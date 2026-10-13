import "server-only";
import { Prisma } from "@prisma/client";
import { db } from "../db";
import { targetUrl } from "../health";
import { scanOptions, type ScanOptions } from "./options";
import { crawlUrl } from "./url";
import {scannerQueueHealth} from './queue-health';
export async function createScan(raw: Partial<ScanOptions>, audit?: Record<string, unknown>) {
  await scannerQueueHealth();
  const options = scanOptions(raw),
    baseUrl = await targetUrl();
  if (!baseUrl) throw new Error("Сначала настройте URL магазина.");
  if (options.seeds.some((seed) => !crawlUrl(seed, baseUrl, options.excludes)))
    throw new Error("Seeds содержат внешние или служебные URL.");
  const site = await db.site.upsert({
    where: { baseUrl },
    create: { name: "G-market", baseUrl },
    update: {},
  });
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(7462101)`;
    if (
      await tx.scan.findFirst({
        where: {
          status: { in: ["PENDING", "RUNNING", "PAUSING", "STOPPING", "IMPORTING"] },
        },
      })
    )
      throw new Error("Другое сканирование/импорт уже выполняется.");
    return tx.scan.create({
      data: {
        siteId: site.id,
        mode: options.mode,
        configJson: { ...audit, ...options } as unknown as Prisma.InputJsonValue,
      },
    });
  });
}
export async function stopScan(id: string) {
  const scan = await db.scan.findUnique({ where: { id }, select: { mode: true } });
  if (scan?.mode === "METRIKA_COVERAGE") {
    const { coverageControl } = await import("./coverage");
    return coverageControl(id, "STOP");
  }
  await db.scan.updateMany({
    where: { id, status: "PENDING" },
    data: { status: "STOPPED", finishedAt: new Date() },
  });
  await db.scan.updateMany({
    where: { id, status: "RUNNING" },
    data: { status: "STOPPING" },
  });
}
