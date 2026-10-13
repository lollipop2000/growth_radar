"use client";
import { t } from "@/lib/i18n/ru";

export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <section className="panel">
      <h1>{t("Операция не выполнена")}</h1>
      <p>{t("Проверьте PostgreSQL и применённые миграции.")}</p>
      <button onClick={reset}>{t("Повторить")}</button>
    </section>
  );
}
