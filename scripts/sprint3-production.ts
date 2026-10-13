import assert from "node:assert/strict";
import {readFileSync,writeFileSync} from "node:fs";
import {createHash} from "node:crypto";
import {db} from "../src/lib/db";
import {currentSite} from "../src/lib/yandex/settings";
import {calculateOpportunities,datasetCounts} from "../src/lib/opportunities/service";
import {publicData} from "../src/lib/public-data";
import type {Evidence} from "../src/components/opportunities";
try{
  const site=await currentSite();assert.equal(site.baseUrl,"https://shop.gazpromneft-sm.ru/");
  const baseline=JSON.parse(readFileSync("test-results/sprint3-safety-before.json","utf8")) as {scans:{id:string;status:string;hash:string;pagesScanned:number}[];jobs:{id:string;status:string;hash:string}[]};
  const digest=(value:unknown)=>createHash("sha256").update(JSON.stringify(value)).digest("hex");
  const scans=await db.scan.findMany({where:{siteId:site.id},select:{id:true,status:true,configJson:true,pagesScanned:true}});assert.deepEqual(scans.map(({configJson,...s})=>({...s,hash:digest(configJson)})).sort((a,b)=>a.id.localeCompare(b.id)),baseline.scans.sort((a,b)=>a.id.localeCompare(b.id)));
  for(const old of baseline.jobs){const current=await db.jobRun.findUniqueOrThrow({where:{id:old.id},select:{id:true,status:true,checkpointJson:true}});assert.deepEqual({id:current.id,status:current.status,hash:digest(current.checkpointJson)},old);}
  const result=await calculateOpportunities(28),opps=await db.opportunity.findMany({where:{siteId:site.id,isCurrent:true},orderBy:{score:"desc"}}),distribution={"80–100":0,"60–79":0,"40–59":0,"<40":0};
  for(const o of opps)distribution[o.score>=80?"80–100":o.score>=60?"60–79":o.score>=40?"40–59":"<40"]++;
  const report=publicData({status:"PASS",siteUrl:site.baseUrl,period:result.dataset.period,previous:result.dataset.previous,dataset:datasetCounts(result.dataset),coverage:result.dataset.coverage,primaryGoals:result.dataset.primaryGoals,signals:result.counts,total:opps.length,active:opps.filter(o=>o.status==="ACTIVE").length,dismissed:opps.filter(o=>o.status==="DISMISSED").length,durationMs:result.durationMs,scoreDistribution:distribution,top10:opps.slice(0,10).map(o=>{const e=o.evidenceJson as unknown as Evidence;return {id:o.id,url:e.page.url,score:o.score,ruleId:o.ruleId,title:o.title,evidence:e.signal.evidence,search:e.page.search,traffic:e.page.traffic,business:e.page.business,incomplete:(o.scoreBreakdownJson as {incomplete:boolean}).incomplete};}),safety:{unchangedProductionScans:scans.length,unchangedExistingWebmasterJobs:baseline.jobs.length,newProductionScans:0,newWebmasterExports:0},generatedAt:new Date().toISOString()});
  const historyCount=await db.opportunity.count({where:{siteId:site.id}});
  const repeated=await calculateOpportunities(28);assert.equal(repeated.signals,result.signals);assert.equal(await db.opportunity.count({where:{siteId:site.id}}),historyCount);
  writeFileSync("test-results/sprint3-production.json",JSON.stringify(report,null,2));console.log(JSON.stringify({dataset:report.dataset,signals:report.signals,total:report.total,active:report.active,dismissed:report.dismissed,scoreDistribution:distribution,durationMs:report.durationMs,safety:report.safety}));
}finally{await db.$disconnect();}
