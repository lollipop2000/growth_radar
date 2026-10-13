import {readFileSync,writeFileSync,readdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {join} from 'node:path';
import assert from 'node:assert/strict';
import {Prisma} from '@prisma/client';
import {db} from '../src/lib/db';
import {buildPageSeoReviewInput} from '../src/lib/seo-review/evidence';
import {evidenceItems} from '../src/lib/seo-review/contract';
let requests=0;globalThis.fetch=async()=>{requests++;throw Error('NETWORK_FORBIDDEN');};
const phase=process.argv[2]??'before',base='test-results/sprint5-1-';
const files=(dir:string):string[]=>readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(join(dir,e.name)):[join(dir,e.name)]);
const protectedFiles=[...['src/lib/scanner','src/lib/search','src/lib/seo-actions','src/lib/opportunities','src/lib/business','src/lib/ai','src/lib/yandex','prisma'].flatMap(files),'.env','test-results/sprint5-live-2026-10-09.json','test-results/sprint4-2-live.json','test-results/sprint4-2-1-revalidation-2026-10-09.json'];
const code=Object.fromEntries(protectedFiles.map(p=>[p,createHash('sha256').update(readFileSync(p)).digest('hex')]));
const data:Record<string,unknown>={};
try{
 for(const table of ['Scan','ScanPage','JobRun','MetrikaPageDaily','WebmasterQueryDaily','BusinessRecord','Import','Opportunity','Page','SeoAction']){
  const [r]=await db.$queryRaw<unknown[]>(Prisma.sql`SELECT count(*)::int AS rows, md5(COALESCE(string_agg(md5(row_to_json(t)::text),'' ORDER BY t.id),'')) AS hash FROM ${Prisma.raw('"'+table+'"')} t`);data[table]=r;
 }
 if(phase==='after'){const before=JSON.parse(readFileSync(base+'before.json','utf8'));assert.deepEqual(data,before.data);assert.deepEqual(code,before.code);}
 writeFileSync(base+phase+'.json',JSON.stringify({data,code},null,2));
 const id='cmuvgasnz002t20tcltbmyjw4',start=performance.now(),input=await buildPageSeoReviewInput(id),builderMs=performance.now()-start;
 if(phase==='fixture')writeFileSync('tests/fixtures/seo-review-catalog.json',JSON.stringify(input,null,2));
 const snapshots=await db.scanPage.findMany({where:{pageId:id,outcome:'OK'},orderBy:{scannedAt:'desc'},select:{id:true,source:true,scannedAt:true,title:true,description:true,h1:true,h2Json:true,contentSignalsJson:true,internalLinksJson:true},take:10});
 const audit={phase,apiCalls:0,networkRequests:requests,builderMs,inputBytes:Buffer.byteLength(JSON.stringify(input)),content:input.content,search:input.search,knownLinks:input.internalLinks,observations:snapshots.map(s=>({...s,contentSignalsJson:s.contentSignalsJson?{keys:Object.keys(s.contentSignalsJson),hasVisibleText:!!(s.contentSignalsJson as {visibleText?:string}).visibleText}:null})),evidenceCount:evidenceItems(input).length};
 writeFileSync(base+'catalog-'+phase+'.json',JSON.stringify(audit,null,2));
 console.log(JSON.stringify({phase,integrity:'PASS',builderMs,inputBytes:audit.inputBytes,snapshots:audit.observations.map(({contentSignalsJson,internalLinksJson,...s})=>({...s,signals:contentSignalsJson,links:Array.isArray(internalLinksJson)?internalLinksJson.length:null})),networkRequests:requests}));
}finally{await db.$disconnect();}
