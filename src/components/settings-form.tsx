"use client";
import { t , ui } from "@/lib/i18n/ru";

import { useActionState } from "react";
import { settingsAction } from "@/app/actions";
export function SettingsForm({ baseUrl }: { baseUrl: string }) {
  const [state, action, pending] = useActionState(settingsAction, {
    message: "",
  });
  return (
    <>
      <form action={action} className="panel">
        <label htmlFor="baseUrl">{t("URL магазина")}</label>
        <input
          id="baseUrl"
          name="baseUrl"
          type="url"
          defaultValue={baseUrl}
          required
          placeholder={t("https://shop.example.ru/")}
        />
        <p className="muted">
          {t("Проверка выполняется с сервера приложения из вашей сети.")}</p>
        <div className="buttons">
          <button name="action" value="save" disabled={pending}>
            {t("Сохранить")}</button>
          <button name="action" value="test" disabled={pending}>
            {ui(pending ? "Проверяем…" : "Test site connection")}
          </button>
        </div>
      </form>
      <div aria-live="polite">
        {state.message && <p>{ui(state.message)}</p>}
        {state.result && (
          <dl className="panel">
            {Object.entries({
              "Resolved URL": state.result.resolvedUrl,
              "HTTP status": state.result.statusCode,
              "Response time (ms)": state.result.responseTimeMs,
              "Content type": state.result.contentType,
              "Размер ответа (bytes)": state.result.sizeBytes,
              Title: state.result.title,
              Ошибка: state.result.error,
            }).map(([key, value]) => (
              <div key={key}>
                <dt>{t(key)}</dt>
                <dd>{value ?? "—"}</dd>
              </div>
            ))}
          </dl>
        )}
      </div>
    </>
  );
}
