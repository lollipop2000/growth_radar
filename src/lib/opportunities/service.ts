import "server-only";
import { db } from "../db";
import { json, currentSite } from "../yandex/settings";
import { day } from "../yandex/dates";
import { prepareDataset, rulesIntegration } from "./dataset";
import { runRules, ruleIds } from "./rules";
import { scorePage } from "./score";
import {opportunityScores} from './commerce-score';
import {commerceClassification} from './commerce-rules';
import { rulesConfig, type RulesConfig, type Dataset } from "./model";
import { goalConfig } from "../yandex/goal-types";
import { config } from "../yandex/settings";
import {businessRevision,businessRevisionSelect,confirmedStatuses} from '../business/revision';
export async function calculateOpportunities(n:number|string=28,options:Parameters<typeof prepareDataset>[1]={}) {
  const start=performance.now(),dataset=await prepareDataset(n,options),signals=runRules(dataset),pages=new Map(dataset.pages.map(p=>[p.id,p]));
  const counts=Object.fromEntries(ruleIds.map(id=>[id,signals.filter(s=>s.ruleId===id).length]));
  // One lock serializes runs/settings; the dataset is prepared in a few bulk reads.
  await db.$transaction(async tx=>{
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(7462302)`;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(7462301)`;
    if(dataset.businessRevision&&businessRevision(await tx.import.findMany({where:{siteId:dataset.siteId,status:{in:confirmedStatuses}},select:businessRevisionSelect}))!==dataset.businessRevision)throw new Error('Бизнес-данные изменились во время расчёта. Пересчитайте возможности.');
    const settings=await tx.integration.findUnique({where:{type:rulesIntegration(dataset.siteId)}});
    if(JSON.stringify(rulesConfig((settings?.configJson as {thresholds?:RulesConfig}|null)?.thresholds))!==JSON.stringify(dataset.config))throw new Error("Пороги изменились во время расчёта. Пересчитайте возможности.");
    if(!options.goalConfig){const metrika=await tx.integration.findUnique({where:{type:"Yandex Metrika"}}),m=config(metrika?.configJson);const current=goalConfig(m.siteId===dataset.siteId&&m.counterId===process.env.YANDEX_METRIKA_COUNTER_ID?m:{});if(JSON.stringify(current)!==JSON.stringify(dataset.goalConfig))throw new Error("Типы целей изменились во время расчёта. Пересчитайте возможности.");}
    const where={siteId:dataset.siteId,periodFrom:day(dataset.period.from),periodTo:day(dataset.period.to)};
    await tx.opportunity.updateMany({where,data:{isCurrent:false}});
    for(const signal of signals){const page=pages.get(signal.pageId)!,scores=opportunityScores(page,dataset.config,signal.ruleId),breakdown=scores.breakdown,classification=['RULE_23','RULE_24'].includes(signal.ruleId)?{domain:'SEARCH',primaryType:'GROWTH'}:Number(signal.ruleId.slice(5))>=11?commerceClassification(signal.ruleId):{domain:'SEARCH',primaryType:'SEARCH'},data={...classification,searchScore:scores.searchScore,commerceScore:scores.commerceScore,overallScore:scores.overallScore,title:signal.title,description:signal.description,severity:signal.severity,score:breakdown.score,evidenceJson:json({commerceVersion:1,conversionVersion:2,goalConfig:dataset.goalConfig,signal,page,config:dataset.config,period:dataset.period,previous:dataset.previous,coverage:dataset.coverage,primaryGoals:dataset.primaryGoals,calculatedAt:dataset.createdAt}),scoreBreakdownJson:json(breakdown),isCurrent:true};
      await tx.opportunity.upsert({where:{siteId_pageId_ruleId_periodFrom_periodTo:{...where,pageId:signal.pageId,ruleId:signal.ruleId}},create:{...where,pageId:signal.pageId,ruleId:signal.ruleId,...data},update:data});}
    const old=await tx.integration.findUnique({where:{type:rulesIntegration(dataset.siteId)}});
    const data={enabled:true,status:"HEALTHY",lastSuccessfulSyncAt:new Date(),configJson:json({...old?.configJson as object,thresholds:dataset.config,lastRun:{period:dataset.period,previous:dataset.previous,counts,signals:signals.length,createdAt:dataset.createdAt,durationMs:Math.round(performance.now()-start),dataset:datasetCounts(dataset)}})};
    await tx.integration.upsert({where:{type:rulesIntegration(dataset.siteId)},create:{type:rulesIntegration(dataset.siteId),...data},update:data});
  },{timeout:120000});
  return {dataset,counts,signals:signals.length,durationMs:Math.round(performance.now()-start)};
}
export function datasetCounts(d:Dataset){return {pages:d.pages.length,scanner:d.pages.filter(p=>p.scanner).length,metrika:d.pages.filter(p=>p.traffic).length,webmaster:d.pages.filter(p=>p.search).length,excel:d.pages.filter(p=>p.business).length};}
export async function saveRulesConfig(input:RulesConfig){const site=await currentSite(),thresholds=rulesConfig(input);return db.$transaction(async tx=>{await tx.$executeRaw`SELECT pg_advisory_xact_lock(7462302)`;const row=await tx.integration.findUnique({where:{type:rulesIntegration(site.id)}});return tx.integration.upsert({where:{type:rulesIntegration(site.id)},create:{type:rulesIntegration(site.id),enabled:true,status:"HEALTHY",configJson:json({thresholds})},update:{configJson:json({...row?.configJson as object,thresholds})}});});}
export async function setOpportunityStatus(id:string,status:"ACTIVE"|"DISMISSED") {const site=await currentSite();return db.opportunity.updateMany({where:{id,siteId:site.id},data:{status}});}

