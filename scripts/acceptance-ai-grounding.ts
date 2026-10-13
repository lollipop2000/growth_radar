import {readFileSync,writeFileSync} from 'node:fs';
import {buildAiPageEvidence} from '../src/lib/ai/evidence';
import {analyzePage} from '../src/lib/ai/service-v2';
import {DeepSeekProvider} from '../src/lib/ai/deepseek';
import {AiError,type AiProvider} from '../src/lib/ai/provider';
import {db} from '../src/lib/db';
// Explicitly authorized final acceptance only. No queue/bulk product feature or rejected text logging.
if(process.argv[2]!=='--authorized-eight-calls')throw new Error('Final acceptance requires explicit paid-call authorization');
const pages=JSON.parse(readFileSync('test-results/sprint4-acceptance-pages.json','utf8')) as {case:string;page:{id:string;url:string}}[];
const results:Record<string,unknown>[]=[],transport=new DeepSeekProvider();let totalCalls=0,halt=false;
try{for(const p of pages){for(let run=1;run<=(p.case==='C'?2:3);run++){
 if(halt)break;const start=performance.now();let evidenceBuilderMs=0,providerMs=0,apiSuccess=false;
 try{
  const input=await buildAiPageEvidence(p.page.id);evidenceBuilderMs=Math.round(performance.now()-start);
  const provider:AiProvider={analyzePage:async(i)=>{if(totalCalls>=8)throw new AiError('ACCEPTANCE_BUDGET');totalCalls++;const t=performance.now();try{const response=await transport.analyzePage(i);apiSuccess=true;return response;}finally{providerMs=Math.round(performance.now()-t);}}};
  const analysis=await analyzePage(input,provider,{maxProviderCalls:1});analysis.metadata.timings.evidenceBuilderMs=evidenceBuilderMs;analysis.metadata.latencyMs=Math.round(performance.now()-start);
  results.push({case:p.case,run,pageId:p.page.id,apiSuccess,status:analysis.validation.outcome,analysis});
 }catch(error){const code=error instanceof AiError?error.code:'INTERNAL';results.push({case:p.case,run,pageId:p.page.id,apiSuccess,status:'ERROR',code,...(error instanceof AiError?{generatedCount:error.diagnostics?.generatedCount}:{}),latencyMs:Math.round(performance.now()-start),timings:{evidenceBuilderMs,providerMs,...(error instanceof AiError?error.diagnostics?.timings:{})}});if(['UNAVAILABLE','NETWORK','TIMEOUT','RATE_LIMIT','UPSTREAM','PROVIDER_REJECTED','ACCEPTANCE_BUDGET'].includes(code))halt=true;}
 const last=results.at(-1)!;console.log(JSON.stringify({case:p.case,run,status:last.status,code:last.code,apiSuccess,totalCalls}));
 writeFileSync('test-results/sprint4-1-live.json',JSON.stringify({totalCalls,halt,results},null,2));
}if(halt)break;}}finally{await db.$disconnect();}
if(halt||results.some(r=>r.status==='ERROR'||r.status==='ALL_REJECTED'))process.exitCode=1;
