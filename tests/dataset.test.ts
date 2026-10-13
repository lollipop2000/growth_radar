import { test } from "node:test";
import assert from "node:assert/strict";
import { aggregateLanding, trafficCoverage, cohortAfter, rankCandidates, safeDatasetUrl, type Candidate } from "../src/lib/yandex/dataset";
import { choosePriority, scopeKey, previewFingerprint } from "../src/lib/yandex/priority";
import { createServer } from "node:http";
import { once } from "node:events";
import { crawl } from "../src/lib/scanner/engine";
import { scanOptions } from "../src/lib/scanner/options";
test("URL coverage aggregates raw variants, counts unmatched zero-visit URLs and weights by visits", () => {
  const data = aggregateLanding([
    { url: "https://x.test/a?utm_source=x", normalizedUrl: "https://x.test/a", pageId: "a", visits: 90 },
    { url: "https://x.test/a", normalizedUrl: "https://x.test/a", pageId: "a", visits: 10 },
    { url: "https://x.test/b", normalizedUrl: "https://x.test/b", pageId: null, visits: 1 },
    { url: "https://x.test/c", normalizedUrl: "https://x.test/c", pageId: null, visits: 0 },
  ]);
  const c = trafficCoverage(data);
  assert.equal(data[0].rawUrls, 2); assert.equal(c.totalUrls, 3); assert.equal(c.unmatchedUrls, 2);
  assert.equal(c.matchedVisits, 100); assert.equal(c.coverage, 100/101*100);
  assert.equal(trafficCoverage([]).coverage, null);
  const after = cohortAfter(data, "https://x.test/", [{ id: "b", normalizedUrl: "https://x.test/b", aliasesJson: [] }, { id: "a", normalizedUrl: "https://x.test/a", aliasesJson: [] }]);
  assert.equal(after.totalVisits, c.totalVisits); assert.equal(after.coverage, 100); assert.equal(after.unmatchedUrls, 1);
});
const candidate = (url: string, visits: number, discovery = false, pageType = "other", valid = true): Candidate => ({
  url, visits, discovery, pageType, valid, matchedVisits: 0, unmatchedVisits: visits, unmatchedRows: 1, rawUrls: 1, reason: "page not scanned",
  pageId: null, hasSearch: false, matchStatus: "UNMATCHED", inclusionReason: "fixture",
});
test("Priority uses visits then discovery then commercial classification; manual scope validates dataset and limits", () => {
  const rows = rankCandidates([candidate("https://x.test/category", 3, false, "category"), candidate("https://x.test/other",3),
    candidate("https://x.test/discovered",3,true), candidate("https://x.test/top",20), candidate("https://evil.test/",100,false,"other",false)]);
  assert.deepEqual(rows.map(r => r.url), ["https://x.test/top","https://x.test/discovered","https://x.test/category","https://x.test/other"]);
  assert.equal(choosePriority(rows,"TOP20").length, 4);
  assert.equal(choosePriority(rows,"MANUAL",[rows[1].url,rows[1].url]).length,1);
  assert.throws(() => choosePriority(rows,"MANUAL",["https://evil.test/"]));
  assert.throws(() => choosePriority(rows,"MANUAL",Array.from({length:101},(_,i)=>`https://x.test/${i}`)));
  assert.equal(scopeKey(rows.map(r=>r.url)),scopeKey(rows.map(r=>r.url).reverse()));
  assert.notEqual(previewFingerprint(rows,"host","counter"),previewFingerprint(rows,"different","counter"));
  assert.equal(safeDatasetUrl("https://x.test/personal/profile","https://x.test/"),null);
  assert.equal(safeDatasetUrl("https://x.test/checkout","https://x.test/"),null);
  assert.equal(safeDatasetUrl("https://evil.test/product","https://x.test/"),null);
});
test("Targeted Scanner reads robots and seeds only, never sitemaps or discovered links", async () => {
  const requests: string[] = [];
  const server = createServer((req,res) => {
    requests.push(req.url!);
    res.setHeader("content-type", req.url === "/robots.txt" ? "text/plain" : "text/html");
    res.end(req.url === "/robots.txt" ? "User-agent: *\nDisallow: /private\nSitemap: /sitemap.xml" : '<html><title>Test</title><h1>Test</h1><a href="/extra">Extra</a></html>');
  });
  server.listen(0,"127.0.0.1"); await once(server,"listening");
  const address = server.address() as { port: number }, base = `http://127.0.0.1:${address.port}/`;
  try {
    const result = await crawl(base, scanOptions({ maxPages:10, delayMs:500, seedOnly:true, seeds:[base+"a",base+"private",base+"b"], browserFallback:false }), new AbortController().signal, async()=>{},async()=>{});
    assert.equal(result.scanned,2); assert.deepEqual(requests,["/robots.txt","/a","/b"]);
  } finally { server.close(); }
});
