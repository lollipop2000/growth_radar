import "server-only";
import { db } from "../db";
import { createScan } from "../scanner/service";
import { landingDataset, trafficCoverage, cohortAfter, type Landing } from "./dataset";
import { rematchSite, usablePageWhere } from "./store";
import { json } from "./settings";
import { selectRequestUrl } from "../scanner/url";
import { day } from "./dates";
import {observedRedirect,redirectHops} from '../scanner/redirects';
export type TargetDiagnostic = {
  kind: "TOP_UNMATCHED"; state: "PENDING" | "DONE"; selected: string[]; counterId: string;
  dates: { from: string; to: string }; capturedAt: string; cohort: Landing[];
  before: ReturnType<typeof trafficCoverage>; after?: ReturnType<typeof trafficCoverage>; rematchedAt?: string;
};
export async function scanTopUnmatched(limit: number,options:{mode?:'HTTP'|'BROWSER';delayMs?:number;browserFallback?:boolean}={}) {
  if (![10,20,50].includes(limit)) throw new Error("INVALID_TARGET_LIMIT");
  const dataset = await landingDataset();
  if (!dataset.counterId || !dataset.landing.length) throw new Error("NO_LANDING_DATA");
  // First apply the same evidence requirement used for normal imports. Error-only
  // Page placeholders must not count as successful crawl coverage.
  await rematchSite(dataset.site.id);
  const current = await landingDataset();
  const selected = current.candidates.filter(r => r.unmatchedRows > 0).slice(0,limit).map(r => r.url);
  if (!selected.length) throw new Error("NO_SAFE_UNMATCHED");
  const raw = await db.metrikaPageDaily.findMany({ where: { siteId: current.site.id, counterId: current.counterId!,
    date: { gte: day(current.dates.from), lte: day(current.dates.to) }, normalizedUrl: { in: selected } }, select: { url: true, normalizedUrl: true } });
  const seeds = selected.map(url => selectRequestUrl(url, raw.filter(r => r.normalizedUrl === url).map(r => r.url), current.site.baseUrl)!);
  const targeted: TargetDiagnostic = { kind: "TOP_UNMATCHED", state: "PENDING", selected, counterId: current.counterId!,
    dates: current.dates, capturedAt: new Date().toISOString(), cohort: current.landing, before: current.coverage };
  return createScan({ mode: options.mode??"HTTP", maxPages: selected.length, concurrency: 1, delayMs: options.delayMs??3000,
    seeds, seedOnly: true, single: false, browserFallback: options.browserFallback??true }, { targeted });
}
export async function completeTargetedScan(id: string) {
  const scan = await db.scan.findUniqueOrThrow({ where: { id }, include: { site: true } });
  const cfg = scan.configJson as Record<string, unknown>, target = cfg.targeted as TargetDiagnostic | undefined;
  const searchTarget=cfg.searchTargeted as {state?:string;selected?:string[]}|undefined;
  if(searchTarget&&searchTarget.state==='PENDING'&&scan.finishedAt){
    await rematchSite(scan.siteId,searchTarget.selected);
    const snapshots=await db.scanPage.findMany({where:{scanId:id},select:{requestedUrl:true,finalUrl:true,statusCode:true,outcome:true,pageId:true,source:true,redirectsJson:true,scannedAt:true}});
    await db.scan.update({where:{id},data:{configJson:json({...cfg,searchTargeted:{...searchTarget,state:'DONE',rematchedAt:new Date().toISOString(),outcomes:snapshots.map(s=>({...s,observedAt:s.scannedAt.toISOString(),evidenceSource:'TARGETED_SCAN',redirectStatus:redirectHops(s.redirectsJson)[0]?.statusCode??null,resolutionStatus:observedRedirect(s,scan.site.baseUrl)?'RESOLVED_REDIRECT':s.statusCode===404&&!['BLOCKED_BY_WAF','AUTH_REQUIRED'].includes(s.outcome)?'HISTORICAL_DEAD':s.outcome==='OK'&&s.statusCode===200?'READ_SUCCESS':'UNRESOLVED'}))}})}});
    return;
  }
  if (!target || target.kind !== "TOP_UNMATCHED" || target.state === "DONE" || !scan.finishedAt) return;
  await rematchSite(scan.siteId);
  const pages = await db.page.findMany({ where: { siteId: scan.siteId, ...usablePageWhere }, select: { id: true, normalizedUrl: true, aliasesJson: true } });
  await db.scan.update({ where: { id }, data: { configJson: json({ ...cfg, targeted: {
    ...target, after: cohortAfter(target.cohort, scan.site.baseUrl, pages), rematchedAt: new Date().toISOString(), state: "DONE",
  } }) } });
}
export async function recoverTargetedDiagnostics() {
  const scans = await db.scan.findMany({ where: { finishedAt: { not: null }, OR:[{configJson:{path:["targeted","state"],equals:"PENDING"}},{configJson:{path:["searchTargeted","state"],equals:"PENDING"}}] }, select: { id: true }, take: 10 });
  for (const scan of scans) await completeTargetedScan(scan.id);
}
