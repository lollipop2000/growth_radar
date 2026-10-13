// Default 3-second policy tested against local HTTP + real Chromium only.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { writeFileSync } from "node:fs";
import { db } from "../src/lib/db";
import { ACTIVE_SCANS, createCoverageScan, coverageConfig, runCoverageScan, coverageControl } from "../src/lib/scanner/coverage";
import { day, yesterday } from "../src/lib/yandex/dates";
import { rowKey } from "../src/lib/yandex/store";
import { json } from "../src/lib/yandex/settings";
if (await db.scan.count({ where: { status: { in: ACTIVE_SCANS } } })) throw new Error("Stop active jobs before fixture acceptance.");
const hits: { path: string; adapter: string; time: number }[] = [];
const server = createServer((req, res) => {
  const http = Boolean(req.headers["user-agent"]?.includes("G-market-Growth-Radar"));
  hits.push({ path: req.url!, adapter: http ? "HTTP" : "BROWSER", time: Date.now() });
  if (req.url === "/robots.txt") return res.end("User-agent: *");
  assert.equal(req.method, "GET");
  res.setHeader("content-type", "text/html");
  if (http) { res.statusCode = 403; return res.end("Local HTTP blocked fixture"); }
  res.end("<h1>Readable local browser fixture content</h1><p>Local product page</p>");
});
server.listen(0, "127.0.0.1"); await once(server, "listening");
const base = `http://127.0.0.1:${(server.address() as { port: number }).port}/`;
try {
  const site = await db.site.create({ data: { baseUrl: base, name: "Local 3-second pacing acceptance" } });
  const integration = await db.integration.findUniqueOrThrow({ where: { type: "Yandex Metrika" } });
  const date = day(yesterday()), counterId = "pacing-fixture";
  const job = await db.jobRun.create({ data: { siteId: site.id, integrationId: integration.id, source: "METRIKA", mode: "FIXTURE_PACING", status: "COMPLETED", dateFrom: date, dateTo: date, configJson: { counterId } } });
  for (const path of ["item1", "item2"]) { const url = base + path;
    await db.metrikaPageDaily.create({ data: { siteId: site.id, counterId, date, url, normalizedUrl: url, rowKey: rowKey(url), visits: 5, visitors: 1, pageviews: 1, jobRunId: job.id } });
  }
  const scan = await createCoverageScan(30, "ALL", 1, true, site.id, counterId);
  const c = coverageConfig(scan.configJson)!;
  assert.equal(c.delayMs, 3000); assert.equal((scan.configJson as { concurrency: number }).concurrency, 1);
  // Old 500ms/concurrency2 checkpoint must receive the new default on execution.
  delete c.delayMs;
  await db.scan.update({ where: { id: scan.id }, data: { status: "RUNNING", configJson: json({ ...(scan.configJson as object), concurrency: 2, delayMs: 500, coverage: c }) } });
  await runCoverageScan(scan.id, new AbortController().signal);
  const final = await db.scan.findUniqueOrThrow({ where: { id: scan.id } }), saved = coverageConfig(final.configJson)!;
  assert.equal(final.status, "COMPLETED"); assert.equal(saved.delayMs, 3000);
  assert.equal(saved.after.coverage, 100); assert.equal(saved.wafStreak, 0);
  assert.equal(saved.batches.length, 2); assert.ok(saved.queue.every(q => q.result === "SUCCESS_BROWSER"));
  const intervals = hits.slice(1).map((hit, i) => hit.time - hits[i].time);
  assert.ok(intervals.length >= 5); assert.ok(intervals.every(ms => ms >= 2900));
  assert.equal(saved.queue[0].diagnostics?.http?.statusCode, 403); assert.equal(saved.queue[0].diagnostics?.browser?.statusCode, 200);
  const timestamps = saved.queue.map(q => q.processedAt);
  const resumed = await createCoverageScan(30, "ALL", 1, true, site.id, counterId);
  await coverageControl(resumed.id, "PAUSE");
  await coverageControl(resumed.id, "RESUME", 30000);
  const updated = await db.scan.findUniqueOrThrow({ where: { id: resumed.id } });
  assert.equal(coverageConfig(updated.configJson)!.delayMs, 30000);
  assert.equal((updated.configJson as { delayMs: number }).delayMs, 30000);
  await coverageControl(resumed.id, "STOP"); // Never execute the 30s queue.
  assert.deepEqual(coverageConfig((await db.scan.findUniqueOrThrow({ where: { id: scan.id } })).configJson)!.queue.map(q => q.processedAt), timestamps);
  const report = { checkedAt: new Date().toISOString(), status: "PASS", productionRequestsMade: 0, scanId: scan.id,
    defaultDelayMs: 3000, concurrency: 1, sharedHttpBrowserQueue: true, intervalsMs: intervals,
    pacedAcrossBatches: true, legacyCheckpointUpdated: true, customResumeDelayPersisted: true, existingResultsUnchanged: true };
  writeFileSync("test-results/pacing-acceptance.json", JSON.stringify(report, null, 2)); console.log(JSON.stringify(report, null, 2));
} finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); await db.$disconnect(); }
