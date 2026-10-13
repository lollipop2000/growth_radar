import type { Range, RulesConfig, Sales, Traffic, PreparedPage } from './model';
import { salesAggregate, type BusinessInput } from './aggregate';
import type { ProductMapping } from '../business/typed-import';
import {days} from '../yandex/dates';
import {coveredSales,type SalesImport,type CoveredSales} from './transactional';

export type CommercialRow=BusinessInput & {id?:string;kind?:string};
export type SkuProfile={sku:string;productGroup:string;name:string;kgPerUnit:number|null;stock:number|null;stockKg:number|null;stockUnit:string|null;stockDate:string|null;price:number|null;priceMin:number|null;priceMax:number|null;priceDate:string|null;sales:Sales|null;previousSales:Sales|null;currency:string|null;priceComparable:boolean};
export type Freshness={date:string|null;ageDays:number|null;fresh:boolean;complete?:boolean};
export type Benchmarks={scope:string;peers:number;visits:number|null;revenue:number|null;revenueP80:number|null;revenuePerVisit:number|null;kgPerVisit:number|null;ordersPer100:number|null};
export type CommerceProfile={groups:{code:string;name:string}[];category:string|null;skus:SkuProfile[];sales:Sales|null;previousSales:Sales|null;stock:number|null;stockKg:number|null;stockUnit:string|null;stockKgCoverage:number;stockUnitsCoverage:number;averageDailySalesKg:number|null;salesProvenance:CoveredSales["provenance"];salesModes:string[];transactionalDays:number;zeroSales:boolean;previousStockKg:number|null;stockChange:number|null;available:boolean|null;priceMin:number|null;priceMax:number|null;priceAvg:number|null;previousPriceAvg:number|null;priceChange:number|null;daysOfStock:number|null;stockZone:string|null;revenuePerVisit:number|null;kgPerVisit:number|null;ordersPer100:number|null;revenuePerOrder:number|null;kgPerOrder:number|null;changes:{visits:number|null;revenue:number|null;kg:number|null;orders:number|null};freshness:{stock:Freshness;price:Freshness;sales:Freshness};salesComplete:boolean;previousSalesComplete:boolean;priceComparable:boolean;priceComparisonComplete:boolean;benchmarks:Benchmarks|null};
export const ratio=(a:number|null|undefined,b:number|null|undefined)=>a!=null&&b!=null&&b>0?a/b:null;
export const delta=(a:number|null|undefined,b:number|null|undefined)=>{if(a===0&&b===0)return 0;const v=ratio(a,b);return v==null?null:(v-1)*100;};
export function median(values:number[]) {const a=[...values].sort((x,y)=>x-y),i=Math.floor(a.length/2);return a.length?a.length%2?a[i]:(a[i-1]+a[i])/2:null;}
export function percentile(values:number[],p:number){const a=[...values].sort((x,y)=>x-y);if(!a.length)return null;const i=(a.length-1)*p,l=Math.floor(i);return a[l]+(a[Math.ceil(i)]-a[l])*(i-l);}
const iso=(d:Date|null)=>d?.toISOString().slice(0,10)??null;
const attrs=(r:CommercialRow)=>r.attributesJson&&typeof r.attributesJson==='object'?r.attributesJson as Record<string,unknown>:{};
export function attribute(r:CommercialRow,key:string){const a=attrs(r),k=Object.keys(a).find(k=>k===key||k.startsWith(key+' ['));return k?String(a[k]??'').trim():'';}
const kind=(r:CommercialRow)=>r.kind??String(attrs(r).businessKind??'LEGACY');
const unit=(v:string)=>/^(кг|kg|килограмм[а-я]*)$/i.test(v)?'кг':/^(шт|шт\.|pcs)$/i.test(v)?'шт':v||null;
export function fresh(date:string|null,today:string,max:number):Freshness {const age=date==null?null:(Date.parse(today)-Date.parse(date))/86400000;return {date,ageDays:age,fresh:age!=null&&age>=0&&age<=max};}
// Choose the latest dated snapshot for one SKU, then the latest import for each
// warehouse/region/unit or price type/currency. Older uploads remain history.
export function latestRows(rows:CommercialRow[],type:'STOCK'|'PRICES',cutoff:string) {
  const selected=rows.filter(r=>(kind(r)===type||kind(r)==='LEGACY')&&r.date&&iso(r.date)!<=cutoff&&(type==='STOCK'?r.stock!=null:r.price!=null));
  const date=selected.map(r=>iso(r.date)!).sort().at(-1);if(!date)return [];
  const map=new Map<string,CommercialRow>();
  for(const r of selected.filter(r=>iso(r.date)===date).sort((a,b)=>b.createdAt.valueOf()-a.createdAt.valueOf()||(b.id??'').localeCompare(a.id??''))){const key=JSON.stringify((type==='STOCK'?['Склад','Регион','Единица измерения']:['Тип цены','Валюта']).map(k=>attribute(r,k)));if(!map.has(key))map.set(key,r);}
  return [...map.values()];
}
const sum=(v:(number|null|undefined)[])=>v.length&&v.every(x=>x!=null)?v.reduce<number>((s,x)=>s+x!,0):null;
export function convertedStock(rows:CommercialRow[],kgPerUnit:number|null):number|null {
  if(!rows.length)return null;
  const values=rows.map(r=>{const u=unit(attribute(r,'Единица измерения'));return r.stock==null?null:u==='кг'?r.stock:u==='шт'&&kgPerUnit!=null&&kgPerUnit>0?r.stock*kgPerUnit:null;});
  return sum(values);
}
function aggregateSales(skus:SkuProfile[],previous=false):Sales|null {const rows=skus.map(s=>previous?s.previousSales:s.sales),observed=rows.filter((r):r is Sales=>r!=null);if(!observed.length)return null;return {orders:sum(observed.map(r=>r.orders)),quantity:sum(observed.map(r=>r.quantity)),quantityKg:sum(observed.map(r=>r.quantityKg)),revenue:sum(observed.map(r=>r.revenue)),days:Math.min(...rows.map(r=>r?.days??0))};}
export function stockZone(days:number|null,c:RulesConfig){return days==null?null:days<c.criticalStockDays?'Критический риск дефицита':days<=c.lowStockDays?'Риск дефицита':days<=c.normalStockDays?'Нормальный диапазон':days<=c.elevatedStockDays?'Повышенный запас':'Возможный избыточный запас';}
export function commerceProfile(products:ProductMapping[],rows:CommercialRow[],current:Range,previous:Range,c:RulesConfig,today:string,traffic:Traffic|null,previousTraffic:Traffic|null,salesImports:SalesImport[]=[],previousDates?:string[]):CommerceProfile|null {
  const active=products.filter(p=>p.active);if(!active.length)return null;
  const skus:SkuProfile[]=active.map(p=>{
    const rs=rows.filter(r=>r.sku===p.sku),stocks=latestRows(rs,'STOCK',today),prices=latestRows(rs,'PRICES',today),currencies=new Set(prices.map(r=>attribute(r,'Валюта')||'RUB')),types=new Set(prices.map(r=>attribute(r,'Тип цены')||'Основная'));
    const units=new Set(stocks.map(r=>unit(attribute(r,'Единица измерения'))));
    const stock=units.size===1?sum(stocks.map(r=>r.stock)):null,values=prices.map(r=>Number(r.price)),currency=currencies.size===1?[...currencies][0]:null;
    const saleRows=rs.filter(r=>kind(r)==='SALES'||kind(r)==='LEGACY');
    return {sku:p.sku,productGroup:p.productGroup,name:p.productName,kgPerUnit:p.kgPerUnit??null,stock,stockKg:convertedStock(stocks,p.kgPerUnit??null),stockUnit:units.size===1?[...units][0]:null,stockDate:iso(stocks[0]?.date??null),price:values.length&&currency==='RUB'?values.reduce((s,x)=>s+x,0)/values.length:null,priceMin:values.length&&currency==='RUB'?Math.min(...values):null,priceMax:values.length&&currency==='RUB'?Math.max(...values):null,priceDate:iso(prices[0]?.date??null),currency,priceComparable:types.size<=1&&currency==='RUB',sales:salesImports.length?coveredSales(saleRows,current,p.sku,salesImports):salesAggregate(saleRows,current),previousSales:salesImports.length?coveredSales(saleRows,previous,p.sku,salesImports):salesAggregate(saleRows,previous)};
  });
  const sales=aggregateSales(skus),previousSales=aggregateSales(skus,true),stockUnits=new Set(skus.map(s=>s.stockUnit)),stock=stockUnits.size===1?sum(skus.map(s=>s.stock)):null,stockKg=skus.some(s=>s.stockKg!=null)?skus.reduce((n,s)=>n+(s.stockKg??0),0):null;
  const stockKgCoverage=skus.filter(s=>s.stockKg!=null).length/skus.length,stockUnitsCoverage=skus.filter(s=>s.stock!=null).length/skus.length;
  const salesProvenance=skus.flatMap(s=>(s.sales as CoveredSales|null)?.provenance??[]),salesModes=[...new Set(salesProvenance.map(p=>p.mode))],transactionalDays=Math.min(...skus.map(s=>(s.sales as CoveredSales|null)?.transactionalDays??0));
  const oldest=(dates:(string|null)[])=>dates.every(Boolean)?dates.map(d=>d!).sort()[0]:null;
  const aggregateFresh=(dates:(string|null)[],max:number)=>{const complete=dates.every(Boolean),date=dates.filter((d):d is string=>d!=null).sort()[0]??null,result=fresh(date,today,max);return {...result,complete,fresh:complete&&result.fresh};};
  const stockFresh=aggregateFresh(skus.map(s=>s.stockDate),c.stockFreshDays),priceFresh=aggregateFresh(skus.map(s=>s.priceDate),c.priceFreshDays);
  const salesFresh=aggregateFresh(skus.map(s=>((s.sales as CoveredSales|null)?.transactionalDays?(s.sales as CoveredSales).latestDate:null)??rows.filter(r=>r.sku===s.sku&&(kind(r)==='SALES'||kind(r)==='LEGACY')&&iso(r.date)!<=today).map(r=>iso(r.date)).filter(Boolean).sort().at(-1)??null),c.salesFreshDays);
  const priceTypes=new Set(active.flatMap(p=>latestRows(rows.filter(r=>r.sku===p.sku),'PRICES',today).map(r=>attribute(r,'Тип цены')||'Основная')));
  const priceSum=sum(skus.map(s=>s.price)),priceAvg=priceSum==null?null:priceSum/skus.length;
  const priceCoverage:number[]=[];
  const previousTypes=new Set<string>();
  const priceDates=previousDates??days(previous.from,previous.to,previous.grain==='MONTH'?600:90);
  const pastPrices=active.map(p=>{const source=rows.filter(r=>r.sku===p.sku),daily=priceDates.map(date=>{const list=latestRows(source,'PRICES',date);for(const r of list)previousTypes.add(attribute(r,'Тип цены')||'Основная');return list.length&&list.every(r=>!attribute(r,'Валюта')||attribute(r,'Валюта')==='RUB')?list.reduce((s,r)=>s+Number(r.price),0)/list.length:null;});const known=daily.filter((v):v is number=>v!=null);priceCoverage.push(known.length/previous.days);return known.length?known.reduce((s,v)=>s+v,0)/known.length:null;});
  const pastSum=sum(pastPrices),previousPriceAvg=pastSum==null?null:pastSum/skus.length;
  const previousStockKg=sum(active.map(p=>{const stocks=latestRows(rows.filter(r=>r.sku===p.sku),'STOCK',previous.to);return convertedStock(stocks,p.kgPerUnit??null);}));
  const complete=(s:Sales|null)=>!!s&&s.days/current.days>=c.minCoverage;
  const hasTransactional=skus.some(s=>(s.sales as CoveredSales|null)?.transactionalDays),previousTransactional=skus.some(s=>(s.previousSales as CoveredSales|null)?.transactionalDays);
  const salesComplete=hasTransactional?!!sales&&sales.days===current.days:complete(sales),previousSalesComplete=previousTransactional?!!previousSales&&previousSales.days===previous.days:!!previousSales&&previousSales.days/previous.days>=c.minCoverage;
  const daily=salesComplete&&sales?.quantityKg!=null&&sales.days>0?sales.quantityKg/sales.days:null;
  const daysOfStock=stockFresh.fresh&&salesFresh.fresh&&stockKgCoverage>=c.minStockKgCoverage?ratio(stockKg,daily):null;
  const knownPrices=skus.flatMap(s=>s.priceMin!=null&&s.priceMax!=null?[s.priceMin,s.priceMax]:[]),allPrices=knownPrices.length===skus.length*2;
  return {groups:[...new Map(active.map(p=>[p.productGroup,{code:p.productGroup,name:p.productName}])).values()],category:active[0].category??null,skus,sales,previousSales,stock,stockKg,stockUnit:stockUnits.size===1?[...stockUnits][0]:null,stockKgCoverage,stockUnitsCoverage,averageDailySalesKg:daily,salesProvenance,salesModes,transactionalDays,zeroSales:salesComplete&&sales?.quantityKg===0,previousStockKg,stockChange:stockKg!=null&&previousStockKg!=null?stockKg-previousStockKg:null,available:stockFresh.fresh&&stock!=null?stock>0:null,priceMin:allPrices?Math.min(...knownPrices):null,priceMax:allPrices?Math.max(...knownPrices):null,priceAvg,previousPriceAvg,priceChange:delta(priceAvg,previousPriceAvg),daysOfStock,stockZone:stockZone(daysOfStock,c),revenuePerVisit:ratio(sales?.revenue,traffic?.visits),kgPerVisit:ratio(sales?.quantityKg,traffic?.visits),ordersPer100:ratio(sales?.orders,traffic?.visits)==null?null:100*ratio(sales?.orders,traffic?.visits)!,revenuePerOrder:ratio(sales?.revenue,sales?.orders),kgPerOrder:ratio(sales?.quantityKg,sales?.orders),changes:{visits:delta(traffic?.visits,previousTraffic?.visits),revenue:delta(sales?.revenue,previousSales?.revenue),kg:delta(sales?.quantityKg,previousSales?.quantityKg),orders:delta(sales?.orders,previousSales?.orders)},freshness:{stock:stockFresh,price:priceFresh,sales:salesFresh},salesComplete,previousSalesComplete,priceComparable:skus.every(s=>s.priceComparable)&&priceTypes.size===1,priceComparisonComplete:priceCoverage.every(v=>v>=c.minCoverage)&&previousTypes.size===1&&[...previousTypes][0]===[...priceTypes][0],benchmarks:null};
}
export function commerceBenchmarks(pages:PreparedPage[],c:RulesConfig){
  const eligible=pages.filter(p=>p.commerce?.salesComplete&&p.commerce.freshness.sales.fresh&&p.traffic&&p.traffic.visits>0&&p.traffic.days>=c.minCoverage*(p.periodDays??(p.searchTrend.length||28)));
  for(const p of pages){const cp=p.commerce;if(!cp)continue;const others=eligible.filter(x=>x.id!==p.id),category=others.filter(x=>x.pageType===p.pageType&&cp.category&&x.commerce!.category===cp.category),type=others.filter(x=>x.pageType===p.pageType),peers=category.length>=c.minPeers?category:type.length>=c.minPeers?type:others;const scope=category.length>=c.minPeers?'Категория и тип страницы':type.length>=c.minPeers?'Тип страницы':'Весь сайт';
    if(peers.length<c.minPeers){cp.benchmarks=null;continue;}
    const med=(key:'revenuePerVisit'|'kgPerVisit'|'ordersPer100')=>{const v=peers.flatMap(x=>x.commerce![key]!=null?[x.commerce![key]!]:[]);return v.length>=c.minPeers?median(v):null;},revenues=peers.flatMap(x=>x.commerce?.sales?.revenue!=null?[x.commerce.sales.revenue]:[]);
    cp.benchmarks={scope,peers:peers.length,visits:median(peers.map(x=>x.traffic!.visits)),revenue:revenues.length>=c.minPeers?median(revenues):null,revenueP80:revenues.length>=c.minPeers?percentile(revenues,.8):null,revenuePerVisit:med('revenuePerVisit'),kgPerVisit:med('kgPerVisit'),ordersPer100:med('ordersPer100')};
  }
}



