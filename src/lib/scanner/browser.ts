import { chromium, type Browser } from "playwright";
export const DEFAULT_EXCLUDES = [
  "/admin",
  "/login",
  "/logout",
  "/cart",
  "/checkout",
  "/api",
  "/basket",
  "/account",
  "/auth",
];
export function allowedUrl(
  value: string,
  base: string,
  excludes = DEFAULT_EXCLUDES,
): boolean {
  try {
    const url = new URL(value, base),
      target = new URL(base);
    const path = decodeURIComponent(url.pathname).toLowerCase();
    return (
      ["http:", "https:"].includes(url.protocol) &&
      url.origin === target.origin &&
      !url.username &&
      !url.password &&
      !/(?:^|\/)(?:admin|login|logout|cart|checkout|api|basket|account|auth)(?:\/|\.|;|$)/i.test(
        path,
      ) &&
      !excludes.some(
        (prefix) =>
          path === prefix.toLowerCase() ||
          path.startsWith(prefix.toLowerCase() + "/"),
      ) &&
      !Array.from(url.searchParams.keys()).some((key) =>
        /^(token|password|session|access_token|auth|action|csrf[_-]?token|secret|cookie)$/i.test(key),
      )
    );
  } catch {
    return false;
  }
}
export function isChallenge(html: string): boolean {
  return (
    /<title[^>]*>\s*(just a moment|access denied|checking your browser|captcha|security check|доступ запрещ|проверка браузера)/i.test(
      html,
    ) ||
    /id=["'](?:cf-chl|challenge-form|captcha-container)|\/cdn-cgi\/challenge-platform\/|<iframe[^>]+(?:recaptcha|hcaptcha)/i.test(
      html,
    )
  );
}
export type BrowserResult = {
  timeoutStage?: import("./diagnostics").TimeoutStage | null;
  html: string;
  finalUrl: string;
  statusCode: number | null;
  contentType: string | null;
  responseTimeMs: number;
  outcome: "OK" | "BLOCKED_BY_WAF" | "AUTH_REQUIRED" | "ERROR";
  error: string | null;
  redirects: string[];
  redirectHops?: import('./redirects').RedirectHop[];
};
export class BrowserReader {
  private browser?: Browser;
  async close() {
    await this.browser?.close();
    this.browser = undefined;
  }
  async read(
    url: string,
    base: string,
    signal: AbortSignal,
    excludes = DEFAULT_EXCLUDES,
  ): Promise<BrowserResult> {
    const started = performance.now();
    const result: BrowserResult = {
      html: "",
      finalUrl: url,
      statusCode: null,
      contentType: null,
      responseTimeMs: 0,
      outcome: "ERROR",
      error: null,
      redirects: [],
    };
    if (!allowedUrl(url, base, excludes))
      return {
        ...result,
        error: "URL за пределами разрешённого сайта или служебный URL.",
      };
    if (signal.aborted)
      return { ...result, error: "Сканирование остановлено." };
    let stage: import("./diagnostics").TimeoutStage = "BROWSER_LAUNCH";
    try {
      this.browser ??= await chromium.launch({
        headless: true,
        timeout: 20000,
      });
      stage = "BROWSER_CONTEXT";
      const context = await this.browser.newContext({
        serviceWorkers: "block",
        acceptDownloads: false,
        permissions: [],
      });
      const abort = () => {
        void context.close().catch(() => {});
      };
      signal.addEventListener("abort", abort, { once: true });
      const remaining = Math.max(1, 20000 - (performance.now() - started));
      const deadline = setTimeout(abort, remaining);
      let requests = 0,
        navigations = 0;
      try {
        signal.throwIfAborted();
        await context.route("**/*", async (route) => {
          const request = route.request();
          if (
            ++requests > 100 ||
            !["GET", "HEAD"].includes(request.method()) ||
            !allowedUrl(request.url(), base, excludes) ||
            ["image", "media", "font"].includes(request.resourceType()) ||
            (request.isNavigationRequest() && ++navigations > 6)
          )
            await route.abort();
          else await route.continue();
        });
        await context.routeWebSocket("**/*", (socket) => socket.close());
        const page = await context.newPage();
        // Retain an observed navigation status even if DOMContentLoaded times out.
        page.on("response", response => {
          const request = response.request();
          if (request.isNavigationRequest() && request.frame() === page.mainFrame()) {
            result.statusCode = response.status();
            result.finalUrl = response.url();
            result.contentType = response.headers()["content-type"] ?? null;
            const location=response.headers()['location'];
            if([301,302,303,307,308].includes(response.status())&&location)(result.redirectHops??=[]).push({sourceUrl:response.url(),targetUrl:new URL(location,response.url()).href,statusCode:response.status()});
          }
        });
        page.on("popup", (popup) => {
          void popup.close();
        });
        stage = "NAVIGATION";
        const response = await page.goto(url, {
          waitUntil: "domcontentloaded",
          timeout: Math.max(1, 20000 - (performance.now() - started)),
        });
        result.finalUrl = page.url();
        result.statusCode = response?.status() ?? null;
        result.contentType = response?.headers()["content-type"] ?? null;
        let request = response?.request();
        while (request?.redirectedFrom()) {
          request = request.redirectedFrom()!;
          result.redirects.unshift(request.url());
        }
        if (!allowedUrl(result.finalUrl, base, excludes))
          throw new Error("BOUNDARY");
        if (![401,403].includes(result.statusCode ?? 0) && !result.contentType?.includes("text/html"))
          throw new Error("NOT_HTML");
        stage = "CONTENT";
        result.html = await page.content();
        if (Buffer.byteLength(result.html) > 2_000_000)
          throw new Error("BODY_LIMIT");
        if (result.statusCode === 403 || isChallenge(result.html)) {
          result.outcome = "BLOCKED_BY_WAF";
          result.error =
            "Browser Scan заблокирован WAF/challenge. Используйте Excel Crawl Import.";
          result.html = "";
        } else if (
          result.statusCode === 401 ||
          /<title[^>]*>\s*(login|sign in|авторизация|вход в аккаунт)/i.test(
            result.html,
          )
        ) {
          result.outcome = "AUTH_REQUIRED";
          result.error =
            "Страница требует авторизацию. Автоматическая авторизация не выполняется.";
          result.html = "";
        } else if (result.statusCode && result.statusCode >= 400) {
          result.outcome = "ERROR";
          result.error = `HTTP ${result.statusCode}`;
        } else result.outcome = "OK";
      } finally {
        clearTimeout(deadline);
        signal.removeEventListener("abort", abort);
        await context.close().catch(() => {});
      }
    } catch (error) {
      result.error = signal.aborted
        ? "Сканирование остановлено."
        : error instanceof Error && /Executable doesn't exist|browser executable|Failed to launch.*browser/i.test(error.message)
          ? "Browser CONFIGURATION_ERROR: установите Chromium для Playwright."
        : (error instanceof Error && error.name === "TimeoutError") || performance.now() - started >= 19500
          ? "Browser TIMEOUT: страница не получена за 20 секунд."
          : "Browser NETWORK_ERROR: проверьте сеть, TLS и установку Chromium.";
      result.html = "";
      result.outcome = "ERROR";
      if (result.error.includes("TIMEOUT")) result.timeoutStage = stage;
      if (!signal.aborted && result.statusCode === 403) {
        result.outcome = "BLOCKED_BY_WAF";
        result.error = "Browser HTTP 403: BLOCKED_BY_WAF. CAPTCHA/challenge не обходятся.";
      }
    }
    result.responseTimeMs = Math.round(performance.now() - started);
    return result;
  }
}
