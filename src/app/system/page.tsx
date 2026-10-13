import { t , ui } from "@/lib/i18n/ru";
import { readSystem } from "@/lib/health";
import { systemAction } from "@/app/actions";
import { Freshness } from "@/components/freshness";
export const dynamic = "force-dynamic";
export default async function System() {
  const rows = await readSystem();
  return (
    <>
      <p className="eyebrow">{t("HEALTH CHECK")}</p>
      <h1>{t("System Status")}</h1>
      <p className="muted">
        {t("Connected — соединение проверено. Configured — обязательные ENV заданы, API ещё не проверялся.")}</p>
      <form action={systemAction}>
        <button>{t("Проверить систему")}</button>
      </form>
      <div className="health">
        {rows.map((row) => (
          <section className="panel" key={row.type}>
            <h2>{t(row.type)}</h2>
            <span className="badge" data-status={row.status}>
              {t(row.status)}
            </span>
            <p className="muted">
              {t("Последняя проверка:")}{" "}
              {row.lastCheckedAt
                ? new Intl.DateTimeFormat("ru-RU", {
                    dateStyle: "short",
                    timeStyle: "medium",
                    timeZone: "Europe/Moscow",
                  }).format(row.lastCheckedAt) + " МСК"
                : "ещё не выполнялась"}
            </p>
            {row.lastError && <p>{ui(row.lastError)}</p>}
          </section>
        ))}
      </div>
      <Freshness />
    </>
  );
}
