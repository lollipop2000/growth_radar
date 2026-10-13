"use client";
import { t , ui } from "@/lib/i18n/ru";

import { useActionState, useState } from "react";
import { startScanAction, importCrawlAction } from "@/app/scanner/actions";
export function ScanForm({ baseUrl }: { baseUrl: string }) {
  const [mode, setMode] = useState("HTTP"),
    [httpConcurrency, setHttpConcurrency] = useState("1"),
    [state, action, pending] = useActionState(startScanAction, { message: "" });
  return (
    <form action={action} className="panel">
      <h2>{t("Запуск сканирования")}</h2>
      <label htmlFor="mode">{t("Режим")}</label>
      <select
        id="mode"
        name="mode"
        value={mode}
        onChange={(e) => setMode(e.target.value)}
      >
        <option value="HTTP">{t("HTTP с browser fallback")}</option>
        <option value="BROWSER">{t("Browser Scan")}</option>
      </select>
      <div className="form-grid">
        <div>
          <label htmlFor="maxPages">{t("Max Pages (1–50)")}</label>
          <input
            id="maxPages"
            name="maxPages"
            type="number"
            min="1"
            max="50"
            defaultValue="50"
            required
          />
        </div>
        <div>
          <label htmlFor="concurrency">{t("Concurrency")}</label>
          <select
            name="concurrency"
            id="concurrency"
            disabled={mode === "BROWSER"}
            value={mode === "BROWSER" ? "1" : httpConcurrency}
            onChange={(event) => setHttpConcurrency(event.target.value)}
          >
            <option value="1">1</option>
            <option value="2">2</option>
          </select>
          {mode === "BROWSER" && <p>{t("Browser: всегда 1.")}</p>}
        </div>
        <div>
          <label htmlFor="delayMs">{t("Delay (ms)")}</label>
          <input
            key={mode}
            id="delayMs"
            name="delayMs"
            type="number"
            min={mode === "BROWSER" ? 1000 : 500}
            max={60000}
            defaultValue={3000}
            required
          />
        </div>
      </div>
      <p className="muted">
        {t("Общая пауза HTTP/Browser по умолчанию 3 sec, максимум 60 sec. HTTP timeout 15 sec; Browser timeout 20 sec, ожидание паузы не входит в timeout. При WAF/challenge браузер останавливается. Первое acceptance ограничено 50 страницами.")}</p>
      <label htmlFor="seeds">{t("Seed URL — по одному на строку")}</label>
      <textarea id="seeds" name="seeds" defaultValue={baseUrl} rows={3} />
      <label htmlFor="excludes">{t("Дополнительные exclude prefixes")}</label>
      <textarea id="excludes" name="excludes" placeholder={t("/private")} rows={2} />
      <label className="checkbox">
        <input name="browserFallback" type="checkbox" defaultChecked /> {t("Browser fallback для 403/challenge, недоступного HTTP или страницы без читаемого HTML")}</label>
      <div className="buttons">
        <button name="action" value="full" disabled={pending}>
          {t("Start full scan")}</button>
        <button name="action" value="single" disabled={pending}>
          {t("Scan one URL")}</button>
      </div>
      <p aria-live="polite">{ui(state.message)}</p>
    </form>
  );
}
export function CrawlImportForm() {
  const [state, action, pending] = useActionState(importCrawlAction, {
    message: "",
  });
  return (
    <form action={action} className="panel">
      <h2>{t("Excel Crawl Import")}</h2>
      <p className="muted">
        {t("Альтернатива, если WAF или сеть не позволяют читать сайт. XLSX или UTF-8 CSV; до 5 MB и 50 строк. Данные попадают в те же Page / ScanPage.")}</p>
      <p>
        {t("Колонки: URL, Status Code, Title, Meta Description, H1, H2, Canonical, Robots, Word Count.")}</p>
      <label htmlFor="file">{t("Файл crawl-данных")}</label>
      <details><summary>{t("Техническая схема колонок файла")}</summary><code>URL, Status Code, Title, Meta Description, H1, H2, Canonical, Robots, Word Count</code></details>
      <input type="file" id="file" name="file" accept=".xlsx,.csv" required />
      <button disabled={pending}>
        {ui(pending ? "Импортируем…" : t("Import crawl data"))}
      </button>
      <div aria-live="polite">
        <p>{ui(state.message)}</p>
        {state.errors?.map((error) => (
          <p key={error}>{ui(error)}</p>
        ))}
      </div>
    </form>
  );
}
