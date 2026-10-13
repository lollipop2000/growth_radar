"use client";
import { t , ui } from "@/lib/i18n/ru";

import Link from "next/link";
import { useActionState, useState } from "react";
import { previewCoverageAction, startCoverageAction, type CoveragePreviewData, type CoverageFormState } from "@/app/scanner/coverage-actions";
import { transportLabels, type Transport } from "@/lib/scanner/diagnostics";
export function CoverageForm({ initial }: { initial?: CoveragePreviewData }) {
  const [preview, previewAction, previewPending] = useActionState(previewCoverageAction, { message: "", preview: initial } as CoverageFormState);
  const [started, startAction, startPending] = useActionState(startCoverageAction, { message: "" } as CoverageFormState);
  const [period,setPeriod] = useState("30"), [scope,setScope] = useState("UNMATCHED"), [batchSize,setBatchSize] = useState("50"), [rescan,setRescan] = useState(false);
  const [mode,setMode] = useState<Transport>("HTTP_BROWSER"), [limit,setLimit] = useState("10"), [testUrl,setTestUrl] = useState("");
  const [delayMs,setDelayMs] = useState("3000");
  const p = preview.preview;
  const dirty = !p || Number(period) !== p.period || scope !== p.scope || Number(batchSize) !== p.batchSize || rescan !== p.rescanSuccessful;
  return <section className="panel"><h2>{t("Metrika Coverage Scan")}</h2>
    <p role="note"><strong>{t("Production Site Scanner должен запускаться только когда целевой интернет-магазин доступен из текущей сети. При включенном VPN сайт может быть недоступен и давать timeout.")}</strong></p>
    <form action={previewAction} onReset={event=>event.preventDefault()}><div className="form-grid">
      <label>{t("Period")}<select name="period" value={period} onChange={e=>setPeriod(e.target.value)}><option value="7">{t("7 days")}</option><option value="30">{t("30 days")}</option><option value="90">{t("90 days")}</option></select></label>
      <label>{t("Scope")}<select name="scope" value={scope} onChange={e=>setScope(e.target.value)}><option value="UNMATCHED">{t("Unmatched only")}</option><option value="ALL">{t("All Metrika URLs")}</option></select></label>
      <label>{t("Batch size")}<input name="batchSize" type="number" min="1" max="50" value={batchSize} onChange={e=>setBatchSize(e.target.value)} required/></label>
    </div><label><input name="rescanSuccessful" type="checkbox" checked={rescan} onChange={e=>setRescan(e.target.checked)}/> {t("Rescan successful URLs")}</label><p>{t("OFF: пропуск успешных snapshots за последние 7 дней. HTTP и Browser: concurrency 1, общая пауза по умолчанию 3 sec. Browser timeout 20 sec. Batch size не меняет concurrency.")}</p>
    <button disabled={previewPending}>{t("Preview scope")}</button></form>
    <p role="status">{ui(preview.message)}</p>
    {p && <><p><strong>{t("Scope для Start:")}</strong> {p.period} {t("days ·")}{" "}{t(p.scope)} {t("· Batch")}{" "}{p.batchSize} {t("· Rescan")}{" "}{ui(p.rescanSuccessful ? "ON" : "OFF")}.</p>
      <p>{t("Raw Metrika URLs:")}{" "}{p.rawUrls} {t("· normalized unique URLs:")}{" "}{p.before.totalUrls} {t("· matched:")}{" "}{p.before.matchedUrls} {t("· unmatched:")}{" "}{p.before.unmatchedUrls}.</p>
      <p>{t("Matched visits:")}{" "}{p.before.matchedVisits} {t("· unmatched visits:")}{" "}{p.before.unmatchedVisits} · <strong>{t("Traffic coverage:")}{" "}{p.before.coverage?.toLocaleString("ru-RU", {maximumFractionDigits:2}) ?? "—"}%</strong>.</p>
      <p>{t("К сканированию:")}{" "}{p.queueUrls} {t("URLs /")}{" "}{p.totalBatches} {t("batches. Исключено/уже matched/recent success:")}{" "}{p.excluded}{t(". Missing Metrika days:")}{" "}{p.missingDays}.</p>
      <form action={startAction} onReset={e=>e.preventDefault()}><input type="hidden" name="period" value={p.period}/><input type="hidden" name="scope" value={p.scope}/><input type="hidden" name="batchSize" value={p.batchSize}/><input type="hidden" name="rescanSuccessful" value={String(p.rescanSuccessful)}/>
        <div className="form-grid"><label>{t("Режим сканирования")}<select name="transport" value={mode} onChange={e=>setMode(e.target.value as Transport)}>{Object.entries(transportLabels).map(([value,label])=><option key={value} value={value}>{t(label)}</option>)}</select></label>
          <label>{t("Diagnostic Max URLs")}<input name="diagnosticLimit" type="number" min="1" max="50" required value={limit} onChange={e=>setLimit(e.target.value)}/></label>
          <label>{t("Пауза между запросами")}<select name="delayMs" value={delayMs} onChange={e=>setDelayMs(e.target.value)}>{[3,10,20,30,60].map(seconds=><option key={seconds} value={seconds*1000}>{seconds} {t("sec")}</option>)}</select></label>
          <label>{t("Тестовый URL (пусто: первый URL очереди)")}<input name="testUrl" value={testUrl} onChange={e=>setTestUrl(e.target.value)} placeholder={t("https://…")}/></label></div>
        <p>{t("Выбранный режим:")}{" "}<strong>{t(transportLabels[mode])}</strong>{t(". Diagnostic обработает не более")}{" "}{limit} {t("URL из показанного scope. Тест одного URL ограничен одной страницей; явный URL текущего сайта допускается независимо от matched/recent-success.")}</p>
        <p>{t("Общая пауза")}{" "}{Number(delayMs)/1000} {t("sec действует между HTTP, Browser fallback и пачками; ожидание паузы не расходует сетевой timeout. Browser only не отправляет HTTP-запрос страницы; robots.txt читается HTTP во всех режимах. Три неразрешённые WAF-блокировки подряд автоматически приостанавливают очередь. CAPTCHA/challenge не обходятся.")}</p>
        <div className="actions"><button name="intent" value="TEST_ONE" disabled={startPending || dirty || (!p.queueUrls && !testUrl.trim())}>{t("Test one URL")}</button>
        <button name="intent" value="DIAGNOSTIC" disabled={startPending || dirty || !p.queueUrls}>{t("Start diagnostic scan")}</button>
        <button name="intent" value="FULL" disabled={startPending || dirty || !p.queueUrls}>{t("Start Metrika Coverage Scan")}</button></div></form>{dirty && <p>{t("Настройки изменены: обновите Preview scope перед Start.")}</p>}</>}
    <p role="status">{ui(started.message)} {started.scanId && <Link href={"/scanner/" + started.scanId}>{t("Открыть progress")}</Link>}</p>
  </section>;
}
