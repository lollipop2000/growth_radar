import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {chromium} from 'playwright';
import {db} from '../src/lib/db';
import {json} from '../src/lib/yandex/settings';
import {assertFixtureServer} from './stabilization1-fixture-guard.mjs';
const port=3002,origin=`http://127.0.0.1:${port}`;
await assertFixtureServer(process.env.DATABASE_URL!,port);
const {siteId}=JSON.parse(readFileSync('test-results/data-activation-fixtures.json','utf8'));
const site=await db.site.findUniqueOrThrow({where:{id:siteId}}),target=await db.integration.findUniqueOrThrow({where:{type:'Target Site'}}),web=await db.integration.findUniqueOrThrow({where:{type:'Yandex Webmaster'}});
const browser=await chromium.launch({headless:true}),page=await browser.newPage();
await page.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
const evidence:any[]=[];
try{
 await db.integration.update({where:{id:target.id},data:{configJson:json({baseUrl:site.baseUrl})}});await db.integration.update({where:{id:web.id},data:{configJson:json({siteId,hostId:'activation-fixture'})}});
 for(const source of ['SEO_RESCAN','SEARCH_UNMATCHED']){
  await page.goto(origin+'/scanner');
  await page.locator('[name=scanScope]').selectOption('SOURCE');await page.locator('select[name=scope]').selectOption(source);
  const transport=source==='SEO_RESCAN'?'BROWSER_ONLY':'HTTP_ONLY',delayMs=source==='SEO_RESCAN'?'10000':'3000';
  await page.locator('[name=transport]').selectOption(transport);await page.locator('[name=delayMs]').selectOption(delayMs);
  const before=await db.scan.count({where:{siteId}});
  await page.getByRole('button',{name:'Предпросмотр источника',exact:true}).click();await page.locator('[data-search-preview] tbody tr').first().waitFor({timeout:30000});
  const fields=await page.locator('[data-scanner-launch]').evaluate((f:HTMLFormElement)=>Object.fromEntries([...new FormData(f).entries()].filter(([key])=>!key.startsWith('$ACTION'))));
  console.log(JSON.stringify({source,fields}));
  assert.equal(fields.scanScope,'SOURCE');assert.equal(fields.scope,source);assert.equal(fields.searchScope,'TOP100');assert.equal(fields.transport,transport);assert.equal(fields.delayMs,delayMs);assert.equal(await db.scan.count({where:{siteId}}),before);
  await page.getByRole('button',{name:'Запустить сканирование',exact:true}).click();await page.waitForFunction(()=>document.querySelector('[data-scanner-launch] [role=status]')?.textContent?.includes('создано'),{},{timeout:30000});
  const scan=await db.scan.findFirstOrThrow({where:{siteId,status:'PENDING'},orderBy:{startedAt:'desc'}}),c=scan.configJson as any;
  await db.scan.update({where:{id:scan.id},data:{status:'STOPPED',finishedAt:new Date()}});
  evidence.push({source,fields,actual:{seedOnly:c.seedOnly,seeds:c.seeds?.length,searchSource:c.searchTargeted?.source,maxPages:c.maxPages}});
  assert.equal(c.searchTargeted?.source,source);assert.equal(c.seedOnly,true);assert.ok(c.seeds.length>0&&c.seeds.length<=50);
  assert.equal(scan.mode,transport==='BROWSER_ONLY'?'BROWSER':'HTTP');assert.equal(c.delayMs,Number(delayMs));assert.equal(c.browserFallback,false);
  await page.reload();assert.ok(await page.locator('[data-search-scan-scope]').filter({hasText:'без обхода ссылок сайта'}).count());
 }
 writeFileSync('test-results/search-selection-ui.json',JSON.stringify({status:'PASS',manualSourceSwitch:true,previewPreservesSelection:true,noWholeSiteFallback:true,evidence},null,2));
 console.log('PASS manual Search selection and launch');
}finally{await browser.close();await db.scan.updateMany({where:{siteId,status:'PENDING'},data:{status:'STOPPED',finishedAt:new Date()}});await db.integration.update({where:{id:target.id},data:{configJson:json(target.configJson)}});await db.integration.update({where:{id:web.id},data:{configJson:json(web.configJson)}});await db.$disconnect();}
