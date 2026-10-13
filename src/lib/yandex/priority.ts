import "server-only";
import { createHash } from "node:crypto";
import { db } from "../db";
import { landingDataset, type Candidate } from "./dataset";
import { config, readIntegration, json } from "./settings";
export type ScopeMode = "TOP20" | "TOP50" | "TOP100" | "MANUAL";
export type PriorityScope = { mode: ScopeMode; urls: string[]; key: string; selectedAt: string; syncedThrough?: string };
export function scopeKey(urls: string[]) { return createHash("sha256").update(JSON.stringify([...urls].sort())).digest("hex"); }
export function choosePriority(candidates: Candidate[], mode: string, manual: string[] = []) {
  if (!["TOP20","TOP50","TOP100","MANUAL"].includes(mode)) throw new Error("INVALID_PRIORITY_MODE");
  if (mode !== "MANUAL") return candidates.slice(0, Number(mode.slice(3)));
  const urls = [...new Set(manual.map(u => u.trim()).filter(Boolean))];
  if (!urls.length || urls.length > 100) throw new Error("INVALID_MANUAL_SCOPE");
  const rows = urls.map(url => candidates.find(r => r.url === url));
  if (rows.some(r => !r)) throw new Error("INVALID_MANUAL_SCOPE");
  return rows as Candidate[];
}
export function previewFingerprint(rows: Candidate[], hostId?: string, counterId?: string) {
  return createHash("sha256").update(JSON.stringify({ hostId, counterId, rows })).digest("hex");
}
export async function previewPriority(mode = "TOP20", manual: string[] = []) {
  const dataset = await landingDataset(), integration = await readIntegration("WEBMASTER"), c = config(integration?.configJson);
  if (!integration?.enabled || c.siteId !== dataset.site.id || !c.hostId) throw new Error("PRIORITY_NOT_CONFIGURED");
  const rows = choosePriority(dataset.candidates, mode, manual);
  if (!rows.length) throw new Error("NO_PRIORITY_URLS");
  return { rows, fingerprint: previewFingerprint(rows, c.hostId, dataset.counterId), mode: mode as ScopeMode };
}
export async function savePriority(mode: string, manual: string[], fingerprint: string) {
  const preview = await previewPriority(mode, manual);
  if (preview.fingerprint !== fingerprint) throw new Error("PRIORITY_PREVIEW_CHANGED");
  const dataset = await landingDataset();
  const row = (await readIntegration("WEBMASTER"))!;
  return db.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(7462201)`;
    if (await tx.jobRun.findFirst({ where: { integrationId: row.id, status: { in: ["PENDING","RUNNING","WAITING_EXPORT","WAITING_QUOTA","PAUSED"] } } })) throw new Error("ACTIVE_SYNC");
    const current = await tx.integration.findUniqueOrThrow({ where: { id: row.id } });
    if (JSON.stringify(current.configJson) !== JSON.stringify(row.configJson)) throw new Error("CONFIG_CHANGED");
    const c = config(current.configJson), previous = c.priorityScope;
    const urls = preview.rows.map(r => r.url), key = scopeKey(urls);
    const scope: PriorityScope = { mode: preview.mode, urls, key, selectedAt: new Date().toISOString(),
      ...(previous?.key === key && previous.syncedThrough ? { syncedThrough: previous.syncedThrough } : {}) };
    const uncertain = await tx.jobRun.findFirst({ where: { integrationId: row.id, siteId: c.siteId, status: { in: ["FAILED","PARTIAL"] }, checkpointJson: { path: ["phase"], equals: "SUBMITTING" } } });
    await tx.integration.update({ where: { id: row.id }, data: { configJson: json({ ...c, priorityScope: scope, discoveryUrls: dataset.discoveryUrls }),
      ...(uncertain ? { status: "WARNING", lastError: "EXPORT_SUBMISSION_UNCERTAIN: Priority Scope сохранён, но новый POST заблокирован до проверки предыдущей задачи." } : {}),
    } });
    return scope;
  });
}
