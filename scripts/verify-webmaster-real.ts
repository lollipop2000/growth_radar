// Reprocess a confirmed, completed production export twice through the real
// API/download/store pipeline. No export creation or additional quota spending.
import assert from "node:assert/strict";
import type { JobRun } from "@prisma/client";
import { writeFileSync } from "node:fs";
import { db } from "../src/lib/db";
import { processJob } from "../src/lib/yandex/jobs";
import { YandexApi } from "../src/lib/yandex/api";
import { yandexFetch } from "../src/lib/yandex/transport";
import { config, json } from "../src/lib/yandex/settings";
import { days, iso } from "../src/lib/yandex/dates";
const [originalId, taskId] = process.argv.slice(2);
if (!originalId || !taskId) throw new Error("Expected production job ID and its completed task ID");
const api = new YandexApi("https://api.webmaster.yandex.net", process.env.YANDEX_WEBMASTER_TOKEN!,
  (async (input, init) => {
    if ((init?.method ?? "GET") !== "GET") throw new Error("Acceptance cannot create export tasks");
    return yandexFetch(input, init);
  }) as typeof fetch);
try {
  assert.equal(await db.jobRun.count({ where: { status: "RUNNING" } }), 0, "Stop worker first");
  const original = await db.jobRun.findUniqueOrThrow({ where: { id: originalId }, include: { integration: true } });
  assert.equal(original.source, "WEBMASTER");
  const cp = original.checkpointJson as { paths?: string[]; completedExports?: { taskId: string; path: string; from: string; to: string; rows: number }[] };
  const completed = cp.completedExports?.find(task => task.taskId === taskId);
  assert.ok(completed && completed.rows > 0 && cp.paths?.includes(completed.path));
  assert.equal(completed.from, iso(original.dateFrom)); assert.equal(completed.to, iso(original.dateTo));
  const cfg = config(original.configJson), current = config(original.integration.configJson);
  assert.equal(cfg.hostId, current.hostId); assert.equal(cfg.userId, current.userId);
  const before = await db.webmasterQueryDaily.count({ where: { siteId: original.siteId } });
  const watermark = current.syncedThrough;
  const jobs: string[] = [];
  for (let repeat = 0; repeat < 2; repeat++) {
    const job: JobRun = await db.$transaction(async (tx): Promise<JobRun> => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(7462201)`;
      assert.equal(await tx.jobRun.count({ where: { status: "RUNNING" } }), 0);
      return tx.jobRun.create({ data: {
        siteId: original.siteId, integrationId: original.integrationId, source: "WEBMASTER", mode: "INITIAL",
        dateFrom: original.dateFrom, dateTo: original.dateTo, status: "RUNNING", startedAt: new Date(), heartbeatAt: new Date(),
        configJson: json({ ...cfg, requestedDays: 7, maxUrls: 1, noOp: false, acceptance: "REAL_COMPLETED_EXPORT_REPLAY", originalJobId: original.id }),
        checkpointJson: json({ phase: "EXPORT", paths: [completed.path], discoveredPathsCount: cp.paths!.length,
          dates: days(completed.from, completed.to), missingDates: [], pathIndex: 0, dateIndex: 0,
          taskId, taskDates: days(completed.from, completed.to), taskSubmittedAt: new Date().toISOString(), reusedConfirmedTask: true }),
      } });
    });
    jobs.push(job.id);
    const timer = setInterval(() => { void db.jobRun.update({ where: { id: job.id }, data: { heartbeatAt: new Date() } }).catch(() => {}); }, 10000);
    try { await processJob(job.id, { webmaster: api }); } finally { clearInterval(timer); }
    const finished = await db.jobRun.findUniqueOrThrow({ where: { id: job.id } });
    assert.equal(finished.status, "COMPLETED", JSON.stringify(finished.errorsJson));
    assert.equal(finished.rowsSaved, completed.rows);
    assert.equal(await db.webmasterQueryDaily.count({ where: { siteId: original.siteId } }), before);
    assert.equal(config((await db.integration.findUniqueOrThrow({ where: { id: original.integrationId } })).configJson).syncedThrough, watermark);
    console.log(JSON.stringify({ jobId: job.id, status: finished.status, rows: finished.rowsSaved }));
  }
  const report = { checkedAt: new Date().toISOString(), production: true, scope: { urls: 1, discovered: cp.paths!.length, days: 7 },
    originalId, taskId, jobs, before, after: before, initialConfirmedExport: "PASS", realDownloadAndStore: "PASS",
    repeatNoDuplicates: "PASS", watermarkUnchanged: true, newExportPosts: 0, wholeHostAcceptance: "INCOMPLETE" };
  writeFileSync("test-results/webmaster-production-repeat.json", JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
} finally { await db.$disconnect(); }
