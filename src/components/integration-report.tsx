import {MonthlySearchTrend} from './monthly-search';
import {searchCoverage} from '@/lib/search/metrics';
import { t , ui, number } from "@/lib/i18n/ru";
import Link from "next/link";
import { db } from "@/lib/db";
import {
  dataForSite,
  selectedPeriod,
  searchTotals,
  metrikaTotals,
  groupBy,
} from "@/lib/yandex/views";
import {
  integrationType,
  readIntegration,
  config,
  type Source,
} from "@/lib/yandex/settings";
import { iso, days } from "@/lib/yandex/dates";
import { PeriodLinks, Metrics, Trend, format, timestamp } from "./analytics";
import { SyncForm, ResumeExportForm } from "./yandex-forms";
import { cancelSyncAction } from "@/app/yandex-actions";
import { aggregateLanding, trafficCoverage } from "@/lib/yandex/dataset";
import { GoalGroupsPanel } from "./goal-groups";
import { aggregateGoalGroups } from "../lib/yandex/goal-types";
export async function IntegrationReport({
  source,
  period,
}: {
  source: Source;
  period?: string;
}) {
  const n = selectedPeriod(period),
    data = await dataForSite(n),
    web = source === "WEBMASTER",
    row = await readIntegration(source),
    c = config(row?.configJson);
  const jobs = await db.jobRun.findMany({
    where: { source, siteId: data.site.id },
    orderBy: { createdAt: "desc" },
    take: 30,
  });
  const records = web ? data.webmaster : data.metrika,
    total = records.length,
    matched = records.filter((r) => r.pageId !== null).length;
  const coverage = trafficCoverage(aggregateLanding(data.metrika));
  const search = searchTotals(data.webmaster),
    traffic = metrikaTotals(data.metrika, data.goals);
  const byDay = web
    ? groupBy(data.webmaster.filter(r=>r.grain!=='MONTH'), (r) => iso(r.date))
    : groupBy(data.metrika, (r) => iso(r.date));
  const daily = days(data.dates.from, data.dates.to).map((date) => ({
    date,
    search: searchTotals(data.webmaster.filter((r) => iso(r.date) === date&&r.grain!=='MONTH')),
    traffic: metrikaTotals(
      data.metrika.filter((r) => iso(r.date) === date),
      data.goals,
    ),
    has: byDay.has(date),
  }));
  const byUrl = web
    ? groupBy(data.webmaster, (r) => r.normalizedUrl)
    : groupBy(data.metrika, (r) => r.normalizedUrl);
  const urls = Array.from(byUrl.keys())
    .map((url) => {
      const w = data.webmaster.filter((r) => r.normalizedUrl === url),
        m = data.metrika.filter((r) => r.normalizedUrl === url);
      return {
        url,
        pageId: byUrl.get(url)?.[0]?.pageId,
        search: searchTotals(w),
        traffic: metrikaTotals(m, data.goals),
      };
    })
    .sort((a, b) =>
      web
        ? b.search.impressions - a.search.impressions
        : b.traffic.visits - a.traffic.visits,
    )
    .slice(0, 50);
  return (
    <>
      <p className="eyebrow">{t("YANDEX / SPRINT 2")}</p>
      <h1>{t(integrationType(source))}</h1>
      <p>{data.site.baseUrl}</p>
      <p>
        {t("Status:")}{ui(row?.status ?? "NOT_CONFIGURED")} {t("· Last successful sync:")}{" "}
        {timestamp(row?.lastSuccessfulSyncAt)} {t("МСК")}</p>
      {row?.lastError && <p>{ui(row.lastError)}</p>}
      <p>
        {web
          ? `${t("Сайт")}: ${c.hostUrl ?? t("Не выбран")}`
          : `${t("Счётчик")}: ${c.counterId ?? t("Не проверен")}`}
      </p>
      <div className="buttons">
        <Link href="/settings">{t("Settings")}</Link>
        <Link href={`/unmatched?source=${source}&period=${n}`}>
          {t("Unmatched URLs")}</Link>
        <Link href={`/${web ? "webmaster" : "metrika"}?period=${n}`}>
          {t("Обновить статус")}</Link>
      </div>
      <PeriodLinks path={web ? "/webmaster" : "/metrika"} n={n} />
      {web&&data.webmaster.some(r=>r.grain==='MONTH')&&<MonthlySearchTrend rows={data.webmaster} from={data.dates.from} to={data.dates.to}/>} {web&&<section className='panel'><h2>Полнота поисковых данных</h2><p>API: {data.webmaster.filter(r=>r.source==='WEBMASTER_API').length} строк · Файловый импорт: {data.webmaster.filter(r=>r.source==='WEBMASTER_IMPORT').length} строк · Покрытие {searchCoverage(data.webmaster,{...data.dates,days:n}).grain==='MONTH'?'месяцев':'дней'}: {number(searchCoverage(data.webmaster,{...data.dates,days:n}).observed)}/{searchCoverage(data.webmaster,{...data.dates,days:n}).expected} · Запросов: {new Set(data.webmaster.map(r=>r.normalizedQuery||r.query)).size} · URL: {new Set(data.webmaster.map(r=>r.url)).size}.</p><p>Учтены выбранные строки после исключения дублей; Дневной API приоритетен в дневных совпадениях; полный месячный импорт исключает совпадающие дневные наблюдения. Покрытие дат не доказывает полноту запросов и страниц всего сайта.</p></section>}
      <p>{t("Matched traffic coverage · Metrika:")}{" "}{format(coverage.coverage,2)}{t("% · landing URLs")}{" "}{coverage.matchedUrls}/{coverage.totalUrls} {t("· visits")}{" "}{format(coverage.matchedVisits)}/{format(coverage.totalVisits)}.</p>
      <p className="muted">
        {data.dates.from} — {data.dates.to}{t(". Total rows:")}{" "}{total}{t("; matched:")}{" "}
        {matched}{t("; unmatched:")}{" "}{total - matched}{t("; daily row matching (secondary):")}{" "}
        {total ? format((matched / total) * 100, 1) + "%" : "—"}.
      </p>
      {web ? (
        <Metrics
          values={{
            Impressions: total ? search.impressions : null,
            Clicks: total ? search.clicks : null,
            "CTR %": search.ctr,
            "Avg position": search.avgPosition,
          }}
        />
      ) : (
        <>
          <Metrics
            values={{
              Visits: total ? traffic.visits : null,
              "Visitors (сумма дневных)": total ? traffic.visitors : null,
              "Pageviews в визитах": total ? traffic.pageviews : null,
              "Bounce rate %": traffic.bounceRate,
              "Average duration sec": traffic.avgVisitDuration,
            }}
          />
          <GoalGroupsPanel groups={aggregateGoalGroups(data.metrika,data.goalConfig)} />
          <p className="muted">
            {t("Метрики визитов сгруппированы по странице входа. Pageviews — просмотры во всём визите, а не просмотры только этого URL. Сумма дневных visitors не равна уникальным посетителям за весь период. Primary Goals — количество достижений в этих визитах.")}</p>
          {data.metrika.some(
            (r) => (r.reportMetaJson as { sampled?: boolean }).sampled,
          ) && (
            <p>
              {t("WARNING: API использовал sampling; сохранены параметры выборки.")}</p>
          )}
        </>
      )}
      <div className="trend-grid">
        {web
          ? ["impressions", "clicks", "ctr", "avgPosition"].map((key) => (
              <Trend
                key={key}
                title={key}
                points={daily.map((d) => ({
                  date: d.date,
                  value: d.has ? d.search[key as keyof typeof d.search] : null,
                }))}
              />
            ))
          : ["visits", "pageviews", "bounceRate", "avgVisitDuration"].map(
              (key) => (
                <Trend
                  key={key}
                  title={key}
                  points={daily.map((d) => ({
                    date: d.date,
                    value: d.has
                      ? d.traffic[
                          key as
                            | "visits"
                            | "pageviews"
                            | "bounceRate"
                            | "avgVisitDuration"
                        ]
                      : null,
                  }))}
                />
              ),
            )}
      </div>
      <details>
        <summary>{t("Динамика по дням — таблица")}</summary>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>{t("Date")}</th>
                <th>{ui(web ? "Impressions" : "Visits")}</th>
                <th>{ui(web ? "Clicks" : "Pageviews")}</th>
                <th>{ui(web ? "CTR %" : "Bounce %")}</th>
                <th>{ui(web ? "Position" : "Duration sec")}</th>
              </tr>
            </thead>
            <tbody>
              {daily.map((d) => (
                <tr key={d.date}>
                  <td>{d.date}</td>
                  <td>
                    {d.has
                      ? format(web ? d.search.impressions : d.traffic.visits)
                      : "—"}
                  </td>
                  <td>
                    {d.has
                      ? format(web ? d.search.clicks : d.traffic.pageviews)
                      : "—"}
                  </td>
                  <td>
                    {d.has
                      ? format(web ? d.search.ctr : d.traffic.bounceRate, 2)
                      : "—"}
                  </td>
                  <td>
                    {d.has
                      ? format(
                          web
                            ? d.search.avgPosition
                            : d.traffic.avgVisitDuration,
                          2,
                        )
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
      <h2>{t("TOP-50 URL за период")}</h2>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>{t("URL")}</th>
              <th>{ui(web ? "Impressions" : "Visits")}</th>
              <th>{ui(web ? "Clicks" : "Pageviews")}</th>
              <th>{t("Matching")}</th>
            </tr>
          </thead>
          <tbody>
            {urls.map((r) => (
              <tr key={r.url}>
                <td>
                  {r.pageId ? (
                    <Link href={`/pages/${r.pageId}?period=${n}`}>{r.url}</Link>
                  ) : (
                    r.url
                  )}
                </td>
                <td>{format(web ? r.search.impressions : r.traffic.visits)}</td>
                <td>{format(web ? r.search.clicks : r.traffic.pageviews)}</td>
                <td>{ui(r.pageId ? "MATCHED" : "UNMATCHED")}</td>
              </tr>
            ))}
            {!urls.length && (
              <tr>
                <td colSpan={4}>{t("Данные пока не импортированы.")}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {web ? <Link className="cta" href="/webmaster/priority">{t("Priority Scope · TOP 20 / 50 / 100 / Manual selection")}</Link> : <SyncForm source={source} />}
      {web && (
        <p className="muted">
          {t("Полные пары URL/query получаются через async export. Discovery URLs —")}{ui(c.webmasterUrlSource === "WEBMASTER" ? "только API monitoring с pagination" : "API monitoring с pagination плюс Scanner/Метрика")}{t(". Базовая квота: 100 URL × день/сутки; платный тариф не используется. Большой initial sync ограничен квотой: минимум число URL × число дней / 100 суток. Export обычно готовится 20 минут–2 часа, иногда до суток.")}</p>
      )}
      <h2>{t("Последние 30 JobRun")}</h2>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>{t("Создан / период")}</th>
              <th>{t("Status / duration")}</th>
              <th>{t("Fetched / saved")}</th>
              <th>{t("Errors / export progress")}</th>
            </tr>
          </thead>
          <tbody>
            {jobs.map((job) => {
              const checkpoint = job.checkpointJson as {
                taskId?: string;
                paths?: string[];
                pathIndex?: number;
                completedTasks?: number;
                phase?: string;
              };
              return (
                <tr key={job.id}>
                  <td>
                    {timestamp(job.createdAt)}
                    <p>
                      {iso(job.dateFrom)} — {iso(job.dateTo)}
                    </p>
                    <small>
                      {t(job.mode)} · {job.id}
                    </small>
                  </td>
                  <td>
                    {t(job.status)}
                    <p>
                      {format(
                        job.finishedAt
                          ? job.durationMs / 1000
                          : job.startedAt
                            ? (Date.now() - job.startedAt.getTime()) / 1000
                            : 0,
                      )}{" "}
                      {t("sec")}</p>
                    <p>{t("Start:")}{" "}{timestamp(job.startedAt)}</p>
                    <p>{t("Finish:")}{" "}{timestamp(job.finishedAt)}</p>
                    {web && ["FAILED", "PARTIAL"].includes(job.status) && checkpoint.taskId && checkpoint.phase === "EXPORT" &&
                      <ResumeExportForm id={job.id} />}
                    {!web && ["FAILED", "PARTIAL"].includes(job.status) && <ResumeExportForm id={job.id} source="METRIKA" />}
                    {["PENDING", "WAITING_EXPORT", "WAITING_QUOTA"].includes(
                      job.status,
                    ) && (
                      <form action={cancelSyncAction}>
                        <input type="hidden" name="id" value={job.id} />
                        <button>{t("Отменить ожидающее задание")}</button>
                      </form>
                    )}
                  </td>
                  <td>
                    {job.rowsFetched} / {job.rowsSaved}
                  </td>
                  <td>
                    {Array.isArray(job.errorsJson)
                      ? job.errorsJson.map((e, i) => <p key={i}>{ui(String(e))}</p>)
                      : null}
                    {web && (
                      <>
                        <p>
                          {t("Paths completed:")}{checkpoint.pathIndex ?? 0}/
                          {checkpoint.paths?.length ?? 0}{t("; tasks:")}{" "}
                          {checkpoint.completedTasks ?? 0}
                        </p>
                        <p>{t("Task:")}{" "}{checkpoint.taskId ?? "—"}</p>
                      </>
                    )}
                    <p>{t("Next attempt:")}{" "}{timestamp(job.nextAttemptAt)}</p>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
