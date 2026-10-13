import {readFileSync,writeFileSync,readdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {join} from 'node:path';
import assert from 'node:assert/strict';
import {db} from '../src/lib/db';
import {targetUrl} from '../src/lib/health';
import {aiConfig} from '../src/lib/ai/config';
import {searchUrlKind} from '../src/lib/seo-actions/eligibility';
import {buildPageSeoReviewInput} from '../src/lib/seo-review/evidence';
import {evidenceItems} from '../src/lib/seo-review/contract';
import {reviewPage} from '../src/lib/seo-review/service';
import {validateSeoReview} from '../src/lib/seo-review/validator';
import {profile,recommendation,envelope} from '../tests/fixtures/seo-review';
let forbiddenRequests=0;globalThis.fetch=async()=>{forbiddenRequests++;throw Error('NETWORK_FORBIDDEN_OFFLINE');};
const phase=process.argv[2]??'before';
const files=(dir:string):string[]=>readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(join(dir,e.name)):[join(dir,e.name)]);
const protectedFiles=[...['src/lib/scanner','src/lib/search','src/lib/opportunities','src/lib/seo-actions','src/lib/yandex','src/lib/business','prisma'].flatMap(files),...files('src/lib/ai').filter(p=>!p.endsWith('deepseek.ts')),'test-results/sprint4-2-live.json','test-results/sprint4-2-1-revalidation-2026-10-09.json'];
const hashes=Object.fromEntries(protectedFiles.map(p=>[p,createHash('sha256').update(readFileSync(p)).digest('hex')]));
if(phase==='after')assert.deepEqual(hashes,JSON.parse(readFileSync('test-results/sprint5-code-before.json','utf8')));
writeFileSync(`test-results/sprint5-code-${phase}.json`,JSON.stringify(hashes,null,2));
if(phase==='after'){console.log('PASS protected deterministic/scanner/Search/Commerce/legacy AI/ledgers hashes; 0 network');await db.$disconnect();process.exit();}
try{
 const baseUrl=await targetUrl(),site=await db.site.findUniqueOrThrow({where:{baseUrl}});
 const pages=await db.page.findMany({where:{siteId:site.id,active:true},select:{id:true,url:true,pageType:true,scanPages:{where:{outcome:'OK',statusCode:{gte:200,lt:400}},orderBy:{scannedAt:'desc'},take:1,select:{scannedAt:true,contentSignalsJson:true}},seoActions:{where:{status:'ACTIVE',isCurrent:true},select:{id:true}}}});
 const search=await db.webmasterQueryDaily.groupBy({by:['pageId'],where:{siteId:site.id,pageId:{not:null}},_sum:{impressions:true},_count:{query:true}});
 const demand=new Map(search.map(s=>[s.pageId,s._sum.impressions??0]));
 const ranked=pages.filter(p=>searchUrlKind(p.url)==='OTHER_HTML').sort((a,b)=>(demand.get(b.id)??0)-(demand.get(a.id)??0)||a.url.localeCompare(b.url));
 const a=ranked.find(p=>p.pageType==='product'&&demand.has(p.id)&&p.scanPages.length);
 const choices=[['A',a],['B',ranked.find(p=>p.pageType==='category'&&demand.has(p.id)&&p.scanPages.length)],['C',ranked.find(p=>['info','information','article','informational','content'].includes(p.pageType)&&p.scanPages.length)],['D',[...ranked].reverse().find(p=>!p.scanPages.length&&!demand.has(p.id))??[...ranked].reverse().find(p=>!demand.has(p.id))],['E',ranked.find(p=>p.id!==a?.id&&!p.seoActions.length&&demand.has(p.id)&&p.scanPages.length)]] as const;
 const profiles=[];
 for(const [scenario,p]of choices){if(!p){profiles.push({scenario,available:false,reason:'Нет сохранённой страницы требуемого типа.'});continue;}
  const started=performance.now(),input=await buildPageSeoReviewInput(p.id),builderMs=performance.now()-started;let fakeCalls=0;
  const result=await reviewPage(input,{review:async()=>{fakeCalls++;return {model:'OFFLINE_FAKE',text:envelope([])};}});
  profiles.push({scenario,available:true,pageId:p.id,url:p.url,pageType:p.pageType,snapshotAt:input.page.snapshotAt,searchPeriod:input.search.period,search:input.search.summary.value,queries:input.search.queries.length,totalQueries:input.search.totalQueries,activeFindings:input.existingFindings.length,inputBytes:Buffer.byteLength(JSON.stringify(input)),evidenceCount:evidenceItems(input).length,builderMs,validatorMs:result.metadata.validatorMs,fakeCalls,deepSeekCalls:0});
 }
 const fixture=profile(),times=[];for(let n=0;n<25;n++){const start=performance.now();validateSeoReview(envelope([recommendation(fixture)]),fixture);times.push(performance.now()-start);}
 assert.equal(forbiddenRequests,0);
 const report={phase:'OFFLINE_ONLY',productionApiCalls:0,networkRequests:forbiddenRequests,model:aiConfig().model,prompt:'PAGE_SEO_REVIEW_V1',profiles,validatorFixtureMs:{samples:times.length,min:Math.min(...times),median:times.sort((a,b)=>a-b)[12],max:Math.max(...times)}};
 writeFileSync('test-results/sprint5-offline.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}finally{await db.$disconnect();}
