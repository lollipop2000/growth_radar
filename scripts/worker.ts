import { db } from "../src/lib/db";
import { crawl } from "../src/lib/scanner/engine";
import { scanOptions, type ScanOptions } from "../src/lib/scanner/options";
import { saveResultIsolated } from "../src/lib/scanner/save-result";
import {failureCode,infrastructureFailure} from '../src/lib/scanner/failures';
import { completeTargetedScan, recoverTargetedDiagnostics } from "../src/lib/yandex/targeted";
import { COVERAGE_MODE, runCoverageScan } from "../src/lib/scanner/coverage";
import { setTimeout as delay } from "node:timers/promises";
import {writeWorkerHealth} from './scanner-supervisor.mjs';
let stage='STARTING';
const healthTimer=setInterval(()=>{try{writeWorkerHealth(stage);}catch{}},5000);
writeWorkerHealth(stage);
let exiting = false;
let active: AbortController | undefined;
process.on("SIGINT", () => {
  exiting = true;
  active?.abort();
});
process.on("SIGTERM", () => {
  exiting = true;
  active?.abort();
});
async function recover() {
  await db.scan.updateMany({
    where: { mode: COVERAGE_MODE, status: "STOPPING", OR: [
      { heartbeatAt: { lt: new Date(Date.now() - 60000) } },
      { heartbeatAt: null, startedAt: { lt: new Date(Date.now() - 60000) } },
    ] },
    data: { status: "STOPPED", finishedAt: new Date(), lastError: "Worker остановлен. Coverage checkpoint сохранён." },
  });
  await db.scan.updateMany({
    where: { mode: COVERAGE_MODE, status: { in: ["RUNNING", "PAUSING"] }, OR: [
      { heartbeatAt: { lt: new Date(Date.now() - 60000) } },
      { heartbeatAt: null, startedAt: { lt: new Date(Date.now() - 60000) } },
    ] },
    data: { status: "PAUSED", lastError: "Worker недоступен. Coverage checkpoint сохранён; используйте Resume." },
  });
  await db.scan.updateMany({
    where: {
      mode: { not: COVERAGE_MODE },
      status: { in: ["RUNNING", "STOPPING", "IMPORTING"] },
      OR: [
        { heartbeatAt: { lt: new Date(Date.now() - 60000) } },
        { heartbeatAt: null, startedAt: { lt: new Date(Date.now() - 60000) } },
      ],
    },
    data: {
      status: "INTERRUPTED",
      finishedAt: new Date(),
      lastError:
        "Worker был остановлен. Запустите новый scan; полученные страницы сохранены.",
    },
  });
}
async function claim() {
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(7462101)`;
    if (
      await tx.scan.findFirst({
        where: { status: { in: ["RUNNING", "PAUSING", "STOPPING", "IMPORTING"] } },
      })
    )
      return null;
    const pending = await tx.scan.findFirst({
      where: { status: "PENDING" },
      orderBy: { startedAt: "asc" },
      include: { site: true },
    });
    if (!pending) return null;
    await tx.scan.update({
      where: { id: pending.id },
      data: {
        status: "RUNNING",
        ...(pending.mode === COVERAGE_MODE ? {} : { startedAt: new Date() }),
        heartbeatAt: new Date(),
      },
    });
    return pending;
  });
}
try {
  console.log(
    "Scanner worker готов. HTTP concurrency ≤2, Browser concurrency 1, Max Pages / Coverage batch ≤50.",
  );
  while (!exiting) {
    try {
      stage='RECOVERY';await recover();
      stage='REMATCH';try{await recoverTargetedDiagnostics();}catch{console.error('Scanner worker: previous rematch failed; queue processing continues, rematch will retry.');}
      stage='QUEUE';
      const scan = await claim();
      if (!scan) {
        await delay(1000);
        continue;
      }
      active = new AbortController();
      stage='SCANNING';
      let polling = false;
      const timer = setInterval(async () => {
        if (polling) return;
        polling = true;
        try {
          const state = await db.scan.findUnique({
            where: { id: scan.id },
            select: { status: true },
          });
          if (state?.status !== "RUNNING") active?.abort();
          else
            await db.scan.update({
              where: { id: scan.id },
              data: { heartbeatAt: new Date() },
            });
        } catch {
          active?.abort();
        } finally {
          polling = false;
        }
      }, 1000);
      try {
        if (scan.mode === COVERAGE_MODE) {
          await runCoverageScan(scan.id, active.signal);
          continue;
        }
        const options = scanOptions(scan.configJson as Partial<ScanOptions>);
        const summary = await crawl(
          scan.site.baseUrl,
          options,
          active.signal,
          (result) => saveResultIsolated(scan.id, scan.siteId, result),
          async (progress) => {
            await db.scan.update({
              where: { id: scan.id },
              data: {
                pagesDiscovered: progress.discovered,
                pagesScanned: progress.scanned,
                errorsCount: progress.errors,
                discoveryErrorsJson: progress.discoveryErrors,
              },
            });
          },
        );
        await db.scan.update({
          where: { id: scan.id },
          data: {
            status: active.signal.aborted
              ? "STOPPED"
              : summary.blocked
                ? summary.authRequired
                  ? "AUTH_REQUIRED"
                  : "BLOCKED_BY_WAF"
                : summary.browserUnavailable
                  ? "FAILED"
                  : summary.errors || summary.discoveryErrors.length
                    ? "COMPLETED_WITH_ERRORS"
                    : "COMPLETED",
            finishedAt: new Date(),
            lastError: summary.blocked
              ? "WAF/authentication остановили Browser Scan. Используйте Excel Crawl Import."
              : summary.browserUnavailable
                ? "HTTP и Browser не получили страницу. Используйте Excel Crawl Import или проверьте сеть."
                : summary.discovered === 0
                  ? "Нет разрешённых URL."
                  : null,
          },
        });
      } catch(error) {
        const code=failureCode(error);console.error('Scanner stopped: '+code);
        await db.scan.update({
          where: { id: scan.id },
          data: {
            status: active.signal.aborted ? "STOPPED" : "FAILED",
            finishedAt: new Date(),
            lastError:
              infrastructureFailure(error)?'Scan остановлен: ошибка БД/транзакции '+code+'. Полученные страницы сохранены.':'Scan остановлен: '+code+'. Полученные страницы сохранены; ошибка не является HTTP-статусом страницы.',
          },
        });
      } finally {
        clearInterval(timer);
        active = undefined;
        stage='REMATCH';await completeTargetedScan(scan.id);
      }
    } catch(error) {
      stage='ERROR';
      console.error(
        "Scanner worker: stage failed; retry in 5s. Code:",error&&typeof error==='object'&&'code' in error?String(error.code):'UNKNOWN',
      );
      await delay(5000);
    }
  }
} finally {
  clearInterval(healthTimer);writeWorkerHealth('STOPPED');
  await db.$disconnect();
}
