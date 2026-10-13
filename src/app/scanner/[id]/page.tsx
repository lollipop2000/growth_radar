import { t , ui } from "@/lib/i18n/ru";
import { db } from "@/lib/db";
import { notFound } from "next/navigation";
import { Diagnostic } from "@/components/traffic-diagnostic";
import type { TargetDiagnostic } from "@/lib/yandex/targeted";
import { coverageConfig } from "@/lib/scanner/coverage";
import { CoverageReport } from "@/components/coverage-report";
import { redactUrl } from "@/lib/scanner/diagnostics";
import {observedRedirect,redirectHops} from '@/lib/scanner/redirects';
export const dynamic = "force-dynamic";
export default async function ScanDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const scan = await db.scan.findUnique({
    where: { id },
    include: {
      site: true,
      pages: { include: { page: true }, orderBy: { scannedAt: "asc" } },
    },
  });
  if (!scan) notFound();
  return (
    <>
      <h1>{ui(scan.mode === "METRIKA_COVERAGE" ? "Metrika Coverage Scan" : "Scan · " + scan.mode)}</h1>
      <p>{scan.site.name} · {scan.site.baseUrl}</p>
      <p>
        {t(scan.status)} · {scan.pagesScanned}/{scan.pagesDiscovered} {t("· ошибок:")}{" "}
        {scan.errorsCount}
      </p>
      {scan.lastError && <p>{ui(scan.lastError)}</p>}
      {coverageConfig(scan.configJson) && <CoverageReport id={scan.id} status={scan.status} heartbeatAt={scan.heartbeatAt} coverage={coverageConfig(scan.configJson)!} manage={false}/>}
      {(scan.configJson as { targeted?: TargetDiagnostic }).targeted && <Diagnostic target={(scan.configJson as { targeted: TargetDiagnostic }).targeted}/>}
      <section className="panel">
        <h2>{t("Discovery / import errors")}</h2>
        {(Array.isArray(scan.discoveryErrorsJson)
          ? scan.discoveryErrorsJson
          : []
        ).map((error, i) => (
          <p key={i}>{String(error)}</p>
        ))}
      </section>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>{t("URL")}</th>
              <th>{t("Source")}</th>
              <th>{t("HTTP → final")}</th>
              <th>{t("Outcome")}</th>
              <th>{t("Error")}</th>
            </tr>
          </thead>
          <tbody>
            {scan.pages.map((page) => (
              <tr key={page.id}>
                <td>{redactUrl(page.requestedUrl ?? page.page.url)}{observedRedirect(page,scan.site.baseUrl)&&<p data-resolved-redirect>RESOLVED_REDIRECT · {redirectHops(page.redirectsJson)[0]?.statusCode??'Redirect status unknown'} → <a href={'/pages/'+page.pageId}>{redactUrl(page.finalUrl??page.page.url)}</a></p>}</td>
                <td>{t(page.source)}</td>
                <td>
                  {page.httpStatusCode ?? "—"} → {ui(page.statusCode ?? "—")}
                </td>
                <td>{t(page.outcome)}</td>
                <td>{page.error ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
