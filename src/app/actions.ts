"use server";
import { revalidatePath } from "next/cache";
import { saveTarget, checkTarget, checkSystem } from "@/lib/health";
import type { ConnectionResult } from "@/lib/connection";
export type SettingsState = { message: string; result?: ConnectionResult };
export async function settingsAction(
  _previous: SettingsState,
  data: FormData,
): Promise<SettingsState> {
  try {
    await saveTarget(String(data.get("baseUrl") ?? ""));
    const result =
      data.get("action") === "test" ? await checkTarget() : undefined;
    revalidatePath("/system");
    revalidatePath("/settings");
    return {
      message: result
        ? result.error
          ? "Проверка завершилась с ошибкой."
          : "Соединение установлено."
        : "Адрес сохранён.",
      result,
    };
  } catch {
    return {
      message:
        "Не удалось сохранить настройки или выполнить проверку. Проверьте HTTP(S) URL без query/credentials, PostgreSQL и миграции.",
    };
  }
}
export async function systemAction() {
  await checkSystem();
  revalidatePath("/system");
}
