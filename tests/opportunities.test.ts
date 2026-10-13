import test from "node:test";
import assert from "node:assert/strict";
import { runRules, rules, benchmarkPages, technicalProblems } from "../src/lib/opportunities/rules";
import { defaults, type Dataset, type PreparedPage } from "../src/lib/opportunities/model";
import { scorePage } from "../src/lib/opportunities/score";
import { searchAggregate, trafficAggregate, businessAggregate } from "../src/lib/opportunities/aggregate";
import { goalConfig, aggregateGoalGroups, validateGoalTypes, reportGoalIds, type GoalType } from "../src/lib/yandex/goal-types";
const businessConfig=goalConfig({goals:[{id:"goal",name:"Покупка"}],goalTypes:{goal:"BUSINESS_CONVERSION"}});
function page(id="p"):PreparedPage {return {id,url:`https://fixture.invalid/${id}/`,pageType:"product",search:{impressions:1000,clicks:10,ctr:1,avgPosition:8,days:28},previousSearch:{impressions:1000,clicks:50,ctr:5,avgPosition:5,days:28},traffic:trafficAggregate([{date:new Date("2026-10-01"),visits:1000,goalConversionsJson:{goal:0}}],businessConfig),previousTraffic:trafficAggregate([{date:new Date("2026-10-01"),visits:1000,goalConversionsJson:{goal:10}}],businessConfig),scanner:{id:"scan",source:"IMPORT",outcome:"OK",statusCode:200,title:null,description:"Описание",h1:"Товар",wordCount:50,canonical:null,indexable:true,finalUrl:null,error:null,scannedAt:"2026-10-05"},content:null,business:null,ctrBenchmark:5,conversionBenchmark:1,conversionBenchmarkScope:"Все страницы",searchTrend:[],trafficTrend:[],queries:[]};}
function dataset(pages=[page()]):Dataset {return {siteId:"fixture",siteUrl:"https://fixture.invalid/",period:{from:"2026-09-08",to:"2026-10-05",days:28},previous:{from:"2026-08-11",to:"2026-09-07",days:28},createdAt:"2026-10-06",config:{...defaults},primaryGoals:["goal"],goalConfig:businessConfig,pages,totals:{search:null,traffic:null,sales:null},coverage:{metrikaDays:28,webmasterDays:28,matchedVisits:1000,totalVisits:1000}};}
test("Each of the ten rules produces factual evidence with its supported source",()=>{
  const p=page(),d=dataset([p]);p.traffic!.days=28;p.previousTraffic!.days=28;p.content=p.scanner;p.business={sku:"sku",productName:null,category:null,productGroup:null,brand:null,price:10,stock:0,available:false,package:null,priority:90,updatedAt:"2026-10-05",attributes:{},sales:{orders:1,quantityKg:1,revenue:10,days:28},previousSales:{orders:10,quantityKg:10,revenue:100,days:28}};
  assert.ok(rules[0](p,d));assert.ok(rules[1](p,d));assert.ok(rules[2](p,d));
  p.search!.impressions=500;assert.ok(rules[3](p,d));p.search!.impressions=1000;assert.ok(rules[4](p,d));p.search!.impressions=1500;assert.ok(rules[5](p,d));p.search!.impressions=1000;
  p.scanner!.indexable=false;assert.ok(rules[6](p,d));assert.ok(rules[7](p,d));assert.ok(rules[8](p,d));assert.ok(rules[9](p,d));
  const result=runRules(d);assert.ok(result.length);assert.ok(result.every(s=>s.evidence&&s.pageId===p.id&&s.period.from===d.period.from&&/[а-я]/i.test(s.description)));
});
test("Quantity-only sales can support the existing decline rule without inventing other metrics",()=>{
  const p=page(),d=dataset([p]);p.traffic!.days=28;p.previousTraffic!.days=28;
  p.business={sku:"sku",productName:null,category:null,productGroup:null,brand:null,price:null,stock:null,available:null,package:null,priority:null,updatedAt:null,attributes:{},sales:{orders:null,quantity:5,quantityKg:null,revenue:null,days:28},previousSales:{orders:null,quantity:10,quantityKg:null,revenue:null,days:28}};
  assert.deepEqual((rules[9](p,d) as {declines:string[]}).declines,["quantity"]);
});
test("CTR benchmark is weighted within position bands, needs peers and does not average row CTR",()=>{
  const a=page("a"),b=page("b"),c=page("c");a.search={impressions:10000,clicks:100,ctr:1,avgPosition:8,days:28};b.search={impressions:100,clicks:50,ctr:50,avgPosition:8,days:28};c.search!.avgPosition=2;
  benchmarkPages([a,b,c],defaults);assert.equal(a.ctrBenchmark,150/10100*100);assert.equal(c.ctrBenchmark,null);benchmarkPages([c],{...defaults,ctrMode:"SIMPLE",simpleCtr:7});assert.equal(c.ctrBenchmark,7);
});
test("Conversion benchmark uses configured goals and median, missing goals remain unknown",()=>{
  const a=page("a"),b=page("b"),c=page("c");a.traffic!.goalGroups!.BUSINESS_CONVERSION.rate=0;b.traffic!.goalGroups!.BUSINESS_CONVERSION.rate=2;c.traffic!.goalGroups!.BUSINESS_CONVERSION.rate=100;
  const config=goalConfig({goals:[{id:"g",name:"Покупка"},{id:"missing",name:"Неизвестная цель"}],goalTypes:{g:"BUSINESS_CONVERSION",missing:"BUSINESS_CONVERSION"}});
  benchmarkPages([a,b,c],defaults);assert.equal(a.conversionBenchmark,2);assert.equal(trafficAggregate([{date:new Date("2026-10-01"),visits:100,goalConversionsJson:{g:3}}],config)!.goals,null);
  assert.equal(trafficAggregate([{date:new Date("2026-10-01"),visits:100,goalConversionsJson:{g:3}}],goalConfig({goals:[{id:"g",name:"Покупка"}],goalTypes:{g:"BUSINESS_CONVERSION"}}))!.conversion,3);
});
test("Selected goals default to IGNORE without inferring their type from purchase names",()=>{
  const input={goals:[{id:"g",name:"Покупка"}],primaryGoals:["g"]};
  assert.equal(goalConfig(input).goalTypes.g,"IGNORE");assert.deepEqual(reportGoalIds(input),["g"]);
  assert.throws(()=>validateGoalTypes({g:"AUTO"},input.goals));assert.throws(()=>validateGoalTypes({foreign:"BUSINESS_CONVERSION"},input.goals));
  assert.equal(validateGoalTypes({g:"BUSINESS_CONVERSION"},input.goals).g,"BUSINESS_CONVERSION");
});
test("Explicitly typed nonprimary goals join report collection without assigning meaning to primary goals",()=>{
  const goals=[{id:"a",name:"Покупка"},{id:"b",name:"Регистрация"},{id:"c",name:"Поиск"}];
  assert.deepEqual(reportGoalIds({goals,primaryGoals:["a"],goalTypes:{b:"MICRO_CONVERSION",c:"NAVIGATION"}}),["a","b","c"]);
  assert.equal(goalConfig({goals,goalTypes:{b:"MICRO_CONVERSION"}}).goalTypes.a,"IGNORE");
});
test("Business and micro rates are sums of their own goals divided by visits, navigation stays context",()=>{
  const goals=["a","b","m","n","i"].map(id=>({id,name:id}));
  const c=goalConfig({goals,goalTypes:{a:"BUSINESS_CONVERSION",b:"BUSINESS_CONVERSION",m:"MICRO_CONVERSION",n:"NAVIGATION",i:"IGNORE"}});
  const rows=[{visits:100,goalConversionsJson:{a:2,b:3,m:20,n:50,i:99}}],g=aggregateGoalGroups(rows,c);
  assert.equal(g.BUSINESS_CONVERSION.rate,5);assert.equal(g.MICRO_CONVERSION.rate,20);assert.equal(g.NAVIGATION.reaches,50);assert.equal(g.IGNORE.reaches,99);
  assert.equal(trafficAggregate([{...rows[0],date:new Date("2026-10-01")}],c)!.conversion,5);
});
for(const type of ["MICRO_CONVERSION","NAVIGATION","IGNORE"] as GoalType[])test(`${type} cannot trigger RULE 03 or supply its score weight`,()=>{
  const p=page(),d=dataset([p]),c=goalConfig({goals:[{id:"goal",name:"Покупка"}],goalTypes:{goal:type}});
  p.traffic=trafficAggregate([{date:new Date("2026-10-01"),visits:1000,goalConversionsJson:{goal:0}}],c);
  // Legacy conversion values must never be used as a fallback.
  p.traffic!.conversion=0;p.conversionBenchmark=10;d.goalConfig=c;
  assert.equal(rules[2](p,d),null);assert.equal(scorePage(p,defaults).components.find(c=>c.key==="conversionGap")!.value,null);
  assert.equal(runRules(d).filter(s=>s.ruleId==="RULE_03").length,0);
});
test("No business goals and missing business reaches stay unavailable, never zero",()=>{
  for(const c of [goalConfig({}),goalConfig({goals:[{id:"missing",name:"Бизнес"}],goalTypes:{missing:"BUSINESS_CONVERSION"}})]){
    const p=page(),d=dataset([p]);p.traffic=trafficAggregate([{date:new Date("2026-10-01"),visits:1000,goalConversionsJson:{goal:0}}],c);d.goalConfig=c;
    assert.equal(p.traffic!.conversion,null);assert.equal(rules[2](p,d),null);assert.equal(scorePage(p,defaults).components.find(c=>c.key==="conversionGap")!.value,null);
  }
});
test("Peer medians and score ignore the legacy combined conversion and nonbusiness reaches",()=>{
  const pages=Array.from({length:5},(_,i)=>page(String(i)));pages.forEach((p,i)=>{p.traffic!.goalGroups!.BUSINESS_CONVERSION.rate=i*2;p.traffic!.conversion=1000;});
  benchmarkPages(pages,defaults);assert.equal(pages[0].conversionBenchmark,4);assert.equal(pages[0].conversionBenchmarkScope,"Аналогичные страницы");
  const before=scorePage(pages[0],defaults);pages[0].traffic!.conversion=99999;assert.equal(scorePage(pages[0],defaults).score,before.score);
});
test("Partial periods, missing sales and absent Excel never invent declines or unavailable stock",()=>{
  const p=page(),d=dataset([p]);p.search!.days=1;p.search!.impressions=1;assert.equal(rules[3](p,d),null);assert.equal(rules[4](p,d),null);assert.equal(rules[5](p,d),null);assert.equal(rules[8](p,d),null);assert.equal(rules[9](p,d),null);
});
test("WAF and transport failure are not SEO errors, absent canonical and short text alone are harmless",()=>{
  const p=page(),d=dataset([p]);p.content={...p.scanner!,title:"Заголовок"};assert.equal(rules[7](p,d),null);assert.deepEqual(technicalProblems(p),[]);
  p.scanner!.outcome="BLOCKED_BY_WAF";p.scanner!.statusCode=403;assert.equal(rules[6](p,d),null);p.scanner!.outcome="ERROR";p.scanner!.statusCode=null;p.scanner!.error="TIMEOUT";assert.equal(rules[6](p,d),null);
  p.scanner!.statusCode=404;assert.ok(rules[6](p,d));p.scanner!.outcome="OK";p.scanner!.statusCode=200;p.scanner!.error=null;p.scanner!.canonical=p.url.replace(/\/$/,"");assert.deepEqual(technicalProblems(p),[]);
  p.scanner!.canonical="https://fixture.invalid/other/";assert.ok(technicalProblems(p).length);
});
test("Explainable score is bounded, normalizes missing sources and has neutral absent priority",()=>{
  const p=page(),a=scorePage(p,defaults);assert.ok(a.score>=0&&a.score<=100);p.business={priority:50} as PreparedPage["business"];assert.equal(scorePage(p,defaults).score,a.score);
  p.search=null;p.traffic=null;p.ctrBenchmark=null;p.conversionBenchmark=null;p.business=null;const s=scorePage(p,defaults);assert.equal(s.score,50);assert.equal(s.availableWeight,15);assert.equal(s.incomplete,true);assert.ok(s.components.filter(c=>c.value==null).length===4);
});
test("Search sums clicks/impressions and weights position correctly",()=>{const s=searchAggregate([{date:new Date("2026-10-01"),impressions:100,clicks:1,avgPosition:10},{date:new Date("2026-10-01"),impressions:1,clicks:1,avgPosition:1}])!;assert.equal(s.ctr,200/101);assert.equal(s.avgPosition,1001/101);assert.equal(s.days,1);});
test("Repeated business uploads replace daily snapshot without multiplying sales",()=>{
  const d=dataset(),base={importId:"old",date:new Date("2026-10-01"),createdAt:new Date("2026-10-01"),sku:"s",productName:null,category:null,productGroup:null,brand:null,price:null,stock:null,available:null,package:null,priority:80,orders:10,quantityKg:null,revenue:100,attributesJson:{}};
  const business=businessAggregate([base,{...base,importId:"new",createdAt:new Date("2026-10-02"),priority:null,orders:7,revenue:70}],d.period,d.previous)!;
  assert.equal(business.sales!.orders,7);assert.equal(business.sales!.revenue,70);assert.equal(business.priority,80);assert.equal(business.previousSales,null);
});
