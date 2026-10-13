import { setTimeout as delay } from "node:timers/promises";
import { networkError } from "../connection";
import { allowedUrl, DEFAULT_EXCLUDES, isChallenge } from "./browser";
export class Pacer {
  private tail: Promise<unknown> = Promise.resolve();
  private nextAt = 0;
  constructor(private delayMs: number) {}
  run<T>(signal: AbortSignal, operation: () => Promise<T>): Promise<T> {
    const task = this.tail.then(async () => {
      signal.throwIfAborted();
      while (this.nextAt > Date.now())
        await delay(this.nextAt - Date.now(), undefined, { signal });
      try {
        return await operation();
      } finally {
        this.nextAt = Date.now() + this.delayMs;
      }
    });
    this.tail = task.catch(() => {});
    return task;
  }
  cooldown() { this.nextAt = Math.max(this.nextAt, Date.now() + this.delayMs); }
}
export type HttpResult = {
  timeoutStage?: import("./diagnostics").TimeoutStage | null;
  body: string;
  finalUrl: string;
  statusCode: number | null;
  contentType: string | null;
  contentLength: number;
  responseTimeMs: number;
  redirects: string[];
  redirectHops?: import('./redirects').RedirectHop[];
  outcome: "OK" | "BLOCKED_BY_WAF" | "AUTH_REQUIRED" | "ERROR";
  error: string | null;
};
export async function readHttp(
  url: string,
  base: string,
  signal: AbortSignal,
  pacer: Pacer,
  excludes = DEFAULT_EXCLUDES,
  timeoutMs = 15000,
): Promise<HttpResult> {
  const started = performance.now(),
    result: HttpResult = {
      body: "",
      finalUrl: url,
      statusCode: null,
      contentType: null,
      contentLength: 0,
      responseTimeMs: 0,
      redirects: [],
      outcome: "ERROR",
      error: null,
    };
  // The network budget excludes intentional rate-limit waiting, including
  // waits before redirect hops. Otherwise a 30s delay exhausts a 15s timeout.
  let deadline = signal, remainingMs = timeoutMs, activeStarted = 0;
  let stage: import("./diagnostics").TimeoutStage = "RATE_LIMIT_WAIT";
  try {
    let current = url;
    for (let hop = 0; hop <= 5; hop++) {
      if (!allowedUrl(current, base, excludes)) throw new Error("BOUNDARY");
      stage = "RATE_LIMIT_WAIT";
      const response = await pacer.run(signal, () => {
        deadline = AbortSignal.any([signal, AbortSignal.timeout(Math.max(1, Math.ceil(remainingMs)))]);
        activeStarted = performance.now();
        stage = "HEADERS";
        return fetch(current, {
          redirect: "manual",
          signal: deadline,
          cache: "no-store",
          headers: {
            "User-Agent": "G-market-Growth-Radar/0.2 (read-only scanner)",
          },
        }); },
      );
      result.finalUrl = current;
      result.statusCode = response.status;
      result.contentType = response.headers.get("content-type");
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        await response.body?.cancel();
        remainingMs -= performance.now() - activeStarted;
        pacer.cooldown();
        if (remainingMs <= 0) { result.timeoutStage = "HEADERS"; throw new DOMException("HTTP TIMEOUT", "TimeoutError"); }
        const location = response.headers.get("location");
        if (!location || hop === 5) throw new Error("REDIRECT_LIMIT");
        result.redirects.push(current);
        const target=new URL(location,current).href;
        (result.redirectHops??=[]).push({sourceUrl:current,targetUrl:target,statusCode:response.status});
        current = target;
        continue;
      }
      if (response.status === 403) {
        result.outcome = "BLOCKED_BY_WAF";
        result.error = "HTTP 403: BLOCKED_BY_WAF.";
        await response.body?.cancel();
        break;
      }
      if (response.status === 401) {
        result.outcome = "AUTH_REQUIRED";
        result.error = "HTTP 401: требуется авторизация.";
        await response.body?.cancel();
        break;
      }
      stage = "BODY";
      const chunks: Uint8Array[] = [],
        reader = response.body?.getReader();
      if (reader) {
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            result.contentLength += value.byteLength;
            if (result.contentLength > 2_000_000) {
              await reader.cancel();
              throw new Error("BODY_LIMIT");
            }
            chunks.push(value);
          }
        } finally {
          reader.releaseLock();
        }
      }
      result.body = Buffer.concat(chunks).toString("utf8");
      if (isChallenge(result.body)) {
        result.body = "";
        result.outcome = "BLOCKED_BY_WAF";
        result.error = "HTTP challenge: BLOCKED_BY_WAF.";
      } else if (response.status >= 400) {
        result.outcome = "ERROR";
        result.error = `HTTP ${response.status}`;
      } else result.outcome = "OK";
      break;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    result.error = signal.aborted
      ? "Сканирование остановлено."
      : ((
          {
            BOUNDARY: "Redirect за разрешённые границы заблокирован.",
            REDIRECT_LIMIT: "Превышен лимит redirects.",
            BODY_LIMIT: "Ответ превышает 2 MB.",
          } as Record<string, string>
        )[message] ?? networkError(error));
    result.outcome = "ERROR";
    if (!signal.aborted && (deadline.aborted || result.timeoutStage)) { result.error = "HTTP TIMEOUT: истекло время ожидания."; result.timeoutStage ??= stage; }
    result.body = "";
  }
  pacer.cooldown();
  result.responseTimeMs = Math.round(performance.now() - started);
  return result;
}
