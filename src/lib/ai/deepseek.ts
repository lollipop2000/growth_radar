import 'server-only';
import type {AiPageAnalysisInput} from './contract';
import {AiError,type AiProvider,type AiProviderResponse} from './provider';
import {analysisMessages} from './prompt';
import {aiConfig} from './config';
/** Transport only. No raw error body or secrets reach logs/UI. */
export class DeepSeekProvider implements AiProvider {
  constructor(private readonly options=aiConfig(),private readonly request:typeof fetch=fetch){}
  async analyzePage(input:AiPageAnalysisInput):Promise<AiProviderResponse> {
    return this.complete(analysisMessages(input));
  }
  /** Shared bounded server transport. Callers own their independent input/prompt contracts. */
  async complete(messages:{role:string;content:string}[]):Promise<AiProviderResponse> {
    const c=this.options;if(!c.enabled)throw new AiError('UNAVAILABLE');
    let response:Response;
    const signal=AbortSignal.timeout(c.timeoutMs);
    try {
      response=await this.request(c.baseUrl.replace(/\/$/,'')+'/chat/completions',{
        method:'POST',redirect:'error',signal,headers:{'Content-Type':'application/json',Authorization:`Bearer ${c.key}`},
        body:JSON.stringify({model:c.model,messages,response_format:{type:'json_object'},thinking:{type:'disabled'},temperature:0.2,max_tokens:c.maxOutputTokens,stream:false})});
    }catch {throw new AiError(signal.aborted?'TIMEOUT':'NETWORK');}
    if(!response.ok)throw new AiError(response.status===429?'RATE_LIMIT':response.status>=500?'UPSTREAM':'PROVIDER_REJECTED');
    let body='';const reader=response.body?.getReader();if(!reader)throw new AiError('INVALID_RESPONSE');
    let bytes=0;const decoder=new TextDecoder();
    try {while(true){const r=await reader.read();if(r.done)break;bytes+=r.value.byteLength;
      if(bytes>100000){await reader.cancel();throw new AiError('OUTPUT_TOO_LARGE');}body+=decoder.decode(r.value,{stream:true});}
      body+=decoder.decode();
    }catch(error){if(error instanceof AiError)throw error;throw new AiError(signal.aborted?'TIMEOUT':'NETWORK');}
    let parsed:unknown;try{parsed=JSON.parse(body);}catch{throw new AiError('INVALID_JSON');}
    const envelope=parsed as {choices?:{message?:{content?:unknown};finish_reason?:string}[];usage?:{prompt_tokens?:number;completion_tokens?:number}};
    const choice=envelope?.choices?.[0],text=choice?.message?.content;
    if(choice?.finish_reason==='length')throw new AiError('OUTPUT_TRUNCATED');
    if(typeof text!=='string'||choice?.finish_reason!=='stop')throw new AiError('INVALID_RESPONSE');
    const usage=envelope.usage;
    return {text,model:c.model,...(usage&&Number.isFinite(usage.prompt_tokens)&&Number.isFinite(usage.completion_tokens)?{usage:{inputTokens:usage.prompt_tokens!,outputTokens:usage.completion_tokens!}}:{})};
  }
}
