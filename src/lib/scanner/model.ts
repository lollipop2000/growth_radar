import { createHash } from "node:crypto";
import { load } from "cheerio";
import { crawlUrl, normalizeUrl } from "./url";
import { DEFAULT_EXCLUDES } from "./browser";
import {extractSignals,type ContentSignals} from './content';
export type CrawlSource = "HTTP" | "BROWSER" | "IMPORT";
export type Outcome = "OK" | "ERROR" | "BLOCKED_BY_WAF" | "AUTH_REQUIRED";
export type PageResult = {
  contentSignalsJson?: ContentSignals;
  internalLinksJson?: string[];
  diagnostics?: import("./diagnostics").PageDiagnostics;
  requestedUrl: string;
  finalUrl: string;
  source: CrawlSource;
  outcome: Outcome;
  statusCode: number | null;
  httpStatusCode: number | null;
  responseTimeMs: number | null;
  redirectsJson: string[];
  redirectHops?: import('./redirects').RedirectHop[];
  contentType: string | null;
  contentLength: number | null;
  title: string | null;
  description: string | null;
  canonical: string | null;
  h1: string | null;
  h2Json: string[];
  robots: string | null;
  lang: string | null;
  wordCount: number | null;
  internalLinksCount: number | null;
  externalLinksCount: number | null;
  structuredDataJson: string[];
  openGraphJson: Record<string, string>;
  contentHash: string | null;
  indexable: boolean | null;
  error: string | null;
};
export function emptyResult(url: string, source: CrawlSource): PageResult {
  return {
    requestedUrl: url,
    finalUrl: url,
    source,
    outcome: "OK",
    statusCode: null,
    httpStatusCode: null,
    responseTimeMs: null,
    redirectsJson: [],
    contentType: null,
    contentLength: null,
    title: null,
    description: null,
    canonical: null,
    h1: null,
    h2Json: [],
    robots: null,
    lang: null,
    wordCount: null,
    internalLinksCount: null,
    externalLinksCount: null,
    structuredDataJson: [],
    openGraphJson: {},
    contentHash: null,
    indexable: null,
    error: null,
  };
}
export function parseHtml(
  html: string,
  url: string,
  base: string,
  excludes = DEFAULT_EXCLUDES,
): { fields: Partial<PageResult>; links: string[] } {
  const $ = load(html),
    trim = (text: string | undefined) =>
      text?.replace(/\s+/g, " ").trim().slice(0, 10000) || null;
  const meta = (name: string) =>
    trim($(`meta[name="${name}"]`).attr("content"));
  const rawCanonical = $('link[rel~="canonical"]').first().attr("href");
  let canonical: string | null = null;
  try {
    if (rawCanonical) canonical = normalizeUrl(rawCanonical, url);
  } catch {}
  const links = new Set<string>();
  let internal = 0,
    external = 0;
  $("a[href]").each((_i, element) => {
    const href = $(element).attr("href")!;
    try {
      const u = new URL(href, url);
      if (!["http:", "https:"].includes(u.protocol)) return;
      if (u.origin === new URL(base).origin) {
        internal++;
        const target = crawlUrl(href, url, excludes);
        if (target && new URL(target).origin === new URL(base).origin)
          links.add(target);
      } else external++;
    } catch {}
  });
  const structured = new Set<string>();
  function types(value: unknown, depth = 0) {
    if (depth > 20 || !value || typeof value !== "object") return;
    if (Array.isArray(value)) {
      for (const item of value) types(item, depth + 1);
      return;
    }
    const object = value as Record<string, unknown>;
    for (const type of [object["@type"]].flat())
      if (typeof type === "string") structured.add(type);
    for (const nested of Object.values(object)) types(nested, depth + 1);
  }
  $('script[type="application/ld+json"]').each((_i, element) => {
    try {
      types(JSON.parse($(element).text()));
    } catch {}
  });
  $('[itemtype]').each((_i,e)=>{for(const value of ($(e).attr('itemtype')??'').split(/\s+/)){try{const type=new URL(value);if(['schema.org','www.schema.org'].includes(type.hostname))structured.add(type.pathname.split('/').filter(Boolean).at(-1)??'');}catch{}}});
  const openGraphJson: Record<string, string> = {};
  for (const key of ["title", "description", "image"]) {
    const value = trim($(`meta[property="og:${key}"]`).attr("content"));
    if (value) openGraphJson[key] = value;
  }
  const title = trim($("title").first().text()),
    description = meta("description"),
    robots = meta("robots"),
    h1 = trim($("h1").first().text());
  const h2Json = $("h2")
    .map((_i, e) => trim($(e).text()) ?? "")
    .get()
    .filter(Boolean)
    .slice(0, 100);
  $("script,style,noscript,template,[hidden],[aria-hidden='true']").remove();
  const text = $("body").text().replace(/\s+/g, " ").trim();
  const main=$('main,[role="main"]').first(),meaningful=(main.length?main:$('body')).clone();meaningful.find('nav,header,footer,aside').remove();
  const meaningfulText=meaningful.text().replace(/\s+/g,' ').trim();
  return {
    fields: {
      contentSignalsJson:extractSignals(meaningfulText,[h1,meaningfulText.slice(0,3500)].filter(Boolean).join(' '),h1,Array.from(structured)),
      internalLinksJson:Array.from(links).slice(0,5000),
      title,
      description,
      canonical,
      robots,
      h1,
      h2Json,
      lang: trim($("html").attr("lang")),
      wordCount: text ? text.split(/\s+/u).length : 0,
      internalLinksCount: internal,
      externalLinksCount: external,
      structuredDataJson: Array.from(structured),
      openGraphJson,
      contentHash: createHash("sha256")
        .update(
          JSON.stringify({
            title,
            description,
            canonical,
            robots,
            h1,
            h2Json,
            text,
          }),
        )
        .digest("hex"),
      indexable: !/noindex|none/i.test(robots ?? ""),
    },
    links: Array.from(links),
  };
}
