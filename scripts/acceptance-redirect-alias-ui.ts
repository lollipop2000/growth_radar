import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {chromium} from 'playwright';
import {db} from '../src/lib/db';
import {json} from '../src/lib/yandex/settings';
import {assertFixtureServer} from './stabilization1-fixture-guard.mjs';
const origin='http://127.0.0.1:3002';await assertFixtureServer(process.env.DATABASE_URL!,3002);
const f=JSON.parse(readFileSync('test-results/redirect-alias-fixtures.json','utf8'));
const site=await db.site.findUniqueOrThrow({where:{id:f.siteId}});
const target=await db.integration.findUniqueOrThrow({where:{type:'Target Site'}}),web=await db.integration.findUniqueOrThrow({where:{type:'Yandex Webmaster'}}),met=await db.integration.findUniqueOrThrow({where:{type:'Yandex Metrika'}});
const browser=await chromium.launch({headless:true}),page=await browser.newPage(),errors:string[]=[];
page.on('pageerror',e=>errors.push(e.message));await page.route('**/*',r=>new URL(r.request().url()).origin===origin?r.continue():r.abort());
try{
 await db.integration.update({where:{id:target.id},data:{configJson:json({baseUrl:site.baseUrl})}});await db.integration.update({where:{id:web.id},data:{configJson:json({siteId:site.id,hostId:'alias-fixture'})}});await db.integration.update({where:{id:met.id},data:{configJson:json({siteId:site.id,counterId:'alias-counter'})}});
 await page.goto(`${origin}/pages/${f.pageId}?period=28&searchPeriod=M1&detail=1`);
 const historical=page.locator('[data-historical-urls]');await historical.waitFor();const row=historical.locator('tbody tr').filter({hasText:f.source});assert.equal(await row.count(),1);const text=await row.innerText();assert.ok(text.includes('301'));assert.ok(text.includes('200'));assert.ok(text.includes('20'));assert.ok(text.includes('7'));
 assert.ok((await page.locator('body').innerText()).includes(f.source));await page.screenshot({path:'test-results/redirect-alias-page360.png',fullPage:true});
 await page.goto(`${origin}/scanner/${f.scanId}`);assert.ok((await page.locator('body').innerText()).includes('RESOLVED_REDIRECT'));
 await page.goto(origin+'/unmatched?source=WEBMASTER');assert.ok((await page.locator('body').innerText()).includes('RESOLVED_REDIRECT'));
 await page.goto(`${origin}/scanner?preset=SINGLE&url=${encodeURIComponent(f.source)}`);
 assert.equal(await page.locator('[name=scanScope]').inputValue(),'SINGLE');assert.equal(await page.locator('[name=maxPages]').inputValue(),'1');assert.equal(await page.locator('[name=seeds]').inputValue(),f.source);
 await page.getByRole('button',{name:'Запустить сканирование',exact:true}).click();await page.waitForFunction(()=>document.querySelector('[data-scanner-launch] [role=status]')?.textContent?.includes('создано'),{},{timeout:30000});
 const scan=await db.scan.findFirstOrThrow({where:{siteId:f.siteId,status:'PENDING'},orderBy:{startedAt:'desc'}}),c=scan.configJson as any;assert.equal(c.maxPages,1);assert.equal(c.single,true);assert.deepEqual(c.seeds,[f.source]);assert.equal(c.searchTargeted.source,'TEST_ONE');assert.deepEqual(c.searchTargeted.selected,[f.source]);await db.scan.update({where:{id:scan.id},data:{status:'STOPPED',finishedAt:new Date()}});assert.deepEqual(errors,[]);
 writeFileSync('test-results/redirect-alias-ui.json',JSON.stringify({status:'PASS',page360HistoricalAlias:true,scannerResolvedRedirect:true,unmatchedDiagnostic:true,singleUrlPrefill:true,singleLaunchBounded:true,noBrowserErrors:true},null,2));console.log('PASS redirect alias UI');
}finally{await browser.close();await db.scan.updateMany({where:{siteId:f.siteId,status:'PENDING'},data:{status:'STOPPED',finishedAt:new Date()}});for(const i of [target,web,met])await db.integration.update({where:{id:i.id},data:{configJson:json(i.configJson)}});await db.$disconnect();}

