import type { Business, Search, Traffic, Sales, Range } from "./model";
import { aggregateGoalGroups, type GoalConfig } from "../yandex/goal-types";
import {searchCoverage,demandMetric} from '../search/metrics';
export type SearchRow={grain?:string;periodMonth?:string|null;query?:string;region?:string|null;demand?:number|null;date:Date;impressions:number;clicks:number;avgPosition:number|null};
export type TrafficRow={date:Date;visits:number;visitors?:number;goalConversionsJson:unknown};
export function searchAggregate(rows:SearchRow[],range?:Range & {grain?:string}):Search|null {
  if(!rows.length)return null;const impressions=rows.reduce((s,r)=>s+r.impressions,0), clicks=rows.reduce((s,r)=>s+r.clicks,0),known=rows.filter(r=>r.avgPosition!=null),weight=known.reduce((s,r)=>s+r.impressions,0);
  return {impressions,clicks,ctr:impressions?100*clicks/impressions:null,avgPosition:weight?known.reduce((s,r)=>s+r.avgPosition!*r.impressions,0)/weight:null,days:new Set(rows.filter(r=>r.grain!=='MONTH').map(r=>r.date.toISOString().slice(0,10))).size,...(rows.some(r=>r.grain==='MONTH')?{grain:'MONTH',demand:demandMetric(rows),monthsCovered:new Set(rows.filter(r=>r.grain==='MONTH').map(r=>r.periodMonth)).size,...(range?{coverage:searchCoverage(rows,range).ratio}:{})}:{})};
}
export function trafficAggregate(rows:TrafficRow[],config:GoalConfig):Traffic|null {
  if(!rows.length)return null; const visits=rows.reduce((s,r)=>s+r.visits,0);
  const goalGroups=aggregateGoalGroups(rows,config),business=goalGroups.BUSINESS_CONVERSION;
  return {visits,visitors:rows.every(r=>r.visitors!=null)?rows.reduce((s,r)=>s+r.visitors!,0):null,goals:business.reaches,conversion:business.rate,goalGroups,days:new Set(rows.map(r=>r.date.toISOString().slice(0,10))).size};
}
export type BusinessInput={importId:string;date:Date|null;createdAt:Date;attributesJson:unknown;sku:string|null;productName:string|null;category:string|null;productGroup:string|null;brand:string|null;price:unknown;stock:number|null;available:boolean|null;package:string|null;priority:number|null;orders:number|null;quantity?:number|null;quantityKg:number|null;revenue:unknown};
export function salesAggregate(rows:BusinessInput[],range:Range):Sales|null {
  const dated=rows.filter(r=>{
    const kind=(r.attributesJson as {businessKind?:string})?.businessKind;
    return (!kind||kind==="SALES")&&r.date&&r.date.toISOString().slice(0,10)>=range.from&&r.date.toISOString().slice(0,10)<=range.to;
  });
  // A new upload replaces the older business snapshot for that date, not its history.
  const rowKey=(r:BusinessInput)=>JSON.stringify([r.date!.toISOString().slice(0,10),r.sku]);
  const latest=new Map<string,{id:string;at:number}>(); for(const r of dated){const key=rowKey(r),old=latest.get(key);if(!old||r.createdAt.valueOf()>old.at)latest.set(key,{id:r.importId,at:r.createdAt.valueOf()});}
  const selected=dated.filter(r=>latest.get(rowKey(r))?.id===r.importId);
  if(!selected.length)return null;
  const result={orders:null,quantity:null,quantityKg:null,revenue:null,days:new Set(selected.map(r=>r.date!.toISOString().slice(0,10))).size} as Sales;
  for(const key of ["orders","quantity","quantityKg","revenue"] as const) {const known=selected.filter(r=>r[key]!=null);
    // Missing cells/dates never count as zero sales in a comparison.
    if(known.length===selected.length)result[key]=known.reduce((s,r)=>s+Number(r[key]),0);}
  return result;
}
export function businessAggregate(rows:BusinessInput[],current:Range,previous:Range):Business|null {
  if(!rows.length)return null;const sorted=[...rows].sort((a,b)=>b.createdAt.valueOf()-a.createdAt.valueOf());
  const result={sales:salesAggregate(rows,current),previousSales:salesAggregate(rows,previous),updatedAt:sorted[0].createdAt.toISOString(),attributes:sorted[0].attributesJson} as Business;
  for(const key of ["sku","productName","category","productGroup","brand","price","stock","available","package","priority"] as const){const r=sorted.find(r=>r[key]!=null);(result as unknown as Record<string,unknown>)[key]=r?["price","stock","priority"].includes(key)?Number(r[key]):r[key]:null;}return result;
}
