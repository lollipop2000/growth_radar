import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {buildAiPageEvidence} from '../src/lib/ai/evidence';
import {analyzePage} from '../src/lib/ai/service';
import {DeepSeekProvider} from '../src/lib/ai/deepseek';
import {AiError,type AiProviderResponse} from '../src/lib/ai/provider';
import {actionsEnvelopeSchema,proposalSchema} from '../src/lib/ai/schema-v3';
import {diagnoseProposal} from '../src/lib/ai/validator';
import {db} from '../src/lib/db';
// New explicitly authorized series. One invocation = at most one request, no retry.
const file='test-results/sprint4-2-1-revalidation-2026-10-09.json';
const reviewFile='test-results/sprint4-2-1-revalidation-review-2026-10-09.json';
const previousFile='test-results/sprint4-2-live.json';
const protectedFiles=['src/lib/ai/validator.ts','src/lib/ai/specificity.ts','src/lib/ai/action-context.ts','src/lib/ai/prompt.ts','src/lib/ai/deepseek.ts','src/lib/ai/provider.ts','src/lib/ai/service.ts','src/lib/ai/config.ts','.env',previousFile];
const hashes=()=>Object.fromEntries(protectedFiles.map(p=>[p,createHash('sha256').update(readFileSync(p)).digest('hex')]));
if(process.argv[2]!=='--authorized-three-calls')throw new Error('Requires new three-call authorization');
const step=process.argv[3],order=['A1','B1','A2'];if(!order.includes(step))throw new Error('Only A1, B1, A2 allowed; C forbidden');
const ledger:any=existsSync(file)?JSON.parse(readFileSync(file,'utf8')):{series:'Sprint 4.2.1 / 2026-10-09',maximumCalls:3,totalCalls:0,halt:false,protectedHashes:hashes(),results:[]};
if(ledger.halt)throw new Error('Series halted; no automatic replay');
if(JSON.stringify(hashes())!==JSON.stringify(ledger.protectedHashes))throw new Error('Protected code/config/previous ledger changed');
const index=order.indexOf(step);if(ledger.results.length!==index)throw new Error('Wrong order or phase already reserved; replay forbidden');
if(index>0){
 const review=JSON.parse(readFileSync(reviewFile,'utf8'));
 for(const previous of ledger.results){
  if(!previous.analysis?.result.actions.length||!['SUCCESS','PARTIAL_SUCCESS'].includes(previous.status))throw new Error('Previous scenario failed');
  const items=review.filter((r:any)=>r.step===previous.step);
  if(items.length!==previous.analysis.result.actions.length||items.some((r:any)=>r.status!=='PASS'))throw new Error('Every accepted action in previous scenarios requires useful PASS review');
 }
}
const pages=JSON.parse(readFileSync('test-results/sprint4-acceptance-pages.json','utf8'));
const page=pages.find((p:any)=>p.case===step[0]);
const row:any={step,pageId:page.page.id,status:'STARTED',apiSuccess:false};ledger.results.push(row);
const save=()=>writeFileSync(file,JSON.stringify(ledger,null,2));save();
const start=performance.now();let response:AiProviderResponse|undefined;
try{
 const input=await buildAiPageEvidence(page.page.id),evidenceBuilderMs=Math.round(performance.now()-start);
 const provider={analyzePage:async(i:typeof input)=>{
  if(ledger.totalCalls>=3)throw new AiError('ACCEPTANCE_BUDGET');ledger.totalCalls++;row.status='REQUEST_RESERVED';save();
  response=await new DeepSeekProvider().analyzePage(i);row.apiSuccess=true;return response;
 }};
 try{
  const analysis=await analyzePage(input,provider,{maxProviderCalls:1});analysis.metadata.timings.evidenceBuilderMs=evidenceBuilderMs;analysis.metadata.latencyMs=Math.round(performance.now()-start);
  row.status=analysis.validation.outcome;row.analysis={...analysis,evidence:analysis.evidence.map(({value,...provenance})=>provenance)};
 }catch(error){row.status='ERROR';row.code=error instanceof AiError?error.code:'INTERNAL';row.diagnostics=error instanceof AiError?error.diagnostics:undefined;row.latencyMs=Math.round(performance.now()-start);row.evidenceBuilderMs=evidenceBuilderMs;row.usage=response?.usage;}
 // Closed text stays in process memory only. Persist code lists for every item.
 if(response){
  let value:unknown;try{value=JSON.parse(response.text);}catch{row.envelopeReasonCodes=['INVALID_JSON'];}
  if(value!==undefined){const envelope=actionsEnvelopeSchema.safeParse(value);
   if(!envelope.success)row.envelopeReasonCodes=['INVALID_SCHEMA'];
   else row.itemDiagnostics=envelope.data.proposals.map((item,index)=>{const parsed=proposalSchema.safeParse(item);return {index,reasonCodes:parsed.success?diagnoseProposal(parsed.data,input):['PROPOSAL_SCHEMA']};});
  }
 }
 if(!row.analysis?.result.actions.length||row.analysis.validation.rejectedCount>0)ledger.halt=true;
}catch(error){row.status='ERROR';row.code=error instanceof AiError?error.code:'INTERNAL';row.latencyMs=Math.round(performance.now()-start);ledger.halt=true;}
finally{save();await db.$disconnect();}
console.log(JSON.stringify({step,status:row.status,totalCalls:ledger.totalCalls,halt:ledger.halt,validation:row.analysis?.validation,itemDiagnostics:row.itemDiagnostics,code:row.code}));
if(ledger.halt)process.exitCode=1;
