import {chromium} from 'playwright';
import {db} from '../src/lib/db';
import {json} from '../src/lib/yandex/settings';
import {calculateOpportunities} from '../src/lib/opportunities/service';
import {goalConfig} from '../src/lib/yandex/goal-types';
import {readFileSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const fixture=JSON.parse(readFileSync('test-results/commerce-acceptance.json','utf8')),site=await db.site.findUniqueOrThrow({where:{id:fixture.siteId}}),target=await db.integration.findUniqueOrThrow({where:{type:'Target Site'}}),metrika=await db.integration.findUniqueOrThrow({where:{type:'Yandex Metrika'}});
assert.equal(new URL(site.baseUrl).hostname,'127.0.0.1');
const browser=await chromium.launch({headless:true}),page=await browser.newPage({viewport:{width:1440,height:1000}});
try{
 const counter=process.env.YANDEX_METRIKA_COUNTER_ID!;
 await db.metrikaPageDaily.updateMany({where:{siteId:site.id},data:{counterId:counter}});
 await db.integration.update({where:{id:target.id},data:{configJson:json({...target.configJson as object,url:site.baseUrl,baseUrl:site.baseUrl})}});
 await db.integration.update({where:{id:metrika.id},data:{configJson:json({siteId:site.id,counterId:counter,goals:[],goalTypes:{},dailyEnabled:false})}});
 const calculated=await calculateOpportunities(28,{siteId:site.id,counterId:counter,goalConfig:goalConfig({}),hostId:'commerce-no-webmaster'});
 const result:{route:string;status:number;overflow:boolean}[]=[];
 for(const route of ['/','/opportunities?domain=COMMERCE','/business-data',`/pages/${fixture.pageId}`,`/opportunities/${fixture.opportunityId}`]){
  const response=await page.goto('http://127.0.0.1:3000'+route,{waitUntil:'networkidle',timeout:60000});assert.equal(response?.status(),200);
  if(route==='/'){await page.locator('[data-commerce-kpi]').waitFor();assert.match(await page.locator('main').innerText(),/Ходовой товар заканчивается/);}
  if(route==='/business-data')await page.locator('[data-business-quality]').waitFor();
  if(route.startsWith('/pages/')||route.startsWith('/opportunities/')){await page.locator('[data-commerce-profile]').waitFor();assert.match(await page.locator('main').innerText(),/Запас в днях/);assert.match(await page.locator('main').innerText(),/GROUP-0/);}
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+2);assert.equal(overflow,false);
  await page.screenshot({path:`test-results/commerce-ui-${route==='/'?'dashboard':route.startsWith('/pages/')?'page':route.startsWith('/opportunities/')?'detail':route.startsWith('/business')?'quality':'list'}.png`,fullPage:false});result.push({route,status:response!.status(),overflow});
 }
 const groupPageIds=calculated.dataset.pages.filter(p=>p.commerce?.groups.some(g=>g.code==='GROUP-0')).map(p=>p.id);
 const expected=await db.opportunity.findMany({where:{siteId:site.id,isCurrent:true,status:'ACTIVE',domain:'COMMERCE',pageId:{in:groupPageIds},periodFrom:new Date(calculated.dataset.period.from),periodTo:new Date(calculated.dataset.period.to)},select:{pageId:true}});assert.ok(expected.length>0);
 await page.goto('http://127.0.0.1:3000/opportunities?domain=COMMERCE&group=GROUP-0',{waitUntil:'networkidle'});
 const actual=await page.locator('section table tbody tr td:nth-child(2) a').evaluateAll(a=>a.map(e=>e.getAttribute('href')));
 assert.deepEqual(actual.sort(),expected.map(o=>'/pages/'+o.pageId).sort());
 await page.setViewportSize({width:390,height:844});await page.goto('http://127.0.0.1:3000/',{waitUntil:'networkidle'});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+2),false);await page.screenshot({path:'test-results/commerce-ui-mobile.png',fullPage:false});
 writeFileSync('test-results/commerce-ui-acceptance.json',JSON.stringify({status:'PASS',routes:result,mobile:true,commerceWithoutWebmaster:true,groupFilter:true},null,2));console.log('PASS: Commerce Dashboard, filters, Page 360, detail, business quality, mobile; no Webmaster data.');
}finally{
 await db.integration.update({where:{id:target.id},data:{configJson:json(target.configJson)}});
 await db.integration.update({where:{id:metrika.id},data:{configJson:json(metrika.configJson)}});
 await browser.close();await db.$disconnect();
}

