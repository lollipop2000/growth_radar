import { t , ui } from "@/lib/i18n/ru";
import { freshness } from "@/lib/yandex/views";
import { timestamp } from "./analytics";
export async function Freshness() {
  const rows = await freshness();
  return (
    <section>
      <h2>{t("Data freshness")}</h2>
      <div className="health">
        {rows.map((r) => (
          <section className="panel" key={r.source}>
            <h3>{t(r.source)}</h3>
            <span className="badge" data-status={r.status}>
              {t(r.status)}
            </span>
            <p>
              {t("Last successful")}:{" "}
              {timestamp(r.lastSuccess)} {t("МСК")}</p>
            {r.nextRun && <p>{t("Next run:")}{" "}{timestamp(r.nextRun)} {t("МСК")}</p>}
            {r.error && <p>{ui(r.error)}</p>}
          </section>
        ))}
      </div>
    </section>
  );
}
