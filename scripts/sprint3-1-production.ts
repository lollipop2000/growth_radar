import assert from "node:assert/strict";
import { readFileSync,writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { db } from "../src/lib/db";
import { currentSite,readIntegration,config } from "../src/lib/yandex/settings";
import { goalConfig } from "../src/lib/yandex/goal-types";
import { calculateOpportunities } from "../src/lib/opportunities/service";
import { day } from "../src/lib/yandex/dates";
import { publicData } from "../src/lib/public-data";
import type { Evidence } from "../src/components/opportunities";

const before=JSON.parse(readFileSync("test-results/sprint3-1-before.json","utf8"));
const hash=(v:unknown)=>createHash("sha256").update(JSON.stringify(v)).digest("hex");
async function checkQueues(siteId:string) {
  const scans=await db.scan.findMany({where:{siteId},select:{id:true,status:true,pagesScanned:true,configJson:true}});
  assert.deepEqual(scans.map(({configJson,...s})=>({...s,hash:hash(configJson)})).sort((a,b)=>a.id.localeCompare(b.id)),before.scans.sort((a:{id:string},b:{id:string})=>a.id.localeCompare(b.id)));
  const jobs=await db.jobRun.findMany({where:{siteId},select:{id:true,source:true,status:true,checkpointJson:true}});
  assert.deepEqual(jobs.map(({checkpointJson,...j})=>({...j,hash:hash(checkpointJson)})).sort((a,b)=>a.id.localeCompare(b.id)),before.jobs.sort((a:{id:string},b:{id:string})=>a.id.localeCompare(b.id)));
  return {unchangedProductionScans:scans.length,unchangedProductionJobs:jobs.length,newScannerJobs:0,newWebmasterJobs:0};
}
try {
  const site=await currentSite();assert.equal(site.id,before.siteId);
  const safety=await checkQueues(site.id),m=config((await readIntegration("METRIKA"))?.configJson),goals=goalConfig(m);
  assert.equal(m.siteId,site.id);assert.equal(m.counterId,process.env.YANDEX_METRIKA_COUNTER_ID);
  if(!Object.values(goals.goalTypes).includes("BUSINESS_CONVERSION")) {
    writeFileSync("test-results/sprint3-1-production.json",JSON.stringify({status:"AWAITING_MANUAL_GOAL_TYPES",beforeCurrent:before.opportunities.filter((o:{isCurrent:boolean})=>o.isCurrent).length,goals:goals.goals.map(g=>({...g,type:goals.goalTypes[g.id]})),safety,recalculationPerformed:false},null,2));
    console.log("AWAITING_MANUAL_GOAL_TYPES: production types were not assigned automatically; no recalculation performed.");
  } else {
    const first=await calculateOpportunities(28,{now:new Date(before.checkedAt)}),d=first.dataset;
    const all=await db.opportunity.findMany({where:{siteId:site.id,periodFrom:day(d.period.from),periodTo:day(d.period.to)},orderBy:{score:"desc"}}),current=all.filter(o=>o.isCurrent);
    for(const old of before.opportunities){const row=all.find(o=>o.id===old.id);assert.ok(row,"Opportunity history must remain");if(!row.isCurrent)assert.equal(hash(row.evidenceJson),old.evidenceHash);if(old.status==="DISMISSED")assert.equal(row.status,"DISMISSED");}
    await calculateOpportunities(28,{now:new Date(before.checkedAt)});assert.equal(await db.opportunity.count({where:{siteId:site.id,periodFrom:day(d.period.from),periodTo:day(d.period.to)}}),all.length);
    await checkQueues(site.id);
    const eligible=d.pages.filter(p=>p.traffic&&p.traffic.visits>=d.config.minVisits&&p.traffic.goalGroups?.BUSINESS_CONVERSION.rate!=null);
    const benchmarks=[...new Map(d.pages.filter(p=>p.conversionBenchmark!=null).map(p=>{const same=eligible.filter(x=>x.pageType===p.pageType),peers=same.length>=5?same:eligible,key=same.length>=5?p.pageType:"site";return [key,{scope:p.conversionBenchmarkScope,pageType:same.length>=5?p.pageType:null,pages:peers.length,pageTypes:[...new Set(peers.map(x=>x.pageType))],median:p.conversionBenchmark}];})).values()];
    const report=publicData({status:"PASS",period:d.period,goals:goals.goals.filter(g=>before.primaryGoals.includes(g.id)||goals.goalTypes[g.id]!=="IGNORE").map(g=>({...g,type:goals.goalTypes[g.id]})),before:{current:before.opportunities.filter((o:{isCurrent:boolean})=>o.isCurrent).length,rule03:before.opportunities.filter((o:{isCurrent:boolean;ruleId:string})=>o.isCurrent&&o.ruleId==="RULE_03").length},after:{current:current.length,active:current.filter(o=>o.status==="ACTIVE").length,dismissed:current.filter(o=>o.status==="DISMISSED").length,historical:all.filter(o=>!o.isCurrent).length,rule03:current.filter(o=>o.ruleId==="RULE_03").length},changes:before.opportunities.map((old:{id:string;url:string;ruleId:string;score:number})=>{const o=all.find(o=>o.id===old.id)!;return {url:old.url,ruleId:old.ruleId,beforeScore:old.score,afterScore:o.score,isCurrent:o.isCurrent,reason:!o.isCurrent?"Не подтверждено бизнес-конверсией после типизации":"Пересчитано по бизнес-целям; остальные веса сохранены"};}),newOpportunities:current.filter(o=>!before.opportunities.some((old:{id:string})=>old.id===o.id)).map(o=>({ruleId:o.ruleId,url:(o.evidenceJson as unknown as Evidence).page.url,score:o.score})),benchmarks,eligibleBusinessPages:eligible.length,totals:d.totals.traffic?.goalGroups,signals:first.counts,repeatWithoutDuplicates:true,historyPreserved:true,safety,generatedAt:new Date().toISOString()});
    writeFileSync("test-results/sprint3-1-production.json",JSON.stringify(report,null,2));
    console.log(JSON.stringify({status:report.status,before:report.before,after:report.after,benchmarks:report.benchmarks,safety:report.safety}));
  }
} finally { await db.$disconnect(); }
