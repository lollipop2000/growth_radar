import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {db} from '../src/lib/db';
import {day,yesterday} from '../src/lib/yandex/dates';
import {normalizeUrl} from '../src/lib/scanner/url';
import {coverageConfig} from '../src/lib/scanner/coverage';
import {writeFileSync} from 'node:fs';
const target=await db.integration.findUniqueOrThrow({where:{type:'Target Site'}}),metrika=await db.integration.findUniqueOrThrow({where:{type:'Yandex Metrika'}}),counter=process.env.YANDEX_METRIKA_COUNTER_ID!;
const site=await db.site.create({data:{baseUrl:`http://127.0.0.1:48999/unified-${Date.now()}/`,name:'Unified Scanner local fixture'}});
const date=day(yesterday()),job=await db.jobRun.create({data:{siteId:site.id,integrationId:metrika.id,source:'METRIKA',mode:'FIXTURE',status:'COMPLETED',dateFrom:date,dateTo:date}});
for(let i=0;i<12;i++){const url=site.baseUrl+'item-'+i+'/';await db.metrikaPageDaily.create({data:{siteId:site.id,jobRunId:job.id,counterId:counter,date,url,normalizedUrl:normalizeUrl(url),rowKey:'fixture-'+i,visits:100-i,visitors:1,pageviews:1}});}
const browser=await chromium.launch({headless:true}),page=await browser.newPage({viewport:{width:1440,height:1000}}),checks:any[]=[];
await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
try{
 await db.integration.update({where:{id:target.id},data:{configJson:{baseUrl:site.baseUrl}}});await db.integration.update({where:{id:metrika.id},data:{configJson:{siteId:site.id,counterId:counter}}});
 assert.equal(await db.scan.count({where:{status:{in:['PENDING','RUNNING','PAUSING','STOPPING','IMPORTING']}}}),0,'Fixtures must be idle');
 async function submit(name:string,scope:string,preset='FULL',source='UNMATCHED',transport='HTTP_BROWSER'){
  await page.goto('http://127.0.0.1:3000/scanner',{waitUntil:'networkidle'});assert.equal(await page.locator('[data-scanner-launch]').count(),1);const f=page.locator('[data-scanner-launch]');await f.locator('[name=scanScope]').selectOption(scope);
  if(scope==='SOURCE'){await f.locator('[name=preset]').selectOption(preset);if(preset!=='TARGETED')await f.locator('select[name=scope]').selectOption(source);if(preset==='TEST_ONE')await f.locator('[name=testUrl]').fill(site.baseUrl+'item-0/');}
  await f.locator('[name=transport]').selectOption(transport);const before=await db.scan.count({where:{siteId:site.id}});
  await f.locator('[name=operation][value=START]').click();await page.waitForFunction(()=>document.querySelector('[data-scanner-launch] [role=status]')?.textContent?.includes('создано'),{},{timeout:30000});
  assert.equal(await db.scan.count({where:{siteId:site.id}}),before+1);const s=await db.scan.findFirstOrThrow({where:{siteId:site.id},orderBy:{startedAt:'desc'}}),c=s.configJson as any;
  if(scope==='SOURCE'&&preset!=='TARGETED'){const coverage=coverageConfig(c)!;assert.equal(coverage.scope,source);assert.equal(coverage.transport,transport);if(preset==='DIAGNOSTIC')assert.equal(coverage.queue.length,10);if(preset==='TEST_ONE')assert.equal(coverage.queue.length,1);}
  else{assert.equal(c.mode,transport==='BROWSER_ONLY'?'BROWSER':'HTTP');assert.equal(c.browserFallback,transport==='HTTP_BROWSER');assert.equal(c.single,scope==='SINGLE');if(preset==='TARGETED'){assert.equal(c.targeted.kind,'TOP_UNMATCHED');assert.equal(c.targeted.selected.length,10);}}
  assert.equal(c.delayMs,3000);await db.scan.update({where:{id:s.id},data:{status:'STOPPED',finishedAt:new Date()}});checks.push({name,status:'PASS',id:s.id});return s;
 }
 await submit('Full Scan','SITE');await submit('Single URL','SINGLE','FULL','UNMATCHED','BROWSER_ONLY');await submit('Coverage UNMATCHED','SOURCE');await submit('Coverage ALL','SOURCE','FULL','ALL','HTTP_ONLY');await submit('Diagnostic','SOURCE','DIAGNOSTIC');const test=await submit('Test one','SOURCE','TEST_ONE');await submit('Targeted','SOURCE','TARGETED');
 await page.goto('http://127.0.0.1:3000/scanner?preset=TARGETED',{waitUntil:'networkidle'});assert.equal(await page.locator('[name=scanScope]').inputValue(),'SOURCE');assert.equal(await page.locator('[name=preset]').inputValue(),'TARGETED');assert.equal(await page.locator('select[name=scope]').inputValue(),'UNMATCHED');
 await page.goto('http://127.0.0.1:3000/scanner/'+test.id,{waitUntil:'networkidle'});assert.equal(await page.locator('button[value=RESUME]').count(),0);assert.ok(await page.locator(`a[href="/scanner?scanId=${test.id}"]`).count());
 await page.goto('http://127.0.0.1:3000/scanner?scanId='+test.id,{waitUntil:'networkidle'});assert.equal(await page.locator('button[value=RESUME]').count(),1);assert.equal(await page.locator('input[type=file]').count(),1);
 const foreign=await db.scan.findFirst({where:{siteId:{not:site.id}}});if(foreign)assert.equal(await page.locator(`a[href="/scanner/${foreign.id}"]`).count(),0);
 const historyUrl=site.baseUrl+'history/',historyPage=await db.page.create({data:{siteId:site.id,url:historyUrl,normalizedUrl:normalizeUrl(historyUrl),path:new URL(historyUrl).pathname}});
 for(let i=0;i<21;i++){const scan=await db.scan.create({data:{siteId:site.id,mode:'IMPORT',status:'COMPLETED',finishedAt:new Date()}});await db.scanPage.create({data:{scanId:scan.id,pageId:historyPage.id,source:'IMPORT',outcome:'OK',statusCode:200}});}
 await page.goto('http://127.0.0.1:3000/pages/'+historyPage.id,{waitUntil:'networkidle'});assert.equal(await page.locator('[data-snapshot]').count(),5);
 await page.goto('http://127.0.0.1:3000/pages/'+historyPage.id+'?detail=1',{waitUntil:'networkidle'});assert.equal(await page.locator('[data-snapshot]').count(),20);
 await page.goto('http://127.0.0.1:3000/pages/'+historyPage.id+'?detail=1&historyPage=2',{waitUntil:'networkidle'});assert.equal(await page.locator('[data-snapshot]').count(),1);
 checks.push({name:'Page scan history: 5 initially, 20 per detail page, older snapshots accessible',status:'PASS'});
 await page.goto('http://127.0.0.1:3000/scanner?scanId='+test.id,{waitUntil:'networkidle'});
 await page.screenshot({path:'test-results/stabilization1-scanner.png',fullPage:true});
 checks.push({name:'Preset/source, one launch form, history site filter, one Resume, one import',status:'PASS'});writeFileSync('test-results/stabilization1-scanner-ui.json',JSON.stringify(checks,null,2));console.log('PASS actual form submissions',checks.map(c=>c.name));
}finally{
 await db.integration.update({where:{id:target.id},data:{configJson:target.configJson as object}});await db.integration.update({where:{id:metrika.id},data:{configJson:metrika.configJson as object}});await browser.close();await db.$disconnect();
}
