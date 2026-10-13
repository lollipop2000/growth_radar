import { t } from "@/lib/i18n/ru";
import Link from "next/link";
import { db } from "@/lib/db";
import { landingDataset } from "@/lib/yandex/dataset";
import { config, readIntegration } from "@/lib/yandex/settings";
import { day } from "@/lib/yandex/dates";
import { format } from "./analytics";
import { TrafficCoverage, Diagnostic } from "./traffic-diagnostic";
import { rematchAction } from "@/app/yandex-actions";
import type { TargetDiagnostic } from "@/lib/yandex/targeted";
import {searchDataset} from '@/lib/search/dataset';
export async function AggregateUnmatched({ source, n, index }: { source: "METRIKA" | "WEBMASTER"; n: number; index: number }) {
  const data = await landingDataset(n), w = config((await readIntegration("WEBMASTER"))?.configJson);
  let rows = data.landing.filter(r => r.unmatchedRows > 0).map(r => ({ ...r, impressions: null as number | null, clicks: null as number | null }));
  if (source === "WEBMASTER") {
    const search=await searchDataset({siteId:data.site.id,date:{gte:day(data.dates.from),lte:day(data.dates.to)}},w.siteId===data.site.id?w.hostId:undefined),aggregates=new Map<string,{normalizedUrl:string;_sum:{impressions:number;clicks:number}}>();
    for(const r of search.filter(r=>!r.pageId)){const g=aggregates.get(r.normalizedUrl)??{normalizedUrl:r.normalizedUrl,_sum:{impressions:0,clicks:0}};g._sum.impressions+=r.impressions;g._sum.clicks+=r.clicks;aggregates.set(r.normalizedUrl,g);}const groups=[...aggregates.values()];
    rows = groups.map(r => ({ url: r.normalizedUrl, visits: data.landing.find(m => m.url === r.normalizedUrl)?.visits ?? 0,
      matchedVisits: 0, unmatchedVisits: 0, unmatchedRows: 1, rawUrls: 0, reason: "Webmaster URL не связан с Page",
      impressions: r._sum.impressions, clicks: r._sum.clicks })).sort((a,b) => b.visits - a.visits || (b.impressions ?? 0) - (a.impressions ?? 0));
  }
  const pages = Math.max(1,Math.ceil(rows.length/50)), page = Math.min(index,pages);
  const diagnostics = await db.scan.findMany({ where: { siteId: data.site.id, configJson: { path: ["targeted","kind"], equals: "TOP_UNMATCHED" } }, orderBy: { startedAt: "desc" }, take: 5 });
  return <><h1>{t("Unmatched URLs · URL aggregates")}</h1><form className="filters"><label>{t("Source")}<select name="source" defaultValue={source}><option value="METRIKA">{t("Metrika")}</option><option value="WEBMASTER">{t("Webmaster")}</option></select></label><label>{t("Период")}<select name="period" defaultValue={n}>{[7,30,90].map(v => <option key={v} value={v}>{v} {t("days")}</option>)}</select></label><button>{t("Применить")}</button></form>
    <p>{data.dates.from} — {data.dates.to}. {data.rawUrls} {t("уникальных raw landing URL →")}{" "}{data.landing.length} {t("normalized URLs. Нет данных за день — visits не выдумываются.")}</p>
    {!!data.missingDays.length && <p>{t("Дни без импортированных rows Метрики:")}{" "}{data.missingDays.join(", ")}{t(". Это отсутствие строк, не доказательство нулевого traffic.")}</p>}
    <TrafficCoverage value={data.coverage}/><Link href={`/unmatched?view=ROWS&source=${source}&period=${n}`}>{t("Daily rows")}</Link> · <Link href="/webmaster/priority">{t("Webmaster Priority Scope")}</Link>
    <form action={rematchAction}><button>{t("Повторить matching с текущими Pages")}</button></form><Link href="/scanner?preset=TARGETED">Сканировать TOP несопоставленных URL Метрики</Link>
    <p>{t("Unique unmatched URLs (")}{t(source)}): {rows.length}{t(". Visits и доля traffic относятся к данным Метрики выбранного периода.")}</p>
    <div className="table-scroll"><table><thead><tr><th>{t("Normalized URL")}</th><th>{t("Raw variants")}</th><th>{t("Visits")}</th><th>{t("Доля общего traffic %")}</th><th>{t("Impressions / clicks")}</th><th>{t("Причина")}</th></tr></thead><tbody>{rows.slice((page-1)*50,page*50).map(r => <tr key={r.url}><td>{r.url}</td><td>{r.rawUrls || "—"}</td><td>{format(r.visits)}</td><td>{data.coverage.totalVisits ? format(r.visits/data.coverage.totalVisits*100,2) : "—"}</td><td>{r.impressions === null ? "—" : `${r.impressions} / ${r.clicks}`}</td><td>{t(r.reason)}</td></tr>)}</tbody></table></div>
    <div className="buttons">{page > 1 && <Link href={`/unmatched?source=${source}&period=${n}&page=${page-1}`}>{t("Назад")}</Link>}{t("Страница")}{" "}{page}/{pages}{page < pages && <Link href={`/unmatched?source=${source}&period=${n}&page=${page+1}`}>{t("Далее")}</Link>}</div>
    {diagnostics.map(scan => <div key={scan.id}><Link href={`/scanner/${scan.id}`}>{t("Scan")}{" "}{scan.id} · {t(scan.status)}</Link><Diagnostic target={(scan.configJson as { targeted: TargetDiagnostic }).targeted}/></div>)}
  </>;
}
