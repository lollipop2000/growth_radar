import { BrowserReader } from "./browser";
import { discover, robotsAllowed } from "./discovery";
import { Pacer, readHttp } from "./http";
import { crawlUrl, normalizeUrl } from "./url";
import { emptyResult, parseHtml, type PageResult } from "./model";
import type { ScanOptions } from "./options";
import { attempt, type PageDiagnostics } from "./diagnostics";
import {failureCode} from './failures';
export type ScanSummary = {
  discovered: number;
  scanned: number;
  errors: number;
  discoveryErrors: string[];
  blocked: boolean;
  browserUnavailable: boolean;
  authRequired: boolean;
};
export async function crawl(
  base: string,
  options: ScanOptions,
  signal: AbortSignal,
  onPage: (page: PageResult) => Promise<void>,
  onProgress: (summary: ScanSummary) => Promise<void>,
  browserReader = new BrowserReader(),
): Promise<ScanSummary> {
  const summary: ScanSummary = {
    discovered: 0,
    scanned: 0,
    errors: 0,
    discoveryErrors: [],
    blocked: false,
    browserUnavailable: false,
    authRequired: false,
  };
  // One queue for discovery, HTTP and Browser fallback: switching adapters
  // must not cause a second request immediately after an HTTP rejection.
  const httpPacer = new Pacer(Math.max(options.delayMs, options.browserFallback || options.mode === "BROWSER" ? 1000 : 500)),
    browserPacer = httpPacer;
  const queue: string[] = [],
    seen = new Set<string>(),
    resolved = new Set<string>();
  let browserDisabled = false;
  const browserRead = (url: string) => {
    const task = browserPacer.run(signal, async () => {
      if (browserDisabled)
        return {
          html: "",
          finalUrl: url,
          statusCode: null,
          contentType: null,
          responseTimeMs: 0,
          outcome: summary.blocked
            ? summary.authRequired
              ? ("AUTH_REQUIRED" as const)
              : ("BLOCKED_BY_WAF" as const)
            : ("ERROR" as const),
          error:
            "Browser остановлен после недоступной страницы. Используйте Excel Crawl Import.",
          redirects: [],
        };
      return browserReader.read(url, base, signal, options.excludes);
    });
    return task;
  };
  function enqueue(url: string, rules: Parameters<typeof robotsAllowed>[1]) {
    const clean = crawlUrl(url, base, options.excludes);
    const identity = clean ? normalizeUrl(clean) : null;
    if (clean && identity && seen.has(identity) && robotsAllowed(clean, rules)) {
      const index = queue.findIndex(queued => normalizeUrl(queued) === identity);
      if (index >= 0 && new URL(clean).pathname.endsWith("/") && !new URL(queue[index]).pathname.endsWith("/")) queue[index] = clean;
    }
    if (
      clean &&
      !seen.has(identity!) &&
      !resolved.has(identity!) &&
      seen.size < options.maxPages &&
      robotsAllowed(clean, rules)
    ) {
      seen.add(identity!);
      queue.push(clean);
      summary.discovered = seen.size;
    }
  }
  try {
    const discovery = options.single
      ? { urls: [], rules: [], errors: [] }
      : await discover(
          base,
          options.maxPages,
          signal,
          httpPacer,
          options.excludes,
          options.seedOnly,
        );
    summary.discoveryErrors = discovery.errors;
    for (const url of discovery.urls) enqueue(url, discovery.rules);
    for (const url of options.seeds.length ? options.seeds : [base])
      enqueue(url, discovery.rules);
    if (!queue.length)
      summary.discoveryErrors.push(
        "Нет разрешённых URL; проверьте robots.txt, seeds и excludes.",
      );
    await onProgress(summary);
    while (
      queue.length &&
      summary.scanned < options.maxPages &&
      !signal.aborted &&
      (options.continueOnError || !summary.blocked) &&
      (options.continueOnError || !summary.browserUnavailable)
    ) {
      while (queue.length && resolved.has(normalizeUrl(queue[0]))) queue.shift();
      if (!queue.length) break;
      const batch = queue.splice(
        0,
        Math.min(options.concurrency, options.maxPages - summary.scanned),
      );
      let delivery = Promise.resolve();
      const results = await Promise.all(
        batch.map(async (url) => {
          const preceding = delivery;
          let release!: () => void;
          delivery = new Promise<void>(resolve => { release = resolve; });
          let persisting=false;
          const deliver = async (result: { page: PageResult; links: string[] }) => {
            // Coverage persists each completed result in queue order immediately,
            // so the WAF guard can abort another URL still waiting in its pacer.
            if (options.continueOnError) {
              persisting=true;
              await preceding;
              if (!signal.aborted) {
                await onPage(result.page);
                summary.scanned++;
                if (result.page.outcome !== "OK") summary.errors++;
                resolved.add(normalizeUrl(result.page.finalUrl));
              }
              persisting=false;
            }
            return result;
          };
          try {
          const started = performance.now();
          const diagnostics: PageDiagnostics = { mode: options.mode === "BROWSER" ? "BROWSER_ONLY" : options.browserFallback ? "HTTP_BROWSER" : "HTTP_ONLY", elapsedMs: 0, classification: "PENDING" };
          let page = emptyResult(
              url,
              options.mode === "BROWSER" ? "BROWSER" : "HTTP",
            ),
            html = "";
          let fallback = options.mode === "BROWSER";
          if (options.mode === "HTTP") {
            const response = await readHttp(
              url,
              base,
              signal,
              httpPacer,
              options.excludes,
              options.timeoutMs,
            );
            page = {
              ...page,
              finalUrl: response.finalUrl,
              statusCode: response.statusCode,
              httpStatusCode: response.statusCode,
              responseTimeMs: response.responseTimeMs,
              contentType: response.contentType,
              contentLength: response.contentLength,
              redirectsJson: response.redirects,
              redirectHops: response.redirectHops,
              outcome: response.outcome,
              error: response.error,
            };
            diagnostics.http = attempt(response);
            html = response.contentType?.includes("text/html")
              ? response.body
              : "";
            const shell =
              html &&
              /<script/i.test(html) &&
              parseHtml(html, response.finalUrl, base, options.excludes).fields
                .wordCount! < 5;
            fallback =
              options.browserFallback &&
              !browserDisabled &&
              (response.outcome === "BLOCKED_BY_WAF" ||
                (response.statusCode === null &&
                  response.outcome === "ERROR") ||
                Boolean(shell));
          }
          if (fallback && !browserDisabled && !signal.aborted) {
            const httpStatusCode = page.httpStatusCode,
              httpTime = page.responseTimeMs ?? 0;
            const response = await browserRead(url);
            diagnostics.browser = attempt(response);
            page = {
              ...page,
              source: "BROWSER",
              finalUrl: response.finalUrl,
              statusCode: response.statusCode,
              httpStatusCode,
              responseTimeMs: httpTime + response.responseTimeMs,
              redirectsJson: response.redirects,
              redirectHops: response.redirectHops,
              contentType: response.contentType,
              contentLength: Buffer.byteLength(response.html),
              outcome: response.outcome,
              error: response.error,
            };
            if (!options.continueOnError && httpStatusCode === 403 && response.outcome === "ERROR" && response.statusCode===null) {
              page.outcome = "BLOCKED_BY_WAF";
              page.error = "HTTP: BLOCKED_BY_WAF. " + response.error;
            }
            html = response.html;
            if (
              page.outcome === "BLOCKED_BY_WAF" ||
              page.outcome === "AUTH_REQUIRED"
            ) {
              summary.blocked = true;
              summary.authRequired = page.outcome === "AUTH_REQUIRED";
              browserDisabled = !options.continueOnError;
            } else if (
              response.outcome === "ERROR" &&
              response.statusCode === null && /CONFIGURATION_ERROR/.test(response.error??'')
            ) {
              browserDisabled = !options.continueOnError;
              summary.browserUnavailable = true;
            }
          }
          if(!fallback&&['BLOCKED_BY_WAF','AUTH_REQUIRED'].includes(page.outcome)){summary.blocked=true;summary.authRequired=page.outcome==='AUTH_REQUIRED';}
          diagnostics.elapsedMs = Math.round(performance.now() - started);
          diagnostics.classification = (diagnostics.browser ?? diagnostics.http)?.classification ?? page.outcome;
          page.diagnostics = diagnostics;
          if (
            html &&
            !["BLOCKED_BY_WAF", "AUTH_REQUIRED"].includes(page.outcome)
          ) {
            const parsed = parseHtml(
              html,
              page.finalUrl,
              base,
              options.excludes,
            );
            page = { ...page, ...parsed.fields };
            page.indexable = Boolean(
              page.indexable &&
              page.statusCode &&
              page.statusCode < 300 &&
              (!page.canonical ||
                page.canonical === normalizeUrl(page.finalUrl)),
            );
            return await deliver({ page, links: parsed.links });
          }
          return await deliver({ page, links: [] as string[] });
          } catch(error){
            if(persisting)throw error;
            const page={...emptyResult(url,options.mode==='BROWSER'?'BROWSER' as const:'HTTP' as const),outcome:'ERROR' as const,error:'PAGE_PROCESSING_ERROR: '+failureCode(error)};
            return await deliver({page,links:[]});
          } finally { release(); }
        }),
      );
      for (const { page, links } of results) {
        if (options.continueOnError) break;
        if (signal.aborted) break;
        await onPage(page);
        summary.scanned++;
        if (page.outcome !== "OK") summary.errors++;
        resolved.add(normalizeUrl(page.finalUrl));
        if (!options.single && !options.seedOnly)
          for (const link of links) enqueue(link, discovery.rules);
      }
      await onProgress(summary);
    }
    return summary;
  } finally {
    await browserReader.close().catch(()=>{summary.discoveryErrors.push('BROWSER_CLEANUP_ERROR: результаты страниц сохранены.');});
  }
}
