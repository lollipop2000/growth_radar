"use server";
import { revalidatePath } from "next/cache";
import { coveragePreview, createCoverageScan, coverageControl } from "@/lib/scanner/coverage";
import { transport } from "@/lib/scanner/diagnostics";
export type CoveragePreviewData = { period: number; scope: string; batchSize: number; rescanSuccessful: boolean; rawUrls: number; queueUrls: number; excluded: number; totalBatches: number; missingDays: number; before: { totalUrls: number; matchedUrls: number; unmatchedUrls: number; totalVisits: number; matchedVisits: number; unmatchedVisits: number; coverage: number | null } };
export type CoverageFormState = { message: string; preview?: CoveragePreviewData; scanId?: string };
export async function previewCoverageAction(_state: CoverageFormState, form: FormData): Promise<CoverageFormState> {
  try {
    const period = Number(form.get("period")), scope = String(form.get("scope")), batchSize = Number(form.get("batchSize")), rescanSuccessful = form.get("rescanSuccessful") === "on";
    const p = await coveragePreview(period, scope, batchSize, rescanSuccessful);
    return { message: "Scope обновлён. Start создаст очередь для выбранных настроек.", preview: { period, scope, batchSize, rescanSuccessful, rawUrls: p.dataset.rawUrls, queueUrls: p.queue.length, excluded: p.excluded.length, totalBatches: p.totalBatches, missingDays: p.dataset.missingDays.length, before: p.before } };
  } catch { return { message: "Не удалось получить scope: проверьте period, batch size, Метрику и PostgreSQL." }; }
}
export async function startCoverageAction(_state: CoverageFormState, form: FormData): Promise<CoverageFormState> {
  try {
    const intent = String(form.get("intent") ?? "FULL");
    if (!["FULL","DIAGNOSTIC","TEST_ONE"].includes(intent)) throw new Error("Неизвестный запуск.");
    const scan = await createCoverageScan(Number(form.get("period")), String(form.get("scope")), Number(form.get("batchSize")), form.get("rescanSuccessful") === "true", undefined, undefined, {
      transport: transport(form.get("transport")), diagnosticLimit: intent === "TEST_ONE" ? 1 : intent === "DIAGNOSTIC" ? Number(form.get("diagnosticLimit")) : undefined,
      testUrl: intent === "TEST_ONE" ? String(form.get("testUrl") ?? "").trim() : undefined,
      delayMs: form.has("delayMs") ? Number(form.get("delayMs")) : undefined,
    });
    revalidatePath("/scanner");
    return { message: "Coverage queue создана. Прогресс и Pause/Stop/Resume — в деталях задания.", scanId: scan.id };
  } catch (error) { return { message: error instanceof Error && /Нет доступных|Другое|Period|Diagnostic|Тест|Неизвестный|Delay/.test(error.message) ? error.message : "Не удалось создать очередь. Проверьте Метрику, БД и worker." }; }
}
export async function coverageControlAction(_state: CoverageFormState, form: FormData): Promise<CoverageFormState> {
  const action = String(form.get("control"));
  if (!["PAUSE","STOP","RESUME"].includes(action)) return { message: "Неизвестное действие." };
  try { await coverageControl(String(form.get("scanId")), action as "PAUSE" | "STOP" | "RESUME", action === "RESUME" && form.has("delayMs") ? Number(form.get("delayMs")) : undefined); }
  catch { return { message: "Действие не выполнено. Обновите статус и проверьте, нет ли другого активного scan/import." }; }
  revalidatePath("/scanner"); revalidatePath("/scanner/" + String(form.get("scanId")));
  return { message: action === "RESUME" ? "Resume: очередь продолжится с checkpoint." : action === "PAUSE" ? "Pause запрошен; дождитесь PAUSED." : "Stop запрошен; сохранённые результаты остаются доступны для Resume." };
}
