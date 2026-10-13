import 'server-only';
import {AiError,type AiProvider} from './provider';
import {validateAiResult} from './validator';
import {PROMPT_VERSION} from './prompt';
import {evidenceItems,type AiAnalysisResponse,type AiPageAnalysisInput} from './contract';
import {publicData} from '../public-data';
import {buildActionContexts} from './action-context';
import {aiConfig} from './config';
/** One retry only: transport timeout/network or syntactically invalid JSON. */
export async function analyzePage(input:AiPageAnalysisInput,provider:AiProvider,options:{maxProviderCalls?:1|2}={}):Promise<AiAnalysisResponse> {
  const start=performance.now();let providerMs=0,validatorMs=0,apiCalls=0;
  const contextStart=performance.now(),contexts=buildActionContexts(input),contextBuilderMs=Math.round(performance.now()-contextStart);
  const scoped={...input,actionContexts:contexts};
  if(!contexts.length){const validated=validateAiResult('{"proposals":[]}',input);return {result:publicData(validated.result),validation:validated.validation,evidence:evidenceItems(input),metadata:{provider:'DEEPSEEK',model:aiConfig().model,promptVersion:PROMPT_VERSION,latencyMs:Math.round(performance.now()-start),apiCalls:0,timings:{providerMs:0,validatorMs:0,contextBuilderMs},emptyReason:input.findings.length?'NO_ALLOWED_CONTEXT':'NO_FINDINGS'}};}
  for(let attempt=0;attempt<(options.maxProviderCalls??2);attempt++) {
    try {
      const providerStart=performance.now();apiCalls++;let output;
      try{output=await provider.analyzePage(scoped);}finally{providerMs+=performance.now()-providerStart;}
      const validationStart=performance.now();let validated;
      try{validated=validateAiResult(output.text,input);}finally{validatorMs+=performance.now()-validationStart;}
      return {result:publicData(validated.result),validation:validated.validation,evidence:evidenceItems(input),metadata:{provider:'DEEPSEEK',model:output.model,promptVersion:PROMPT_VERSION,latencyMs:Math.round(performance.now()-start),apiCalls,timings:{providerMs:Math.round(providerMs),validatorMs:Math.round(validatorMs),contextBuilderMs},...output.usage?{usage:output.usage}:{},...validated.validation.generatedCount===0?{emptyReason:'MODEL_EMPTY' as const}:{}}};
    }catch(error){
      const code=error instanceof AiError?error.code:'INTERNAL';
      if(attempt===0&&(options.maxProviderCalls??2)>1&&['TIMEOUT','NETWORK','INVALID_JSON'].includes(code))continue;
      throw new AiError(code,{...(error instanceof AiError?error.diagnostics:{}),apiCalls,timings:{providerMs:Math.round(providerMs),validatorMs:Math.round(validatorMs)}});
    }
  }
  throw new AiError('INTERNAL');
}
