import "server-only";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import type { Prisma } from "@prisma/client";
import { db } from "../db";
import { day } from "../yandex/dates";
import { landingDataset, cohortAfter, safeDatasetUrl, type Landing } from "../yandex/dataset";
import { rematchSite, usablePageWhere } from "../yandex/store";
import { matchUrl } from "../yandex/matching";
import { json } from "../yandex/settings";
import { crawlUrl, normalizeUrl, selectRequestUrl } from "./url";
import { scanOptions } from "./options";
import { crawl } from "./engine";
import { saveScanPage } from "./store";
import {saveResultIsolated} from './save-result';
import type { PageResult } from "./model";
import { transport, unresolvedWaf, redactUrl, type Transport, type PageDiagnostics } from "./diagnostics";
export type CoverageSettings = { transport?: Transport; diagnosticLimit?: number; testUrl?: string; delayMs?: number };
export const DEFAULT_COVERAGE_DELAY_MS = 3000;
export const WAF_THRESHOLD = 3;
export function coverageSettings(settings: CoverageSettings = {}) {
  const mode = transport(settings.transport), limit = settings.diagnosticLimit;
  if (limit !== undefined && (!Number.isInteger(limit) || limit < 1 || limit > 50)) throw new Error("Diagnostic Max URLs: 1–50.");
  if (settings.testUrl && limit !== 1) throw new Error("Тест одного URL требует Max URLs = 1.");
  const delayMs = settings.delayMs ?? DEFAULT_COVERAGE_DELAY_MS;
  if (!Number.isInteger(delayMs) || delayMs < 1000 || delayMs > 60000) throw new Error("Delay: 1000–60000 ms.");
  return { transport: mode, diagnosticLimit: limit, testUrl: settings.testUrl, delayMs };
}

export const COVERAGE_MODE = "METRIKA_COVERAGE";
export const ACTIVE_SCANS = ["PENDING", "RUNNING", "PAUSING", "STOPPING", "IMPORTING"];
export const RECENT_SUCCESS_DAYS = 7;
export type CoverageResult = "SUCCESS_HTTP" | "SUCCESS_BROWSER" | "BLOCKED_BY_WAF" | "TIMEOUT" | "HTTP_ERROR" | "NETWORK_ERROR" | "INVALID_URL" | "SKIPPED";
export type CoverageMetrics = ReturnType<typeof cohortAfter>;
export type QueueUrl = { url: string; requestUrl?: string; rawUrls: string[]; visits: number; result?: CoverageResult; reason?: string; processedAt?: string; diagnostics?: PageDiagnostics };
export type CoverageCounts = ReturnType<typeof resultCounts>;
export type CoverageBatch = { number: number; urlCount: number; startedAt: string; finishedAt?: string; durationMs?: number; counts?: CoverageCounts; coverageBefore: CoverageMetrics; coverageAfter?: CoverageMetrics };
export type CoverageCheckpoint = {
  version: 1; period: number; scope: "UNMATCHED" | "ALL"; batchSize: number; rescanSuccessful: boolean;
  transport?: Transport; diagnosticLimit?: number; wafStreak?: number; pauseReason?: string; delayMs?: number;
  counterId: string; dates: { from: string; to: string }; rawUrls: number; missingDays: string[];
  cohort: Landing[]; queue: QueueUrl[]; excluded: { url: string; reason: string }[];
  before: CoverageMetrics; after: CoverageMetrics; batches: CoverageBatch[];
  startedAt: string; updatedAt: string; lastProcessedUrl?: string; lease?: string;
  remainingUnmatched?: { url: string; visits: number; result: string; reason: string }[];
  progress?: CoverageCounts & { currentBatch: number; totalBatches: number };
};
export function resultCounts(queue: QueueUrl[]) {
  const count = (r: CoverageResult) => queue.filter(q => q.result === r).length;
  const successHTTP = count("SUCCESS_HTTP"), successBrowser = count("SUCCESS_BROWSER"), timedOut = count("TIMEOUT"), blocked = count("BLOCKED_BY_WAF"), httpErrors = count("HTTP_ERROR"), networkErrors = count("NETWORK_ERROR"), invalid = count("INVALID_URL"), skipped = count("SKIPPED");
  const processed = queue.filter(q => q.result).length;
  return { totalUrls: queue.length, processedUrls: processed, remainingUrls: queue.length - processed, total: queue.length, processed, remaining: queue.length - processed, successful: successHTTP + successBrowser,
    failed: timedOut + httpErrors + networkErrors + invalid, attempted: processed - skipped - invalid, successHTTP, successBrowser, timedOut, blocked, httpErrors, networkErrors, invalid, skipped };
}
export function pageCoverageResult(p: PageResult): CoverageResult {
  if (p.outcome === "BLOCKED_BY_WAF") return "BLOCKED_BY_WAF";
  if (/TIMEOUT|время ожидания|за 20 секунд/i.test(p.error ?? "")) return "TIMEOUT";
  if (p.outcome === "OK" && p.statusCode && p.statusCode >= 200 && p.statusCode < 400) return p.source === "BROWSER" ? "SUCCESS_BROWSER" : "SUCCESS_HTTP";
  if (p.outcome === "AUTH_REQUIRED" || p.statusCode && p.statusCode >= 400) return "HTTP_ERROR";
  return "NETWORK_ERROR";
}
export function coverageConfig(value: unknown): CoverageCheckpoint | undefined {
  const c = (value as { coverage?: CoverageCheckpoint } | null)?.coverage;
  return c?.version === 1 ? c : undefined;
}
function validate(period: number, scope: string, batchSize: number) {
  if (![7,30,90].includes(period) || !["UNMATCHED","ALL"].includes(scope) || !Number.isInteger(batchSize) || batchSize < 1 || batchSize > 50)
    throw new Error("Period 7/30/90, Scope Unmatched/All, Batch size 1–50.");
}
export async function coveragePreview(period = 30, scope = "UNMATCHED", batchSize = 50, rescanSuccessful = false, siteId?: string, counterId?: string) {
  validate(period, scope, batchSize);
  const d = await landingDataset(period, siteId, counterId);
  const pages = await db.page.findMany({ where: { siteId: d.site.id, ...usablePageWhere }, select: { id: true, normalizedUrl: true, aliasesJson: true,
    scanPages: { where: { outcome: "OK", statusCode: { gte: 200, lt: 400 } }, orderBy: { scannedAt: "desc" }, take: 1, select: { scannedAt: true } } } });
  const raw = d.counterId ? await db.metrikaPageDaily.findMany({ where: { siteId: d.site.id, counterId: d.counterId, date: { gte: day(d.dates.from), lte: day(d.dates.to) } }, select: { url: true, normalizedUrl: true } }) : [];
  const context = new Map<string, Set<string>>();
  for (const r of raw) { const variants = context.get(r.normalizedUrl) ?? new Set<string>(); variants.add(r.url); context.set(r.normalizedUrl, variants); }
  const queue: QueueUrl[] = [], excluded: CoverageCheckpoint["excluded"] = [];
  const seen = new Set<string>();
  for (const r of d.landing) {
    const url = safeDatasetUrl(r.url, d.site.baseUrl);
    if (!url) { excluded.push({ url: redactUrl(r.url), reason: "Existing Scanner exclusions / external or invalid URL" }); continue; }
    if (seen.has(url)) continue;
    seen.add(url);
    const match = matchUrl(url, d.site.baseUrl, pages), page = pages.find(p => p.id === match.pageId);
    if (scope === "UNMATCHED" && match.pageId) { excluded.push({ url, reason: "Already matched to successful Page" }); continue; }
    if (!rescanSuccessful && page && page.scanPages[0].scannedAt.getTime() >= Date.now() - RECENT_SUCCESS_DAYS * 86400000) { excluded.push({ url, reason: "Recent successful snapshot (7 days)" }); continue; }
    const variants = [...(context.get(r.url) ?? new Set([r.url]))];
    queue.push({ url, requestUrl: selectRequestUrl(url, variants, d.site.baseUrl) ?? undefined, rawUrls: variants.map(redactUrl), visits: r.visits });
  }
  return { dataset: d, queue, excluded, before: cohortAfter(d.landing, d.site.baseUrl, pages), batchSize, totalBatches: Math.ceil(queue.length / batchSize) };
}
export async function createCoverageScan(period = 30, scope = "UNMATCHED", batchSize = 50, rescanSuccessful = false, siteId?: string, counterId?: string, settings: CoverageSettings = {}) {
  const selected = coverageSettings(settings);
  const preview = await coveragePreview(period, scope, batchSize, rescanSuccessful, siteId, counterId), d = preview.dataset;
  if (selected.testUrl) {
    const url = safeDatasetUrl(selected.testUrl, d.site.baseUrl);
    if (!url) throw new Error("Тестовый URL должен быть разрешённым URL текущего сайта без секретных параметров.");
    const requestUrl = crawlUrl(selected.testUrl, d.site.baseUrl)!;
    preview.queue = [{ url, requestUrl, rawUrls: [redactUrl(requestUrl)], visits: d.landing.find(r => r.url === url)?.visits ?? 0 }];
  }
  if (selected.diagnosticLimit) preview.queue = preview.queue.slice(0, selected.diagnosticLimit);
  if (!d.counterId || !preview.queue.length) throw new Error("Нет доступных Metrika URLs для выбранного scope.");
  // Existing matcher, fixed landing cohort. No remote crawl occurs while creating this queue.
  await rematchSite(d.site.id);
  const now = new Date().toISOString();
  const checkpoint: CoverageCheckpoint = { version: 1, period, scope: scope as "ALL" | "UNMATCHED", batchSize, rescanSuccessful, counterId: d.counterId,
    transport: selected.transport, diagnosticLimit: selected.diagnosticLimit, wafStreak: 0, delayMs: selected.delayMs,
    dates: d.dates, rawUrls: d.rawUrls, missingDays: d.missingDays, cohort: d.landing, queue: preview.queue, excluded: preview.excluded,
    before: preview.before, after: preview.before, batches: [], startedAt: now, updatedAt: now };
  checkpoint.progress = { ...resultCounts(checkpoint.queue), currentBatch: 1, totalBatches: Math.ceil(checkpoint.queue.length / batchSize) };
  const options = scanOptions({ maxPages: batchSize, mode: selected.transport === "BROWSER_ONLY" ? "BROWSER" : "HTTP", browserFallback: selected.transport === "HTTP_BROWSER", seedOnly: true, continueOnError: true, concurrency: 1, delayMs: selected.delayMs });
  return db.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(7462101)`;
    if (await tx.scan.findFirst({ where: { status: { in: ACTIVE_SCANS } } })) throw new Error("Другое сканирование/импорт уже выполняется.");
    return tx.scan.create({ data: { siteId: d.site.id, mode: COVERAGE_MODE, pagesDiscovered: preview.queue.length, configJson: json({ ...options, coverage: checkpoint }) } });
  });
}
export async function coverageControl(id: string, action: "PAUSE" | "STOP" | "RESUME", delayMs?: number) {
  return db.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(7462101)`;
    const scan = await tx.scan.findUniqueOrThrow({ where: { id } });
    if (scan.mode !== COVERAGE_MODE || !coverageConfig(scan.configJson)) throw new Error("Не Coverage Scan.");
    let status = scan.status;
    if (action === "PAUSE") status = scan.status === "RUNNING" ? "PAUSING" : scan.status === "PENDING" ? "PAUSED" : scan.status;
    if (action === "STOP") status = scan.status === "RUNNING" || scan.status === "PAUSING" ? "STOPPING" : ["PENDING","PAUSED","INTERRUPTED","FAILED"].includes(scan.status) ? "STOPPED" : scan.status;
    if (action === "RESUME") {
      if (!["PAUSED","STOPPED","INTERRUPTED","FAILED"].includes(scan.status)) throw new Error("Resume доступен для приостановленной очереди.");
      if (await tx.scan.findFirst({ where: { id: { not: id }, status: { in: ACTIVE_SCANS } } })) throw new Error("Другое сканирование/импорт уже выполняется.");
      status = "PENDING";
    }
    const c = coverageConfig(scan.configJson)!; c.updatedAt = new Date().toISOString();
    if (action === "RESUME") { c.wafStreak = 0; delete c.pauseReason; c.delayMs = coverageSettings({ delayMs: delayMs ?? c.delayMs }).delayMs; }
    await tx.scan.update({ where: { id }, data: { status, configJson: json({ ...(scan.configJson as object), ...(action === "RESUME" ? { delayMs: c.delayMs, concurrency: 1 } : {}), coverage: c }), ...(status === "STOPPED" ? { finishedAt: new Date() } : {}), ...(status === "PENDING" ? { finishedAt: null, lastError: null } : {}) } });
  });
}
// Serialized checkpoint writes are fenced by the current worker claim. ScanPage +
// result commit together; a crash cannot persist a snapshot without advancing its URL.
async function mutate(id: string, lease: string, fn: (c: CoverageCheckpoint) => void, tx?: Prisma.TransactionClient) {
  const operation = async (t: Prisma.TransactionClient) => {
    await t.$executeRaw`SELECT pg_advisory_xact_lock(7462101)`;
    const row = await t.scan.findUniqueOrThrow({ where: { id } }), c = coverageConfig(row.configJson);
    if (!c || c.lease !== lease || !["RUNNING","PAUSING","STOPPING"].includes(row.status)) throw new Error("COVERAGE_LEASE_LOST");
    fn(c); c.updatedAt = new Date().toISOString();
    const count = resultCounts(c.queue);
    const totalBatches = Math.ceil(c.queue.length / c.batchSize);
    c.progress = { ...count, totalBatches, currentBatch: c.batches.find(b => !b.finishedAt)?.number ?? Math.min(totalBatches, Math.floor(count.processed / c.batchSize) + 1) };
    await t.scan.update({ where: { id }, data: { configJson: json({ ...(row.configJson as object), coverage: c }), pagesScanned: count.processed, errorsCount: count.failed + count.blocked,
      ...(c.pauseReason && row.status === "RUNNING" ? { status: "PAUSING", lastError: c.pauseReason } : {}) } });
  };
  if (tx) await operation(tx); else await db.$transaction(operation, { timeout: 15000 });
}
export async function coverageLease(id: string) {
  const lease = randomUUID();
  await db.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(7462101)`;
    const row = await tx.scan.findUniqueOrThrow({ where: { id } }), c = coverageConfig(row.configJson);
    if (!c || !["RUNNING","PAUSING","STOPPING"].includes(row.status)) throw new Error("COVERAGE_NOT_RUNNING");
    c.lease = lease;
    await tx.scan.update({ where: { id }, data: { configJson: json({ ...(row.configJson as object), coverage: c }) } });
  });
  return lease;
}
async function refreshCoverage(id: string, lease: string) {
  const scan = await db.scan.findUniqueOrThrow({ where: { id }, include: { site: true } }), c = coverageConfig(scan.configJson)!;
  await rematchSite(scan.siteId);
  const pages = await db.page.findMany({ where: { siteId: scan.siteId, ...usablePageWhere }, select: { id: true, normalizedUrl: true, aliasesJson: true } });
  const after = cohortAfter(c.cohort, scan.site.baseUrl, pages);
  const remaining = c.cohort.filter(r => !matchUrl(r.url, scan.site.baseUrl, pages).pageId).sort((a,b) => b.visits - a.visits).slice(0,50);
  const requestVariants = remaining.flatMap(r => { const q = c.queue.find(q => q.url === r.url); return [r.url, ...(q?.rawUrls ?? []), ...(q?.requestUrl ? [q.requestUrl] : [])]; });
  const snapshots = await db.scanPage.findMany({ where: { page: { siteId: scan.siteId }, OR: [{ requestedUrl: { in: requestVariants } }, { page: { normalizedUrl: { in: remaining.map(r => r.url) } } }] }, orderBy: { scannedAt: "desc" } });
  const unmatched = remaining.map(r => {
    const q = c.queue.find(q => q.url === r.url);
    const previous = snapshots.find(p => p.requestedUrl && normalizeUrl(p.requestedUrl) === r.url);
    const result = q?.result ?? (previous ? pageCoverageResult(previous as unknown as PageResult) : "NOT_ATTEMPTED");
    const matchReason = matchUrl(r.url, scan.site.baseUrl, pages).matchReason;
    return { url: r.url, visits: r.visits, result, reason: result.startsWith("SUCCESS") ? matchReason : q?.reason ?? previous?.error ?? c.excluded.find(e => e.url === r.url)?.reason ?? matchReason };
  });
  await mutate(id, lease, c => { c.after = after; c.remainingUnmatched = unmatched; });
  return after;
}
export async function runCoverageScan(id: string, signal: AbortSignal) {
  const guard = new AbortController();
  signal = AbortSignal.any([signal, guard.signal]);
  const lease = await coverageLease(id), initial = await db.scan.findUniqueOrThrow({ where: { id }, include: { site: true } });
  const options = scanOptions({ ...(initial.configJson as Parameters<typeof scanOptions>[0]),
    concurrency: 1, delayMs: coverageConfig(initial.configJson)?.delayMs ?? DEFAULT_COVERAGE_DELAY_MS });
  try {
    await mutate(id, lease, c => { c.delayMs = options.delayMs; });
    for (;;) {
      const scan = await db.scan.findUniqueOrThrow({ where: { id } }), c = coverageConfig(scan.configJson)!;
      if (signal.aborted || scan.status !== "RUNNING") break;
      const unfinished = c.batches.find(b => !b.finishedAt);
      const index = unfinished ? (unfinished.number - 1) * c.batchSize : c.queue.findIndex(q => !q.result);
      if (index < 0) break;
      const batchNumber = Math.floor(index / c.batchSize) + 1, start = (batchNumber - 1) * c.batchSize;
      const group = c.queue.slice(start, start + c.batchSize);
      await mutate(id, lease, c => {
        if (!c.batches.some(b => b.number === batchNumber)) c.batches.push({ number: batchNumber, urlCount: group.length, startedAt: new Date().toISOString(), coverageBefore: c.after });
      });
      const seeds: string[] = [];
      for (const q of group.filter(q => !q.result)) {
        const requestUrl = selectRequestUrl(q.url, q.requestUrl ? [q.requestUrl] : q.rawUrls, initial.site.baseUrl, options.excludes);
        if (requestUrl) {
          seeds.push(requestUrl);
          await mutate(id, lease, c => { c.queue.find(r => r.url === q.url)!.requestUrl = requestUrl; });
        }
        else await mutate(id, lease, c => { const entry = c.queue.find(r => r.url === q.url)!; entry.result = "INVALID_URL"; entry.reason = "URL no longer allowed by Scanner"; entry.processedAt = new Date().toISOString(); c.lastProcessedUrl = q.url; });
      }
      if (seeds.length) try { await crawl(initial.site.baseUrl, { ...options, maxPages: seeds.length, seeds, seedOnly: true, continueOnError: true }, signal,
        async page => { let blocked = false; await saveResultIsolated(id, initial.siteId, page,(scanId,siteId,saved)=>{blocked=false;return saveScanPage(scanId, siteId, saved, tx => mutate(id, lease, c => {
          const entry = c.queue.find(q => q.url === normalizeUrl(saved.requestedUrl));
          if (!entry) throw new Error("INVALID_COVERAGE_RESULT");
          if (!entry.result) {
            entry.requestUrl = saved.requestedUrl; entry.result = pageCoverageResult(saved); entry.reason = saved.error ?? entry.result; entry.diagnostics = saved.diagnostics; entry.processedAt = new Date().toISOString(); c.lastProcessedUrl = saved.requestedUrl;
            c.wafStreak = unresolvedWaf(saved) ? (c.wafStreak ?? 0) + 1 : 0;
            if (c.wafStreak >= WAF_THRESHOLD) { c.pauseReason = "Автоматическая пауза: 3 URL подряд заблокированы WAF/403/challenge без успешного чтения. Очередь сохранена. Проверьте один URL; используйте Excel Crawl Import при повторной блокировке. Resume только вручную."; blocked = true; }
          }
        }, tx));}); if (blocked) guard.abort(); if (page.error?.includes("CONFIGURATION_ERROR")) throw new Error("BROWSER_CONFIGURATION_ERROR"); }, async () => {});
      } catch (error) { if (!signal.aborted) throw error; }
      if (signal.aborted || (await db.scan.findUniqueOrThrow({ where: { id } })).status !== "RUNNING") break;
      // Seeds rejected by robots or resolved redirect aliases are not fetched again.
      await mutate(id, lease, c => { for (const entry of c.queue.slice(start, start + c.batchSize)) if (!entry.result) { entry.result = "SKIPPED"; entry.reason = "Scanner robots rule / already resolved redirect alias"; entry.processedAt = new Date().toISOString(); c.lastProcessedUrl = entry.url; } });
      const after = await refreshCoverage(id, lease);
      await mutate(id, lease, c => { const b = c.batches.find(b => b.number === batchNumber)!; b.finishedAt = new Date().toISOString(); b.durationMs = Date.now() - Date.parse(b.startedAt); b.counts = resultCounts(c.queue.slice(start, start + c.batchSize)); b.coverageAfter = after; });
      // Each crawl owns its pacers; keep the same safe browser spacing across
      // logical batch boundaries as well, before creating the next crawl.
      await delay(options.delayMs, undefined, { signal }).catch(() => {});
    }
    await refreshCoverage(id, lease);
    await db.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(7462101)`;
      const row = await tx.scan.findUniqueOrThrow({ where: { id } }), c = coverageConfig(row.configJson)!;
      if (c.lease !== lease || !["RUNNING","PAUSING","STOPPING"].includes(row.status)) return;
      const count = resultCounts(c.queue), status = row.status === "STOPPING" ? "STOPPED" : row.status === "PAUSING" || signal.aborted ? "PAUSED" : count.remaining ? "PAUSED" : count.failed + count.blocked ? "COMPLETED_WITH_ERRORS" : "COMPLETED";
      await tx.scan.update({ where: { id }, data: { status, finishedAt: ["PAUSED"].includes(status) ? null : new Date(), lastError: c.pauseReason ?? (status === "PAUSED" && signal.aborted ? "Очередь сохранена. Используйте Resume." : null) } });
    });
  } catch {
    // Per-URL network/WAF errors are returned by the existing scanner; only
    // persistence/configuration failures reach here. Never restart from URL 1.
    await db.scan.updateMany({ where: { id, configJson: { path: ["coverage","lease"], equals: lease }, status: { in: ["RUNNING","PAUSING","STOPPING"] } }, data: { status: "PAUSED", lastError: "Coverage scan приостановлен: проверьте БД/worker/config. Checkpoint сохранён; используйте Resume." } });
  }
}
