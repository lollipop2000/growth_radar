"use client";
import { t, ui, goalType } from "@/lib/i18n/ru";

import { useActionState } from "react";
import { yandexSettingsAction, syncAction } from "@/app/yandex-actions";
import type { Goal } from "@/lib/yandex/metrika";
import type { Host } from "@/lib/yandex/webmaster";
import { goalTypes, goalConfig, type GoalType } from "@/lib/yandex/goal-types";
type Source = "METRIKA" | "WEBMASTER";
export function GoalTypesForm({ goals, types, selected }: { goals: Goal[]; types?: Record<string, GoalType>; selected: string[] }) {
  const [state, action, pending] = useActionState(yandexSettingsAction, { message: "" });
  const config = goalConfig({ goals, goalTypes: types });
  const sorted = [...goals].sort((a,b) => Number(selected.includes(b.id))-Number(selected.includes(a.id)));
  return <form action={action}>
    <h3>{t("goalTypesHeading")}</h3><p>{t("goalTypesHelp")}</p>
    <input type="hidden" name="source" value="METRIKA" />
    <div className="table-scroll"><table><thead><tr><th>{t("Цель")}</th><th>{t("ID")}</th><th>{t("goalMeaning")}</th></tr></thead><tbody>{sorted.map(g=><tr key={g.id}><td><span data-source-value>{g.name}</span>{selected.includes(g.id)&&<small> · {t("selectedForCollection")}</small>}</td><td>{g.id}</td><td><label><span className="muted">{t("goalMeaning")}: {t(config.goalTypes[g.id])}</span><select aria-label={`${t("goalMeaning")} ${g.id}`} name={`goalType_${g.id}`} defaultValue={config.goalTypes[g.id]}>{goalTypes.map(type=><option key={type} value={type}>{t(type)}</option>)}</select></label></td></tr>)}</tbody></table></div>
    {!goals.length&&<p>{t("Сначала проверьте подключение. Если целей нет, API не вернул доступные цели.")}</p>}
    <button name="action" value="goalTypes" disabled={pending||!goals.length}>{t("saveGoalTypes")}</button><p role="status">{ui(state.message)}</p>
  </form>;
}
export function ConnectionButton({ source }: { source: Source }) {
  const [state, action, pending] = useActionState(yandexSettingsAction, {
    message: "",
  });
  return (
    <form action={action}>
      <input type="hidden" name="source" value={source} />
      <button name="action" value="test" disabled={pending}>
        {ui(pending
          ? "Проверяем…"
          : source === "METRIKA"
            ? t("Test Metrika Connection")
            : t("Test Webmaster Connection"))}
      </button>
      <p role="status">{ui(state.message)}</p>
    </form>
  );
}
export function GoalsForm({
  goals,
  selected,
}: {
  goals: Goal[];
  selected: string[];
}) {
  const [state, action, pending] = useActionState(yandexSettingsAction, {
    message: "",
  });
  return (
    <form action={action}>
      <h3>{t("collectionGoalsHeading")}</h3>
      <input type="hidden" name="source" value="METRIKA" />
      {goals.length ? (
        goals.map((g) => (
          <label className="checkbox" key={g.id}>
            <input
              type="checkbox"
              name="goals"
              value={g.id}
              defaultChecked={selected.includes(g.id)}
            />
            <span data-source-value>{g.name}</span> · {g.id} · {goalType(g.type)}
          </label>
        ))
      ) : (
        <p className="muted">
          {t("Сначала проверьте подключение. Если целей нет, API не вернул доступные цели.")}</p>
      )}
      <p className="muted">
        {t("collectionGoalsHelp")}</p>
      <button name="action" value="goals" disabled={pending || !goals.length}>
        {t("saveCollectionGoals")}</button>
      <p role="status">{ui(state.message)}</p>
    </form>
  );
}
export function HostsForm({
  hosts,
  selected,
}: {
  hosts: Host[];
  selected?: string;
}) {
  const [state, action, pending] = useActionState(yandexSettingsAction, {
    message: "",
  });
  return (
    <form action={action}>
      <input type="hidden" name="source" value="WEBMASTER" />
      <label htmlFor="hostId">{t("Доступные hosts")}</label>
      <select id="hostId" name="hostId" defaultValue={selected ?? ""} required>
        <option value="">{t("Выберите сайт магазина")}</option>
        {hosts.map((h) => (
          <option key={h.id} value={h.id} disabled={!h.verified}>
            {h.url} · {t(h.verified ? "verified" : "not verified")}
          </option>
        ))}
      </select>
      <button name="action" value="host" disabled={pending || !hosts.length}>
        {t("Сохранить host")}</button>
      <p role="status">{ui(state.message)}</p>
    </form>
  );
}
export function ScheduleForm({
  source,
  enabled,
}: {
  source: Source;
  enabled: boolean;
}) {
  const [state, action, pending] = useActionState(yandexSettingsAction, {
    message: "",
  });
  return (
    <form action={action}>
      <input type="hidden" name="source" value={source} />
      <label className="checkbox">
        <input type="checkbox" name="dailyEnabled" defaultChecked={enabled} />
        {t("Daily incremental sync")}</label>
      <button name="action" value="schedule" disabled={pending}>
        {t("Сохранить расписание")}</button>
      <p role="status">{ui(state.message)}</p>
    </form>
  );
}
export function SyncForm({ source }: { source: Source }) {
  const [state, action, pending] = useActionState(syncAction, { message: "" });
  return (
    <form className="panel" action={action}>
      <h2>{t("Синхронизация")}</h2>
      <input type="hidden" name="source" value={source} />
      {source === "WEBMASTER" ? (
        <>
        <label>
          {t("Initial import period")}<select name="period" defaultValue="7">
            <option value="7">{t("7 days")}</option>
            <option value="30">{t("30 days")}</option>
            <option value="90">{t("90 days")}</option>
          </select>
        </label>
        <label>
          {t("Max URLs для Initial (пусто — все URL)")}<input type="number" name="maxUrls" min="1" max="50000" placeholder={t("Для первой проверки: 1")} />
          <small>{t("Ограниченная выборка не продвигает общий watermark сайта. Остальные URL сохраняют статус неполной загрузки.")}</small>
        </label>
        </>
      ) : (
        <>
          <input type="hidden" name="period" value="90" />
          <p>{t("Initial import: последние 90 полных дней.")}</p>
        </>
      )}
      <div className="buttons">
        <button name="mode" value="INITIAL" disabled={pending}>
          {t("Initial sync")}</button>
        <button name="mode" value="INCREMENTAL" disabled={pending}>
          {t("Manual incremental sync")}</button>
      </div>
      <p className="muted">
        {t("Повторный sync обновляет записи без дублей. Progress сохраняется в PostgreSQL. Обновите страницу, чтобы увидеть результат.")}</p>
      <p role="status">{ui(state.message)}</p>
    </form>
  );
}
export function ResumeExportForm({ id, source = "WEBMASTER" }: { id: string; source?: Source }) {
  const [state, action, pending] = useActionState(syncAction, { message: "" });
  return <form action={action}>
    <input type="hidden" name="source" value={source} />
    <input type="hidden" name="mode" value="RESUME" />
    <input type="hidden" name="id" value={id} />
    <button disabled={pending}>{ui(source === "WEBMASTER" ? "Продолжить сохранённый export" : "Продолжить с сохранённого дня")}</button>
    <p role="status">{ui(state.message)}</p>
  </form>;
}
