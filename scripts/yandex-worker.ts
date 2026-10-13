import { db } from "../src/lib/db";
import {
  claimJob,
  processJob,
  recoverJobs,
  scheduleDue,
} from "../src/lib/yandex/jobs";
import { setTimeout as delay } from "node:timers/promises";
let exiting = false,
  lastSchedule = 0;
process.on("SIGINT", () => {
  exiting = true;
});
process.on("SIGTERM", () => {
  exiting = true;
});
console.log(
  "Yandex worker готов: daily sync, durable export checkpoints, без Logs API.",
);
try {
  while (!exiting) {
    try {
      await recoverJobs();
      if (Date.now() - lastSchedule > 60000) {
        await scheduleDue();
        lastSchedule = Date.now();
      }
      const jobId = await claimJob();
      if (!jobId) {
        await delay(1000);
        continue;
      }
      const timer = setInterval(() => {
        void db.jobRun
          .updateMany({
            where: { id: jobId, status: "RUNNING" },
            data: { heartbeatAt: new Date() },
          })
          .catch(() => {});
      }, 10000);
      try {
        await processJob(jobId);
      } finally {
        clearInterval(timer);
      }
    } catch {
      console.error("Yandex worker: проверьте PostgreSQL и миграции.");
      await delay(5000);
    }
  }
} finally {
  await db.$disconnect();
}
