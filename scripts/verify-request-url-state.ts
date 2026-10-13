// Read-only production checkpoint verification; never contacts production.
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { db } from "../src/lib/db";
import { coverageConfig, ACTIVE_SCANS } from "../src/lib/scanner/coverage";
import { normalizeUrl } from "../src/lib/scanner/url";
try {
  if (process.argv.includes("--status")) {
    console.log(JSON.stringify(await db.scan.findMany({ where: { status: { in: ACTIVE_SCANS } }, select: { id: true, mode: true, status: true, pagesScanned: true, pagesDiscovered: true, heartbeatAt: true } }), null, 2));
    await db.$disconnect(); process.exit(0);
  }
  assert.equal(await db.scan.count({ where: { status: { in: ACTIVE_SCANS } } }), 0);
  const queues = [];
  for (const id of ["cmuwa0o6o000o208s90v4ou8e", "cmuwds2m8000p20zoipyl1b4a"]) {
    const scan = await db.scan.findUniqueOrThrow({ where: { id } }), c = coverageConfig(scan.configJson)!;
    assert.equal(scan.status, "STOPPED");
    for (const q of c.queue) if (q.requestUrl) assert.equal(normalizeUrl(q.requestUrl), q.url);
    queues.push({ id, status: scan.status, processed: c.queue.filter(q => q.result).length,
      pending: c.queue.filter(q => !q.result).length,
      pendingRequestUrls: c.queue.filter(q => !q.result && q.requestUrl).length,
      restoredSlash: c.queue.filter(q => !q.result && q.requestUrl && q.requestUrl !== q.url && new URL(q.requestUrl).pathname.endsWith("/")).length });
  }
  const report = { verifiedAt: new Date().toISOString(), status: "PASS", productionRequestsMade: 0, activeScans: 0, queues };
  writeFileSync("test-results/request-url-state.json", JSON.stringify(report, null, 2)); console.log(JSON.stringify(report, null, 2));
} finally { await db.$disconnect(); }
