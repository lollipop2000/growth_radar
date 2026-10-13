import type {Dataset,PreparedPage,Signal} from './model';
import {commerceBenchmarks} from './commerce';
export const commerceRuleIds=Array.from({length:12},(_,i)=>`RULE_${i+11}`);
export const commerceTitles=['Трафик без зафиксированной онлайн-продажи','Ходовой товар заканчивается','Трафик есть, товара нет','Большой остаток, слабые продажи','Трафик растёт, продажи не растут','Продажи падают при стабильном трафике','После роста цены продажи снизились','Высокая коммерческая эффективность, мало трафика','Много трафика, низкая коммерческая эффективность','Аномалия цен внутри группового кода','Устаревшие коммерческие данные','Высокая выручка и низкий запас'];
export const commerceDescriptions=['При достаточном покрытии продаж коммерческий результат равен нулю. Проверьте предложение и путь к покупке.','Продажи подтверждены, расчётный запас ниже порога. Проверьте пополнение.','Актуальные остатки подтверждают отсутствие товара при наличии трафика. Возможен потерянный спрос.','Актуальный запас велик относительно подтверждённого темпа продаж. Проверьте оборачиваемость.','Рост визитов не сопровождается ростом коммерческих показателей в сопоставимых периодах.','При стабильных визитах снизился коммерческий результат. Проверьте предложение и наличие.','Наблюдается совпадение роста цены и снижения продаж. Это гипотеза, а не доказанная причинность.','Эффективность выше медианы сопоставимых страниц, а визитов меньше. Изучите возможность увеличения трафика.','Эффективность ниже медианы сопоставимых страниц при большом количестве визитов.','Диапазон сопоставимых цен SKU превышает порог. Проверьте предложение; ошибка не доказана.','Дата коммерческого источника старше допустимого порога. Обновите данные перед сильными выводами.','Выручка в верхней части распределения сопоставимых страниц, а запас ограничен.'];
export function commerceClassification(id:string){return {domain:id==='RULE_21'?'DATA_QUALITY':'COMMERCE',primaryType:id==='RULE_21'?'DATA_QUALITY':['RULE_12','RULE_13','RULE_14','RULE_16','RULE_17','RULE_22'].includes(id)?'RISK':'GROWTH'};}
export function commerceEvidence(p:PreparedPage,d:Dataset,index:number):Record<string,unknown>|null {
  const x=p.commerce,c=d.config;if(!x)return null;
  const sales=x.sales,ready=x.salesComplete&&x.freshness.sales.fresh,stock=x.freshness.stock.fresh&&x.stockKg!=null&&x.stockKgCoverage>=c.minStockKgCoverage;
  const visits=p.traffic?.visits??null,traffic=!!p.traffic&&p.traffic.days/d.period.days>=c.minCoverage;
  const comparison=ready&&x.previousSalesComplete&&traffic&&!!p.previousTraffic&&p.previousTraffic.days/d.previous.days>=c.minCoverage;
  const changes=[x.changes.revenue,x.changes.kg,x.changes.orders].filter((v):v is number=>v!=null),declines=changes.some(v=>v<=-100*c.salesDecline),b=x.benchmarks;
  const efficient=[{v:x.revenuePerVisit,b:b?.revenuePerVisit},{v:x.kgPerVisit,b:b?.kgPerVisit}].filter(v=>v.v!=null&&v.b!=null&&v.b>0);
  let pass=false;
  switch(index){
    case 0:{const values=[sales?.revenue,sales?.quantityKg,sales?.orders];pass=ready&&sales?.days===d.period.days&&traffic&&visits!>=c.minVisits&&values.every(v=>v===0);break;}
    case 1:pass=ready&&stock&&(sales?.quantityKg??-1)>=c.minKg&&x.daysOfStock!=null&&x.daysOfStock<c.lowStockDays;break;
    case 2:pass=traffic&&visits!>=c.minVisits&&x.freshness.stock.fresh&&((stock&&x.stockKg===0)||(x.stockUnitsCoverage===1&&x.stockUnit==='шт'&&x.stock===0));break;
    case 3:pass=ready&&stock&&x.stockKg!=null&&x.stockKg>=c.highStockKg&&sales?.quantityKg!=null&&sales.quantityKg<c.minKg&&(sales.quantityKg===0||(x.daysOfStock!=null&&x.daysOfStock>c.overstockDays));break;
    case 4:{const pairs=[[sales?.revenue,x.previousSales?.revenue],[sales?.quantityKg,x.previousSales?.quantityKg],[sales?.orders,x.previousSales?.orders]].filter((v):v is [number,number]=>v[0]!=null&&v[1]!=null);pass=comparison&&x.changes.visits!=null&&x.changes.visits>=100*c.trafficGrowth&&pairs.length>0&&pairs.every(([a,b])=>a<=b);break;}
    case 5:pass=comparison&&x.changes.visits!=null&&Math.abs(x.changes.visits)<=100*c.stableTraffic&&declines;break;
    case 6:pass=ready&&x.previousSalesComplete&&x.freshness.price.fresh&&x.priceComparable&&x.priceComparisonComplete&&x.priceChange!=null&&x.priceChange>=100*c.priceGrowth&&declines&&stock&&x.stockKg!>0&&x.previousStockKg!=null&&x.previousStockKg>0;break;
    case 7:pass=ready&&traffic&&!!b&&visits!>0&&visits!<b.visits!&&efficient.some(v=>v.v!>=v.b!*(1+c.efficiencyGap));break;
    case 8:pass=ready&&traffic&&!!b&&visits!>=c.minVisits&&visits!>=b.visits!&&efficient.length>0&&efficient.every(v=>v.v!<v.b!*(1-c.efficiencyGap));break;
    case 9:pass=x.freshness.price.fresh&&x.priceComparable&&x.groups.some(g=>{const skus=x.skus.filter(s=>s.productGroup===g.code);if(skus.length<2||skus.some(s=>s.priceMin==null||s.priceMax==null))return false;const low=Math.min(...skus.map(s=>s.priceMin!)),high=Math.max(...skus.map(s=>s.priceMax!));return low===0?high>0:high/low>c.priceRatio;});break;
    case 10:pass=Object.entries(x.freshness).some(([k,v])=>v.ageDays!=null&&v.ageDays>({stock:c.stockFreshDays,price:c.priceFreshDays,sales:c.salesFreshDays}[k as 'stock'|'price'|'sales']));break;
    case 11:pass=ready&&!!b&&b.revenueP80!=null&&sales?.revenue!=null&&sales.revenue>=c.minRevenue&&sales.revenue>=b.revenueP80&&stock&&x.daysOfStock!=null&&x.daysOfStock<c.lowStockDays;break;
  }
  return pass?{commerce:x,visits,previousVisits:p.previousTraffic?.visits??null,thresholds:c,classification:commerceClassification(commerceRuleIds[index])}:null;
}
export function runCommerceRules(d:Dataset):Signal[]{commerceBenchmarks(d.pages,d.config);return d.pages.flatMap(p=>commerceRuleIds.flatMap((ruleId,i)=>{const evidence=commerceEvidence(p,d,i);return evidence?[{ruleId,pageId:p.id,severity:(['RULE_12','RULE_13','RULE_22'].includes(ruleId)?'HIGH':ruleId==='RULE_21'?'LOW':'MEDIUM') as Signal['severity'],rawScore:0,title:commerceTitles[i],description:commerceDescriptions[i],evidence,period:d.period,createdAt:d.createdAt}]:[];}));}

