// All navigation targets are a local slash-sensitive fixture.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { writeFileSync } from "node:fs";
import { db } from "../src/lib/db";
import { coverageConfig, createCoverageScan, coveragePreview, runCoverageScan, ACTIVE_SCANS } from "../src/lib/scanner/coverage";
import { normalizeUrl } from "../src/lib/scanner/url";
import { day, yesterday } from "../src/lib/yandex/dates";
import { rowKey } from "../src/lib/yandex/store";
import { json } from "../src/lib/yandex/settings";
import type { Transport } from "../src/lib/scanner/diagnostics";
if (await db.scan.count({ where: { status: { in: ACTIVE_SCANS } } })) throw new Error("Stop scanner jobs first.");
const hits: string[] = []; let blockHttp = false;
const server = createServer((req, res) => {
  hits.push(req.url!);
  if (req.url === "/robots.txt") return res.end("User-agent: *");
  res.setHeader("content-type", "text/html");
  if (req.url !== "/catalog/item/") { res.statusCode = 404; return res.end("Missing trailing slash"); }
  if (blockHttp && req.headers["user-agent"]?.includes("G-market-Growth-Radar")) { res.statusCode = 403; return res.end("Local HTTP blocked fixture"); }
  res.end("<title>Local product</title><h1>Readable product fixture</h1><p>Local read only content</p>");
});
server.listen(0, "127.0.0.1"); await once(server, "listening");
const base = `http://127.0.0.1:${(server.address() as { port: number }).port}/`, url = base + "catalog/item/", identity = normalizeUrl(url);
try {
  const site = await db.site.create({ data: { baseUrl: base, name: "Local request URL repair acceptance" } });
  const integration = await db.integration.findUniqueOrThrow({ where: { type: "Yandex Metrika" } });
  const date = day(yesterday()), counterId = "request-url-fixture";
  const job = await db.jobRun.create({ data: { siteId: site.id, integrationId: integration.id, source: "METRIKA", mode: "FIXTURE_REQUEST_URL", status: "COMPLETED", dateFrom: date, dateTo: date, configJson: { counterId } } });
  for (const raw of [identity, url + "?utm_source=test"]) await db.metrikaPageDaily.create({ data: {
    siteId: site.id, counterId, date, url: raw, normalizedUrl: identity, rowKey: rowKey(raw), visits: 5, visitors: 1, pageviews: 1, jobRunId: job.id,
  } });
  const preview = await coveragePreview(30, "ALL", 50, true, site.id, counterId);
  assert.equal(preview.queue.length, 1); assert.equal(preview.queue[0].requestUrl, url); assert.equal(preview.queue[0].url, identity);
  // An existing error-only Page may still advertise the old stripped address.
  const oldPage = await db.page.create({ data: { siteId: site.id, normalizedUrl: identity, url: identity, path: new URL(identity).pathname } });
  const cases: object[] = [];
  for (const mode of ["HTTP_ONLY", "BROWSER_ONLY", "HTTP_BROWSER"] as Transport[]) {
    blockHttp = mode === "HTTP_BROWSER"; hits.length = 0;
    const scan = await createCoverageScan(30, "ALL", 50, true, site.id, counterId, { transport: mode, diagnosticLimit: 1, delayMs: 1000 });
    // Backward-compatible recovery of an old checkpoint lacking requestUrl.
    const c = coverageConfig(scan.configJson)!; delete c.queue[0].requestUrl;
    await db.scan.update({ where: { id: scan.id }, data: { status: "RUNNING", configJson: json({ ...(scan.configJson as object), coverage: c }) } });
    await runCoverageScan(scan.id, new AbortController().signal);
    const final = await db.scan.findUniqueOrThrow({ where: { id: scan.id } }), saved = coverageConfig(final.configJson)!;
    assert.equal(final.status, "COMPLETED"); assert.equal(saved.queue[0].requestUrl, url);
    assert.equal(saved.queue[0].result, mode === "HTTP_ONLY" ? "SUCCESS_HTTP" : "SUCCESS_BROWSER");
    assert.equal(saved.after.coverage, 100); assert.ok(!hits.includes("/catalog/item"));
    const snapshot = await db.scanPage.findFirstOrThrow({ where: { scanId: scan.id } });
    assert.equal(snapshot.requestedUrl, url); assert.equal(snapshot.finalUrl, url); assert.equal(snapshot.statusCode, 200);
    cases.push({ mode, scanId: scan.id, status: final.status, requestUrlRestored: true, trafficCoverage: saved.after.coverage });
  }
  blockHttp = false;
  const manual = await createCoverageScan(30, "ALL", 50, true, site.id, counterId, { transport: "HTTP_ONLY", diagnosticLimit: 1, testUrl: url, delayMs: 1000 });
  assert.equal(coverageConfig(manual.configJson)!.queue[0].requestUrl, url);
  await db.scan.update({ where: { id: manual.id }, data: { status: "RUNNING" } });
  await runCoverageScan(manual.id, new AbortController().signal);
  assert.equal((await db.scan.findUniqueOrThrow({ where: { id: manual.id } })).status, "COMPLETED");
  assert.equal(await db.page.count({ where: { siteId: site.id } }), 1);
  assert.equal((await db.page.findUniqueOrThrow({ where: { id: oldPage.id } })).url, url);
  const report = { checkedAt: new Date().toISOString(), status: "PASS", productionRequestsMade: 0, normalizedIdentityUnchanged: true, duplicatePages: false, existingPageAddressUpdatedOnSuccess: true, legacyCheckpointRecovered: true, manualTestPreservesSlash: true, cases };
  writeFileSync("test-results/request-url-acceptance.json", JSON.stringify(report, null, 2)); console.log(JSON.stringify(report, null, 2));
} finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); await db.$disconnect(); }
