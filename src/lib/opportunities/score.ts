import type { PreparedPage, RulesConfig } from "./model";
export function scorePage(p:PreparedPage,c:RulesConfig) {
  const clamp=(n:number)=>Math.min(1,Math.max(0,n));
  const business=p.traffic?.goalGroups?.BUSINESS_CONVERSION;
  const components=[
    {key:"searchDemand",max:30,value:p.search?30*clamp(Math.log1p(p.search.impressions)/Math.log1p(c.demandScale)):null,formula:`30 × min(1, ln(1 + показы) / ln(1 + ${c.demandScale}))`},
    {key:"position",max:20,value:p.search?.avgPosition==null?null:p.search.avgPosition<c.strikingFrom||p.search.avgPosition>c.strikingTo?0:20*(1-.75*(p.search.avgPosition-c.strikingFrom)/Math.max(1,c.strikingTo-c.strikingFrom)),formula:`В диапазоне ${c.strikingFrom}–${c.strikingTo}: 20 × (1 − 0,75 × (позиция − ${c.strikingFrom}) / max(1, ${c.strikingTo-c.strikingFrom})); вне диапазона: 0`},
    {key:"ctrGap",max:20,value:p.search?.ctr==null||p.ctrBenchmark==null?null:p.ctrBenchmark<=0?0:20*clamp(1-p.search.ctr/p.ctrBenchmark),formula:"20 × max(0, 1 − CTR / ожидаемый CTR); при нулевом сравнении: 0"},
    {key:"conversionGap",max:15,value:!business?.configured||business.rate==null||p.conversionBenchmark==null?null:p.conversionBenchmark<=0?0:15*clamp(1-business.rate/p.conversionBenchmark),formula:"15 × max(0, 1 − бизнес-конверсия / медиана бизнес-конверсии); при нулевой медиане: 0"},
    {key:"businessPriority",max:15,value:15*(p.business?.priority??50)/100,formula:"15 × приоритет / 100; при отсутствии приоритета: нейтральные 50"},
  ];
  const available=components.filter(v=>v.value!=null), weight=available.reduce((s,v)=>s+v.max,0), sum=available.reduce((s,v)=>s+v.value!,0);
  return {score:Math.round(Math.min(100,Math.max(0,100*sum/weight))*100)/100,components,availableWeight:weight,rawTotal:sum,normalization:100/weight,incomplete:components.some(v=>v.value==null)||p.business?.priority==null,formula:"Итог = сумма доступных баллов × 100 / сумма весов доступных компонентов. Отсутствующие данные исключены; отсутствующий бизнес-приоритет нейтрален."};
}
