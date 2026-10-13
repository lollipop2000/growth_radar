import "server-only";
import { setTimeout as delay } from "node:timers/promises";
import { yandexFetch } from "./transport";
export type ApiCode =
  | "NOT_CONFIGURED"
  | "INVALID_TOKEN"
  | "FORBIDDEN"
  | "COUNTER_NOT_ACCESSIBLE"
  | "HOST_NOT_ACCESSIBLE"
  | "RATE_LIMIT"
  | "TIMEOUT"
  | "NETWORK"
  | "MALFORMED_RESPONSE"
  | "API_ERROR"
  | "QUOTA_EXCEEDED";
const messages: Record<ApiCode, string> = {
  NOT_CONFIGURED: "Задайте необходимые ENV на сервере и проверьте подключение.",
  INVALID_TOKEN: "OAuth token недействителен или истёк. Обновите его в ENV.",
  FORBIDDEN:
    "API запрещает доступ. Проверьте OAuth scopes и права пользователя.",
  COUNTER_NOT_ACCESSIBLE: "Счётчик не найден или недоступен этому token.",
  HOST_NOT_ACCESSIBLE:
    "Сайт недоступен этому token или права на host не подтверждены.",
  RATE_LIMIT:
    "Достигнут rate limit API после повторов с backoff. Повторите позже.",
  TIMEOUT: "API не ответил за отведённое время. Проверьте сеть.",
  NETWORK: "Не удалось подключиться к API. Проверьте сеть и TLS.",
  MALFORMED_RESPONSE:
    "API вернул ответ неожиданного формата; данные не приняты.",
  API_ERROR: "API отклонил запрос. Проверьте параметры и доступность сервиса.",
  QUOTA_EXCEEDED:
    "Базовая квота выгрузки Вебмастера исчерпана. Задание продолжится после обновления квоты.",
};
export class ApiError extends Error {
  constructor(
    public code: ApiCode,
    public httpStatus?: number,
  ) {
    super(messages[code]);
  }
}
export function safeError(error: unknown): string {
  const dbCode = error && typeof error === "object" && "code" in error ? String(error.code) : "";
  if (["P1001", "P1002", "P2024", "P2028", "P2034"].includes(dbCode))
    return `DATABASE_${dbCode}: PostgreSQL недоступен, перегружен или транзакция прервана. Данные и checkpoint сохранены; повторите sync.`;
  return error instanceof ApiError
    ? `${error.code}: ${error.message}`
    : "SYNC_ERROR: Не удалось завершить операцию. Проверьте PostgreSQL, worker и настройки интеграции.";
}
export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new ApiError("MALFORMED_RESPONSE");
  return value as Record<string, unknown>;
}
export function text(value: unknown): string {
  if (typeof value !== "string" || value.length > 10000)
    throw new ApiError("MALFORMED_RESPONSE");
  return value;
}
export function number(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0)
    throw new ApiError("MALFORMED_RESPONSE");
  return value;
}
export function id(value: unknown): string {
  const s = String(value ?? "");
  if (!/^\d+$/.test(s)) throw new ApiError("MALFORMED_RESPONSE");
  return s;
}
export class YandexApi {
  constructor(
    private origin:
      "https://api-metrika.yandex.net" | "https://api.webmaster.yandex.net",
    private token: string,
    private fetcher: typeof fetch = yandexFetch,
    private sleeper: (ms: number) => Promise<unknown> = delay,
  ) {}
  async json(
    path: string,
    body?: unknown,
    retry = true,
  ): Promise<Record<string, unknown>> {
    if (!this.token) throw new ApiError("NOT_CONFIGURED");
    const url = new URL(path, this.origin);
    if (url.origin !== this.origin) throw new ApiError("API_ERROR");
    for (let attempt = 0; attempt < 4; attempt++) {
      let response: Response;
      try {
        response = await this.fetcher(url, {
          method: body === undefined ? "GET" : "POST",
          headers: {
            Authorization: `OAuth ${this.token}`,
            Accept: "application/json",
            ...(body === undefined
              ? {}
              : { "Content-Type": "application/json; charset=UTF-8" }),
          },
          body: body === undefined ? undefined : JSON.stringify(body),
          redirect: "error",
          signal: AbortSignal.timeout(20000),
          cache: "no-store",
        });
      } catch (e) {
        if (retry && body === undefined && attempt < 2 &&
          (e instanceof TypeError || e instanceof Error && /Timeout|Abort/.test(e.name))) {
          await this.sleeper(1000 * 2 ** attempt);
          continue;
        }
        throw new ApiError(
          e instanceof Error && /Timeout|Abort/.test(e.name)
            ? "TIMEOUT"
            : "NETWORK",
        );
      }
      if (response.status === 429 || response.status >= 500) {
        await response.body?.cancel();
        if (attempt === 3 || !retry)
          throw new ApiError(
            response.status === 429 ? "RATE_LIMIT" : "API_ERROR",
            response.status,
          );
        const retrySeconds = Number(response.headers.get("retry-after"));
        await this.sleeper(
          Math.min(
            30000,
            Math.max(
              1000 * 2 ** attempt,
              Number.isFinite(retrySeconds) ? retrySeconds * 1000 : 0,
            ),
          ),
        );
        continue;
      }
      const raw = await readBounded(response, 10 * 1024 * 1024);
      let data: Record<string, unknown>;
      try {
        data = object(JSON.parse(raw));
      } catch {
        if (response.status === 401) throw new ApiError("INVALID_TOKEN", 401);
        if (response.status === 403) throw new ApiError("FORBIDDEN", 403);
        if (response.status === 404)
          throw new ApiError(
            this.origin.includes("metrika")
              ? "COUNTER_NOT_ACCESSIBLE"
              : "HOST_NOT_ACCESSIBLE",
            404,
          );
        throw new ApiError("MALFORMED_RESPONSE", response.status);
      }
      if (!response.ok) {
        const code = String(data.error_code ?? data.code ?? "");
        if (code === "LIMITS_EXCEEDED")
          throw new ApiError("QUOTA_EXCEEDED", response.status);
        if (response.status === 401) throw new ApiError("INVALID_TOKEN", 401);
        if (response.status === 403) throw new ApiError("FORBIDDEN", 403);
        if (response.status === 404)
          throw new ApiError(
            this.origin.includes("metrika")
              ? "COUNTER_NOT_ACCESSIBLE"
              : "HOST_NOT_ACCESSIBLE",
            404,
          );
        throw new ApiError("API_ERROR", response.status);
      }
      return data;
    }
    throw new ApiError("API_ERROR");
  }
}
export async function readBounded(
  response: Response,
  max: number,
): Promise<string> {
  return (await readBoundedBytes(response, max)).toString("utf8");
}
export async function readBoundedBytes(
  response: Response,
  max: number,
): Promise<Buffer> {
  const reader = response.body?.getReader();
  if (!reader) throw new ApiError("MALFORMED_RESPONSE");
  let size = 0;
  const parts: Uint8Array[] = [];
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > max) throw new ApiError("MALFORMED_RESPONSE");
      parts.push(value);
    }
  } catch (error) {
    await reader.cancel().catch(() => {});
    if (error instanceof ApiError) throw error;
    throw new ApiError(
      error instanceof Error && /Timeout|Abort/.test(error.name)
        ? "TIMEOUT"
        : "NETWORK",
    );
  }
  return Buffer.concat(parts);
}
export function metrikaApi() {
  return new YandexApi(
    "https://api-metrika.yandex.net",
    process.env.YANDEX_METRIKA_TOKEN ?? "",
  );
}
export function webmasterApi() {
  return new YandexApi(
    "https://api.webmaster.yandex.net",
    process.env.YANDEX_WEBMASTER_TOKEN ?? "",
  );
}
