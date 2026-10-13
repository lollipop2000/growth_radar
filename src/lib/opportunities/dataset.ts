import "server-only";
import { db } from "../db";
import { currentSite, readIntegration, config } from "../yandex/settings";
import { period, day, shift, days } from "../yandex/dates";
import { groupBy } from "../yandex/views";
import { searchAggregate, trafficAggregate, businessAggregate } from "./aggregate";
import { defaults, rulesConfig, type Dataset, type Snapshot, type RulesConfig } from "./model";
import { benchmarkPages } from "./rules";
import {datasetPageSelect,snapshotSelect} from './read-projections';
import type { Prisma } from '@prisma/client';
import type { ScanPage } from "@prisma/client";
import { goalConfig, type GoalConfig } from "../yandex/goal-types";
import { mappingRegistry } from "../business/typed-import";
import { matchUrl, urlMatcher } from "../yandex/matching";
import { commerceProfile, commerceBenchmarks } from "./commerce";
import {businessRevision,businessRevisionSelect} from '../business/revision';
import type {Workbook} from '../business/import';
import {availableMonths} from '../search/range';
import type {BusinessContext} from '../business/context';
import {searchDataset} from '../search/dataset';
import {monthlySelection,searchRange,shiftMonth,monthsBetween} from '../search/periods';
export function selectedDays(value?:string) {const n=Number(value);return [7,28,30,90].includes(n)?n:28;}
export const rulesIntegration=(siteId:string)=>`Rules Engine:${siteId}`;
export async function loadRulesConfig(siteId:string) {const row=await db.integration.findUnique({where:{type:rulesIntegration(siteId)}});return rulesConfig((row?.configJson as {thresholds?:RulesConfig}|null)?.thresholds??defaults);}
function snapshot(r:Prisma.ScanPageGetPayload<{select:typeof snapshotSelect}>|null|undefined):Snapshot|null {if(!r)return null;return {id:r.id,source:r.source,outcome:r.outcome,statusCode:r.statusCode,title:r.title,description:r.description,h1:r.h1,wordCount:r.wordCount,canonical:r.canonical,indexable:r.indexable,finalUrl:r.finalUrl,error:r.error,scannedAt:r.scannedAt.toISOString()};}
export async function prepareDataset(n:number|string=28,options:{searchCapture?:import('../search/dataset').SearchCapture;businessContext?:BusinessContext;siteId?:string;counterId?:string;hostId?:string;primaryGoals?:string[];goalConfig?:GoalConfig;now?:Date;range?:import('./model').Range}={}):Promise<Dataset> {
  const site=options.siteId?await db.site.findUniqueOrThrow({where:{id:options.siteId}}):await currentSite();
  const [mi,wi,c]=await Promise.all([readIntegration("METRIKA"),readIntegration("WEBMASTER"),loadRulesConfig(site.id)]), m=config(mi?.configJson),w=config(wi?.configJson);
  const counter=options.counterId??(m.siteId===site.id&&m.counterId===process.env.YANDEX_METRIKA_COUNTER_ID?m.counterId:undefined), host=options.hostId??(w.siteId===site.id?w.hostId:undefined), primaryGoals=options.primaryGoals??(counter&&m.siteId===site.id?m.primaryGoals??[]:[]);
  const typedGoals=options.goalConfig??goalConfig(counter&&m.siteId===site.id?m:{});
  const available=monthlySelection(n)?await availableMonths(site.id):[],current=options.range?{...options.range,expectedMonths:options.range.grain==='MONTH'?monthsBetween(options.range.from,options.range.to):[]}:searchRange(n,available,options.now),previous=current.grain==='MONTH'?{from:shiftMonth(current.from.slice(0,7),-current.expectedMonths.length)+'-01',to:shift(current.from,-1),days:Math.round((+day(current.from)-+day(shiftMonth(current.from.slice(0,7),-current.expectedMonths.length)+'-01'))/86400000),grain:'MONTH'}:{from:shift(current.from,-Number(n)),to:shift(current.from,-1),days:Number(n)},where={siteId:site.id,date:{gte:day(previous.from),lte:day(current.to)}};
  const [pages,metrika,webmaster,business,confirmedImports]=await Promise.all([
    options.businessContext?.pages??db.page.findMany({where:{siteId:site.id,active:true},select:datasetPageSelect}),
    counter?db.metrikaPageDaily.findMany({where:{...where,counterId:counter},select:{pageId:true,date:true,visits:true,visitors:true,goalConversionsJson:true}}):[],
    searchDataset(where,host,options.searchCapture),
    options.businessContext?.records??db.businessRecord.findMany({where:{siteId:site.id,import:{status:{in:["COMPLETED","COMPLETED_WITH_ERRORS"]}}},include:{import:{select:{kind:true}}},orderBy:[{createdAt:"desc"},{id:"desc"}]}),
    options.businessContext?.imports??db.import.findMany({where:{siteId:site.id,status:{in:["COMPLETED","COMPLETED_WITH_ERRORS"]}},select:businessRevisionSelect}),
  ]);
  const salesFiles=options.businessContext?.files.filter(i=>i.kind==='SALES')??await db.import.findMany({where:{id:{in:confirmedImports.filter(i=>i.kind==='SALES').map(i=>i.id)}},select:{id:true,sheetName:true,dataJson:true}}),salesById=new Map(salesFiles.map(i=>[i.id,i]));
  const salesImports=confirmedImports.filter(i=>i.kind==='SALES').map(i=>{
    const stored=new Set(business.filter(r=>r.importId===i.id).map(r=>r.sku));
    const source=salesById.get(i.id),workbook=source?.dataJson as unknown as Workbook,sheet=workbook?.sheets?.find(s=>s.name===source?.sheetName);
    const index=sheet?.headers.findIndex(h=>h.trim().toLowerCase()==='sku')??-1;
    const excludedSkus=index>=0?[...new Set(sheet!.rows.map(r=>r[index]?.trim()).filter(s=>s&&!stored.has(s)))]:[];
    return {...i,excludedSkus};
  });
  const boundary=day(current.from),priceDates=days(previous.from,previous.to,previous.grain==='MONTH'?600:90),trafficDates=days(current.from,current.to,current.grain==='MONTH'?600:90),searchDates=current.grain==='MONTH'?monthsBetween(current.from,current.to):days(current.from,current.to),inCurrent=(r:{date:Date})=>r.date>=boundary,inPrevious=(r:{date:Date})=>r.date<boundary,mg=groupBy(metrika,r=>r.pageId??""),wg=groupBy(webmaster,r=>r.pageId??""),bg=groupBy(business,r=>r.pageId??"");
  const commercialIndex=groupBy(business.map(r=>({...r,kind:r.import.kind})),r=>r.sku??'');
  const registry=mappingRegistry(business.filter(r=>r.import.kind==="MAPPING")).filter(r=>r.active);
  const match=urlMatcher(site.baseUrl,pages);
  const groupPages=new Map<string,Set<string|null>>();
  for(const product of registry){const id=match(product.rawUrl).pageId,ids=groupPages.get(product.productGroup)??new Set();ids.add(id);groupPages.set(product.productGroup,ids);}
  const linked=registry.flatMap(product=>{const ids=groupPages.get(product.productGroup)!;return ids.size===1&&![...ids].includes(null)?[{...product,pageId:[...ids][0]!}]:[];});
  const pg=groupBy(linked,p=>p.pageId);
  const prepared=pages.map(p=>{
    const mr=mg.get(p.id)??[],wr=wg.get(p.id)??[],mc=mr.filter(inCurrent),wc=wr.filter(inCurrent),md=groupBy(mc,r=>r.date.toISOString().slice(0,10)),wd=groupBy(wc,r=>r.date.toISOString().slice(0,10)),q=groupBy(wc,r=>r.query);
    const traffic=trafficAggregate(mc,typedGoals),previousTraffic=trafficAggregate(mr.filter(inPrevious),typedGoals),products=pg.get(p.id)??[],commerce=commerceProfile(products,products.flatMap(p=>commercialIndex.get(p.sku)??[]),current,previous,c,shift(current.to,1),traffic,previousTraffic,salesImports,priceDates);
    const b=businessAggregate(bg.get(p.id)??[],current,previous);
    if(b&&commerce){b.stock=commerce.freshness.stock.fresh?commerce.stock:null;b.price=commerce.priceAvg;b.available=commerce.available;b.sales=commerce.sales;b.previousSales=commerce.previousSales;b.productGroup=commerce.groups.map(g=>g.code).join(', ');}
    return {periodDays:current.days,id:p.id,url:p.url,pageType:p.pageType,scanner:snapshot(p.latestScanPage),content:snapshot(p.scanPages[0]),search:searchAggregate(wc,current),previousSearch:searchAggregate(wr.filter(inPrevious),previous),traffic,previousTraffic,business:b,commerce,ctrBenchmark:null,conversionBenchmark:null,conversionBenchmarkScope:null,
      searchTrend:current.grain==='MONTH'?searchDates.map(month=>({date:month,value:searchAggregate(wc.filter(r=>(r.periodMonth??r.date.toISOString().slice(0,7))===month))?.impressions??null})):searchDates.map(date=>({date,value:searchAggregate(wd.get(date)??[])?.impressions??null})),trafficTrend:trafficDates.map(date=>({date,value:trafficAggregate(md.get(date)??[],typedGoals)?.visits??null})),queries:[...q].map(([query,rows])=>({query,...searchAggregate(rows)!})).sort((a,b)=>b.impressions-a.impressions).slice(0,20)};
  });
  const mc=metrika.filter(inCurrent),wc=webmaster.filter(inCurrent);
  const dataset:Dataset={businessRevision:businessRevision(confirmedImports),siteId:site.id,siteUrl:site.baseUrl,period:current,previous,createdAt:new Date().toISOString(),config:c,primaryGoals,goalConfig:typedGoals,pages:prepared,totals:{search:searchAggregate(wc,current),traffic:trafficAggregate(mc,typedGoals),sales:null},coverage:{metrikaDays:new Set(mc.map(r=>r.date.toISOString().slice(0,10))).size,webmasterDays:new Set(wc.filter(r=>r.grain!=='MONTH').map(r=>r.date.toISOString().slice(0,10))).size,matchedVisits:mc.filter(r=>r.pageId).reduce((s,r)=>s+r.visits,0),totalVisits:mc.reduce((s,r)=>s+r.visits,0)}};
  const sales=prepared.flatMap(p=>p.commerce?.sales?[p.commerce.sales]:p.business?.sales?[p.business.sales]:[]);if(sales.length)dataset.totals.sales={orders:sumSales(sales,"orders"),quantity:sumSales(sales,"quantity"),quantityKg:sumSales(sales,"quantityKg"),revenue:sumSales(sales,"revenue"),days:Math.max(...sales.map(s=>s.days))};
  benchmarkPages(prepared,c);commerceBenchmarks(prepared,c);return dataset;
}
function sumSales(rows:NonNullable<Dataset["totals"]["sales"]>[],key:"orders"|"quantity"|"quantityKg"|"revenue"){return rows.every(r=>r[key]!=null)?rows.reduce((s,r)=>s+r[key]!,0):null;}
