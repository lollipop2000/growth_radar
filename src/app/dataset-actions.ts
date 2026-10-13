"use server";
import { revalidatePath } from "next/cache";
import { previewPriority, savePriority, type ScopeMode } from "@/lib/yandex/priority";
import { scanTopUnmatched } from "@/lib/yandex/targeted";
import { enqueueSync } from "@/lib/yandex/jobs";
import { safeError } from "@/lib/yandex/api";
import type { Candidate } from "@/lib/yandex/dataset";
export type PriorityPreviewState = { rows: Candidate[]; fingerprint: string; mode: ScopeMode; message: string };
const errors: Record<string,string> = {
  INVALID_PRIORITY_MODE: "Выберите TOP 20 / 50 / 100 или Manual selection.",
  INVALID_MANUAL_SCOPE: "Введите 1–100 URL из текущего dataset. Внешние, служебные и неизвестные URL не принимаются.",
  PRIORITY_PREVIEW_CHANGED: "Dataset изменился. Обновите preview перед запуском.",
  PRIORITY_NOT_CONFIGURED: "Сначала подключите Вебмастер и выберите verified host в Settings.",
  NO_PRIORITY_URLS: "В dataset пока нет валидных URL для export.",
  ACTIVE_SYNC: "Сначала дождитесь завершения активной синхронизации.",
  EXPORT_SUBMISSION_UNCERTAIN: "Export не создан: предыдущий POST не подтверждён. Текущий выбор сохранён; проверьте старую задачу в Вебмастере.",
  NO_SAFE_UNMATCHED: "Нет разрешённых unmatched URL для targeted scan.",
  INVALID_TARGET_LIMIT: "Допустим TOP 10 / 20 / 50.",
  NO_LANDING_DATA: "Нет импортированных данных текущей Метрики.",
};
function message(error: unknown) { return error instanceof Error && errors[error.message] || (error instanceof Error && /Другое сканирование/.test(error.message) ? error.message : safeError(error)); }
function refresh() { for (const path of ["/unmatched","/webmaster","/webmaster/priority","/metrika","/scanner","/pages"]) revalidatePath(path); }
export async function previewPriorityAction(previous: PriorityPreviewState, form: FormData): Promise<PriorityPreviewState> {
  try { return { ...await previewPriority(String(form.get("scope")), String(form.get("manual") ?? "").split(/\r?\n/)), message: "Preview готов. Проверьте список перед сохранением или запуском." }; }
  catch (error) { return { ...previous, message: message(error) }; }
}
export async function priorityAction(_previous: { message: string }, form: FormData) {
  try {
    const urls = JSON.parse(String(form.get("urls"))) as unknown;
    if (!Array.isArray(urls) || urls.some(u => typeof u !== "string")) throw new Error("INVALID_MANUAL_SCOPE");
    await savePriority(String(form.get("scope")), urls, String(form.get("fingerprint")));
    if (form.get("action") === "SAVE") { refresh(); return { message: "Priority Scope сохранён. Export POST не выполнялся." }; }
    const job = await enqueueSync("WEBMASTER", form.get("action") === "INCREMENTAL" ? "INCREMENTAL" : "INITIAL", Number(form.get("days")));
    refresh(); return { message: `Priority job ${job.id} поставлена в очередь.` };
  } catch (error) { refresh(); return { message: message(error) }; }
}
export async function targetScanAction(_previous: { message: string }, form: FormData) {
  try { const scan = await scanTopUnmatched(Number(form.get("limit"))); refresh(); return { message: `Targeted scan ${scan.id} поставлен в очередь. После завершения — автоматический rematch и Before/After.` }; }
  catch (error) { return { message: message(error) }; }
}
