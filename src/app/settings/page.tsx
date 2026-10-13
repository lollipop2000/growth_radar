import { t , ui } from "@/lib/i18n/ru";
import { targetUrl } from "@/lib/health";
import { SettingsForm } from "@/components/settings-form";
import {
  ConnectionButton,
  GoalsForm,
  GoalTypesForm,
  HostsForm,
  ScheduleForm,
} from "@/components/yandex-forms";
import { readIntegration, config } from "@/lib/yandex/settings";
import { timestamp } from "@/components/analytics";
export const dynamic = "force-dynamic";
export default async function Settings() {
  let url = process.env.SITE_BASE_URL ?? "";
  try {
    url = await targetUrl();
  } catch {}
  const [metrika, webmaster] = await Promise.all([
    readIntegration("METRIKA"),
    readIntegration("WEBMASTER"),
  ]);
  const m = config(metrika?.configJson),
    w = config(webmaster?.configJson);
  return (
    <>
      <p className="eyebrow">{t("CONFIGURATION")}</p>
      <h1>{t("Settings")}</h1>
      <SettingsForm baseUrl={url} />
      <section className="panel">
        <h2>{t("Yandex Metrika")}</h2>
        <p className="muted">
          {t("YANDEX_METRIKA_TOKEN и YANDEX_METRIKA_COUNTER_ID задаются только через ENV на сервере.")}</p>
        <p>
          {t("Counter ID:")}{process.env.YANDEX_METRIKA_COUNTER_ID ?? "—"} ·{" "}
          {m.name ?? "—"}
        </p>
        <p>
          {t("Status:")}{ui(metrika?.status ?? "NOT_CONFIGURED")} {t("· Last checked:")}{" "}
          {timestamp(metrika?.lastCheckedAt)} {t("МСК")}</p>
        {metrika?.lastError && <p>{ui(metrika.lastError)}</p>}
        <ConnectionButton source="METRIKA" />
        <GoalTypesForm key={JSON.stringify([m.counterId,m.siteId,m.goals])} goals={m.goals??[]} types={m.goalTypes} selected={m.primaryGoals??[]} />
        <GoalsForm
          key={JSON.stringify([m.counterId, m.primaryGoals])}
          goals={m.goals ?? []}
          selected={m.primaryGoals ?? []}
        />
        <ScheduleForm source="METRIKA" enabled={m.dailyEnabled ?? false} />
        <p>{t("Next run:")}{" "}{timestamp(m.dailyEnabled ? m.nextRunAt : null)} {t("МСК")}</p>
      </section>
      <section className="panel">
        <h2>{t("Yandex Webmaster")}</h2>
        <p className="muted">
          {t("В ENV нужен только YANDEX_WEBMASTER_TOKEN. User ID и hosts получаются через официальный API.")}</p>
        <p>{t("User ID:")}{" "}{w.userId ?? "—"}</p>
        <p>{t("Выбранный host:")}{" "}{w.hostId ?? "—"}</p>
        <p>
          {t("Status:")}{ui(webmaster?.status ?? "NOT_CONFIGURED")} {t("· Last checked:")}{" "}
          {timestamp(webmaster?.lastCheckedAt)} {t("МСК")}</p>
        {webmaster?.lastError && <p>{ui(webmaster.lastError)}</p>}
        <ConnectionButton source="WEBMASTER" />
        <HostsForm
          key={w.hostId ?? "none"}
          hosts={w.hosts ?? []}
          selected={w.hostId}
        />
        <ScheduleForm source="WEBMASTER" enabled={w.dailyEnabled ?? false} />
        <p>{t("Next run:")}{" "}{timestamp(w.dailyEnabled ? w.nextRunAt : null)} {t("МСК")}</p>
      </section>
    </>
  );
}
