import type { Outcome, PageResult } from "./model";
export type Transport = "HTTP_BROWSER" | "BROWSER_ONLY" | "HTTP_ONLY";
export const transportLabels = { HTTP_BROWSER: "HTTP + Browser fallback", BROWSER_ONLY: "Browser only", HTTP_ONLY: "HTTP only" };
export type TimeoutStage = "RATE_LIMIT_WAIT" | "HEADERS" | "BODY" | "BROWSER_LAUNCH" | "BROWSER_CONTEXT" | "NAVIGATION" | "CONTENT";
export type Attempt = { outcome: Outcome; statusCode: number | null; elapsedMs: number; timeoutStage: TimeoutStage | null; classification: string };
export type PageDiagnostics = { mode: Transport; elapsedMs: number; http?: Attempt; browser?: Attempt; classification: string };
export function transport(value: unknown): Transport {
  if (value === undefined || value === null) return "HTTP_BROWSER";
  if (!Object.hasOwn(transportLabels, String(value))) throw new Error("Неизвестный режим транспорта.");
  return value as Transport;
}
export function attempt(r: { outcome: Outcome; statusCode: number | null; responseTimeMs: number; error: string | null; timeoutStage?: TimeoutStage | null }): Attempt {
  const classification = r.outcome !== "ERROR" ? r.outcome : /TIMEOUT|время ожидания|за 20 секунд/i.test(r.error ?? "") ? "TIMEOUT" : /CONFIGURATION_ERROR/.test(r.error ?? "") ? "CONFIGURATION_ERROR" : r.statusCode && r.statusCode >= 400 ? "HTTP_ERROR" : "NETWORK_ERROR";
  return { outcome: r.outcome, statusCode: r.statusCode, elapsedMs: r.responseTimeMs, timeoutStage: r.timeoutStage ?? null, classification };
}
// Only unresolved, confirmed WAF evidence counts. A successful fallback resets the streak.
export function unresolvedWaf(p: PageResult) {
  if (p.outcome === "OK") return false;
  const browser=p.diagnostics?.browser;
  if(browser?.outcome==='OK')return false;
  if(browser?.outcome==='ERROR'&&browser.statusCode!=null&&browser.statusCode>=400&&![401,403].includes(browser.statusCode))return false;
  return p.outcome === "BLOCKED_BY_WAF" || p.diagnostics?.http?.outcome === "BLOCKED_BY_WAF" || p.diagnostics?.browser?.outcome === "BLOCKED_BY_WAF";
}
export function redactUrl(value: string) {
  try { const u = new URL(value); for (const key of [...u.searchParams.keys()]) if (/token|password|session|auth|secret|cookie/i.test(key)) u.searchParams.set(key, "REDACTED"); u.username = ""; u.password = ""; return u.href; } catch { return "[invalid URL]"; }
}
