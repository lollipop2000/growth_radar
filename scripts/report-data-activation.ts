import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {writeFileSync} from 'node:fs';
import {db} from '../src/lib/db';
import {currentSite} from '../src/lib/yandex/settings';
import {searchScope,searchScanPreview} from '../src/lib/scanner/search-scope';
import {calculateOpportunities} from '../src/lib/opportunities/service';
import {calculateSeoActions} from '../src/lib/seo-actions/service';
import {priorityOrder} from '../src/lib/seo-actions/config';
const site=await currentSite();assert.equal(site.id,'cmuv42bst000020wcam8pixal');
async function protectedData(){const result:Record<string,unknown>={};for(const name of ['businessRecord','scan','scanPage','jobRun','metrikaPageDaily','webmasterQueryDaily'] as const){const rows=await (db[name] as any).findMany({where:{siteId:site.id} as never,orderBy:{id:'asc'} as never} as never).catch(async()=>name==='scanPage'?db.scanPage.findMany({where:{page:{siteId:site.id}},orderBy:{id:'asc'}}):Promise.reject(Error('Snapshot failed '+name)));result[name]={rows:rows.length,sha256:createHash('sha256').update(JSON.stringify(rows)).digest('hex')};}return result;}
try{
 const before=await protectedData(),search=await searchScope();
 writeFileSync('test-results/data-activation-search-before.json',JSON.stringify(search,null,2));
 const previews={top50:await searchScanPreview('SEO_RESCAN','TOP50'),top100:await searchScanPreview('SEO_RESCAN','TOP100'),all:await searchScanPreview('SEO_RESCAN','ALL'),unmatched:await searchScanPreview('SEARCH_UNMATCHED','TOP100')};
 writeFileSync('test-results/data-activation-previews.json',JSON.stringify(previews,null,2));
 const commerce=await calculateOpportunities(28),seo=await calculateSeoActions('M3');
 const opportunities=await db.opportunity.findMany({where:{siteId:site.id,isCurrent:true,periodFrom:new Date(commerce.dataset.period.from),periodTo:new Date(commerce.dataset.period.to)},orderBy:{score:'desc'}});
 const actions=await db.seoAction.findMany({where:{siteId:site.id,isCurrent:true,periodFrom:new Date(seo.d.period.from),periodTo:new Date(seo.d.period.to)}});
 await calculateOpportunities(28);await calculateSeoActions('M3');
 assert.equal(await db.opportunity.count({where:{siteId:site.id,isCurrent:true,periodFrom:new Date(commerce.dataset.period.from),periodTo:new Date(commerce.dataset.period.to)}}),opportunities.length);
 assert.equal(await db.seoAction.count({where:{siteId:site.id,isCurrent:true,periodFrom:new Date(seo.d.period.from),periodTo:new Date(seo.d.period.to)}}),actions.length);
 const after=await protectedData();assert.deepEqual(after,before);
 const top=opportunities.filter(o=>o.domain==='COMMERCE'&&['GROWTH','RISK'].includes(o.primaryType)&&o.status==='ACTIVE').slice(0,20).map(o=>{const p=commerce.dataset.pages.find(p=>p.id===o.pageId)!;return {url:p.url,rule:o.ruleId,score:o.score,visits:p.traffic?.visits??null,revenue:p.commerce?.sales?.revenue??null,kg:p.commerce?.sales?.quantityKg??null,stockKg:p.commerce?.stockKg??null,daysOfStock:p.commerce?.daysOfStock??null,evidence:(o.evidenceJson as any).signal.evidence};});
 const visible=actions.filter(a=>(a.evidenceJson as any)?.eligibility!=='NOT_ELIGIBLE'),topSeo=visible.filter(a=>a.status==='ACTIVE').sort((a,b)=>priorityOrder.indexOf(a.priority)-priorityOrder.indexOf(b.priority)).slice(0,20).map(a=>{const e=a.evidenceJson as any;return {url:seo.d.pages.find(p=>p.id===a.pageId)?.url,priority:a.priority,action:a.title,category:a.category,impressions:e.impressions??e.search?.impressions??null,ctr:e.ctr??e.search?.ctr??null,position:e.avgPosition??e.position??e.search?.avgPosition??null,intent:e.intent??e.queryIntent??null,eligibility:e.eligibility,evidence:e};});
 const report={status:'PASS',salesConfirmed:true,protectedDataUnchanged:true,idempotent:true,protectedData:after,productionScansStarted:0,commerce:{period:commerce.dataset.period,counts:commerce.counts,growth:opportunities.filter(o=>o.domain==='COMMERCE'&&o.primaryType==='GROWTH').length,risk:opportunities.filter(o=>o.domain==='COMMERCE'&&o.primaryType==='RISK').length,dataQuality:opportunities.filter(o=>o.primaryType==='DATA_QUALITY').length,top},seo:{period:seo.d.period,thresholds:seo.c,total:actions.length,mainTopEligibleOrUncertain:visible.length,excludedNotEligible:actions.length-visible.length,priorities:Object.fromEntries(priorityOrder.map(p=>[p,visible.filter(a=>a.priority===p).length])),categories:Object.fromEntries([...new Set(visible.map(a=>a.category))].map(c=>[c,visible.filter(a=>a.category===c).length])),top:topSeo},search:search.summary,matchingAfter:(await searchScope()).summary,rescannedPages:0};
 writeFileSync('test-results/data-activation-results.json',JSON.stringify(report,null,2));console.log(JSON.stringify({...report,protectedData:undefined,commerce:{...report.commerce,top:undefined},seo:{...report.seo,top:undefined}}));
}finally{await db.$disconnect();}
