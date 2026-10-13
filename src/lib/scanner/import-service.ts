import "server-only";
import { db } from "../db";
import { targetUrl } from "../health";
import { parseCrawlImport } from "./import";
import { saveScanPage } from "./store";
export async function importCrawl(file: File) {
  if (!file.size || file.size > 5_000_000)
    throw new Error("Нужен файл .xlsx/.csv размером до 5 MB.");
  const baseUrl = await targetUrl();
  if (!baseUrl) throw new Error("Сначала настройте магазин.");
  const parsed = await parseCrawlImport(
    Buffer.from(await file.arrayBuffer()),
    file.name,
    baseUrl,
  );
  const site = await db.site.upsert({
    where: { baseUrl },
    create: { name: "G-market", baseUrl },
    update: {},
  });
  const scan = await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(7462101)`;
    if (
      await tx.scan.findFirst({
        where: {
          status: { in: ["PENDING", "RUNNING", "PAUSING", "STOPPING", "IMPORTING"] },
        },
      })
    )
      throw new Error("Дождитесь завершения другого scan/import.");
    return tx.scan.create({
      data: {
        siteId: site.id,
        mode: "IMPORT",
        status: "IMPORTING",
        heartbeatAt: new Date(),
        pagesDiscovered: parsed.total,
        configJson: {
          filename: file.name.slice(0, 200),
          skipped: parsed.skipped,
        },
        discoveryErrorsJson: parsed.errors,
      },
    });
  });
  let imported = 0;
  try {
    for (const page of parsed.pages) {
      await saveScanPage(scan.id, site.id, page);
      imported++;
      await db.scan.update({
        where: { id: scan.id },
        data: { heartbeatAt: new Date(), pagesScanned: imported },
      });
    }
    const errorsCount =
      parsed.errors.length +
      parsed.pages.filter((page) => page.outcome !== "OK").length;
    await db.scan.update({
      where: { id: scan.id },
      data: {
        status: errorsCount ? "COMPLETED_WITH_ERRORS" : "COMPLETED",
        finishedAt: new Date(),
        errorsCount,
      },
    });
    return {
      scanId: scan.id,
      imported,
      skipped: parsed.skipped,
      errors: parsed.errors,
    };
  } catch {
    await db.scan.update({
      where: { id: scan.id },
      data: {
        status: "FAILED",
        finishedAt: new Date(),
        lastError: "Импорт прерван; уже сохранённые строки доступны в Pages.",
      },
    });
    throw new Error("Импорт прерван. Проверьте PostgreSQL.");
  }
}
