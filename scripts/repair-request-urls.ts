// Local checkpoint metadata repair only: no scan/resume or remote request.
import { db } from "../src/lib/db";
import { coverageConfig, ACTIVE_SCANS } from "../src/lib/scanner/coverage";
import { selectRequestUrl } from "../src/lib/scanner/url";
import { scanOptions } from "../src/lib/scanner/options";
import { json } from "../src/lib/yandex/settings";
import { writeFileSync } from "node:fs";
const apply = process.argv.includes("--apply");
try {
  const report = await db.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(7462101)`;
    const active = await tx.scan.findMany({ where: { status: { in: ACTIVE_SCANS } }, select: { id: true, mode: true, status: true } });
    if (active.length) { console.log(JSON.stringify({ active, applySkipped: true })); throw new Error("ACTIVE_SCANS: stop or pause before repair"); }
    const scans = await tx.scan.findMany({ where: { mode: "METRIKA_COVERAGE" }, include: { site: true } });
    const repaired = [];
    for (const scan of scans) {
      const c = coverageConfig(scan.configJson);
      if (!c) continue;
      const options = scanOptions(scan.configJson as Parameters<typeof scanOptions>[0]);
      let pending = 0, restoredSlash = 0;
      for (const q of c.queue) {
        if (q.result || q.requestUrl) continue;
        const request = selectRequestUrl(q.url, q.rawUrls, scan.site.baseUrl, options.excludes);
        if (!request) continue;
        q.requestUrl = request; pending++;
        if (request !== q.url && new URL(request).pathname.endsWith("/")) restoredSlash++;
      }
      if (pending && apply) await tx.scan.update({ where: { id: scan.id }, data: { configJson: json({ ...(scan.configJson as object), coverage: c }) } });
      if (pending) repaired.push({ id: scan.id, status: scan.status, pending, restoredSlash });
    }
    return { capturedAt: new Date().toISOString(), applied: apply, productionRequestsMade: 0, processedResultsUnchanged: true, scanStatusesUnchanged: true, repaired };
  }, { timeout: 30000 });
  console.log(JSON.stringify(report, null, 2));
  if (apply) writeFileSync("test-results/request-url-repair.json", JSON.stringify(report, null, 2));
} finally { await db.$disconnect(); }
