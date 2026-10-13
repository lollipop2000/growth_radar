import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {setTimeout as delay} from 'node:timers/promises';
import {db} from '../src/lib/db';
import {saveScanPage} from '../src/lib/scanner/store';
import {emptyResult} from '../src/lib/scanner/model';
if(!/^\/radar_stabilization1_\d+$/.test(new URL(process.env.DATABASE_URL!).pathname))throw Error('Fixture database required');
try{
 const base='http://127.0.0.1:48993/save-budget-'+Date.now()+'/',site=await db.site.create({data:{baseUrl:base,name:'Local transaction budget fixture'}}),scan=await db.scan.create({data:{siteId:site.id,status:'COMPLETED'}});
 const started=performance.now();await saveScanPage(scan.id,site.id,{...emptyResult(base+'page/','HTTP'),statusCode:200},async()=>{await delay(6000);});
 assert.equal(await db.scanPage.count({where:{scanId:scan.id,outcome:'OK'}}),1);
 writeFileSync('test-results/page-errors-save-budget.json',JSON.stringify({status:'PASS',checkpointMs:6000,elapsedMs:Math.round(performance.now()-started),snapshotPersisted:true},null,2));console.log('PASS save transaction longer than previous 5s budget');
}finally{await db.$disconnect();}
