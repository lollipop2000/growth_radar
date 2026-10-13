import {existsSync,readFileSync,writeFileSync} from 'node:fs';
import {buildAiPageEvidence} from '../src/lib/ai/evidence';
import {analyzePage} from '../src/lib/ai/service';
import {DeepSeekProvider} from '../src/lib/ai/deepseek';
import {AiError,type AiProvider} from '../src/lib/ai/provider';
import {db} from '../src/lib/db';
// Fixed four-call series only; persist reservation BEFORE request, no retries/replays.
if(process.argv[2]!=='--authorized-four-calls')throw new Error('Requires NEW explicit Sprint 4.2 paid-call authorization');
const phase=process.argv[3];if(!['first','repeat'].includes(phase))throw new Error('Select first or repeat');
const file='test-results/sprint4-2-live.json',reviewFile='test-results/sprint4-2-human-review.json';
type Ledger={totalCalls:number;halt:boolean;results:any[]};
const ledger:Ledger=existsSync(file)?JSON.parse(readFileSync(file,'utf8')):{totalCalls:0,halt:false,results:[]};
if(ledger.halt)throw new Error('Acceptance halted; no automatic repeat');
const run=phase==='first'?1:2;if(ledger.results.some(r=>r.run===run))throw new Error('This phase has already started; replay forbidden');
if(run===2){const review=JSON.parse(readFileSync(reviewFile,'utf8'));for(const c of ['A','B']){
 const first=ledger.results.find(r=>r.case===c&&r.run===1);if(!first?.analysis?.result.actions.length||!['SUCCESS','PARTIAL_SUCCESS'].includes(first.status))throw new Error('First pair did not pass');
 const items=review.filter((r:any)=>r.case===c&&r.run===1);if(items.length!==first.analysis.result.actions.length||items.some((r:any)=>r.status!=='PASS'))throw new Error('Review every first-pair action as useful PASS before repeats');
}}
const pages=JSON.parse(readFileSync('test-results/sprint4-acceptance-pages.json','utf8')) as {case:string;page:{id:string}}[],transport=new DeepSeekProvider();
const save=()=>writeFileSync(file,JSON.stringify(ledger,null,2));
try{for(const p of pages.filter(p=>['A','B'].includes(p.case))){
 const start=performance.now(),row:any={case:p.case,run,pageId:p.page.id,status:'STARTED',apiSuccess:false};ledger.results.push(row);save();
 try{
  const input=await buildAiPageEvidence(p.page.id),evidenceBuilderMs=Math.round(performance.now()-start);
  const provider:AiProvider={analyzePage:async(i)=>{if(ledger.totalCalls>=4)throw new AiError('ACCEPTANCE_BUDGET');ledger.totalCalls++;row.status='REQUEST_RESERVED';save();const output=await transport.analyzePage(i);row.apiSuccess=true;return output;}};
  const analysis=await analyzePage(input,provider,{maxProviderCalls:1});analysis.metadata.timings.evidenceBuilderMs=evidenceBuilderMs;analysis.metadata.latencyMs=Math.round(performance.now()-start);row.status=analysis.validation.outcome;row.analysis={...analysis,evidence:analysis.evidence.map(({value,...provenance})=>provenance)};
  if(!analysis.result.actions.length)ledger.halt=true;
 }catch(error){row.status='ERROR';row.code=error instanceof AiError?error.code:'INTERNAL';row.diagnostics=error instanceof AiError?error.diagnostics:undefined;row.latencyMs=Math.round(performance.now()-start);ledger.halt=true;}
 save();console.log(JSON.stringify({case:p.case,run,status:row.status,code:row.code,apiSuccess:row.apiSuccess,totalCalls:ledger.totalCalls}));if(ledger.halt)break;
}}finally{await db.$disconnect();}
if(ledger.halt)process.exitCode=1;
