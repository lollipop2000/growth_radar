import {UnifiedScannerForm} from '@/components/unified-scanner';
import {Prisma} from '@prisma/client';
import {crawlUrl} from '@/lib/scanner/url';
import { t , ui } from "@/lib/i18n/ru";
import Link from "next/link";
import { db } from "@/lib/db";
import { targetUrl } from "@/lib/health";
import { CrawlImportForm } from "@/components/scanner-forms";
import { stopScanAction } from "./actions";
import { CoverageReport } from "@/components/coverage-report";
import { coverageConfig, COVERAGE_MODE } from "@/lib/scanner/coverage";
export const dynamic = "force-dynamic";
export default async function Scanner({searchParams}:{searchParams:Promise<{preset?:string;scanId?:string;queuePage?:string;url?:string}>}) {
  const worker=await (await import('@/lib/scanner/queue-health')).scannerQueueHealth();
  const q=await searchParams,baseUrl=await targetUrl();
  const scans = await db.scan.findMany({
      where:{site:{baseUrl}},
      take: 30,
      orderBy: { startedAt: "desc" },
      select:{id:true,startedAt:true,finishedAt:true,mode:true,status:true,lastError:true,pagesDiscovered:true,pagesScanned:true,errorsCount:true,site:{select:{name:true,baseUrl:true}}},
    });
  // Read only compact Search scope metadata, not entire historical coverage queues.
  const searchScopes=scans.length?await db.$queryRaw<{id:string;source:string;scope:string;batch:string;count:number}[]>(Prisma.sql`
    SELECT id, "configJson"->'searchTargeted'->>'source' AS source,
      "configJson"->'searchTargeted'->>'scope' AS scope,
      "configJson"->'searchTargeted'->>'batch' AS batch,
      jsonb_array_length(CASE WHEN jsonb_typeof("configJson"->'searchTargeted'->'selected')='array'
        THEN "configJson"->'searchTargeted'->'selected' ELSE '[]'::jsonb END) AS count
    FROM "Scan" WHERE id IN (${Prisma.join(scans.map(s=>s.id))}) AND "configJson"->'searchTargeted' IS NOT NULL
  `):[];
  
  const latestCoverage = await db.scan.findFirst({ where: { mode: COVERAGE_MODE, site: { baseUrl },...(q.scanId?{id:q.scanId}:{}) }, orderBy: { startedAt: "desc" } });
  return (
    <>
      <p className="eyebrow">{t("SITE SCANNER")}</p>
      <h1>{t("Site Scanner")}</h1>
      <p className="muted">
        {t("Только чтение. Сканирование выполняет отдельный worker; обновите страницу, чтобы увидеть прогресс.")}</p>
      <Link className="cta" href="/scanner">
        {t("Обновить статус")}</Link>
      <UnifiedScannerForm baseUrl={baseUrl} preset={q.preset} initialUrl={q.url?crawlUrl(q.url,baseUrl)??undefined:undefined}/>
      {latestCoverage && coverageConfig(latestCoverage.configJson) && <CoverageReport id={latestCoverage.id} status={latestCoverage.status} heartbeatAt={latestCoverage.heartbeatAt} coverage={coverageConfig(latestCoverage.configJson)!} queuePage={Number(q.queuePage)||1}/>}
      <CrawlImportForm />
      <section className="panel">
        <h2>{t("История сканирований")}</h2>
        {!scans.length ? (
          <p>{t("Сканирований ещё нет.")}</p>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>{t("Начало / длительность")}</th>
                  <th>{t("Режим / статус")}</th>
                  <th>{t("Discovered")}</th>
                  <th>{t("Scanned")}</th>
                  <th>{t("Failed")}</th>
                  <th>{t("Действия")}</th>
                </tr>
              </thead>
              <tbody>
                {scans.map((scan) => (
                  <tr key={scan.id}>
                    <td>
                      {scan.startedAt.toLocaleString("ru-RU", {
                        timeZone: "Europe/Moscow",
                      })}
                      <br />
                      {Math.round(
                        ((scan.finishedAt?.getTime() ?? Date.now()) -
                          scan.startedAt.getTime()) /
                          1000,
                      )}{" "}
                      {t("sec")}</td>
                    <td>
                      <p>
                        {scan.site.name} · {scan.site.baseUrl}
                      </p>
                      <Link href={"/scanner/" + scan.id}>
                        {t(scan.mode)} · {t(scan.status)}
                      </Link>
                      {searchScopes.filter(s=>s.id===scan.id).map(s=><p key={s.id} data-search-scan-scope>{s.source==='SEO_RESCAN'?'Search rescan':s.source==='TEST_ONE'?'Test One':'Несопоставленные Search URL'} · {s.scope.replace('TOP','TOP ')} · пачка {s.batch} · только {s.count} URL из preview, без обхода ссылок сайта</p>)}
                      {scan.lastError && <p>{ui(scan.lastError)}</p>}
                      {scan.status==='PENDING'&&<p role='status'>{!worker.available?'Worker недоступен. npm start запускает его автоматически. Если задание не принято за 2 минуты, оно завершится с явной ошибкой при обновлении статуса.':worker.stage==='REMATCH'?'Worker пересопоставляет данные предыдущего задания; затем примет очередь.':'Worker доступен; задание ожидает освобождения очереди.'}</p>}
                    </td>
                    <td>{scan.pagesDiscovered}</td>
                    <td>{scan.pagesScanned}</td>
                    <td>{scan.errorsCount}</td>
                    <td>
                      {["PENDING", "RUNNING", "PAUSING", "STOPPING"].includes(
                        scan.status,
                      ) && (
                        <form action={stopScanAction}>
                          <input type="hidden" name="scanId" value={scan.id} />
                          <button>{t("Stop scan")}</button>
                        </form>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
