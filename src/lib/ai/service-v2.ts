import 'server-only';
import {AiError,type AiProvider} from './provider';
import {validateAiResult} from './validator-v2';
import {PROMPT_VERSION} from './prompt-v2';
import {evidenceItems,type AiAnalysisResponseV2 as AiAnalysisResponse,type AiPageAnalysisInput} from './contract';
import {publicData} from '../public-data';
/** One retry only: transport timeout/network or syntactically invalid JSON. */
export async function analyzePage(input:AiPageAnalysisInput,provider:AiProvider,options:{maxProviderCalls?:1|2}={}):Promise<AiAnalysisResponse> {
  const start=performance.now();let providerMs=0,validatorMs=0,apiCalls=0;
  for(let attempt=0;attempt<(options.maxProviderCalls??2);attempt++) {
    try {
      const providerStart=performance.now();apiCalls++;let output;
      try{output=await provider.analyzePage(input);}finally{providerMs+=performance.now()-providerStart;}
      const validationStart=performance.now();let validated;
      try{validated=validateAiResult(output.text,input);}finally{validatorMs+=performance.now()-validationStart;}
      return {result:publicData(validated.result),validation:validated.validation,evidence:evidenceItems(input),metadata:{provider:'DEEPSEEK',model:output.model,promptVersion:PROMPT_VERSION,latencyMs:Math.round(performance.now()-start),apiCalls,timings:{providerMs:Math.round(providerMs),validatorMs:Math.round(validatorMs)}}};
    }catch(error){
      const code=error instanceof AiError?error.code:'INTERNAL';
      if(attempt===0&&(options.maxProviderCalls??2)>1&&['TIMEOUT','NETWORK','INVALID_JSON'].includes(code))continue;
      throw new AiError(code,{...(error instanceof AiError?error.diagnostics:{}),apiCalls,timings:{providerMs:Math.round(providerMs),validatorMs:Math.round(validatorMs)}});
    }
  }
  throw new AiError('INTERNAL');
}
