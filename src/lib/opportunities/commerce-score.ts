import type {PreparedPage,RulesConfig} from './model';
import {scorePage} from './score';
const clamp=(v:number)=>Math.max(0,Math.min(1,v));
export function commerceScore(p:PreparedPage,c:RulesConfig){
  const x=p.commerce;if(!x)return null;const b=x.benchmarks,s=x.sales,ready=x.salesComplete&&x.freshness.sales.fresh,traffic=p.traffic;
  const gaps=[{v:x.revenuePerVisit,b:b?.revenuePerVisit},{v:x.kgPerVisit,b:b?.kgPerVisit}].filter(v=>v.v!=null&&v.b!=null&&v.b>0);
  const volume=[s?.revenue!=null?s.revenue/Math.max(c.minRevenue,b?.revenueP80??0,1):null,s?.quantityKg!=null?s.quantityKg/Math.max(c.minKg,1):null,s?.orders!=null?s.orders/10:null].filter((v):v is number=>v!=null);
  const components=[
    {key:'commercialVolume',max:20,value:ready&&volume.length?20*clamp(Math.max(...volume)):null,formula:'20 × min(1, max(выручка / max(порог, P80), кг / порог, заказы / 10))'},
    {key:'trafficOpportunity',max:15,value:traffic&&traffic.days>=c.minCoverage*(p.trafficTrend.length||28)?15*clamp(Math.max(traffic.visits/Math.max(c.minVisits,b?.visits??0,1),gaps.some(g=>g.v!>g.b!)&&b?.visits?1-traffic.visits/b.visits:0)):null,formula:'15 × min(1, потенциал визитов относительно порога и медианы)'},
    {key:'commercialEfficiency',max:20,value:ready&&gaps.length?20*clamp(Math.max(...gaps.map(g=>g.v!<=g.b!?1-g.v!/g.b!:1-g.b!/g.v!))):null,formula:'20 × максимальное относительное отставание либо преимущество эффективности'},
    {key:'stockRisk',max:20,value:x.freshness.stock.fresh&&x.stockKgCoverage>=c.minStockKgCoverage&&x.stockKg!=null?(x.stockKg===0?20:ready&&s?.quantityKg===0&&x.stockKg>=c.highStockKg?20:x.daysOfStock!=null?20*clamp(x.daysOfStock<c.lowStockDays?1-x.daysOfStock/Math.max(c.lowStockDays,1):x.daysOfStock/c.overstockDays-1):null):null,formula:'20 × риск дефицита или избытка; при известном нулевом остатке: 20'},
    {key:'commercialTrend',max:15,value:ready&&x.previousSalesComplete?[x.changes.revenue,x.changes.kg,x.changes.orders].some(v=>v!=null)?15*clamp(Math.max(...[x.changes.revenue,x.changes.kg,x.changes.orders].filter((v):v is number=>v!=null).map(v=>Math.abs(v)/Math.max(100*c.salesDecline,1)))):null:null,formula:'15 × min(1, максимальная абсолютная динамика продаж / порог)'},
    {key:'businessPriority',max:10,value:10*(p.business?.priority??50)/100,formula:'10 × приоритет / 100; без значения: нейтральные 50'},
  ];
  const available=components.filter(v=>v.value!=null),weight=available.reduce((s,v)=>s+v.max,0),raw=available.reduce((s,v)=>s+v.value!,0);
  return {score:Math.round(10000*raw/weight)/100,components,availableWeight:weight,rawTotal:raw,normalization:100/weight,incomplete:components.some(v=>v.value==null),formula:'Коммерческая оценка = сумма доступных баллов × 100 / доступный вес.'};
}
export function opportunityScores(p:PreparedPage,c:RulesConfig,ruleId:string){
  const search=scorePage(p,c),commerce=commerceScore(p,c),commerceRule=Number(ruleId.slice(5))>=11;
  // Scores retain distinct source semantics. Search absence never adds a zero
  // weight to a Commerce signal; technical search signals keep their old score.
  const searchAvailable=p.search!=null;
  const weights=commerceRule?[...(commerce?[{score:commerce.score,weight:commerce.availableWeight}]:[]),...(searchAvailable?[{score:search.score,weight:search.availableWeight}]:[])]:[{score:search.score,weight:search.availableWeight}];
  const overall=weights.reduce((s,x)=>s+x.score*x.weight,0)/weights.reduce((s,x)=>s+x.weight,0);
  const breakdown=commerceRule&&commerce?{...commerce,score:Math.round(overall*100)/100,formula:commerce.formula+' Общая оценка — среднее доступных блоков с весами их доступных компонентов.',searchBlock:searchAvailable?search:null,commerceBlock:commerce}:search;
  return {searchScore:searchAvailable?search.score:null,commerceScore:commerce?.score??null,overallScore:breakdown.score,breakdown};
}
