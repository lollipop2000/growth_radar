import { allowedUrl, DEFAULT_EXCLUDES } from "./browser";
export function normalizeUrl(
  input: string,
  base?: string,
  resolvedUrl?: string,
): string {
  let url = new URL(input, base);
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password
  )
    throw new Error("INVALID_URL");
  if (resolvedUrl) {
    const resolved = new URL(resolvedUrl, url);
    if (resolved.origin === url.origin) url = resolved;
  }
  url.hash = "";
  for (const key of Array.from(url.searchParams.keys()))
    if (
      /^utm_/i.test(key) ||
      /^(gclid|yclid|fbclid|_openstat|mc_cid|mc_eid)$/i.test(key)
    )
      url.searchParams.delete(key);
  url.searchParams.sort();
  if (url.pathname !== "/") url.pathname = url.pathname.replace(/\/+$/, "");
  return url.href;
}
export function crawlUrl(
  input: string,
  base: string,
  excludes = DEFAULT_EXCLUDES,
): string | null {
  if (
    !input.trim() ||
    input.trim().startsWith("#") ||
    !allowedUrl(input, base, excludes)
  )
    return null;
  try {
    // Identity normalization must not change a slash-sensitive request pathname.
    const request = new URL(normalizeUrl(input, base));
    request.pathname = new URL(input, base).pathname;
    return allowedUrl(request.href, base, excludes) ? request.href : null;
  } catch {
    return null;
  }
}
/** Recover a request address from source evidence, while retaining one identity. */
export function selectRequestUrl(identity: string, variants: string[], base: string, excludes = DEFAULT_EXCLUDES): string | null {
  const key = normalizeUrl(identity, base);
  const candidates = variants.map(url => crawlUrl(url, base, excludes))
    .filter((url): url is string => url !== null && normalizeUrl(url) === key);
  // Prefer an observed slash variant; never invent a slash for files/endpoints.
  return candidates.find(url => new URL(url).pathname.endsWith("/"))
    ?? candidates[0] ?? crawlUrl(identity, base, excludes);
}
export const pageTypes = [
  "homepage",
  "category",
  "product",
  "article",
  "search",
  "informational",
  "other",
] as const;
export function classify(url: string): string {
  const u = new URL(url),
    path = u.pathname;
  if (path === "/") return "homepage";
  if (/\/search(?:\/|$)/i.test(path) || u.searchParams.has("q"))
    return "search";
  if (/\/(product|products|tovar|item)(?:\/|$)/i.test(path)) return "product";
  if (/\/(category|categories|catalog)(?:\/|$)/i.test(path)) return "category";
  if (/\/(article|articles|blog|news)(?:\/|$)/i.test(path)) return "article";
  if (/\/(about|contacts?|delivery|payment|help)(?:\/|$)/i.test(path))
    return "informational";
  return "other";
}
