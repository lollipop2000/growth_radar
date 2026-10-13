import "server-only";
import { Agent, fetch as undiciFetch } from "undici";
const allowedOrigins = new Set([
  "https://api-metrika.yandex.net", "https://api.webmaster.yandex.net", "https://storage.mds.yandex.net",
]);
const compatibleAgent = new Agent({ connect: {
  minVersion: "TLSv1.2", maxVersion: "TLSv1.2",
  ciphers: "ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES128-GCM-SHA256",
  timeout: 10000,
} });
const compatibleFetch = (async (input, init) =>
  await undiciFetch(String(input), { ...init, dispatcher: compatibleAgent } as unknown as Parameters<typeof undiciFetch>[1]) as unknown as Response
) as typeof fetch;
export function createYandexFetch(normal: typeof fetch, compatible: typeof fetch, preferCompatible = false): typeof fetch {
  const learned = new Set<string>();
  return (async (input, init) => {
    const origin = new URL(String(input)).origin;
    if (!allowedOrigins.has(origin)) throw new Error("UNSUPPORTED_YANDEX_ORIGIN");
    if (preferCompatible || learned.has(origin)) return compatible(input, init);
    try { return await normal(input, init); }
    catch (error) {
      const cause = error instanceof Error ? error.cause : undefined;
      const code = cause && typeof cause === "object" && "code" in cause ? String(cause.code) : "";
      // Only a GET whose connection never opened may try the secure TLS 1.2
      // profile. HTTP responses, POSTs and ambiguous disconnects never retry here.
      if ((init?.method ?? "GET") !== "GET" || code !== "UND_ERR_CONNECT_TIMEOUT" || init?.signal?.aborted) throw error;
      const response = await compatible(input, init);
      learned.add(origin);
      return response;
    }
  }) as typeof fetch;
}
// TLS verification, CA trust and hostname verification retain their defaults.
// This transport is isolated from the Scanner and never changes User-Agent.
export const yandexFetch = createYandexFetch(fetch, compatibleFetch, process.env.YANDEX_TLS_COMPAT === "1");
