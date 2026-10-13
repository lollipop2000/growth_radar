import 'server-only';
import {prepareBusinessSummaryContext,type BusinessSummaryContext} from './context';
import {businessQualitySummary} from './quality';
import {mappingRegistry} from './typed-import';
import {urlMatcher} from '../yandex/matching';
import {groupBy} from '../yandex/views';
import {currentSite,config,readIntegration} from '../yandex/settings';
import {day,shift} from '../yandex/dates';
import {searchRange} from '../search/periods';
import {loadRulesConfig} from '../opportunities/dataset';
import {salesAggregate,trafficAggregate,searchAggregate} from '../opportunities/aggregate';
import {coveredSalesCalculator,type CoveredSales} from '../opportunities/transactional';
import {latestRows,convertedStock,fresh} from '../opportunities/commerce';
import type {RulesConfig,Range,Sales} from '../opportunities/model';
import type {Workbook} from './import';
import {analyticsSearchDataset} from '../search/dataset';
import {goalConfig} from '../yandex/goal-types';

const combine=(rows:Sales[],coverage:'min'|'max'):Sales|null=>!rows.length?null:{
 orders:total(rows,'orders'),quantity:total(rows,'quantity'),quantityKg:total(rows,'quantityKg'),revenue:total(rows,'revenue'),
 days:Math[coverage](...rows.map(r=>r.days))};
function total(rows:Sales[],key:'orders'|'quantity'|'quantityKg'|'revenue'){return rows.every(r=>r[key]!=null)?rows.reduce((s,r)=>s+r[key]!,0):null;}
/** Same selected-SKU/coverage semantics as Commerce; no previous-period profiles or benchmarks. */
export function commerceSummary(context:BusinessSummaryContext,baseUrl:string,range:Range,c:RulesConfig){
 const registry=mappingRegistry(context.records.filter(r=>r.import.kind==='MAPPING')).filter(r=>r.active),match=urlMatcher(baseUrl,context.pages);
 const groupPages=new Map<string,Set<string|null>>();for(const p of registry){const ids=groupPages.get(p.productGroup)??new Set();ids.add(match(p.rawUrl).pageId);groupPages.set(p.productGroup,ids);}
 const linked=registry.flatMap(p=>{const ids=groupPages.get(p.productGroup)!;return ids.size===1&&!ids.has(null)?[{...p,pageId:[...ids][0]!}]:[];});
 const byPage=groupBy(linked,p=>p.pageId),bySku=groupBy(context.records.map(r=>({...r,kind:r.import.kind})),r=>r.sku??''),rawPages=groupBy(context.records,r=>r.pageId??'');
 const files=new Map(context.files.map(f=>[f.id,f])),stored=new Map<string,Set<string|null>>();for(const r of context.records){const skus=stored.get(r.importId)??new Set();skus.add(r.sku);stored.set(r.importId,skus);}
 const imports=context.imports.filter(i=>i.kind==='SALES').map(i=>{const file=files.get(i.id),sheet=(file?.dataJson as unknown as Workbook)?.sheets?.find(s=>s.name===file?.sheetName),index=sheet?.headers.findIndex(h=>h.trim().toLowerCase()==='sku')??-1;return {...i,excludedSkus:index<0?[]:[...new Set(sheet!.rows.map(r=>r[index]?.trim()).filter(s=>s&&!stored.get(i.id)?.has(s)))]};});
 const calculateSales=coveredSalesCalculator(range,imports),today=shift(range.to,1),sales:Sales[]=[];let zeroSalesPages=0,staleSalesPages=0,incompleteStockKgPages=0;
 for(const page of context.pages){const products=byPage.get(page.id)??[];if(!products.length){const legacy=salesAggregate(rawPages.get(page.id)??[],range);if(legacy)sales.push(legacy);continue;}
  const skuSales=products.map(p=>{const rows=(bySku.get(p.sku)??[]).filter(r=>r.kind==='SALES'||r.kind==='LEGACY');return imports.length?calculateSales(rows,p.sku):salesAggregate(rows,range);});
  const observed=skuSales.filter((s):s is NonNullable<typeof s>=>s!=null),summary=combine(observed,'min');if(summary){summary.days=Math.min(...skuSales.map(s=>s?.days??0));sales.push(summary);}
  const dates=products.map((p,i)=>{const selected=skuSales[i];return selected&&'transactionalDays' in selected&&selected.transactionalDays?(selected as CoveredSales).latestDate:(bySku.get(p.sku)??[]).filter(r=>(r.kind==='SALES'||r.kind==='LEGACY')&&r.date&&r.date.toISOString().slice(0,10)<=today).map(r=>r.date!.toISOString().slice(0,10)).sort().at(-1)??null;});
  const oldest=dates.filter((d):d is string=>d!=null).sort()[0]??null,salesFresh=fresh(oldest,today,c.salesFreshDays),complete=observed.some(s=>'transactionalDays' in s&&s.transactionalDays)?summary?.days===range.days:!!summary&&summary.days/range.days>=c.minCoverage;
  if(complete&&summary?.quantityKg===0&&dates.every(Boolean)&&salesFresh.fresh)zeroSalesPages++;
  if(salesFresh.ageDays!=null&&salesFresh.ageDays>c.salesFreshDays)staleSalesPages++;
  if(products.some(p=>convertedStock(latestRows(bySku.get(p.sku)??[],'STOCK',today),p.kgPerUnit??null)==null))incompleteStockKgPages++;
 }
 return {sales:combine(sales,'max'),zeroSalesPages,staleSalesPages,incompleteStockKgPages,salesImports:imports};
}
export async function commerceDashboardSummary(n:number,now=new Date()){
 const site=await currentSite(),period=searchRange(n,[],now);
 const [context,mi,wi,c]=await Promise.all([prepareBusinessSummaryContext(site.id),readIntegration('METRIKA'),readIntegration('WEBMASTER'),loadRulesConfig(site.id)]),m=config(mi?.configJson),w=config(wi?.configJson),counter=m.siteId===site.id&&m.counterId&&m.counterId===process.env.YANDEX_METRIKA_COUNTER_ID?m.counterId:undefined,goals=goalConfig(counter?m:{}),dates={gte:day(period.from),lte:day(period.to)};
 const [trafficRows,searchRows,quality]=await Promise.all([
 counter?dbTraffic(site.id,counter,dates):[],
 analyticsSearchDataset({siteId:site.id,date:dates},w.siteId===site.id?w.hostId:undefined),
 businessQualitySummary(site,now,context)
 ]);
 const commerce=commerceSummary(context,site.baseUrl,period,c),confirmedThrough=commerce.salesImports.filter(i=>i.salesImportMode==='TRANSACTIONAL'&&i.coverageTo).map(i=>i.coverageTo!.toISOString().slice(0,10)).sort().at(-1)??null;
 return {siteId:site.id,siteUrl:site.baseUrl,period,pages:context.pages,quality,goalConfig:goals,commerce,confirmedThrough,totals:{sales:commerce.sales,traffic:trafficAggregate(trafficRows,goals),search:searchAggregate(searchRows,period)},coverage:{metrikaDays:new Set(trafficRows.map(r=>r.date.toISOString().slice(0,10))).size,webmasterDays:new Set(searchRows.filter(r=>r.grain!=='MONTH').map(r=>r.date.toISOString().slice(0,10))).size,totalVisits:trafficRows.reduce((s,r)=>s+r.visits,0),matchedVisits:trafficRows.filter(r=>r.pageId).reduce((s,r)=>s+r.visits,0)}};
}
import {db} from '../db';
function dbTraffic(siteId:string,counterId:string,date:{gte:Date;lte:Date}){return db.metrikaPageDaily.findMany({where:{siteId,counterId,date},select:{pageId:true,date:true,visits:true,visitors:true,goalConversionsJson:true}});}

