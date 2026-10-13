import { XMLParser, XMLValidator } from "fast-xml-parser";
import { readHttp, Pacer } from "./http";
import { crawlUrl, normalizeUrl, selectRequestUrl } from "./url";
import { DEFAULT_EXCLUDES } from "./browser";
export type RobotsRule = { allow: boolean; path: string };
export function parseRobots(body: string): {
  rules: RobotsRule[];
  sitemaps: string[];
} {
  const groups: { agents: string[]; rules: RobotsRule[] }[] = [];
  const sitemaps: string[] = [];
  let group: (typeof groups)[number] | undefined,
    hasRules = false;
  for (const line of body.split(/\r?\n/)) {
    const match = line
      .replace(/#.*$/, "")
      .trim()
      .match(/^([^:]+):\s*(.*)$/);
    if (!match) continue;
    const key = match[1].toLowerCase(),
      value = match[2].trim();
    if (key === "sitemap") {
      sitemaps.push(value);
      continue;
    }
    if (key === "user-agent") {
      if (!group || hasRules) {
        group = { agents: [], rules: [] };
        groups.push(group);
        hasRules = false;
      }
      group.agents.push(value.toLowerCase());
    } else if (group && ["allow", "disallow"].includes(key)) {
      hasRules = true;
      if (value) group.rules.push({ allow: key === "allow", path: value });
    }
  }
  const exact = groups.filter((g) =>
    g.agents.some((a) => a !== "*" && "g-market-growth-radar".includes(a)),
  );
  return {
    rules: (exact.length
      ? exact
      : groups.filter((g) => g.agents.includes("*"))
    ).flatMap((g) => g.rules),
    sitemaps,
  };
}
export function robotsAllowed(url: string, rules: RobotsRule[]): boolean {
  const u = new URL(url),
    path = u.pathname + u.search;
  const matches = rules
    .filter((rule) => {
      const anchored = rule.path.endsWith("$");
      const pattern = rule.path
        .replace(/\$$/, "")
        .split("*")
        .map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
        .join(".*");
      return new RegExp("^" + pattern + (anchored ? "$" : "")).test(path);
    })
    .sort(
      (a, b) =>
        b.path.length - a.path.length || Number(b.allow) - Number(a.allow),
    );
  return matches[0]?.allow ?? true;
}
export function parseSitemap(body: string): {
  pages: string[];
  indexes: string[];
} {
  if (/<!DOCTYPE|<!ENTITY/i.test(body) || XMLValidator.validate(body) !== true)
    throw new Error("Некорректный/небезопасный sitemap XML.");
  const doc = new XMLParser({
    processEntities: true,
    ignoreAttributes: false,
    parseTagValue: false,
    removeNSPrefix: true,
  }).parse(body);
  const entries = (value: unknown): string[] =>
    [value]
      .flat()
      .filter(Boolean)
      .map((v) => (v as { loc?: unknown }).loc)
      .filter((v): v is string => typeof v === "string");
  return {
    pages: entries(doc.urlset?.url),
    indexes: entries(doc.sitemapindex?.sitemap),
  };
}
export async function discover(
  base: string,
  maxPages: number,
  signal: AbortSignal,
  pacer: Pacer,
  excludes = DEFAULT_EXCLUDES,
  robotsOnly = false,
) {
  const urls = new Map<string, string>(),
    errors: string[] = [];
  const robots = await readHttp(
    new URL("/robots.txt", base).href,
    base,
    signal,
    pacer,
    excludes,
  );
  const parsed =
    robots.outcome === "OK"
      ? parseRobots(robots.body)
      : { rules: [], sitemaps: [] };
  if (robots.outcome !== "OK" && robots.statusCode !== 404)
    errors.push(`robots.txt: ${robots.error}`);
  if (robotsOnly) return { urls: [], rules: parsed.rules, errors };
  const queue = parsed.sitemaps.length
    ? parsed.sitemaps
    : [new URL("/sitemap.xml", base).href];
  const seen = new Set<string>();
  while (
    queue.length &&
    seen.size < 10 &&
    urls.size < maxPages &&
    !signal.aborted
  ) {
    const raw = queue.shift()!,
      sitemap = crawlUrl(raw, base, excludes);
    if (!sitemap || seen.has(sitemap)) continue;
    seen.add(sitemap);
    const response = await readHttp(sitemap, base, signal, pacer, excludes);
    if (response.outcome !== "OK") {
      errors.push(`sitemap: ${response.error}`);
      continue;
    }
    try {
      const data = parseSitemap(response.body);
      for (const link of data.indexes.slice(0, 10)) queue.push(link);
      for (const link of data.pages) {
        const url = crawlUrl(link, base, excludes);
        if (url && robotsAllowed(url, parsed.rules)) {
          const key = normalizeUrl(url), previous = urls.get(key);
          if (previous || urls.size < maxPages) urls.set(key, previous ? selectRequestUrl(key, [previous, url], base, excludes)! : url);
        }
      }
    } catch {
      errors.push("Sitemap XML не удалось разобрать.");
    }
  }
  return { urls: Array.from(urls.values()), rules: parsed.rules, errors };
}
