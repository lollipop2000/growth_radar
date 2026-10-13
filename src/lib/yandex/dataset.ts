import "server-only";
import { db } from "../db";
import { config, currentSite, readIntegration } from "./settings";
import { day, period, days, iso } from "./dates";
import { crawlUrl, normalizeUrl } from "../scanner/url";
import { matchUrl, type MatchPage } from "./matching";
import {searchDataset} from '../search/dataset';
export type Landing = { url: string; visits: number; matchedVisits: number; unmatchedVisits: number; unmatchedRows: number; rawUrls: number; reason: string };
export function safeDatasetUrl(raw: string, base: string) {
  const url = crawlUrl(raw, base);
  if (!url || /(?:^|\/)(?:personal|profile|registration|register|signin|sign-in|user)(?:\/|$)/i.test(new URL(url).pathname)) return null;
  return normalizeUrl(url);
}
export function aggregateLanding(rows: { url: string; normalizedUrl: string; visits: number; pageId: string | null; matchReason?: string | null }[]): Landing[] {
  const groups = new Map<string, Landing & { raw: Set<string> }>();
  for (const r of rows) {
    const g = groups.get(r.normalizedUrl) ?? { url: r.normalizedUrl, visits: 0, matchedVisits: 0, unmatchedVisits: 0, unmatchedRows: 0, rawUrls: 0, raw: new Set<string>(), reason: r.matchReason ?? "unknown" };
    g.visits += r.visits; g[r.pageId ? "matchedVisits" : "unmatchedVisits"] += r.visits; g.raw.add(r.url);
    if (!r.pageId) g.unmatchedRows++;
    groups.set(g.url, g);
  }
  return [...groups.values()].map(({ raw, ...g }) => ({ ...g, rawUrls: raw.size })).sort((a,b) => b.visits - a.visits || a.url.localeCompare(b.url));
}
export function trafficCoverage(rows: Landing[]) {
  const matchedVisits = rows.reduce((n,r) => n + r.matchedVisits, 0), unmatchedVisits = rows.reduce((n,r) => n + r.unmatchedVisits, 0);
  const matchedUrls = rows.filter(r => r.unmatchedRows === 0).length;
  return { totalUrls: rows.length, matchedUrls, unmatchedUrls: rows.length - matchedUrls,
    totalVisits: matchedVisits + unmatchedVisits, matchedVisits, unmatchedVisits,
    coverage: matchedVisits + unmatchedVisits ? matchedVisits / (matchedVisits + unmatchedVisits) * 100 : null };
}
export function cohortAfter(cohort: Landing[], base: string, pages: MatchPage[]) {
  return trafficCoverage(cohort.map(r => ({ ...r, unmatchedRows: matchUrl(r.url, base, pages).pageId ? 0 : 1, matchedVisits: matchUrl(r.url, base, pages).pageId ? r.visits : 0,
    unmatchedVisits: matchUrl(r.url, base, pages).pageId ? 0 : r.visits })));
}
export type Candidate = Landing & { pageId: string | null; pageType: string; matchStatus: string; discovery: boolean; hasSearch: boolean; valid: boolean; inclusionReason: string };
export function rankCandidates(rows: Candidate[]) {
  return rows.filter(r => r.valid).sort((a,b) => b.visits - a.visits || Number(b.discovery) - Number(a.discovery) ||
    Number(["product","category"].includes(b.pageType)) - Number(["product","category"].includes(a.pageType)) || a.url.localeCompare(b.url));
}
export async function landingDataset(n = 30, siteId?: string, counterId?: string) {
  const site = siteId ? await db.site.findUniqueOrThrow({ where: { id: siteId } }) : await currentSite();
  const m = config((await readIntegration("METRIKA"))?.configJson), w = config((await readIntegration("WEBMASTER"))?.configJson);
  const dates = period(n), bound = counterId ?? (m.siteId === site.id && m.counterId === process.env.YANDEX_METRIKA_COUNTER_ID ? m.counterId : undefined);
  const rows = bound ? await db.metrikaPageDaily.findMany({ where: { siteId: site.id, counterId: bound, date: { gte: day(dates.from), lte: day(dates.to) } },
    select: { url: true, normalizedUrl: true, visits: true, pageId: true, matchReason: true, date: true } }) : [];
  const pages = await db.page.findMany({ where: { siteId: site.id }, include: { latestScanPage: true, scanPages: { where: { outcome: "OK", statusCode: { gte: 200, lt: 400 } }, take: 1 } } });
  const jobs = w.siteId === site.id ? await db.jobRun.findMany({ where: { siteId: site.id, source: "WEBMASTER" }, orderBy: { createdAt: "desc" }, take: 50,
    select: { configJson: true, checkpointJson: true } }) : [];
  const discovery = new Set<string>();
  for (const job of jobs) {
    const cfg = config(job.configJson) as typeof w & { priorityUrls?: string[] };
    const cp = job.checkpointJson as { paths?: string[]; discoveryOffset?: number; phase?: string };
    if (cfg.hostId !== w.hostId || cfg.webmasterUrlSource !== "WEBMASTER" || cfg.priorityUrls || cp.phase === "DISCOVERY") continue;
    const paths = cp.paths;
    if (!paths || cp.discoveryOffset === undefined || cp.discoveryOffset < paths.length) continue;
    if (Array.isArray(paths)) for (const path of paths) { try { discovery.add(normalizeUrl(path, site.baseUrl)); } catch {} }
  }
  const savedDiscovery = (w as { discoveryUrls?: string[] }).discoveryUrls;
  if (w.siteId === site.id && Array.isArray(savedDiscovery)) for (const url of savedDiscovery) { try { discovery.add(normalizeUrl(url, site.baseUrl)); } catch {} }
  const searchRows = await searchDataset({siteId:site.id,date:{gte:day(dates.from),lte:day(dates.to)}},w.siteId===site.id?w.hostId:undefined);
  const search = new Set(searchRows.map(r => r.normalizedUrl)), searchPages = new Set(searchRows.flatMap(r => r.pageId ? [r.pageId] : []));
  const landing = aggregateLanding(rows), all = new Map(landing.map(r => [r.url,r]));
  for (const url of [...discovery, ...pages.filter(p => p.active && p.scanPages.length).map(p => p.normalizedUrl)]) if (!all.has(url))
    all.set(url, { url, visits: 0, matchedVisits: 0, unmatchedVisits: 0, unmatchedRows: 0, rawUrls: 0, reason: "no Metrika visits" });
  const usablePages = pages.filter(p => p.active && p.scanPages.length);
  const candidates: Candidate[] = [...all.values()].map(r => {
    const match = matchUrl(r.url, site.baseUrl, usablePages), page = pages.find(p => p.id === match.pageId);
    const known = pages.find(p => p.normalizedUrl === r.url);
    const gone = known?.active === false || [404,410].includes(known?.latestScanPage?.statusCode ?? 0);
    const valid = !gone && !!safeDatasetUrl(r.url, site.baseUrl) && (r.visits > 0 || discovery.has(r.url) || !!page);
    return { ...r, pageId: match.pageId, pageType: page?.pageType ?? (known?.manualType ? known.pageType : "unknown"), matchStatus: match.matchStatus,
      discovery: discovery.has(r.url), hasSearch: search.has(r.url) || !!page && searchPages.has(page.id), valid,
      inclusionReason: [r.visits > 0 ? "Metrika visits за 30 дней" : "Нет visits", discovery.has(r.url) ? "Webmaster discovery" : "", page ? "Успешный Scanner snapshot" : "Нужен scan"].filter(Boolean).join("; ") };
  });
  const availableDays = new Set(rows.map(r => iso(r.date)));
  return { site, counterId: bound, dates, discoveryUrls: [...discovery], missingDays: days(dates.from,dates.to).filter(d => !availableDays.has(d)), landing, rawUrls: new Set(rows.map(r => r.url)).size, coverage: trafficCoverage(landing), candidates: rankCandidates(candidates) };
}
