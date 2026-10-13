import {readFileSync,writeFileSync,readdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {join} from 'node:path';
import assert from 'node:assert/strict';
import {Prisma} from '@prisma/client';
import {db} from '../src/lib/db';
import {buildPageSeoReviewInput} from '../src/lib/seo-review/evidence';
import {evidenceItems} from '../src/lib/seo-review/contract';
let requests=0;globalThis.fetch=async()=>{requests++;throw Error('NETWORK_FORBIDDEN');};
const phase=process.argv[2]??'before',base='test-results/sprint5-3-';
const files=(dir:string):string[]=>readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(join(dir,e.name)):[join(dir,e.name)]);
const currentFiles=[...files('src'),...files('prisma'),'.env','test-results/sprint5-live-2026-10-09.json','test-results/sprint5-1-live-2026-10-09.json','test-results/sprint5-1-live-review-2026-10-09.json','test-results/sprint4-2-live.json','test-results/sprint4-2-1-revalidation-2026-10-09.json','test-results/sprint5-2-live-diagnostic.json'];
const protectedFiles=phase==='after'?Object.keys(JSON.parse(readFileSync(base+'before.json','utf8')).code):currentFiles;
const code=Object.fromEntries(protectedFiles.map(p=>[p,createHash('sha256').update(readFileSync(p)).digest('hex')]));
const data:Record<string,unknown>={};
try{
 for(const table of ['Scan','ScanPage','JobRun','MetrikaPageDaily','WebmasterQueryDaily','BusinessRecord','Import','Opportunity','Page','SeoAction']){
  const [r]=await db.$queryRaw<unknown[]>(Prisma.sql`SELECT count(*)::int AS rows, md5(COALESCE(string_agg(md5(row_to_json(t)::text),'' ORDER BY t.id),'')) AS hash FROM ${Prisma.raw('"'+table+'"')} t`);data[table]=r;
 }
 if(phase==='after'){const before=JSON.parse(readFileSync(base+'before.json','utf8'));assert.deepEqual(data,before.data);const allowed=['src\\app\\seo-review-actions.ts','src\\components\\page-seo-review.tsx','src\\components\\page-seo-review-output.tsx','src\\lib\\ai-diagnostics\\engine.ts','src\\lib\\ai-diagnostics\\redact.ts','src\\lib\\ai-diagnostics\\details.ts'];for(const key of Object.keys(code))if(!allowed.includes(key))assert.equal(code[key],before.code[key],key);}
 writeFileSync(base+phase+'.json',JSON.stringify({data,code},null,2));
 console.log(JSON.stringify({phase,integrity:'PASS',protectedExistingFiles:protectedFiles.length,apiCalls:0,networkRequests:requests}));
}finally{await db.$disconnect();}
