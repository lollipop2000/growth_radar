import { t } from "@/lib/i18n/ru";
import { format, Metrics, timestamp } from "./analytics";
import type { trafficCoverage } from "@/lib/yandex/dataset";
import type { TargetDiagnostic } from "@/lib/yandex/targeted";
export function TrafficCoverage({ value }: { value: ReturnType<typeof trafficCoverage> }) {
  return <section className="panel"><h2>{t("Matched traffic coverage")}</h2><Metrics values={{
    "Matched landing URLs": value.matchedUrls, "All landing URLs": value.totalUrls,
    "Unique unmatched URLs": value.unmatchedUrls, "Matched visits": value.matchedVisits,
    "All visits": value.totalVisits, "Traffic coverage %": value.coverage,
  }}/><p>{t("Matched landing URLs:")}{" "}{value.matchedUrls}/{value.totalUrls} {t("· matched visits:")}{" "}{format(value.matchedVisits)}/{format(value.totalVisits)}{t(". Primary quality metric — доля visits. Unique URL считается по общей нормализации Scanner; raw URL сохраняются.")}</p></section>;
}
export function Diagnostic({ target }: { target: TargetDiagnostic }) {
  return <section className="panel"><h2>{t("Diagnostic report · Before / After")}</h2><p>{target.dates.from} — {target.dates.to} · {target.selected.length} {t("выбранных URL. Один фиксированный cohort visits, captured")}{" "}{timestamp(target.capturedAt)} {t("МСК. After:")}{" "}{target.rematchedAt ? timestamp(target.rematchedAt) + " МСК" : "ожидает завершения scan/rematch"}.</p>
    <table><thead><tr><th>{t("Показатель")}</th><th>{t("Before")}</th><th>{t("After")}</th></tr></thead><tbody>
      {(["matchedUrls","unmatchedUrls","matchedVisits","unmatchedVisits","coverage"] as const).map(key => <tr key={key}><td>{t({matchedUrls:"Unique matched URLs",unmatchedUrls:"Unique unmatched URLs",matchedVisits:"Matched visits",unmatchedVisits:"Unmatched visits",coverage:"Traffic coverage %"}[key])}</td><td>{format(target.before[key],key === "coverage" ? 2 : 0)}</td><td>{target.after ? format(target.after[key],key === "coverage" ? 2 : 0) : "—"}</td></tr>)}
    </tbody></table><details><summary>{t("Выбранные URL")}</summary><ul>{target.selected.map(url => <li key={url}>{url}</li>)}</ul></details></section>;
}
