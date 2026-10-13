import { t } from "@/lib/i18n/ru";
import Link from "next/link";
import { db } from "@/lib/db";
import { currentSite, config, readIntegration } from "@/lib/yandex/settings";
import { selectedPeriod } from "@/lib/yandex/views";
import { day, iso, period } from "@/lib/yandex/dates";
import { rematchAction } from "@/app/yandex-actions";
import { format } from "@/components/analytics";
import { AggregateUnmatched } from "@/components/aggregate-unmatched";
import {searchDataset} from '@/lib/search/dataset';
import {SearchActivation} from '@/components/search-activation';
export const dynamic = "force-dynamic";
export default async function Unmatched({
  searchParams,
}: {
  searchParams: Promise<{ source?: string; period?: string; page?: string; view?: string }>;
}) {
  const p = await searchParams,
    source = p.source === "WEBMASTER" ? "WEBMASTER" : "METRIKA",
    n = selectedPeriod(p.period),
    index = Math.max(1, Math.trunc(Number(p.page) || 1)),
    site = await currentSite(),
    dates = period(n),
    c = config((await readIntegration(source))?.configJson);
  if (p.view !== "ROWS") return source==='WEBMASTER'?<SearchActivation/>:<AggregateUnmatched source={source} n={n} index={index}/>;
  const bound =
    c.siteId === site.id &&
    (source === "METRIKA"
      ? c.counterId === process.env.YANDEX_METRIKA_COUNTER_ID
      : Boolean(c.hostId));
  const where = {
    siteId: site.id,
    matchStatus: "UNMATCHED",
    date: { gte: day(dates.from), lte: day(dates.to) },
  };
  const mWhere = { ...where, counterId: c.counterId },
    wWhere = { ...where, hostId: c.hostId };
  const search=source==='WEBMASTER'?(await searchDataset({siteId:site.id,date:where.date},c.siteId===site.id?c.hostId:undefined)).filter(r=>r.matchStatus==='UNMATCHED'):[];
  const count = source==='WEBMASTER'?search.length:bound
    ? source === "METRIKA"
      ? await db.metrikaPageDaily.count({ where: mWhere })
      : await db.webmasterQueryDaily.count({ where: wWhere })
    : 0;
  const actual = Math.min(index, Math.max(1, Math.ceil(count / 50))),
    pagination = {
      orderBy: { date: "desc" as const },
      skip: (actual - 1) * 50,
      take: 50,
    };
  const rows = source==='WEBMASTER'?search.sort((a,b)=>+b.date-+a.date).slice((actual-1)*50,actual*50):bound
    ? source === "METRIKA"
      ? await db.metrikaPageDaily.findMany({ where: mWhere, ...pagination })
      : await db.webmasterQueryDaily.findMany({ where: wWhere, ...pagination })
    : [];
  return (
    <>
      <h1>{t("Unmatched URLs")}</h1>
      <Link href={`/unmatched?source=${source}&period=${n}`}>{t("URL aggregates / Traffic coverage")}</Link>
      <p className="muted">
        {t("Записи сохраняются без Page. Сопоставление использует общую нормализацию и подтверждённые redirect aliases; query params не отбрасываются для подгонки.")}</p>
      <form className="filters">
        <input type="hidden" name="view" value="ROWS"/>
        <label>
          {t("Source")}<select name="source" defaultValue={source}>
            <option value="WEBMASTER">{t("Webmaster unmatched")}</option>
            <option value="METRIKA">{t("Metrika unmatched")}</option>
          </select>
        </label>
        <label>
          {t("Период")}<select name="period" defaultValue={n}>
            {[7, 30, 90].map((v) => (
              <option key={v} value={v}>
                {v} {t("days")}</option>
            ))}
          </select>
        </label>
        <button>{t("Применить")}</button>
      </form>
      <p>
        {t("Unmatched records:")}{count} · {dates.from} — {dates.to}
      </p>
      <form action={rematchAction}>
        <button>{t("Повторить matching с текущими Pages")}</button>
      </form>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>{t("Source / date")}</th>
              <th>{t("Raw URL")}</th>
              <th>{t("Normalized URL")}</th>
              <th>{t("Metrics / query")}</th>
              <th>{t("Возможная причина")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>
                  {t(source)}
                  <p>{iso(r.date)}</p>
                </td>
                <td>{r.url}</td>
                <td>{r.normalizedUrl}</td>
                <td>
                  {"visits" in r ? (
                    <>
                      {format(r.visits)} {t("visits ·")}{" "}{format(r.pageviews)}{" "}
                      {t("pageviews")}</>
                  ) : (
                    <>
                      {r.query}
                      <p>
                        {format(r.impressions)} {t("impressions ·")}{" "}{format(r.clicks)}{" "}
                        {t("clicks · region")}{r.region ?? "—"}
                      </p>
                    </>
                  )}
                </td>
                <td>{r.matchReason ?? "unknown"}</td>
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td colSpan={5}>{t("Нет unmatched записей за период.")}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="buttons">
        {actual > 1 && (
          <Link
            href={`/unmatched?view=ROWS&source=${source}&period=${n}&page=${actual - 1}`}
          >
            {t("Назад")}</Link>
        )}
        <span>
          {t("Страница")}{actual}/{Math.max(1, Math.ceil(count / 50))}
        </span>
        {actual * 50 < count && (
          <Link
            href={`/unmatched?view=ROWS&source=${source}&period=${n}&page=${actual + 1}`}
          >
            {t("Далее")}</Link>
        )}
      </div>
    </>
  );
}
