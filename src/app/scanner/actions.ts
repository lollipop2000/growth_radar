"use server";
import { revalidatePath } from "next/cache";
import { createScan, stopScan } from "@/lib/scanner/service";
import { importCrawl } from "@/lib/scanner/import-service";
import { db } from "@/lib/db";
import { pageTypes } from "@/lib/scanner/url";
export type ScannerState = { message: string; errors?: string[] };
export async function startScanAction(
  _state: ScannerState,
  form: FormData,
): Promise<ScannerState> {
  try {
    const scan = await createScan({
      mode: form.get("mode") === "BROWSER" ? "BROWSER" : "HTTP",
      maxPages: Number(form.get("maxPages")),
      concurrency: Number(form.get("concurrency") || 1),
      delayMs: Number(
        form.get("delayMs") || 3000,
      ),
      seeds: String(form.get("seeds") ?? "")
        .split(/\r?\n/)
        .map((v) => v.trim())
        .filter(Boolean),
      excludes: String(form.get("excludes") ?? "")
        .split(/\r?\n/)
        .map((v) => v.trim())
        .filter(Boolean),
      single: form.get("action") === "single",
      browserFallback: form.get("browserFallback") === "on",
    });
    revalidatePath("/scanner");
    return {
      message: `Scan ${scan.id} поставлен в очередь. Worker должен быть запущен.`,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    return {
      message: /Max Pages|concurrency|delay|Seeds|Сначала|Другое/.test(message)
        ? message
        : "Не удалось создать scan. Проверьте БД и миграции.",
    };
  }
}
export async function stopScanAction(form: FormData) {
  await stopScan(String(form.get("scanId")));
  revalidatePath("/scanner");
}
export async function importCrawlAction(
  _state: ScannerState,
  form: FormData,
): Promise<ScannerState> {
  try {
    const file = form.get("file");
    if (!(file instanceof File)) return { message: "Выберите .xlsx/.csv." };
    const result = await importCrawl(file);
    revalidatePath("/scanner");
    revalidatePath("/pages");
    return {
      message: `Импортировано: ${result.imported}. Пропущено: ${result.skipped}.`,
      errors: result.errors,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    return {
      message:
        /файл|Файл|колон|Max|50|Нужен|Нужны|Поддерж|Сначала|Дождитесь|Нет листа|Импорт прерван|Формулы|Неподдерживаемый/i.test(
          message,
        )
          ? message
          : "Файл не удалось прочитать. Проверьте формат и PostgreSQL.",
    };
  }
}
export async function classifyAction(form: FormData) {
  const type = String(form.get("pageType"));
  if (!pageTypes.includes(type as (typeof pageTypes)[number])) return;
  await db.page.update({
    where: { id: String(form.get("pageId")) },
    data: { pageType: type, manualType: true },
  });
  revalidatePath("/pages");
}
