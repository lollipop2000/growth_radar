import {timed} from '@/lib/timing';
import { db } from "@/lib/db";
import { notFound } from "next/navigation";
import { PageAnalytics } from "@/components/page-analytics";
import { PeriodLinks, timestamp } from "@/components/analytics";
import { selectedDays } from "@/lib/opportunities/dataset";
import { commerceForPage } from "@/lib/opportunities/page-commerce";
import { BusinessFacts, OpportunityCards } from "@/components/opportunities";
import { t , ui } from "@/lib/i18n/ru";
import {CommercePanel} from '@/components/commerce-profile';
import {SeoPagePanel} from '@/components/seo-page';
import {HistoricalUrls} from '@/components/historical-urls';
import {PageSeoReview} from '@/components/page-seo-review';
import {aiAvailable} from '@/lib/ai/config';
export const dynamic = "force-dynamic";
export default async function PageDetail({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ period?: string;intent?:string;searchPeriod?:string;detail?:string;historyPage?:string }>;
}) {
  const { id } = await params;
  const q=await searchParams,n = selectedDays(q.period),historyPage=Math.max(1,Math.trunc(Number(q.historyPage)||1));
  const page = await db.page.findUnique({
    where: { id },
    include: {
      latestScanPage: true,
      scanPages: { orderBy: { scannedAt: "desc" }, take: q.detail==='1'?20:5,skip:q.detail==='1'?(historyPage-1)*20:0,select:{id:true,scannedAt:true,source:true,statusCode:true,outcome:true} },
    },
  });
  if (!page) notFound();
  const [dataset, opportunities] = await Promise.all([
    timed('commerce',()=>commerceForPage(id,n)),
    db.opportunity.findMany({ where: { pageId: id, isCurrent: true, status: "ACTIVE" }, orderBy: { score: "desc" } }),
  ]);
  const prepared = dataset;
  const business = prepared?.business ?? null;
  const latest = page.latestScanPage;
  const s = latest?.outcome === "OK" ? latest :
    (await db.scanPage.findFirst({
      where: { pageId: id, outcome: "OK" }, orderBy: { scannedAt: "desc" },
    })) ?? latest;
  return (
    <>
      <h1>{t("Page 360")}</h1>
      <p>{page.normalizedUrl}</p>
      <HistoricalUrls pageId={id} n={n} searchPeriod={q.searchPeriod}/>
      <PeriodLinks path={`/pages/${id}`} n={n} />
      <h2>{t("Site Scan")}</h2>
      {latest && s?.id !== latest.id && <p role="status" className="panel">
        {t("Последняя попытка:")}{timestamp(latest.scannedAt)} · {t(latest.source)} · {t(latest.outcome)}.
        {" "}{ui(latest.error)} {t("Показаны сохранённые данные последнего успешного scan от")}{" "}{timestamp(s?.scannedAt)}.
      </p>}
      <dl className="panel">
        {Object.entries({
          Type: page.pageType,
          "Last scan": timestamp(s?.scannedAt),
          Source: s?.source,
          Outcome: s?.outcome,
          "Status code": s?.statusCode,
          Title: s?.title,
          Description: s?.description,
          H1: s?.h1,
          H2: JSON.stringify(s?.h2Json),
          Canonical: s?.canonical,
          Robots: s?.robots,
          Words: s?.wordCount,
          Language: s?.lang,
          "Internal links": s?.internalLinksCount,
          "External links": s?.externalLinksCount,
          "Structured data": JSON.stringify(s?.structuredDataJson),
          OpenGraph: JSON.stringify(s?.openGraphJson),
          "Content hash": s?.contentHash,
          "Final URL": s?.finalUrl,
          Redirects: JSON.stringify(s?.redirectsJson),
          Indexable: s?.indexable === null ? "Unknown" : String(s?.indexable),
          Error: s?.error,
        }).map(([label, value]) => (
          <div key={label}>
            <dt>{t(label)}</dt>
            <dd>{["Type", "Source", "Outcome", "Language", "Indexable", "Error"].includes(label) ? ui(String(value ?? "—")) : value ?? "—"}</dd>
          </div>
        ))}
      </dl>
      <a href={`/pages/${id}?${new URLSearchParams({...q,period:String(n),detail:"1"} as Record<string,string>)}`}>Полная история и подробности</a>
      <PageAnalytics pageId={id} n={n} />
      <SeoPagePanel pageId={id} n={n} searchPeriod={q.searchPeriod} intent={q.intent} detail={q.detail==='1'}/>
      <CommercePanel benchmarksLoaded={false} detail={q.detail==='1'} profile={prepared?.commerce} traffic={prepared?.traffic} previousTraffic={prepared?.previousTraffic} period={dataset.period} previous={dataset.previous}/>
      <section><h2>{t("Opportunities")}</h2><OpportunityCards items={opportunities} /></section>
      <section className="panel"><h2>{t("Бизнес-данные")}</h2><BusinessFacts business={business} /></section>
      <PageSeoReview pageId={id} enabled={aiAvailable()} selection={q.searchPeriod??'M3'}/>
      <section className="panel" data-scan-history>
        <h2>{t("Последние снимки сканирования")}</h2>
        {page.scanPages.map((snapshot) => (
          <p key={snapshot.id} data-snapshot>
            {snapshot.scannedAt.toLocaleString("ru-RU", {
              timeZone: "Europe/Moscow",
            })}{" "}
            · {t(snapshot.source)} · {ui(snapshot.statusCode ?? "—")} ·{" "}
            {t(snapshot.outcome)}
          </p>
        ))}
        {q.detail==='1'&&<p>История, страница {historyPage}. {historyPage>1&&<a href={`?${new URLSearchParams({...q,historyPage:String(historyPage-1)} as Record<string,string>)}`}>Назад</a>} {page.scanPages.length===20&&<a href={`?${new URLSearchParams({...q,historyPage:String(historyPage+1)} as Record<string,string>)}`}>Далее</a>}</p>}
      </section>
    </>
  );
}
