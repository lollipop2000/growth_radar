import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {db} from '../src/lib/db';
import {currentSite} from '../src/lib/yandex/settings';
import {uploadSearch,previewSearch,commitSearch} from '../src/lib/search/import-service';
import {calculateSeoActions,seoDataset} from '../src/lib/seo-actions/service';
import {calculateOpportunities} from '../src/lib/opportunities/service';
import {priorityOrder} from '../src/lib/seo-actions/config';
import {demandMetric,searchCoverage} from '../src/lib/search/metrics';
const hash=(v:unknown)=>createHash('sha256').update(JSON.stringify(v)).digest('hex'),before=JSON.parse(readFileSync('test-results/sprint3-5-1-before.json','utf8')),path='C:/Users/4way0/Downloads/shop.gazpromneft-sm.ru_ac664341769d27db78d001b.xlsx',profile=JSON.parse(readFileSync('test-results/sprint3-5-1-file-profile.json','utf8'));
async function guards(){const result:Record<string,unknown>={};for(const [name,table,where] of [['scans',db.scan,{siteId:before.siteId}],['jobs',db.jobRun,{siteId:before.siteId}],['metrika',db.metrikaPageDaily,{siteId:before.siteId}],['business',db.businessRecord,{siteId:before.siteId}],['api',db.webmasterQueryDaily,{siteId:before.siteId,source:'WEBMASTER_API'}]] as const){const rows=await (table as unknown as {findMany(args:unknown):Promise<Record<string,unknown>[]>}).findMany({where,orderBy:{id:'asc'}});result[name]=hash(rows.map(r=>{const {grain,periodMonth,demand,...old}=r;return old;}));}result.config=await db.integration.findMany({where:{type:{in:['Target Site','Yandex Metrika','Yandex Webmaster']}},orderBy:{id:'asc'},select:{type:true,configJson:true,status:true,enabled:true}});for(const k of Object.keys(result))assert.deepEqual(result[k],before[k],k+' changed');return result;}
try{await guards();assert.equal((await currentSite()).id,before.siteId);assert.equal(createHash('sha256').update(readFileSync(path)).digest('hex'),profile.sha256);writeFileSync('test-results/sprint3-5-1-safety.json',JSON.stringify({status:'PASS',baselineUnchanged:true,sourceFileUnchanged:true,siteRestored:true},null,2));console.log('Final safety PASS');}finally{await db.$disconnect();}
