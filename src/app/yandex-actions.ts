"use server";
import { revalidatePath } from "next/cache";
import {
  testIntegration,
  saveHost,
  savePrimaryGoals,
  saveGoalTypes,
  saveSchedule,
  currentSite,
  type Source,
} from "@/lib/yandex/settings";
import { safeError } from "@/lib/yandex/api";
import { enqueueSync, cancelJob, resumeExport, resumeMetrika } from "@/lib/yandex/jobs";
import { rematchSite } from "@/lib/yandex/store";
export type YandexState = { message: string };
function source(data: FormData): Source {
  const s = String(data.get("source"));
  if (s !== "METRIKA" && s !== "WEBMASTER") throw new Error("INVALID_SOURCE");
  return s;
}
function refresh() {
  for (const path of [
    "/settings",
    "/system",
    "/",
    "/metrika",
    "/webmaster",
    "/webmaster/priority",
    "/unmatched",
    "/pages",
    "/opportunities",
  ])
    revalidatePath(path);
}
const known: Record<string, string> = {
  INVALID_GOAL_TYPES: "Выберите допустимые типы целей проверенного счётчика.",
  GOAL_REPORT_LIMIT: "Для сбора статистики можно выбрать до 15 целей: учитываются выбранные цели и все цели с типом, отличным от «Не использовать в анализе».",
  EXPORT_SUBMISSION_UNCERTAIN: "Предыдущий export POST не подтверждён. Проверьте его задачу и квоту в Вебмастере перед новым sync.",
  INVALID_URL_LIMIT: "Лимит Priority URLs должен быть целым числом от 1 до 100.",
  PRIORITY_SCOPE_REQUIRED: "Выберите и проверьте Priority Scope на /webmaster/priority.",
  EXPORT_NOT_RESUMABLE: "Нет сохранённого export task, который можно продолжить.",
  CONFIG_CHANGED:
    "Настройки изменились во время операции. Обновите страницу и повторите действие.",
  ACTIVE_SYNC:
    "Сначала дождитесь завершения sync или отмените ожидающее задание.",
  INVALID_GOALS: "Выберите до 15 целей из списка проверенного счётчика.",
  INVALID_HOST: "Выберите подтверждённый host из полученного списка.",
  HOST_MISMATCH:
    "Host должен совпадать с origin магазина в Settings. Сначала выберите корректный магазин.",
  INVALID_PERIOD: "Допустимы периоды 7, 30 и 90 дней.",
};
export async function yandexSettingsAction(
  _state: YandexState,
  data: FormData,
): Promise<YandexState> {
  try {
    const s = source(data),
      action = String(data.get("action"));
    if (action === "test") {
      await testIntegration(s);
      refresh();
      return { message: "Проверка API успешна. Данные подключения сохранены." };
    }
    if (action === "goals" && s === "METRIKA")
      await savePrimaryGoals(data.getAll("goals").map(String));
    else if (action === "goalTypes" && s === "METRIKA") {
      const pairs=[...data.entries()].filter(([name])=>name.startsWith("goalType_"));
      await saveGoalTypes(Object.fromEntries(pairs.map(([name,value])=>[name.slice(9),String(value)])));
    }
    else if (action === "host" && s === "WEBMASTER")
      await saveHost(String(data.get("hostId") ?? ""));
    else if (action === "schedule")
      await saveSchedule(s, data.get("dailyEnabled") === "on");
    else throw new Error("INVALID_ACTION");
    refresh();
    return {
      message:
        action === "goalTypes" ? "Типы целей сохранены. Пересчитайте возможности; новые данные Метрики автоматически не запрашиваются." : action === "goals"
          ? "Выбор целей для сбора сохранён. Синхронизация запускается отдельно."
          : "Настройки сохранены.",
    };
  } catch (error) {
    return {
      message:
        error instanceof Error && known[error.message]
          ? known[error.message]
          : safeError(error),
    };
  }
}
export async function syncAction(
  _state: YandexState,
  data: FormData,
): Promise<YandexState> {
  try {
    const s = source(data),
      mode = data.get("mode") === "INITIAL" ? "INITIAL" : "INCREMENTAL";
    if (s === "WEBMASTER" && data.get("mode") !== "RESUME") throw new Error("PRIORITY_SCOPE_REQUIRED");
    const job = data.get("mode") === "RESUME"
      ? await (s === "WEBMASTER" ? resumeExport : resumeMetrika)(String(data.get("id") ?? ""))
      : await enqueueSync(s, mode, Number(data.get("period") ?? 90),
          mode === "INITIAL" && String(data.get("maxUrls") ?? "").trim() ? Number(data.get("maxUrls")) : undefined);
    refresh();
    return {
      message: `Sync ${job.id} поставлен в очередь. Обновите статус; нужен Yandex worker.`,
    };
  } catch (error) {
    return {
      message:
        error instanceof Error && known[error.message]
          ? known[error.message]
          : safeError(error),
    };
  }
}
export async function cancelSyncAction(data: FormData) {
  await cancelJob(String(data.get("id") ?? ""));
  refresh();
}
export async function rematchAction() {
  await rematchSite((await currentSite()).id);
  refresh();
}
