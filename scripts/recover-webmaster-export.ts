// Recovery of an already-created Yandex export downloaded through a normal browser.
// No new API task is submitted. Stop the Yandex worker before running this script.
import { readFileSync } from "node:fs";
import { db } from "../src/lib/db";
import { decodeExport } from "../src/lib/yandex/webmaster";
import { storeExportChunk } from "../src/lib/yandex/jobs";
import { config } from "../src/lib/yandex/settings";
import { safeError } from "../src/lib/yandex/api";
const [jobId, taskId, file] = process.argv.slice(2);
let claimed = false;
try {
  if (!jobId || !taskId || !file) throw new Error("Arguments: jobId taskId downloadedFile");
  const bytes = readFileSync(file);
  if (bytes.length > 50 * 1024 * 1024) throw new Error("size");
  const csv = decodeExport(bytes);
  await db.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(7462201)`;
    const j = await tx.jobRun.findUniqueOrThrow({ where: { id: jobId }, include: { integration: true } });
    const cp = j.checkpointJson as { taskId?: string; phase?: string };
    const saved = config(j.configJson), current = config(j.integration.configJson);
    if (j.source !== "WEBMASTER" || !["FAILED", "PARTIAL", "WAITING_EXPORT"].includes(j.status) ||
      cp.taskId !== taskId || cp.phase !== "EXPORT" || current.siteId !== j.siteId ||
      saved.hostId !== current.hostId || saved.userId !== current.userId) throw new Error("Invalid export binding");
    if (await tx.jobRun.findFirst({ where: { status: "RUNNING" } })) throw new Error("Worker is running");
    await tx.jobRun.update({ where: { id: jobId }, data: { status: "RUNNING", heartbeatAt: new Date(), finishedAt: null } });
  });
  claimed = true;
  await storeExportChunk(jobId, csv, taskId, true);
  const j = await db.jobRun.update({ where: { id: jobId }, data: {
    status: "PAUSED", errorsJson: ["Сохранённый export загружен через браузер. Выберите объём оставшихся URL перед продолжением."],
  } });
  await db.integration.update({ where: { id: j.integrationId }, data: {
    status: "WARNING", lastError: "Данные готового export сохранены; полный sync ещё не завершён.",
  } });
  console.log(JSON.stringify({ jobId, taskId, status: j.status, rowsSaved: j.rowsSaved, source: "REAL_YANDEX_EXPORT", downloadTransport: "BROWSER" }));
} catch (error) {
  if (claimed) await db.jobRun.update({ where: { id: jobId }, data: {
    status: "FAILED", finishedAt: new Date(), errorsJson: [safeError(error)],
  } });
  console.error(safeError(error)); process.exitCode = 1;
} finally { await db.$disconnect(); }
