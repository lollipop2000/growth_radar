import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import ExcelJS from "exceljs";
import { normalizeUrl, crawlUrl, classify } from "../src/lib/scanner/url";
import { parseHtml, type PageResult } from "../src/lib/scanner/model";
import {
  parseRobots,
  robotsAllowed,
  parseSitemap,
} from "../src/lib/scanner/discovery";
import { crawl } from "../src/lib/scanner/engine";
import { scanOptions } from "../src/lib/scanner/options";
import { parseCrawlImport } from "../src/lib/scanner/import";
test("URL identity preserves meaningful params and normalizes tracking, fragment, slash, redirects", () => {
  assert.equal(
    normalizeUrl("https://EXAMPLE.com/catalog/?b=2&utm_source=x&a=1#part"),
    "https://example.com/catalog?a=1&b=2",
  );
  assert.notEqual(
    normalizeUrl("https://example.com/?size=1"),
    normalizeUrl("https://example.com/?size=2"),
  );
  assert.equal(
    normalizeUrl(
      "https://example.com/old",
      undefined,
      "https://example.com/new/",
    ),
    "https://example.com/new",
  );
  assert.equal(
    normalizeUrl(
      "https://example.com/old",
      undefined,
      "https://other.com/new/",
    ),
    "https://example.com/old",
  );
  for (const link of [
    "#x",
    "mailto:me@example.com",
    "https://other.com/",
    "/logout",
    "/cart?a=1",
    "/cart.php",
    "/shop/cart/",
    "/shop/checkout.html",
    "/checkout",
    "/api/items",
    "/admin/x",
    "/login",
    "/basket",
    "/?action=delete",
  ])
    assert.equal(crawlUrl(link, "https://example.com"), null);
});
test("HTML extracts content fields, canonical, schema types and bounded same-domain links", () => {
  const parsed = parseHtml(
    '<html lang="ru"><head><title>Shop</title><meta name="description" content="Desc"><meta name="robots" content="noindex"><link rel="canonical" href="/catalog/?utm_source=x"><meta property="og:title" content="OG"></head><body><h1>Heading</h1><h2>A</h2><h2>B</h2><p>Readable words</p><a href="/product/x">Item</a><a href="/cart">Cart</a><a href="https://other.com">Out</a><script type="application/ld+json">{"@graph":[{"@type":"Product"},{"@type":"Offer"}]}</script></body></html>',
    "https://example.com/catalog",
    "https://example.com/",
  );
  assert.equal(parsed.fields.title, "Shop");
  assert.equal(parsed.fields.canonical, "https://example.com/catalog");
  assert.equal(parsed.fields.indexable, false);
  assert.deepEqual(parsed.fields.h2Json, ["A", "B"]);
  assert.deepEqual(parsed.fields.structuredDataJson, ["Product", "Offer"]);
  assert.deepEqual(parsed.links, ["https://example.com/product/x"]);
  assert.equal(parsed.fields.externalLinksCount, 1);
  assert.equal(parsed.fields.openGraphJson?.title, "OG");
  assert.equal(parsed.fields.contentHash?.length, 64);
  assert.equal(classify("https://example.com/product/x"), "product");
});
test("Robots allow precedence and sitemap index parsing including query entities", () => {
  const parsed = parseRobots(
    "User-agent: *\nDisallow: /private\nAllow: /private/public\nSitemap: https://example.com/sitemap.xml",
  );
  assert.equal(
    robotsAllowed("https://example.com/private/secret", parsed.rules),
    false,
  );
  assert.equal(
    robotsAllowed("https://example.com/private/public", parsed.rules),
    true,
  );
  assert.deepEqual(
    parseSitemap(
      "<sitemapindex><sitemap><loc>https://example.com/a.xml</loc></sitemap></sitemapindex>",
    ).indexes,
    ["https://example.com/a.xml"],
  );
  assert.deepEqual(
    parseSitemap(
      "<urlset><url><loc>https://example.com/?a=1&amp;b=2</loc></url></urlset>",
    ).pages,
    ["https://example.com/?a=1&b=2"],
  );
  assert.throws(() =>
    parseSitemap('<!DOCTYPE x [<!ENTITY x "bomb">]><urlset/>'),
  );
});
test("Browser limits cannot be increased or omitted", () => {
  assert.throws(() => scanOptions({ mode: "BROWSER" }));
  assert.throws(() => scanOptions({ maxPages: 51 }));
  assert.throws(() =>
    scanOptions({ mode: "BROWSER", maxPages: 50, delayMs: 500 }),
  );
  const options = scanOptions({
    mode: "BROWSER",
    maxPages: 50,
    concurrency: 2,
  });
  assert.equal(options.concurrency, 1);
  assert.equal(options.delayMs, 3000);
  assert.equal(options.timeoutMs, 20000);
});
async function fixture(
  run: (
    base: string,
    hits: { path: string; time: number; method: string }[],
  ) => Promise<void>,
) {
  const hits: { path: string; time: number; method: string }[] = [];
  const server = createServer((req, res) => {
    hits.push({ path: req.url!, time: Date.now(), method: req.method! });
    if (req.url === "/robots.txt")
      res.end("User-agent: *\nDisallow: /private\nSitemap: /index.xml");
    else if (req.url === "/index.xml")
      res.end(
        "<sitemapindex><sitemap><loc>/sitemap.xml</loc></sitemap></sitemapindex>",
      );
    else if (req.url === "/sitemap.xml")
      res.end(
        "<urlset><url><loc>/a</loc></url><url><loc>/blocked</loc></url><url><loc>/private</loc></url></urlset>",
      );
    else if (req.url === "/blocked") {
      res.writeHead(403);
      res.end("WAF");
    } else {
      res.setHeader("content-type", "text/html");
      res.end(
        '<html><title>Fixture</title><body><h1>Content</h1><p>Enough readable words to avoid JS fallback.</p><a href="/b">B</a><a href="/cart">cart</a><a href="https://other.com">external</a></body></html>',
      );
    }
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const base =
    "http://127.0.0.1:" + (server.address() as { port: number }).port;
  try {
    await run(base, hits);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}
test("HTTP crawl discovers sitemap index, bounds pages, respects pacing and classifies WAF", async () =>
  fixture(async (base, hits) => {
    const pages: PageResult[] = [];
    const summary = await crawl(
      base,
      scanOptions({ maxPages: 3, delayMs:500, browserFallback: false }),
      new AbortController().signal,
      async (page) => {
        pages.push(page);
      },
      async () => {},
    );
    assert.equal(summary.scanned, 2);
    assert.equal(summary.blocked, true);
    assert.equal(
      pages.find((p) => p.statusCode === 403)?.outcome,
      "BLOCKED_BY_WAF",
    );
    assert.ok(hits.every((h) => !["/private", "/cart"].includes(h.path)));
    assert.ok(hits.every((h) => h.method === "GET"));
    for (let i = 1; i < hits.length; i++)
      assert.ok(hits[i].time - hits[i - 1].time >= 450);
    assert.ok(hits.some((h) => h.path === "/sitemap.xml"));
  }));
test("Cancellation prevents subsequent page requests", async () =>
  fixture(async (base, hits) => {
    const controller = new AbortController();
    await crawl(
      base,
      scanOptions({ maxPages: 4, delayMs:500, concurrency: 1, browserFallback: false }),
      controller.signal,
      async () => {
        controller.abort();
      },
      async () => {},
    );
    assert.equal(
      hits.filter((h) => !h.path.endsWith(".xml") && h.path !== "/robots.txt")
        .length,
      1,
    );
  }));
const header = [
  "URL",
  "Status Code",
  "Title",
  "Meta Description",
  "H1",
  "H2",
  "Canonical",
  "Robots",
  "Word Count",
];
test("CSV import maps common fields, tracks duplicates and rejects external/invalid rows", async () => {
  const csv = [
    header.join(","),
    "https://example.com/a,200,Title,Desc,H1,H2,https://example.com/a,index,42",
    "https://example.com/a?utm_source=x,200,Title,Desc,H1,H2,,index,42",
    "https://other.com/a,200,Out,Desc,H1,H2,,index,3",
    "https://example.com/b,403,Denied,,,,,noindex,0",
  ].join("\n");
  const result = await parseCrawlImport(
    Buffer.from(csv),
    "crawl.csv",
    "https://example.com",
  );
  assert.equal(result.pages.length, 2);
  assert.equal(result.skipped, 2);
  assert.equal(result.errors.length, 1);
  assert.equal(result.pages[0].source, "IMPORT");
  assert.equal(result.pages[0].wordCount, 42);
  assert.equal(result.pages[1].outcome, "BLOCKED_BY_WAF");
});
test("XLSX imports UTF-8 values and rejects formulas and excessive row counts", async () => {
  const workbook = new ExcelJS.Workbook(),
    sheet = workbook.addWorksheet("Crawl");
  sheet.addRow(header);
  sheet.addRow([
    "https://example.com/a",
    200,
    "Магазин",
    "Описание",
    "Заголовок",
    "A; B",
    "",
    "index",
    10,
  ]);
  const imported = await parseCrawlImport(
    Buffer.from(await workbook.xlsx.writeBuffer()),
    "crawl.xlsx",
    "https://example.com",
  );
  assert.equal(imported.pages[0].title, "Магазин");
  assert.deepEqual(imported.pages[0].h2Json, ["A", "B"]);
  sheet.getCell("C2").value = { formula: "1+1", result: 2 };
  const bytes = Buffer.from(await workbook.xlsx.writeBuffer());
  await assert.rejects(
    () => parseCrawlImport(bytes, "crawl.xlsx", "https://example.com"),
    /Формулы/,
  );
  await assert.rejects(
    () =>
      parseCrawlImport(
        Buffer.from(
          [
            header.join(","),
            ...Array(51).fill("https://example.com/a,200,A,B,C,D,,index,1"),
          ].join("\n"),
        ),
        "crawl.csv",
        "https://example.com",
      ),
    /50/,
  );
});
