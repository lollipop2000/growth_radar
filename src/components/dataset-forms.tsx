"use client";
import { t , ui } from "@/lib/i18n/ru";

import { useActionState } from "react";
import { previewPriorityAction, priorityAction, targetScanAction, type PriorityPreviewState } from "@/app/dataset-actions";
export function PriorityForm({ initial }: { initial: PriorityPreviewState }) {
  const [preview, previewAction, previewPending] = useActionState(previewPriorityAction, initial);
  const [result, runAction, pending] = useActionState(priorityAction, { message: "" });
  return <section className="panel">
    <h2>{t("Priority Scope · default TOP 20")}</h2>
    <form action={previewAction}>
      <label>{t("Режим")}<select name="scope" defaultValue="TOP20"><option value="TOP20">{t("TOP 20")}</option><option value="TOP50">{t("TOP 50")}</option><option value="TOP100">{t("TOP 100")}</option><option value="MANUAL">{t("Manual selection")}</option></select></label>
      <label>{t("Manual selection · один normalized URL на строку")}<textarea name="manual" rows={5} placeholder={t("URL из dataset; максимум 100")} /></label>
      <button disabled={previewPending || pending}>{t("Показать выбранные URL")}</button><p role="status">{ui(preview.message)}</p>
    </form>
    <p>{t("Preview:")}{" "}{t(preview.mode)} · {preview.rows.length} {t("URL. Visits — за последние 30 полных дней; Search data — наличие импортированных строк за эти дни. Наличие visits/discovery не гарантирует текущий HTTP 200.")}</p>
    <div className="table-scroll"><table><thead><tr><th>{t("URL")}</th><th>{t("Page match status")}</th><th>{t("Page type")}</th><th>{t("Metrika visits · 30d")}</th><th>{t("Webmaster data")}</th><th>{t("Причина включения")}</th></tr></thead><tbody>
      {preview.rows.map(r => <tr key={r.url}><td>{r.url}</td><td>{t(r.matchStatus)}</td><td>{t(r.pageType)}</td><td>{r.visits.toLocaleString("ru-RU")}</td><td>{ui(r.hasSearch ? "Есть" : "Нет")}</td><td>{ui(r.inclusionReason)}</td></tr>)}
    </tbody></table></div>
    <form action={runAction}>
      <input type="hidden" name="scope" value={preview.mode}/><input type="hidden" name="urls" value={JSON.stringify(preview.rows.map(r => r.url))}/><input type="hidden" name="fingerprint" value={preview.fingerprint}/>
      <label>{t("Export period")}<select name="days" defaultValue="7"><option value="7">{t("7 days")}</option><option value="30">{t("30 days")}</option><option value="90">{t("90 days")}</option></select></label>
      <p>{t("Оценка за 7 дней:")}{" "}{preview.rows.length * 7} {t("URL-дней; минимум")}{" "}{Math.ceil(preview.rows.length * 7 / 100)} {t("суток при полной бесплатной квоте 100/сутки. Готовые данные не вычитаются из оценки повторного Initial.")}</p>
      <div className="buttons"><button name="action" value="SAVE" disabled={pending || previewPending || !preview.rows.length}>{t("Сохранить выбор без export")}</button><button name="action" value="INITIAL" disabled={pending || previewPending || !preview.rows.length}>{t("Запустить Priority export")}</button><button name="action" value="INCREMENTAL" disabled={pending || previewPending || !preview.rows.length}>{t("Priority incremental")}</button></div>
      <p role="status">{ui(result.message)}</p>
    </form>
  </section>;
}
export function TargetScanForm() {
  const [result, action, pending] = useActionState(targetScanAction, { message: "" });
  return <form className="panel" action={action}><h2>{t("Scan top unmatched URLs")}</h2><p>{t("По visits за 30 дней, только выбранные URL. HTTP first + точечный Browser fallback, concurrency 1, общая пауза 3 sec, максимум 50. После завершения — rematch.")}</p>
    <label>{t("Лимит")}<select name="limit" defaultValue="10"><option value="10">{t("TOP 10")}</option><option value="20">{t("TOP 20")}</option><option value="50">{t("TOP 50")}</option></select></label>
    <button disabled={pending}>{t("Scan top unmatched URLs")}</button><p role="status">{ui(result.message)}</p></form>;
}
