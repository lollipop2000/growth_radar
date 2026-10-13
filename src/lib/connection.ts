import { load } from "cheerio";
export type ConnectionResult = {
  resolvedUrl: string | null;
  statusCode: number | null;
  responseTimeMs: number;
  contentType: string | null;
  sizeBytes: number;
  title: string | null;
  error: string | null;
};
export function safeUrl(value: string): URL {
  const url = new URL(value);
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search
  )
    throw new Error("INVALID_URL");
  url.hash = "";
  return url;
}
export function networkError(error: unknown): string {
  const e = error as {
    name?: string;
    code?: string;
    cause?: { code?: string };
  };
  const code = e.cause?.code ?? e.code ?? "";
  if (e.name === "TimeoutError" || e.name === "AbortError")
    return "Превышено время ожидания ответа сайта.";
  if (["UND_ERR_CONNECT_TIMEOUT", "ETIMEDOUT"].includes(code))
    return "Превышено время ожидания соединения с сайтом. Проверьте корпоративную сеть/VPN.";
  if (["ENOTFOUND", "EAI_AGAIN"].includes(code))
    return "DNS: имя сайта не удалось разрешить. Проверьте корпоративную сеть/VPN.";
  if (/CERT|TLS|SSL|SELF_SIGNED|UNABLE_TO_VERIFY/.test(code))
    return "Ошибка сертификата TLS. Настройте доверенный корпоративный CA; проверка TLS не отключается.";
  return "Не удалось подключиться к сайту. Проверьте адрес, сеть и доступность сервера.";
}
export async function testConnection(
  input: string,
  options: {
    timeoutMs?: number;
    maxBytes?: number;
    fetcher?: typeof fetch;
  } = {},
): Promise<ConnectionResult> {
  const started = performance.now();
  const result: ConnectionResult = {
    resolvedUrl: null,
    statusCode: null,
    responseTimeMs: 0,
    contentType: null,
    sizeBytes: 0,
    title: null,
    error: null,
  };
  try {
    let url = safeUrl(input);
    const signal = AbortSignal.timeout(options.timeoutMs ?? 15000);
    const fetcher = options.fetcher ?? fetch;
    let response: Response | undefined;
    for (let hops = 0; hops <= 5; hops++) {
      result.resolvedUrl = url.href;
      response = await fetcher(url, {
        redirect: "manual",
        signal,
        cache: "no-store",
        headers: { "User-Agent": "G-market-Growth-Radar/0.1 ConnectionCheck" },
      });
      if (![301, 302, 303, 307, 308].includes(response.status)) break;
      const location = response.headers.get("location");
      await response.body?.cancel();
      if (!location || hops === 5) throw new Error("REDIRECT_LIMIT");
      const next = safeUrl(new URL(location, url).href);
      if (
        next.hostname !== url.hostname ||
        (url.protocol === "https:" && next.protocol !== "https:")
      )
        throw new Error("REDIRECT_BLOCKED");
      url = next;
    }
    result.statusCode = response!.status;
    result.contentType = response!.headers.get("content-type");
    const reader = response!.body?.getReader();
    const chunks: Uint8Array[] = [];
    if (reader) {
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          result.sizeBytes += value.byteLength;
          if (result.sizeBytes > (options.maxBytes ?? 2_000_000)) {
            await reader.cancel();
            throw new Error("BODY_LIMIT");
          }
          chunks.push(value);
        }
      } finally {
        reader.releaseLock();
      }
    }
    if (result.contentType?.includes("text/html"))
      result.title =
        load(Buffer.concat(chunks))("title")
          .first()
          .text()
          .trim()
          .slice(0, 300) || null;
    if (result.statusCode === 401)
      result.error = "HTTP 401: сайт требует авторизацию.";
    else if (result.statusCode === 403)
      result.error = "HTTP 403: доступ к сайту запрещён.";
    else if (result.statusCode >= 400)
      result.error = `Сайт вернул HTTP ${result.statusCode}.`;
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    result.error =
      (
        {
          INVALID_URL:
            "Допустим HTTP(S) URL без credentials и query-параметров.",
          REDIRECT_LIMIT: "Пустой redirect или превышен лимит 5 переходов.",
          REDIRECT_BLOCKED:
            "Redirect на другой host или понижение HTTPS заблокировано.",
          BODY_LIMIT: "Размер ответа превышает лимит 2 MB.",
        } as Record<string, string>
      )[message] ?? networkError(error);
    if (result.statusCode === null) result.resolvedUrl = null;
  }
  result.responseTimeMs = Math.round(performance.now() - started);
  return result;
}
