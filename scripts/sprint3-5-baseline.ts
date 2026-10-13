import {db} from '../src/lib/db';
import {currentSite} from '../src/lib/yandex/settings';
import {writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
export const hash=(x:unknown)=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
try{const site=await currentSite(),scans=await db.scan.findMany({where:{siteId:site.id},orderBy:{id:'asc'}}),jobs=await db.jobRun.findMany({where:{siteId:site.id},orderBy:{id:'asc'}}),integrations=await db.integration.findMany({where:{type:{in:['Target Site','Yandex Metrika','Yandex Webmaster']}},orderBy:{id:'asc'}});
  const baseline={siteId:site.id,scans:hash(scans),jobs:hash(jobs),integrations:hash(integrations),scanCount:scans.length,jobCount:jobs.length,at:new Date().toISOString()};
  writeFileSync('test-results/sprint3-5-before.json',JSON.stringify(baseline,null,2));
  console.log(JSON.stringify({...baseline,imports:await db.import.findMany({where:{siteId:site.id},select:{kind:true,status:true,rowsImported:true}}),activeScans:scans.filter(r=>['RUNNING','PENDING'].includes(r.status)).length,activeJobs:jobs.filter(r=>['RUNNING','PENDING'].includes(r.status)).length}));
}finally{await db.$disconnect();}

