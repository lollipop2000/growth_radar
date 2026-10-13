import {db} from '../src/lib/db';
import {currentSite} from '../src/lib/yandex/settings';
import {calculateOpportunities} from '../src/lib/opportunities/service';
import {businessQuality} from '../src/lib/business/quality';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const hash=(x:unknown)=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const baseline=JSON.parse(readFileSync('test-results/sprint3-3-before.json','utf8'));
async function safe(siteId:string){const scans=await db.scan.findMany({where:{siteId},orderBy:{id:'asc'}}),jobs=await db.jobRun.findMany({where:{siteId},orderBy:{id:'asc'}});assert.equal(hash(scans),baseline.scans);assert.equal(hash(jobs),baseline.jobs);return {scansUnchanged:scans.length,jobsUnchanged:jobs.length,newScans:0,newSyncs:0,uncertainPostUnchanged:true};}
try{
 const site=await currentSite();assert.equal(site.id,baseline.siteId);await safe(site.id);
 const integrations=await db.integration.findMany({where:{type:{in:['Target Site','Yandex Metrika','Yandex Webmaster']}},select:{type:true,configJson:true},orderBy:{id:'asc'}});
 const old=await db.opportunity.findMany({where:{siteId:site.id}}),now=new Date(),first=await calculateOpportunities(28,{now}),d=first.dataset;
 const items=await db.opportunity.findMany({where:{siteId:site.id},orderBy:[{score:'desc'},{id:'asc'}]}),current=items.filter(o=>o.isCurrent&&o.periodFrom.toISOString().slice(0,10)===d.period.from&&o.periodTo.toISOString().slice(0,10)===d.period.to);
 for(const prior of old){const next=items.find(o=>o.id===prior.id);assert.ok(next);if(!next.isCurrent)assert.equal(hash(next.evidenceJson),hash(prior.evidenceJson));if(prior.status==='DISMISSED')assert.equal(next.status,'DISMISSED');}
 await calculateOpportunities(28,{now});assert.equal(await db.opportunity.count({where:{siteId:site.id}}),items.length);
 assert.equal(hash(await db.integration.findMany({where:{type:{in:['Target Site','Yandex Metrika','Yandex Webmaster']}},select:{type:true,configJson:true},orderBy:{id:'asc'}})),hash(integrations));
 const safety=await safe(site.id),profiles=d.pages.flatMap(p=>p.commerce?[p.commerce]:[]),skus=profiles.flatMap(p=>p.skus),sum=(v:(number|null|undefined)[])=>v.some(x=>x!=null)?v.reduce<number>((s,x)=>s+(x??0),0):null,stockByUnit=Object.fromEntries([...new Set(skus.map(s=>s.stockUnit??'Не указана'))].map(u=>[u,sum(skus.filter(s=>(s.stockUnit??'Не указана')===u).map(s=>s.stock))]));
 const top=current.filter(o=>o.domain==='COMMERCE').slice(0,10).map(o=>{const page=(o.evidenceJson as unknown as {page:typeof d.pages[number]}).page,x=page.commerce!;return {id:o.id,pageId:o.pageId,url:page.url,name:x.groups.map(g=>g.name).join(', '),rule:o.ruleId,score:o.score,searchScore:o.searchScore,commerceScore:o.commerceScore,revenue:x.sales?.revenue??null,kg:x.sales?.quantityKg??null,visits:page.traffic?.visits??null,stock:x.stock,stockUnit:x.stockUnit,daysOfStock:x.daysOfStock,priceMin:x.priceMin,priceMax:x.priceMax};});
 const report={status:'PASS',period:d.period,previous:d.previous,dataset:{pages:d.pages.length,productGroups:new Set(profiles.flatMap(p=>p.groups.map(g=>g.code))).size,sku:skus.length,pagesWithBusiness:profiles.length,pagesWithSales:profiles.filter(p=>p.sales).length,pagesWithStock:profiles.filter(p=>p.stock!=null).length,pagesWithPrices:profiles.filter(p=>p.priceAvg!=null).length,pagesWithVisits:d.pages.filter(p=>p.traffic).length,completeSalesPages:profiles.filter(p=>p.salesComplete).length,pagesWithStockKg:profiles.filter(p=>p.stockKg!=null).length},totals:{sales:d.totals.sales,stockByUnit,stockKnownSku:skus.filter(s=>s.stock!=null).length,stockUnknownSku:skus.filter(s=>s.stock==null).length,visits:d.totals.traffic?.visits},rules:first.counts,top10:top,scoreDistribution:{'80–100':current.filter(o=>o.score>=80).length,'60–79':current.filter(o=>o.score>=60&&o.score<80).length,'40–59':current.filter(o=>o.score>=40&&o.score<60).length,'<40':current.filter(o=>o.score<40).length},quality:await businessQuality(site),repeatWithoutDuplicates:true,historyPreserved:true,safety,generatedAt:new Date().toISOString()};
 writeFileSync('test-results/sprint3-3-production.json',JSON.stringify(report,null,2));console.log(JSON.stringify({...report,top10:undefined,quality:report.quality.mapping}));
}finally{await db.$disconnect();}
