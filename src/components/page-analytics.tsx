import {MonthlySearchTrend} from './monthly-search';
import { t , ui } from "@/lib/i18n/ru";
import {
  dataForSite,
  groupBy,
  searchTotals,
  metrikaTotals,
} from "@/lib/yandex/views";
import { iso, days } from "@/lib/yandex/dates";
import { Metrics, Trend, format } from "./analytics";
import { GoalGroupsPanel } from "./goal-groups";
import { aggregateGoalGroups } from "../lib/yandex/goal-types";
export async function PageAnalytics({
  pageId,
  n,
}: {
  pageId: string;
  n: number;
}) {
  const data = await dataForSite(n, pageId),
    search = searchTotals(data.webmaster),
    traffic = metrikaTotals(data.metrika, data.goals);
  const queries = Array.from(groupBy(data.webmaster, (r) => r.query))
    .map(([query, rows]) => ({ query, ...searchTotals(rows) }))
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, 20);
  const daily = days(data.dates.from, data.dates.to).map((date) => {
    const w = data.webmaster.filter((r) => iso(r.date) === date && r.grain!=='MONTH'),
      m = data.metrika.filter((r) => iso(r.date) === date);
    return {
      date,
      search: searchTotals(w),
      traffic: metrikaTotals(m, data.goals),
      hasSearch: w.length > 0,
      hasTraffic: m.length > 0,
    };
  });
  return (
    <>
      <p className="muted">
        {t("Site:")}{data.site.name} · {data.site.baseUrl}.{" "}
        {ui(data.historical
          ? "Архивные источники этого Site из последних JobRun с данными. "
          : "")}
        {t("Counter:")}{data.counterId ?? "—"}{t("; host:")}{" "}{data.hostId ?? "—"}.{" "}
        {data.dates.from} — {data.dates.to}{t(". Отсутствующие дни обозначены «—».")}</p>
      <section className="panel">
        <h2>{t("Search")}</h2>{data.webmaster.some(r=>r.grain==='MONTH')&&<><p>Итог включает полные месяцы. Дневные графики показывают только дневные наблюдения.</p><MonthlySearchTrend rows={data.webmaster} from={data.dates.from} to={data.dates.to}/></>}
        {data.webmaster.length ? (
          <Metrics
            values={{
              Impressions: search.impressions,
              Clicks: search.clicks,
              "CTR %": search.ctr,
              "Avg position": search.avgPosition,
            }}
          />
        ) : (
          <p>{t("Нет данных Webmaster для этой страницы за период.")}</p>
        )}
        <div className="trend-grid">
          {["impressions", "clicks", "ctr", "avgPosition"].map((key) => (
            <Trend
              key={key}
              title={key}
              points={daily.map((d) => ({
                date: d.date,
                value: d.hasSearch
                  ? d.search[key as keyof typeof d.search]
                  : null,
              }))}
            />
          ))}
        </div>
      </section>
      <section className="panel">
        <h2>{t("Top Queries · TOP-20")}</h2>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>{t("Query")}</th>
                <th>{t("Impressions ↓")}</th>
                <th>{t("Clicks")}</th>
                <th>{t("CTR %")}</th>
                <th>{t("Avg position")}</th>
              </tr>
            </thead>
            <tbody>
              {queries.map((q) => (
                <tr key={q.query}>
                  <td>{q.query}</td>
                  <td>{format(q.impressions)}</td>
                  <td>{format(q.clicks)}</td>
                  <td>{format(q.ctr, 2)}</td>
                  <td>{format(q.avgPosition, 2)}</td>
                </tr>
              ))}
              {!queries.length && (
                <tr>
                  <td colSpan={5}>{t("Нет запросов за период.")}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
      <section className="panel">
        <h2>{t("Metrika")}</h2>
        {data.metrika.length ? (
          <Metrics
            values={{
              Visits: traffic.visits,
              "Visitors (сумма дневных)": traffic.visitors,
              "Pageviews в визитах": traffic.pageviews,
              "Bounce rate %": traffic.bounceRate,
              "Average duration sec": traffic.avgVisitDuration,
            }}
          />
        ) : (
          <p>{t("Нет данных Metrika для этой страницы за период.")}</p>
        )}
        <p className="muted">
          {t("Гранулярность: страница входа × день. Pageviews и достижения целей относятся ко всему визиту, начавшемуся здесь. Visitors — сумма дневных уникальных, без дедупликации людей между днями/URL. Bounce и duration взвешены по visits.")}</p>
        <div className="trend-grid">
          {[
            "visits",
            "visitors",
            "pageviews",
            "bounceRate",
            "avgVisitDuration",
          ].map((key) => (
            <Trend
              key={key}
              title={key}
              points={daily.map((d) => ({
                date: d.date,
                value: d.hasTraffic
                  ? d.traffic[
                      key as
                        | "visits"
                        | "visitors"
                        | "pageviews"
                        | "bounceRate"
                        | "avgVisitDuration"
                    ]
                  : null,
              }))}
            />
          ))}
          {data.goals.filter(id=>data.goalConfig.goalTypes[id]!=="IGNORE").map((id) => (
            <Trend
              key={id}
              title={`${t("Достижения цели")} ${id}`}
              points={daily.map((d) => ({
                date: d.date,
                value: d.hasTraffic ? d.traffic.goals[id] : null,
              }))}
            />
          ))}
        </div>
      </section>
      <GoalGroupsPanel groups={aggregateGoalGroups(data.metrika,data.goalConfig)} />
      <details>
        <summary>{t("Динамика Search + Metrika по дням")}</summary>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>{t("Date")}</th>
                <th>{t("Impressions")}</th>
                <th>{t("Clicks")}</th>
                <th>{t("CTR %")}</th>
                <th>{t("Position")}</th>
                <th>{t("Visits")}</th>
                <th>{t("Visitors daily")}</th>
                <th>{t("Pageviews")}</th>
                <th>{t("Bounce %")}</th>
                <th>{t("Duration sec")}</th>
                {data.goals.map((id) => (
                  <th key={id}>{t("Goal")}{" "}{id}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {daily.map((d) => (
                <tr key={d.date}>
                  <td>{d.date}</td>
                  <td>{d.hasSearch ? format(d.search.impressions) : "—"}</td>
                  <td>{d.hasSearch ? format(d.search.clicks) : "—"}</td>
                  <td>{d.hasSearch ? format(d.search.ctr, 2) : "—"}</td>
                  <td>{d.hasSearch ? format(d.search.avgPosition, 2) : "—"}</td>
                  <td>{d.hasTraffic ? format(d.traffic.visits) : "—"}</td>
                  <td>{d.hasTraffic ? format(d.traffic.visitors) : "—"}</td>
                  <td>{d.hasTraffic ? format(d.traffic.pageviews) : "—"}</td>
                  <td>
                    {d.hasTraffic ? format(d.traffic.bounceRate, 2) : "—"}
                  </td>
                  <td>
                    {d.hasTraffic ? format(d.traffic.avgVisitDuration, 2) : "—"}
                  </td>
                  {data.goals.map((id) => (
                    <td key={id}>
                      {d.hasTraffic ? format(d.traffic.goals[id]) : "—"}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </>
  );
}
