import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { crawlUrl, normalizeUrl, selectRequestUrl } from "../src/lib/scanner/url";
import { crawl } from "../src/lib/scanner/engine";
import { scanOptions } from "../src/lib/scanner/options";
import { parseHtml, type PageResult } from "../src/lib/scanner/model";
import { parseCrawlImport } from "../src/lib/scanner/import";
import { safeDatasetUrl } from "../src/lib/yandex/dataset";

test("request addresses retain source pathname while matching uses normalized identity", async () => {
  const base = "https://example.com/";
  assert.equal(crawlUrl("/catalog/item/?size=5&utm_source=test#h", base), base + "catalog/item/?size=5");
  assert.equal(safeDatasetUrl(base + "catalog/item/", base), base + "catalog/item");
  assert.equal(selectRequestUrl(base + "catalog/item", [base + "catalog/item", base + "catalog/item/?utm_source=test"], base), base + "catalog/item/");
  assert.equal(selectRequestUrl(base + "catalog/item?size=5", [base + "catalog/item/?size=6", base + "catalog/item/?size=5"], base), base + "catalog/item/?size=5");
  assert.equal(selectRequestUrl(base + "catalog/item", ["https://outside.example/catalog/item/", base + "catalog/item/?csrftoken=private"], base), base + "catalog/item");
  for (const path of ["/sitemap.xml", "/file.html", "/endpoint", "/"]) assert.equal(crawlUrl(path, base), new URL(path, base).href);
  const links = parseHtml('<a href="child/">Child</a>', base + "catalog/", base).links;
  assert.deepEqual(links, [base + "catalog/child/"]);
  const header = "URL,Status Code,Title,Meta Description,H1,H2,Canonical,Robots,Word Count\n";
  const imported = await parseCrawlImport(Buffer.from(header + `${base}catalog/item/,200,Item,,Item,,${base}catalog/item/,index,5\n${base}catalog/item,200,Item,,Item,,,index,5`), "fixture.csv", base);
  assert.equal(imported.pages.length, 1); assert.equal(imported.skipped, 1);
  assert.equal(imported.pages[0].requestedUrl, base + "catalog/item/");
  assert.equal(imported.pages[0].indexable, true);
});

test("HTTP, Browser and fallback navigate the slash-sensitive source URL exactly once", async () => {
  const hits: { path: string; http: boolean }[] = [];
  const server = createServer((req, res) => {
    const http = Boolean(req.headers["user-agent"]?.includes("G-market-Growth-Radar"));
    hits.push({ path: req.url!, http }); res.setHeader("content-type", "text/html");
    if (req.url === "/robots.txt") return res.end("User-agent: *");
    if (req.url === "/catalog/item") { res.statusCode = 404; return res.end("Wrong pathname"); }
    if (req.url === "/fallback/" && http) { res.statusCode = 403; return res.end("Denied HTTP fixture"); }
    if (!["/catalog/item/", "/fallback/", "/file.html"].includes(req.url!)) { res.statusCode = 404; return res.end("Missing"); }
    res.end("<title>Slash fixture</title><h1>Readable actual product page</h1><p>Local fixture useful content</p>");
  });
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  const base = "http://127.0.0.1:" + (server.address() as { port: number }).port;
  try {
    for (const mode of ["HTTP", "BROWSER"] as const) {
      hits.length = 0; const pages: PageResult[] = [];
      await crawl(base, scanOptions({ mode, delayMs:1000, maxPages: 2, seedOnly: true, concurrency: 1, browserFallback: false,
        seeds: [base + "/catalog/item", base + "/catalog/item/"] }), new AbortController().signal, async p => { pages.push(p); }, async () => {});
      assert.equal(pages.length, 1); assert.equal(pages[0].statusCode, 200);
      assert.equal(pages[0].requestedUrl, base + "/catalog/item/");
      assert.equal(normalizeUrl(pages[0].finalUrl), base + "/catalog/item");
      assert.ok(!hits.some(h => h.path === "/catalog/item"));
    }
    const pages: PageResult[] = [];
    await crawl(base, scanOptions({ maxPages: 1, delayMs:1000, single: true, seeds: [base + "/fallback/"] }), new AbortController().signal, async p => { pages.push(p); }, async () => {});
    assert.equal(pages[0].httpStatusCode, 403); assert.equal(pages[0].statusCode, 200);
    assert.equal(pages[0].requestedUrl, base + "/fallback/"); assert.equal(pages[0].source, "BROWSER");
    assert.ok(hits.some(h => h.path === "/fallback/" && h.http));
    assert.ok(hits.some(h => h.path === "/fallback/" && !h.http));
  } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
});

test("sitemap and discovered HTML links retain trailing slash without adding one to files", async () => {
  let base = ""; const hits: string[] = [];
  const server = createServer((req, res) => {
    hits.push(req.url!);
    if (req.url === "/robots.txt") return res.end("User-agent: *");
    if (req.url === "/sitemap.xml") return res.end(`<urlset><url><loc>${base}/catalog/</loc></url></urlset>`);
    res.setHeader("content-type", "text/html");
    if (req.url === "/catalog/") return res.end('<h1>Category fixture</h1><a href="item/">Product</a><a href="/file.html">File</a>');
    if (["/catalog/item/", "/file.html"].includes(req.url!)) return res.end("<h1>Readable fixture content</h1>");
    res.statusCode = 404; res.end("Wrong URL");
  });
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  base = "http://127.0.0.1:" + (server.address() as { port: number }).port;
  try {
    const pages: PageResult[] = [];
    await crawl(base, scanOptions({ maxPages: 3, delayMs:500, concurrency: 1, browserFallback: false, seeds: [base + "/catalog/"] }), new AbortController().signal, async p => { pages.push(p); }, async () => {});
    assert.equal(pages.length, 3); assert.ok(pages.every(p => p.statusCode === 200));
    assert.deepEqual(pages.map(p => p.requestedUrl), [base + "/catalog/", base + "/catalog/item/", base + "/file.html"]);
    assert.ok(!hits.includes("/catalog") && !hits.includes("/file.html/"));
  } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
});
