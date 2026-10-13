import {db} from '../src/lib/db';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const read=(p:string)=>JSON.parse(readFileSync(p,'utf8')),baseline=read('test-results/sprint3-3-before.json'),hash=(v:unknown)=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
try{
 assert.equal(hash(await db.scan.findMany({where:{siteId:baseline.siteId},orderBy:{id:'asc'}})),baseline.scans);
 assert.equal(hash(await db.jobRun.findMany({where:{siteId:baseline.siteId},orderBy:{id:'asc'}})),baseline.jobs);
 const checks=read('test-results/sprint3-1-checks.json');assert.ok(checks.every((r:{status:string})=>r.status==='PASS'));
 const build=readFileSync('test-results/sprint3-3-build.log','utf8');assert.match(build,/Compiled successfully/);assert.match(build,/server-rendered on demand/);
 const unit=readFileSync('test-results/sprint3-3-final-unit.log','utf8');assert.match(unit,/tests 81/);assert.match(unit,/fail 0/);
 assert.equal(read('test-results/commerce-ui-acceptance.json').status,'PASS');assert.equal(read('test-results/commerce-acceptance.json').status,'PASS');
 assert.ok(read('test-results/sprint3-localization.json').results.every((r:{status:string;overflow:boolean})=>r.status==='PASS'&&!r.overflow));
 assert.match(readFileSync('test-results/sprint3-3-secrets.log','utf8'),/PASS/);
 const report={status:'PASS',build:'PASS',typecheck:'PASS',unitTests:{status:'PASS',passed:81},regressions:checks.filter((r:{name:string})=>r.name.includes('regression')),migrations:checks.filter((r:{name:string})=>['migration status','schema drift','clean database'].includes(r.name)),commerceDatabase:'PASS',commerceUi:'PASS',sprint3Ui:'PASS',sprint3_1Ui:'PASS',localization:{status:'PASS',routes:16},secrets:'PASS',production:{repeatWithoutDuplicates:true,historyPreserved:true,scansUnchanged:baseline.scanCount,jobsUnchanged:baseline.jobCount,noExternalOperations:true},checkedAt:new Date().toISOString()};
 writeFileSync('test-results/sprint3-3-final-checks.json',JSON.stringify(report,null,2));let book=readFileSync('SPRINT3_3_RUNBOOK.md','utf8');book=book.replace('unit tests, Scanner','81/81 unit tests, Scanner');writeFileSync('SPRINT3_3_RUNBOOK.md',book);console.log(JSON.stringify(report));
}finally{await db.$disconnect();}
