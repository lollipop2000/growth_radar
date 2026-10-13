/** Acceptance harness only. Never changes production policy, source data or prior ledgers. */
import {readFileSync,writeFileSync,existsSync,readdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {join} from 'node:path';
import assert from 'node:assert/strict';
import {Prisma} from '@prisma/client';
import {db} from '../src/lib/db';
import {targetUrl} from '../src/lib/health';
import {aiConfig} from '../src/lib/ai/config';
import {AiError,type AiProviderResponse} from '../src/lib/ai/provider';
import {buildPageSeoReviewInput} from '../src/lib/seo-review/evidence';
import {DeepSeekSeoReviewProvider,reviewPage} from '../src/lib/seo-review/service';
import {PROMPT_VERSION} from '../src/lib/seo-review/prompt';
import {envelopeSchema,recommendationSchema} from '../src/lib/seo-review/schema';
import {diagnoseRecommendation} from '../src/lib/seo-review/validator';
import {publicData} from '../src/lib/public-data';
const file='test-results/sprint5-1-live-2026-10-09.json',reviews='test-results/sprint5-1-live-review-2026-10-09.json';
const order=['B','A','E'];
const paths:Record<string,string>={A:'/catalog/gazpromneft-premium-n-5w-40-kanistra-4-l/',B:'/catalog/',C:'/about/contacts/',D:'/catalog/tp-30-kub-1-000-l/',E:'/'};
const hash=(value:string|Buffer)=>createHash('sha256').update(value).digest('hex');
const files=(dir:string):string[]=>readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(join(dir,e.name)):[join(dir,e.name)]);
const codeHashes=()=>Object.fromEntries([...files('src/lib'),...files('prisma'),'.env','src/app/seo-review-actions.ts','src/components/page-seo-review.tsx','src/components/page-seo-review-output.tsx','test-results/sprint4-2-live.json', 'test-results/sprint4-2-1-revalidation-2026-10-09.json', 'scripts/acceptance-seo-quality-live.ts', 'test-results/sprint5-live-2026-10-09.json','test-results/sprint5-live-review-2026-10-09.json','src/app/pages/[id]/page.tsx'].map(p=>[p,hash(readFileSync(p))]));
async function dataHashes(){const result:Record<string,unknown>={};for(const table of ['Scan','ScanPage','JobRun','MetrikaPageDaily','WebmasterQueryDaily','BusinessRecord','Import','Opportunity','Page','SeoAction']){
 const [row]=await db.$queryRaw<any[]>(Prisma.sql`SELECT count(*)::int AS rows,md5(COALESCE(string_agg(md5(row_to_json(t)::text),'' ORDER BY t.id),'')) AS hash FROM ${Prisma.raw('"'+table+'"')} t`);result[table]=row;
 }return result;}
if(process.argv[2]!=='--authorized-three-new-calls')throw Error('Requires explicit Sprint 5.1 three-call authorization');
const step=process.argv[3];
const network=globalThis.fetch;let permitted=false,outgoingRequests=0;
globalThis.fetch=async(url,options)=>{
 const endpoint=aiConfig().baseUrl.replace(/\/$/,'')+'/chat/completions';
 if(!permitted||String(url)!==endpoint||options?.method!=='POST'||outgoingRequests>=1)throw new AiError('UNAUTHORIZED_NETWORK');
 outgoingRequests++;return network(url,options);
};
try{
 if(step==='init'){
  if(existsSync(file)||existsSync(reviews))throw Error('Ledger already exists; reset/reuse forbidden');
  assert.equal(await db.scan.count({where:{status:{in:['PENDING','RUNNING','STOPPING','IMPORTING']}}}),0,'Active scan would invalidate frozen data');
  assert.ok(aiConfig().enabled,'AI unavailable');
  const site=await db.site.findUniqueOrThrow({where:{baseUrl:await targetUrl()}}),pages:Record<string,unknown>={};
  for(const key of order){const url=new URL(paths[key],site.baseUrl).href,p=await db.page.findFirstOrThrow({where:{siteId:site.id,url}}),input=await buildPageSeoReviewInput(p.id,'M3');
   if(key==='E')assert.equal(input.existingFindings.length,0,'E must have no ACTIVE findings');
   pages[key]={pageId:p.id,url,pageType:p.pageType,inputHash:hash(JSON.stringify(input)),inputBytes:Buffer.byteLength(JSON.stringify(input)),snapshotAt:input.page.snapshotAt,searchPeriod:input.search.period,queryCount:input.search.totalQueries,activeFindings:input.existingFindings.length};
  }
  const ledger={series:'Sprint 5.1 live revalidation / 2026-10-09',authorizedMaximum:3,totalCalls:0,retries:0,halt:false,prompt:PROMPT_VERSION,model:aiConfig().model,codeHashes:codeHashes(),dataHashes:await dataHashes(),pages,results:[]};
  writeFileSync(file,JSON.stringify(ledger,null,2),{flag:'wx'});writeFileSync(reviews,'[]',{flag:'wx'});
  console.log(JSON.stringify({status:'INITIALIZED',model:ledger.model,prompt:ledger.prompt,maximum:3,pages}));process.exitCode=0;
 }else{
  const ledger=JSON.parse(readFileSync(file,'utf8')),save=()=>writeFileSync(file,JSON.stringify(ledger,null,2));
  assert.deepEqual(codeHashes(),ledger.codeHashes,'Code/config/old ledgers changed');assert.deepEqual(await dataHashes(),ledger.dataHashes,'Source data changed');
  if(step==='finish'){ledger.finalIntegrity={codeUnchanged:true,dataUnchanged:true,checkedAt:new Date().toISOString()};save();console.log(JSON.stringify({status:'INTEGRITY_PASS',totalCalls:ledger.totalCalls,halt:ledger.halt}));}
  else{
   if(ledger.halt)throw Error('Series halted; no replay');
   const index=order.indexOf(step);if(index<0||ledger.results.length!==index)throw Error('Wrong order or already reserved; no replay');
   const quality=JSON.parse(readFileSync(reviews,'utf8'));
   for(const previous of ledger.results){if(previous.step==='D'){assert.equal(previous.review.metadata.apiCalls,0);continue;}
    const q=quality.find((r:any)=>r.step===previous.step);
    if(!q||q.status!=='PASS'||q.items.length!==previous.review?.validation.accepted||q.items.some((r:any)=>r.status==='FAIL')||!q.items.some((r:any)=>r.status==='PASS'))throw Error('Previous scenario lacks useful expert PASS');
   }
   const page=ledger.pages[step],started=performance.now(),input=await buildPageSeoReviewInput(page.pageId,'M3'),builderMs=performance.now()-started;
   assert.equal(hash(JSON.stringify(input)),page.inputHash,'Profile changed since preflight');
   const row:any={step,pageId:page.pageId,url:page.url,status:'STARTED',startedAt:new Date().toISOString(),builderMs};ledger.results.push(row);save();
   let response:AiProviderResponse|undefined,providerMs=0,attempted=false;
   try{
    const provider={review:async(i:typeof input)=>{
     if(step==='D')throw Error('D_PROVIDER_FORBIDDEN');if(attempted||ledger.totalCalls>=3)throw Error('BUDGET_OR_RETRY_FORBIDDEN');
     attempted=true;ledger.totalCalls++;row.status='REQUEST_RESERVED';save();const start=performance.now();
     try{permitted=true;response=await new DeepSeekSeoReviewProvider().review(i);return response;}finally{permitted=false;providerMs=performance.now()-start;}
    }};
    const review=await reviewPage(input,provider);review.metadata.builderMs=builderMs;review.metadata.totalMs=performance.now()-started;
    // Safe numeric usage from transport; publicData intentionally redacts any key containing "token".
    row.usage=response?.usage;row.review={...review,result:publicData(review.result)};row.status=step==='D'?'ZERO_CALL_PASS':review.validation.accepted?'AWAITING_EXPERT_REVIEW':'NO_USEFUL_ACCEPTED_ITEMS';
    if(step==='D'){assert.equal(attempted,false);assert.equal(review.metadata.apiCalls,0);assert.equal(review.validation.generated,0);assert.equal(review.result.recommendations.length,0);}
    else if(!review.validation.accepted){ledger.halt=true;ledger.stopReason='NO_USEFUL_ACCEPTED_ITEMS';}
   }catch(e){row.status='ERROR';row.code=e instanceof AiError?e.code:'ACCEPTANCE_ERROR';ledger.halt=true;ledger.stopReason=row.code;}
   // Only counts/codes/schema paths. Never persist raw response or rejected text.
   if(response){row.usage=response.usage;let parsed:unknown;try{parsed=JSON.parse(response.text);}catch{row.envelopeReasonCodes=['INVALID_JSON'];}
    if(parsed!==undefined){const env=envelopeSchema.safeParse(parsed);if(!env.success){row.envelopeReasonCodes=['INVALID_SCHEMA'];row.schemaIssues=env.error.issues.map(x=>({code:x.code,path:x.path}));}
     else row.itemDiagnostics=row.review?.validation.decisions.map((d:any)=>({index:d.index,failedConditions:d.status==='REJECTED'?d.reasonCodes:[],reviewConditions:d.status!=='REJECTED'?d.reasonCodes:[]}))??[];
    }
   }
   row.transportMs=providerMs;row.totalMs=performance.now()-started;row.attemptedCalls=attempted?1:0;row.outgoingRequests=outgoingRequests;save();
   console.log(JSON.stringify({step,status:row.status,totalCalls:ledger.totalCalls,halt:ledger.halt,validation:row.review?.validation,reason:row.code,usage:row.usage,transportMs:row.transportMs}));
   if(ledger.halt)process.exitCode=1;
  }
 }
}finally{await db.$disconnect();}
