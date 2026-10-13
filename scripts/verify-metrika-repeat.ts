import { db } from "../src/lib/db";
import { processJob, resumeMetrika } from "../src/lib/yandex/jobs";
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
const id = process.argv[2];
if (!id) throw new Error("Expected existing real repeat job ID");
try {
  const original = await db.jobRun.findUniqueOrThrow({ where: { id } });
  assert.equal(original.source, "METRIKA");
  const before = await db.metrikaPageDaily.count({ where: { siteId: original.siteId } });
  let retries = 0;
  for (;;) {
    const job = await db.jobRun.findUniqueOrThrow({ where: { id } });
    if (job.status === "COMPLETED") break;
    if (["PARTIAL", "FAILED"].includes(job.status)) {
      if (retries++ >= 3) throw new Error("Real repeat remains partial; checkpoint retained");
      await resumeMetrika(id);
    }
    assert.equal(await db.jobRun.count({ where: { id: { not: id }, status: "RUNNING" } }), 0);
    await db.jobRun.update({ where: { id }, data: { status: "RUNNING", heartbeatAt: new Date(), startedAt: job.startedAt ?? new Date() } });
    const timer = setInterval(() => { void db.jobRun.update({ where: { id }, data: { heartbeatAt: new Date() } }).catch(() => {}); }, 10000);
    try { await processJob(id); } finally { clearInterval(timer); }
    const current = await db.jobRun.findUniqueOrThrow({ where: { id } });
    if ((current.checkpointJson as { dayIndex?: number }).dayIndex !== (job.checkpointJson as { dayIndex?: number }).dayIndex) retries = 0;
    console.log(JSON.stringify({ status: current.status, progress: current.checkpointJson, rows: current.rowsSaved }));
  }
  const after = await db.metrikaPageDaily.count({ where: { siteId: original.siteId } });
  assert.equal(after, before);
  const report = { checkedAt: new Date().toISOString(), production: true, jobId: id, before, after, repeatNoDuplicates: "PASS" };
  writeFileSync("test-results/metrika-production-repeat.json", JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
} finally { await db.$disconnect(); }
