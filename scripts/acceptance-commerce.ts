import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {db} from '../src/lib/db';
import {calculateOpportunities} from '../src/lib/opportunities/service';
import {days,day} from '../src/lib/yandex/dates';
import {goalConfig} from '../src/lib/yandex/goal-types';
import {normalizeUrl} from '../src/lib/scanner/url';
const now=new Date('2026-10-06T12:00:00Z');
try{
 const site=await db.site.create({data:{baseUrl:`http://127.0.0.1:4777/commerce-${Date.now()}/`,name:'Commerce acceptance fixture'}});
 const mapping=await db.import.create({data:{siteId:site.id,filename:'local-mapping.csv',sizeBytes:1,kind:'MAPPING',status:'COMPLETED'}}),stocks=await db.import.create({data:{siteId:site.id,filename:'local-stock.csv',sizeBytes:1,kind:'STOCK',status:'COMPLETED'}}),prices=await db.import.create({data:{siteId:site.id,filename:'local-prices.csv',sizeBytes:1,kind:'PRICES',status:'COMPLETED'}}),sales=await db.import.create({data:{siteId:site.id,filename:'local-sales.csv',sizeBytes:1,kind:'SALES',status:'COMPLETED'}}),fixtureIntegration=await db.integration.create({data:{type:`Commerce fixture:${site.id}`}}),job=await db.jobRun.create({data:{integrationId:fixtureIntegration.id,siteId:site.id,source:'METRIKA',mode:'FIXTURE',status:'COMPLETED',dateFrom:day('2026-08-11'),dateTo:day('2026-10-05')}});
 let mapRow=0,stockRow=0,priceRow=0,salesRow=0;
 for(let i=0;i<6;i++){
  const url=site.baseUrl+`product-${i}/`,p=await db.page.create({data:{siteId:site.id,url,normalizedUrl:normalizeUrl(url),path:new URL(url).pathname,pageType:'product'}});
  for(let j=0;j<2;j++){
   const sku=`00${i}${j}`,common={siteId:site.id,pageId:p.id,sku,productGroup:`GROUP-${i}`,productName:`Товар ${i}`,rawUrl:url,normalizedUrl:normalizeUrl(url)};
   await db.businessRecord.create({data:{...common,importId:mapping.id,rowNumber:++mapRow,attributesJson:{businessKind:'MAPPING',active:true}}});
   await db.businessRecord.createMany({data:['2026-09-07','2026-10-05'].map(date=>({...common,importId:stocks.id,rowNumber:++stockRow,date:day(date),stock:j?20:10,attributesJson:{businessKind:'STOCK','Единица измерения':'кг'}}))});
   await db.businessRecord.createMany({data:['2026-09-07','2026-10-05'].map(date=>({...common,importId:prices.id,rowNumber:++priceRow,date:day(date),price:j?300:100,attributesJson:{businessKind:'PRICES','Валюта':'RUB','Тип цены':'Розничная'}}))});
   await db.businessRecord.createMany({data:days('2026-08-11','2026-10-05').map(date=>({...common,importId:sales.id,rowNumber:++salesRow,date:day(date),quantityKg:j?6:4,revenue:5000,orders:1,attributesJson:{businessKind:'SALES'}}))});
  }
  await db.metrikaPageDaily.createMany({data:days('2026-08-11','2026-10-05').map(date=>({siteId:site.id,pageId:p.id,counterId:'commerce-fixture',date:day(date),rowKey:`${p.id}-${date}`,url,normalizedUrl:normalizeUrl(url),visits:100,visitors:90,pageviews:100,jobRunId:job.id}))});
 }
 const options={siteId:site.id,counterId:'commerce-fixture',hostId:'commerce-no-webmaster',goalConfig:goalConfig({}),now};
 const first=await calculateOpportunities(28,options),d=first.dataset;
 assert.equal(d.totals.search,null);assert.equal(d.pages.length,6);assert.equal(d.totals.sales?.revenue,1680000);
 assert.equal(d.pages[0].commerce?.stockKg,30);assert.equal(d.pages[0].commerce?.sales?.quantityKg,280);assert.equal(d.pages[0].commerce?.priceMin,100);assert.equal(d.pages[0].commerce?.priceMax,300);assert.equal(d.pages[0].commerce?.daysOfStock,3);assert.equal(d.pages[0].commerce?.revenuePerVisit,100);assert.equal(d.pages[0].commerce?.kgPerVisit,.1);
 assert.equal(first.counts.RULE_12,6);assert.equal(first.counts.RULE_20,6);assert.equal(first.counts.RULE_22,6);
 const before=await db.opportunity.findMany({where:{siteId:site.id}});await db.opportunity.update({where:{id:before[0].id},data:{status:'DISMISSED'}});
 await calculateOpportunities(28,options);assert.equal(await db.opportunity.count({where:{siteId:site.id}}),before.length);assert.equal((await db.opportunity.findUniqueOrThrow({where:{id:before[0].id}})).status,'DISMISSED');
 const report={status:'PASS',siteId:site.id,pageId:d.pages[0].id,opportunityId:before[0].id,webmasterRows:0,counts:first.counts,skuAggregation:true,daysOfStock:3,repeatWithoutDuplicates:true,historyPreserved:true};writeFileSync('test-results/commerce-acceptance.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{await db.$disconnect();}

