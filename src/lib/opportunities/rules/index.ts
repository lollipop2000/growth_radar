import { t } from "../../i18n/ru";
import { normalizeUrl } from "../../scanner/url";
import type { Dataset, PreparedPage, Signal } from "../model";
import {commerceRuleIds,runCommerceRules} from '../commerce-rules';
import {seoGrowthRuleIds,seoGrowthRules} from '../../seo-actions/growth-rules';
export const searchRuleIds=Array.from({length:10},(_,i)=>`RULE_${String(i+1).padStart(2,"0")}`);
export const ruleIds=[...searchRuleIds,...commerceRuleIds,...seoGrowthRuleIds];
export function positionBand(position:number|null) {return position==null?null:position<=3?"1–3":position<=5?"4–5":position<=10?"6–10":position<=20?"11–20":"21+";}
const median=(v:number[])=>{const a=v.sort((a,b)=>a-b);return a.length?a.length%2?a[Math.floor(a.length/2)]:(a[a.length/2-1]+a[a.length/2])/2:null;};
export function benchmarkPages(pages:PreparedPage[],config:Dataset["config"]) {
  const bands=new Map<string,PreparedPage[]>();
  for(const p of pages) {const band=positionBand(p.search?.avgPosition??null); if(band&&p.search&&p.search.impressions>=config.minImpressions){const group=bands.get(band)??[];group.push(p);bands.set(band,group);}}
  const eligible=pages.filter(p=>p.traffic&&p.traffic.visits>=config.minVisits&&p.traffic.goalGroups?.BUSINESS_CONVERSION.configured&&p.traffic.goalGroups.BUSINESS_CONVERSION.rate!=null);
  for(const p of pages){ const b=positionBand(p.search?.avgPosition??null), group=b?bands.get(b)??[]:[];
    p.ctrBenchmark=config.ctrMode==="SIMPLE"?config.simpleCtr:group.length>=2?100*group.reduce((s,x)=>s+x.search!.clicks,0)/group.reduce((s,x)=>s+x.search!.impressions,0):null;
    const similar=eligible.filter(v=>v.pageType===p.pageType), chosen=similar.length>=5?similar:eligible;
    p.conversionBenchmark=chosen.length>=3?median(chosen.map(v=>v.traffic!.goalGroups!.BUSINESS_CONVERSION.rate!)):null;
    p.conversionBenchmarkScope=p.conversionBenchmark==null?null:similar.length>=5?"Аналогичные страницы":"Все страницы с достаточным трафиком";
  }
}
export function technicalProblems(p:PreparedPage) {
  const s=p.scanner;if(!s||s.outcome==="BLOCKED_BY_WAF"||s.outcome==="AUTH_REQUIRED")return [];
  const problems:string[]=[];
  if(s.statusCode===404||s.statusCode===410||s.statusCode!=null&&s.statusCode>=500)problems.push(`HTTP ${s.statusCode}`);
  if(s.outcome==="OK"&&s.indexable===false)problems.push("Запрет индексации");
  if(s.outcome==="OK"&&s.canonical) {try {if(normalizeUrl(s.canonical,s.finalUrl??p.url)!==normalizeUrl(s.finalUrl??p.url))problems.push("Канонический URL ведёт на другую страницу");}catch{/* Invalid canonical is not proof of another destination. */}}
  if(/REDIRECT_LIMIT|REDIRECT_BLOCKED/.test(s.error??""))problems.push("Подтверждённая ошибка перенаправления");return problems;
}
type Rule=(page:PreparedPage,dataset:Dataset)=>Record<string,unknown>|null;
export const rules:Rule[]=[
  (p,d)=>p.search&&p.search.impressions>=d.config.minImpressions&&p.search.avgPosition!=null&&p.search.ctr!=null&&p.ctrBenchmark!=null&&p.ctrBenchmark>0&&p.search.ctr<p.ctrBenchmark*(1-d.config.ctrGap)?{...p.search,ctrBenchmark:p.ctrBenchmark,band:positionBand(p.search.avgPosition),benchmarkMode:d.config.ctrMode}:null,
  (p,d)=>p.search&&p.search.impressions>=d.config.minImpressions&&p.search.avgPosition!=null&&p.search.avgPosition>=d.config.strikingFrom&&p.search.avgPosition<=d.config.strikingTo?{...p.search,range:[d.config.strikingFrom,d.config.strikingTo]}:null,
  (p,d)=>{const b=p.traffic?.goalGroups?.BUSINESS_CONVERSION;return p.traffic&&p.traffic.visits>=d.config.minVisits&&b?.configured&&b.rate!=null&&p.conversionBenchmark!=null&&p.conversionBenchmark>0&&b.rate<p.conversionBenchmark*(1-d.config.conversionGap)?{visits:p.traffic.visits,businessConversion:b.rate,businessReaches:b.reaches,businessGoals:b.goals,conversionBenchmark:p.conversionBenchmark,benchmarkScope:p.conversionBenchmarkScope}:null;},
  (p,d)=>comparable(p,d)&&p.previousSearch!.impressions>=d.config.minImpressions&&p.search!.impressions<=p.previousSearch!.impressions*(1-d.config.decline)?{current:p.search,previous:p.previousSearch,change:p.search!.impressions/p.previousSearch!.impressions-1}:null,
  (p,d)=>comparable(p,d)&&stable(p.search!.impressions,p.previousSearch!.impressions,d.config.stableTraffic)&&p.search!.impressions>=d.config.minImpressions&&p.search!.avgPosition!=null&&p.previousSearch!.avgPosition!=null&&p.search!.avgPosition-p.previousSearch!.avgPosition>=d.config.positionDrop?{current:p.search,previous:p.previousSearch,positionDrop:p.search!.avgPosition-p.previousSearch!.avgPosition}:null,
  (p,d)=>comparable(p,d)&&p.previousSearch!.impressions>=d.config.minImpressions&&p.search!.impressions>=p.previousSearch!.impressions*(1+d.config.growth)?{current:p.search,previous:p.previousSearch,change:p.search!.impressions/p.previousSearch!.impressions-1}:null,
  (p,d)=>p.search&&p.search.impressions>=d.config.minImpressions&&technicalProblems(p).length?{impressions:p.search.impressions,problems:technicalProblems(p),scanner:p.scanner}:null,
  (p,d)=>{const s=p.content;if(!p.search||p.search.impressions<d.config.minImpressions||!s)return null;const missing=[!s.title?.trim()?"Заголовок":null,!s.description?.trim()?"Описание":null,!s.h1?.trim()?"Основной заголовок":null].filter(Boolean);return missing.length?{impressions:p.search.impressions,missing,wordCount:s.wordCount,shortText:s.wordCount!=null&&s.wordCount<100,scanner:s}:null;},
  (p,d)=>p.business&&(p.business.available===false||p.business.stock!=null&&p.business.stock<=0)&&(p.search&&p.search.impressions>=d.config.minImpressions||p.traffic&&p.traffic.visits>=d.config.minVisits)?{available:p.business.available,stock:p.business.stock,impressions:p.search?.impressions??null,visits:p.traffic?.visits??null,sourceDate:p.business.updatedAt}:null,
  (p,d)=>{const a=p.business?.sales,b=p.business?.previousSales;if(!a||!b||a.days/d.period.days<d.config.minCoverage||b.days/d.previous.days<d.config.minCoverage)return null;
    const trafficStable=p.traffic&&p.previousTraffic&&p.traffic.days/d.period.days>=d.config.minCoverage&&p.previousTraffic.days/d.previous.days>=d.config.minCoverage&&p.traffic.visits>=d.config.minVisits&&stable(p.traffic.visits,p.previousTraffic.visits,d.config.stableTraffic), searchStable=comparable(p,d)&&p.search!.impressions>=d.config.minImpressions&&stable(p.search!.impressions,p.previousSearch!.impressions,d.config.stableTraffic);
    if(!trafficStable&&!searchStable)return null;const declines=["orders","quantity","quantityKg","revenue"].filter(k=>{const x=a[k as keyof typeof a],y=b[k as keyof typeof b];return x!=null&&y!=null&&y>0&&x<=y*(1-d.config.decline);});return declines.length?{current:a,previous:b,declines,traffic:p.traffic,previousTraffic:p.previousTraffic,search:p.search,previousSearch:p.previousSearch}:null;},
];
function comparable(p:PreparedPage,d:Dataset){return !!p.search&&!!p.previousSearch&&(p.search.coverage??p.search.days/d.period.days)>=d.config.minCoverage&&(p.previousSearch.coverage??p.previousSearch.days/d.previous.days)>=d.config.minCoverage;}
function stable(a:number,b:number,gap:number){return b>0&&Math.abs(a/b-1)<=gap;}
export function runRules(d:Dataset):Signal[] {
  benchmarkPages(d.pages,d.config); const result:Signal[]=[];
  for(const p of d.pages)for(const [i,rule] of rules.entries()){const evidence=rule(p,d);if(evidence)result.push({ruleId:ruleIds[i],pageId:p.id,severity:[6,8,9].includes(i)?"HIGH":"MEDIUM",rawScore:[6,8,9].includes(i)?80:60,title:t(`rule${String(i+1).padStart(2,"0")}`),description:t(`desc${String(i+1).padStart(2,"0")}`),evidence,period:d.period,createdAt:d.createdAt});}return [...result,...runCommerceRules(d),...seoGrowthRules(d)];
}

