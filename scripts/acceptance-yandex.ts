import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { writeFileSync, mkdirSync } from "node:fs";
import { db } from "../src/lib/db";
import { YandexApi } from "../src/lib/yandex/api";
import {
  config,
  json,
  saveHost,
  savePrimaryGoals,
  saveSchedule,
  testIntegration,
} from "../src/lib/yandex/settings";
import {
  claimJob,
  enqueueSync,
  processJob,
  recoverJobs,
  scheduleDue,
} from "../src/lib/yandex/jobs";
import { days, iso, period, yesterday } from "../src/lib/yandex/dates";
import { metrics } from "../src/lib/yandex/metrika";
import { previewPriority, savePriority } from "../src/lib/yandex/priority";
import { scanTopUnmatched, completeTargetedScan, type TargetDiagnostic } from "../src/lib/yandex/targeted";
import { discoverUrlPage, hostPath } from "../src/lib/yandex/webmaster";
import { crawl } from "../src/lib/scanner/engine";
import { scanOptions } from "../src/lib/scanner/options";
import { saveScanPage } from "../src/lib/scanner/store";
const original = await db.integration.findMany({
  where: {
    type: { in: ["Target Site", "Yandex Metrika", "Yandex Webmaster"] },
  },
});
const envNames = [
    "YANDEX_METRIKA_COUNTER_ID",
    "YANDEX_METRIKA_TOKEN",
    "YANDEX_WEBMASTER_TOKEN",
  ] as const,
  env = Object.fromEntries(envNames.map((k) => [k, process.env[k]]));
if (
  await db.jobRun.count({
    where: {
      status: { in: ["PENDING", "RUNNING", "WAITING_EXPORT", "WAITING_QUOTA"] },
    },
  })
)
  throw new Error("Stop active Yandex jobs before acceptance.");
const server = createServer((req, res) => {
  if (req.url === "/old") {
    res.writeHead(301, { location: "/catalog/" });
    res.end();
    return;
  }
  res.writeHead(200, { "content-type": "text/html" });
  res.end(
    "<html><head><title>Local Sprint 2 fixture</title><meta name='description' content='Test shop'></head><body><h1>Local catalog</h1><p>This page contains fixture HTML only.</p></body></html>",
  );
});
server.listen(0, "127.0.0.1");
await once(server, "listening");
const address = server.address();
if (!address || typeof address === "string") throw new Error("server");
const base = `http://127.0.0.1:${address.port}/`,
  hostId = `http:127.0.0.1:${address.port}`,
  counterId = "90000001",
  createdIds: string[] = [];
const response = (v: unknown) => new Response(JSON.stringify(v));
const tasks = new Map<
  string,
  { dates: string[]; paths: string[]; polls: number }
>();
let submitCount = 0,
  badDate: string | undefined;
const mApi = new YandexApi(
  "https://api-metrika.yandex.net",
  "fixture-secret",
  (async (input) => {
    const u = new URL(String(input));
    if (u.pathname.endsWith("/goals"))
      return response({
        goals: [
          { id: 7, name: "Fixture purchase", type: "action" },
          { id: 8, name: "Fixture contact", type: "url" },
        ],
      });
    if (u.pathname.startsWith("/management"))
      return response({
        counter: {
          id: Number(counterId),
          name: "Local Metrika acceptance",
          site: base,
          time_zone_name: "Europe/Moscow",
        },
      });
    const date = u.searchParams.get("date1")!,
      metricList = u.searchParams.get("metrics")!.split(","),
      goals = metricList.slice(5).map((v) => v.match(/goal(\d+)reaches/)![1]);
    const all = [
      base + "catalog/?utm_source=fixture",
      base + "old",
      base + "catalog?size=2",
      "https://different.example/item",
    ].map((url) => ({
      dimensions: [{ name: date }, { name: url }],
      metrics: [10, 8, 20, 20, 40, ...goals.map(() => 2)],
    }));
    const offset = Number(u.searchParams.get("offset") ?? 1),
      limit = Number(u.searchParams.get("limit") ?? 1000);
    return response({
      query: {
        metrics: metrics(goals),
        dimensions: ["ym:s:date", "ym:s:startURL"],
      },
      data:
        date === badDate
          ? [{ dimensions: [], metrics: [] }]
          : all.slice(offset - 1, offset - 1 + limit),
      total_rows: 4,
      sampled: false,
    });
  }) as typeof fetch,
);
const wApi = new YandexApi(
  "https://api.webmaster.yandex.net",
  "fixture-secret",
  (async (input, init) => {
    const u = new URL(String(input));
    if (u.pathname === "/v4/user") return response({ user_id: 123 });
    if (u.pathname.endsWith("/hosts"))
      return response({
        hosts: [{ host_id: hostId, unicode_host_url: base, verified: true }],
      });
    if (u.pathname.endsWith("/pro/serp/dates"))
      return response({ dates: days(period(90).from, yesterday()) });
    if (u.pathname.endsWith("/query-analytics/list"))
      return response({
        count: 2,
        text_indicator_to_statistics: [
          { text_indicator: { type: "URL", value: base + "catalog/" } },
          { text_indicator: { type: "URL", value: base + "discovered" } },
        ],
      });
    if (u.pathname.endsWith("/download/")) {
      const b = JSON.parse(String(init?.body));
      assert.equal(b.use_pro_tariff, "false");
      const taskId = `fixture-task-${++submitCount}`;
      tasks.set(taskId, { dates: b.dates, paths: b.paths, polls: 0 });
      return response({
        task_id: taskId,
        free_quota_remaining: 100 - b.dates.length,
        total_quota_used: b.dates.length,
      });
    }
    const taskId = u.pathname.split("/").at(-1)!;
    const task = tasks.get(taskId)!;
    return response(
      ++task.polls === 1
        ? { download_status: "IN_PROGRESS" }
        : {
            download_status: "SUCCESS",
            url: `https://storage.mds.yandex.net/get-webmaster-download/${taskId}`,
          },
    );
  }) as typeof fetch,
);
const download = async (url: string) => {
  const task = tasks.get(new URL(url).pathname.split("/").at(-1)!)!;
  return (
    "date;url;query;region;clicks;impressions;position\n" +
    task.dates
      .map((d) => `${d};${task.paths[0]};fixture query;;5;100;4`)
      .join("\n")
  );
};
async function runUntilDone(id: string, max = 120) {
  for (let i = 0; i < max; i++) {
    const job = await db.jobRun.findUniqueOrThrow({ where: { id } });
    if (["COMPLETED", "PARTIAL", "FAILED"].includes(job.status)) return job;
    await db.jobRun.update({
      where: { id },
      data: {
        status: "RUNNING",
        startedAt: job.startedAt ?? new Date(),
        heartbeatAt: new Date(),
      },
    });
    await processJob(id, { metrika: mApi, webmaster: wApi, download });
  }
  throw new Error("Job loop exceeded fixture budget");
}
try {
  process.env.YANDEX_METRIKA_COUNTER_ID = counterId;
  process.env.YANDEX_METRIKA_TOKEN = "fixture-secret";
  process.env.YANDEX_WEBMASTER_TOKEN = "fixture-secret";
  const site = await db.site.create({
    data: { name: "Local Sprint 2 Acceptance Fixture", baseUrl: base },
  });
  await db.integration.upsert({
    where: { type: "Target Site" },
    create: { type: "Target Site", configJson: { baseUrl: base } },
    update: { configJson: { baseUrl: base } },
  });
  const scan = await db.scan.create({
    data: { siteId: site.id, status: "RUNNING" },
  });
  await crawl(
    base,
    scanOptions({
      maxPages: 1,
      single: true,
      seeds: [base + "old"],
      browserFallback: false,
    }),
    new AbortController().signal,
    (r) => saveScanPage(scan.id, site.id, r),
    async () => {},
  );
  await db.scan.update({
    where: { id: scan.id },
    data: { status: "COMPLETED", finishedAt: new Date() },
  });
  const page = await db.page.findFirstOrThrow({ where: { siteId: site.id } });
  assert.equal(page.normalizedUrl, base + "catalog");
  await testIntegration("METRIKA", mApi);
  await savePrimaryGoals(["7", "8"]);
  await saveSchedule("METRIKA", false);
  await testIntegration("WEBMASTER", wApi);
  await saveHost(hostId);
  await saveSchedule("WEBMASTER", false);
  const m1 = await enqueueSync("METRIKA", "INITIAL", 90);
  createdIds.push(m1.id);
  assert.equal((await runUntilDone(m1.id)).status, "COMPLETED");
  assert.equal(
    await db.metrikaPageDaily.count({ where: { siteId: site.id } }),
    360,
  );
  const m2 = await enqueueSync("METRIKA", "INITIAL", 90);
  createdIds.push(m2.id);
  await runUntilDone(m2.id);
  assert.equal(
    await db.metrikaPageDaily.count({ where: { siteId: site.id } }),
    360,
  );
  const inc = await enqueueSync("METRIKA", "INCREMENTAL", 90);
  createdIds.push(inc.id);
  assert.equal((await runUntilDone(inc.id)).rowsSaved, 0);
  const discovery = await discoverUrlPage(wApi, hostPath("123",hostId), 0);
  const wmIntegration = await db.integration.findUniqueOrThrow({ where: { type: "Yandex Webmaster" } });
  await db.integration.update({ where: { id: wmIntegration.id }, data: { configJson: json({ ...config(wmIntegration.configJson), webmasterUrlSource: "WEBMASTER", discoveryUrls: discovery.urls }) } });
  const priority = await previewPriority();
  await assert.rejects(savePriority("TOP20", priority.rows.map(r=>r.url), "stale-fingerprint"), /PRIORITY_PREVIEW_CHANGED/);
  await savePriority("TOP20", priority.rows.map(r => r.url), priority.fingerprint);
  const w1 = await enqueueSync("WEBMASTER", "INITIAL", 7);
  assert.deepEqual((w1.configJson as { priorityUrls: string[] }).priorityUrls, priority.rows.map(r=>r.url));
  createdIds.push(w1.id);
  const first = await claimJob();
  assert.equal(first, w1.id);
  assert.equal(await claimJob(), null);
  await processJob(w1.id, { webmaster: wApi, download });
  const waiting = await db.jobRun.findUniqueOrThrow({ where: { id: w1.id } });
  assert.equal(waiting.status, "WAITING_EXPORT");
  const before = submitCount;
  await db.jobRun.update({ where: { id: w1.id }, data: { status: "RUNNING" } });
  await processJob(w1.id, { webmaster: wApi, download });
  assert.equal(submitCount, before);
  assert.equal((await runUntilDone(w1.id)).status, "COMPLETED");
  const wmCount = await db.webmasterQueryDaily.count({
    where: { siteId: site.id },
  });
  assert.ok(wmCount > 0);
  const w2 = await enqueueSync("WEBMASTER", "INITIAL", 7);
  createdIds.push(w2.id);
  await runUntilDone(w2.id);
  assert.equal(
    await db.webmasterQueryDaily.count({ where: { siteId: site.id } }),
    wmCount,
  );
  const submitsBeforeIncremental = submitCount;
  const wIncremental = await enqueueSync("WEBMASTER", "INCREMENTAL", 7);
  createdIds.push(wIncremental.id);
  assert.equal((await runUntilDone(wIncremental.id)).rowsSaved,0);
  assert.equal(submitCount,submitsBeforeIncremental);
  const manualPreview = await previewPriority("MANUAL", [priority.rows[0].url]);
  const manualScope = await savePriority("MANUAL", manualPreview.rows.map(r=>r.url),manualPreview.fingerprint);
  assert.equal(manualScope.syncedThrough,undefined,"Changing the URL set resets its scope watermark");
  const restoredPreview = await previewPriority();
  await savePriority("TOP20",restoredPreview.rows.map(r=>r.url),restoredPreview.fingerprint);
  const watermark = config((await db.integration.findUniqueOrThrow({ where: { type: "Yandex Webmaster" } })).configJson).syncedThrough;
  const limited = await enqueueSync("WEBMASTER", "INITIAL", 7, 1);
  createdIds.push(limited.id);
  const limitedResult = await runUntilDone(limited.id);
  assert.equal(limitedResult.status, "COMPLETED");
  assert.ok(JSON.stringify(limitedResult.errorsJson).includes("LIMITED_SCOPE"));
  assert.equal(config((await db.integration.findUniqueOrThrow({ where: { type: "Yandex Webmaster" } })).configJson).syncedThrough, watermark);
  const uncertain = await enqueueSync("WEBMASTER", "INITIAL", 7);
  createdIds.push(uncertain.id);
  await db.jobRun.update({ where: { id: uncertain.id }, data: { status: "FAILED", checkpointJson: { phase: "SUBMITTING" } } });
  await assert.rejects(enqueueSync("WEBMASTER", "INITIAL", 7), /EXPORT_SUBMISSION_UNCERTAIN/);
  await db.jobRun.update({ where: { id: uncertain.id }, data: { status: "CANCELLED" } });
  // Worker restart recovers durable progress rather than creating another job.
  const recovery = await enqueueSync("METRIKA", "INCREMENTAL");
  createdIds.push(recovery.id);
  await db.jobRun.update({
    where: { id: recovery.id },
    data: { status: "RUNNING", heartbeatAt: new Date(Date.now() - 120000) },
  });
  await recoverJobs();
  assert.equal(
    (await db.jobRun.findUniqueOrThrow({ where: { id: recovery.id } })).status,
    "PENDING",
  );
  await runUntilDone(recovery.id);
  // A later day's malformed response keeps completed days and does not advance watermark.
  badDate = days(period(90).from, yesterday())[1];
  const partial = await enqueueSync("METRIKA", "INITIAL");
  createdIds.push(partial.id);
  assert.equal((await runUntilDone(partial.id)).status, "PARTIAL");
  badDate = undefined;
  // Concurrent daily scheduler calls create at most one active job per source.
  const integration = await db.integration.findUniqueOrThrow({
      where: { type: "Yandex Metrika" },
    }),
    c = config(integration.configJson);
  await db.integration.update({
    where: { id: integration.id },
    data: {
      configJson: json({
        ...c,
        dailyEnabled: true,
        nextRunAt: new Date(Date.now() - 1000).toISOString(),
      }),
    },
  });
  await Promise.all([scheduleDue(), scheduleDue()]);
  const scheduled = await db.jobRun.findMany({
    where: { siteId: site.id, source: "METRIKA", status: "PENDING" },
  });
  assert.equal(scheduled.length, 1);
  createdIds.push(scheduled[0].id);
  await runUntilDone(scheduled[0].id);
  const target = await scanTopUnmatched(10);
  const summary = await crawl(base, scanOptions(target.configJson as Parameters<typeof scanOptions>[0]), new AbortController().signal,
    r => saveScanPage(target.id, site.id, r), async () => {});
  await db.scan.update({ where: { id: target.id }, data: { status: "COMPLETED", finishedAt: new Date(), pagesScanned: summary.scanned, pagesDiscovered: summary.discovered } });
  await completeTargetedScan(target.id);
  const diagnostic = (await db.scan.findUniqueOrThrow({ where: { id: target.id } })).configJson as unknown as { targeted: TargetDiagnostic };
  assert.equal(diagnostic.targeted.state, "DONE");
  assert.equal(diagnostic.targeted.after?.totalVisits, diagnostic.targeted.before.totalVisits);
  assert.ok(diagnostic.targeted.after!.coverage! > diagnostic.targeted.before.coverage!);
  const [mMatched, wMatched] = await Promise.all([
    db.metrikaPageDaily.count({
      where: { siteId: site.id, pageId: { not: null } },
    }),
    db.webmasterQueryDaily.count({
      where: { siteId: site.id, pageId: { not: null } },
    }),
  ]);
  assert.ok(mMatched > 0 && wMatched > 0);
  assert.ok(mMatched < 360 && wMatched < wmCount);
  const snapshot = await db.page.findUniqueOrThrow({
    where: { id: page.id },
    include: { latestScanPage: true },
  });
  assert.equal(snapshot.latestScanPage?.title, "Local Sprint 2 fixture");
  const report = {
    checkedAt: new Date().toISOString(),
    production: false,
    site: base,
    pageId: page.id,
    counterId,
    goals: 2,
    selectedGoals: ["7", "8"],
    webmasterUserId: "123",
    hostId,
    metrikaRows: 360,
    webmasterRows: wmCount,
    matching: {
      metrika: { matched: mMatched, unmatched: 360 - mMatched },
      webmaster: { matched: wMatched, unmatched: wmCount - wMatched },
    },
    connection: "PASS (fixtures)",
    repeatSync: "PASS",
    incremental: "PASS",
    exportResume: "PASS",
    partialFailure: "PASS",
    workerRecovery: "PASS",
    scheduledDedup: "PASS",
    limitedScopeWatermark: "PASS",
    uncertainExportGuard: "PASS",
    priorityIncremental: "PASS",
    scopeWatermarkReset: "PASS",
    targetedScanBeforeAfter: diagnostic.targeted,
    page360Sources: ["SCANNER", "WEBMASTER", "METRIKA"],
  };
  mkdirSync("test-results", { recursive: true });
  writeFileSync(
    "test-results/yandex-acceptance.json",
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report));
} finally {
  await db.scan.updateMany({
    where: { site: { baseUrl: base }, status: "RUNNING" },
    data: { status: "INTERRUPTED", finishedAt: new Date() },
  });
  for (const id of createdIds)
    await db.jobRun.updateMany({
      where: {
        id,
        status: {
          in: ["PENDING", "RUNNING", "WAITING_EXPORT", "WAITING_QUOTA"],
        },
      },
      data: { status: "CANCELLED", finishedAt: new Date() },
    });
  for (const type of ["Target Site", "Yandex Metrika", "Yandex Webmaster"]) {
    const saved = original.find((r) => r.type === type);
    if (saved) {
      const { id, type: _, ...data } = saved;
      await db.integration.update({
        where: { type },
        data: { ...data, configJson: json(saved.configJson) },
      });
    } else
      await db.integration.updateMany({
        where: { type },
        data: {
          enabled: false,
          status: "NOT_CONFIGURED",
          configJson: {},
          lastError: null,
          lastCheckedAt: null,
          lastSuccessfulSyncAt: null,
        },
      });
  }
  for (const key of envNames) {
    if (env[key] === undefined) delete process.env[key];
    else process.env[key] = env[key];
  }
  server.close();
  await db.$disconnect();
}
