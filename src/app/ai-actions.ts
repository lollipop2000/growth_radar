'use server';
import {aiAvailable,aiConfig} from '@/lib/ai/config';
import {PROMPT_VERSION} from '@/lib/ai/prompt';
import {buildAiPageEvidence} from '@/lib/ai/evidence';
import {analyzePage} from '@/lib/ai/service';
import {DeepSeekProvider} from '@/lib/ai/deepseek';
import {AiError} from '@/lib/ai/provider';
import type {AiActionState} from '@/lib/ai/contract';
const active=new Set<string>();
export async function pageAiAnalysis(pageId:string):Promise<AiActionState> {
  if(!aiAvailable())return {ok:false,code:'UNAVAILABLE',message:'AI-анализ недоступен'};
  if(typeof pageId!=='string'||!/^[a-zA-Z0-9_-]{1,100}$/.test(pageId))return {ok:false,code:'INVALID_PAGE',message:'Страница недоступна для анализа.'};
  if(active.has(pageId)||active.size>=2)return {ok:false,code:'BUSY',message:'AI-анализ уже выполняется. Дождитесь завершения.'};
  active.add(pageId);const start=performance.now();
  try {
    const evidence=await buildAiPageEvidence(pageId),evidenceBuilderMs=Math.round(performance.now()-start),analysis=await analyzePage(evidence,new DeepSeekProvider());
    analysis.metadata.timings.evidenceBuilderMs=evidenceBuilderMs;analysis.metadata.latencyMs=Math.round(performance.now()-start);
    console.info('AI_ANALYSIS',{timestamp:new Date().toISOString(),pageId,provider:analysis.metadata.provider,model:analysis.metadata.model,promptVersion:analysis.metadata.promptVersion,latencyMs:analysis.metadata.latencyMs,timings:analysis.metadata.timings,apiCalls:analysis.metadata.apiCalls,emptyReason:analysis.metadata.emptyReason,usage:analysis.metadata.usage,validation:analysis.validation,success:true,inputBytes:Buffer.byteLength(JSON.stringify(evidence)),outputBytes:Buffer.byteLength(JSON.stringify(analysis.result))});
    return {ok:true,analysis};
  }catch(error){
    const code=error instanceof AiError?error.code:'INTERNAL';
    console.info('AI_ANALYSIS',{timestamp:new Date().toISOString(),pageId,provider:'DEEPSEEK',model:aiConfig().model,promptVersion:PROMPT_VERSION,latencyMs:Math.round(performance.now()-start),success:false,code,...(error instanceof AiError?{diagnostics:error.diagnostics}:{})});
    return {ok:false,code,message:code==='INVALID_PAGE'?'Страница недоступна для анализа.':'Не удалось выполнить AI-анализ. Попробуйте повторить.'};
  }finally{active.delete(pageId);}
}
