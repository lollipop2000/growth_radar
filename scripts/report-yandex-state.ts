import { db } from "../src/lib/db";
import { config, currentSite, readIntegration } from "../src/lib/yandex/settings";
import { metrikaTotals, searchTotals } from "../src/lib/yandex/views";
import { period, day } from "../src/lib/yandex/dates";
import { writeFileSync } from "node:fs";
try {
  const site = await currentSite(), m = await readIntegration("METRIKA"), w = await readIntegration("WEBMASTER");
  const mc = config(m?.configJson), wc = config(w?.configJson);
  const mWhere = { siteId: site.id, counterId: mc.counterId }, wWhere = { siteId: site.id, hostId: wc.hostId };
  const [mRows, mMatched, wRows, wMatched, goalRows, uncertain, page] = await Promise.all([
    db.metrikaPageDaily.count({ where: mWhere }), db.metrikaPageDaily.count({ where: { ...mWhere, pageId: { not: null } } }),
    db.webmasterQueryDaily.count({ where: wWhere }), db.webmasterQueryDaily.count({ where: { ...wWhere, pageId: { not: null } } }),
    db.metrikaPageDaily.findMany({ where: mWhere, select: { goalConversionsJson: true } }),
    db.jobRun.findMany({ where: { siteId: site.id, source: "WEBMASTER", status: { in: ["PARTIAL", "FAILED"] }, checkpointJson: { path: ["phase"], equals: "SUBMITTING" } }, select: { id: true, status: true, rowsSaved: true, errorsJson: true } }),
    db.page.findUniqueOrThrow({ where: { id: process.argv[2] ?? "cmuv6w2wt000120goxunx7su2" }, include: { latestScanPage: true } }),
  ]);
  if (page.siteId !== site.id) throw new Error("Page belongs to another site");
  const range = period(30), date = { gte: day(range.from), lte: day(range.to) };
  const rootM = await db.metrikaPageDaily.findMany({ where: { ...mWhere, pageId: page.id, date } });
  const rootW = await db.webmasterQueryDaily.findMany({ where: { ...wWhere, pageId: page.id, date } });
  const report = {
    checkedAt: new Date().toISOString(), production: true, site: site.baseUrl,
    metrika: { counterId: mc.counterId, name: mc.name, primaryGoals: mc.primaryGoals,
      rows: mRows, matched: mMatched, unmatched: mRows - mMatched,
      rowsWithAllSelectedGoals: goalRows.filter(r => (mc.primaryGoals ?? []).every(g => Object.hasOwn(r.goalConversionsJson as object, g))).length,
      syncedThrough: mc.syncedThrough, lastSuccess: m?.lastSuccessfulSyncAt, dailyEnabled: mc.dailyEnabled, nextRun: mc.nextRunAt },
    webmaster: { userId: wc.userId, hostId: wc.hostId, urlSource: wc.webmasterUrlSource,
      rows: wRows, matched: wMatched, unmatched: wRows - wMatched,
      syncedThrough: wc.syncedThrough ?? null, lastSuccess: w?.lastSuccessfulSyncAt,
      dailyEnabled: wc.dailyEnabled, nextRun: wc.nextRunAt, unresolvedSubmissions: uncertain,
      fullHostInitialAcceptance: "INCOMPLETE; 690 URLs, current 7-day job PARTIAL" },
    page360: { pageId: page.id, url: page.url, period: 30, scanner: {
      source: page.latestScanPage?.source, status: page.latestScanPage?.statusCode,
      outcome: page.latestScanPage?.outcome, title: page.latestScanPage?.title,
      scannedAt: page.latestScanPage?.scannedAt,
    }, search: searchTotals(rootW), metrika: metrikaTotals(rootM, mc.primaryGoals), sources: ["SCANNER", "WEBMASTER", "METRIKA"] },
    acceptance: "NOT PASS: full Webmaster host initial/repeat incomplete; confirmed root replay is bounded acceptance only",
  };
  writeFileSync("test-results/yandex-production-state.json", JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
} finally { await db.$disconnect(); }
