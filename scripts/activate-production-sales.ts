import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
import {db} from '../src/lib/db';
import {updateSalesMetadata} from '../src/lib/business/service';
const audit=JSON.parse(await readFile('test-results/data-activation-audit.json','utf8'));
const file=audit.sales[0];assert.equal(file.id,'cmuwsa1kv0494202oo3rxgay9');assert.equal(audit.siteId,'cmuv42bst000020wcam8pixal');
const hash=(v:unknown)=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const records=await db.businessRecord.findMany({where:{siteId:audit.siteId},orderBy:{id:'asc'}}),scans=await db.scan.findMany({where:{siteId:audit.siteId},orderBy:{id:'asc'}}),jobs=await db.jobRun.findMany({where:{siteId:audit.siteId},orderBy:{id:'asc'}});
// Explicit user confirmation in this conversation: complete online sales export,
// 2025-01-10 through 2026-10-06. This script does not infer completeness.
const updated=await updateSalesMetadata(file.id,{salesImportMode:'TRANSACTIONAL',coverageFrom:'2025-01-10',coverageTo:'2026-10-06'});
assert.equal(hash(records),hash(await db.businessRecord.findMany({where:{siteId:audit.siteId},orderBy:{id:'asc'}})));
assert.equal(hash(scans),hash(await db.scan.findMany({where:{siteId:audit.siteId},orderBy:{id:'asc'}})));
assert.equal(hash(jobs),hash(await db.jobRun.findMany({where:{siteId:audit.siteId},orderBy:{id:'asc'}})));
const result={status:'PASS',id:updated.id,mode:updated.salesImportMode,coverageFrom:updated.coverageFrom,coverageTo:updated.coverageTo,confirmedByUser:true,recordsUnchanged:true,queuesUnchanged:true};
await writeFile('test-results/data-activation-sales.json',JSON.stringify(result,null,2));console.log(result);await db.$disconnect();
