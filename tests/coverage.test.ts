import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { crawl } from "../src/lib/scanner/engine";
import { BrowserReader } from "../src/lib/scanner/browser";
import { scanOptions } from "../src/lib/scanner/options";
import { emptyResult } from "../src/lib/scanner/model";
import { pageCoverageResult, resultCounts } from "../src/lib/scanner/coverage";

test("Coverage results distinguish timeout, WAF, HTTP, network, success and persisted counters", () => {
  const p = emptyResult("https://fixture.example/a", "HTTP");
  assert.equal(pageCoverageResult({ ...p, statusCode: 200 }), "SUCCESS_HTTP");
  assert.equal(pageCoverageResult({ ...p, source: "BROWSER", statusCode: 200 }), "SUCCESS_BROWSER");
  assert.equal(pageCoverageResult({ ...p, outcome: "BLOCKED_BY_WAF", statusCode: 403 }), "BLOCKED_BY_WAF");
  assert.equal(pageCoverageResult({ ...p, outcome: "ERROR", error: "Browser TIMEOUT: 20 sec" }), "TIMEOUT");
  assert.equal(pageCoverageResult({ ...p, outcome: "ERROR", statusCode: 404 }), "HTTP_ERROR");
  assert.equal(pageCoverageResult({ ...p, outcome: "ERROR", error: "Browser NETWORK_ERROR" }), "NETWORK_ERROR");
  const counts = resultCounts([{ url: p.requestedUrl, rawUrls: [], visits: 1, result: "TIMEOUT" }, { url: p.requestedUrl + "b", rawUrls: [], visits: 0, result: "SKIPPED" }, { url: p.requestedUrl + "c", rawUrls: [], visits: 0 }]);
  assert.equal(counts.processed, 2); assert.equal(counts.remaining, 1); assert.equal(counts.attempted, 1); assert.equal(counts.failed, 1);
  assert.equal(scanOptions({ maxPages: 50, seedOnly: true, continueOnError: true }).concurrency, 1);
  assert.equal(scanOptions({ maxPages: 50, continueOnError: true }).continueOnError, false);
});
test("Coverage reuses crawl and proceeds after browser timeout/challenge/network plus ordinary HTTP error", async () => {
  const server = createServer((req,res) => {
    res.setHeader("content-type", "text/html");
    if (req.url === "/robots.txt") return res.end("User-agent: *");
    if (req.url === "/http-error") { res.statusCode = 500; return res.end("failed"); }
    if (req.url !== "/last") { res.statusCode = 403; return res.end("blocked HTTP"); }
    res.end("<title>Final successful URL after errors</title><h1>Fixture</h1>");
  });
  server.listen(0,"127.0.0.1"); await once(server,"listening");
  const base = "http://127.0.0.1:" + (server.address() as {port:number}).port;
  class FixtureReader extends BrowserReader {
    async read(url: string) { return { html: "", finalUrl: url, statusCode: url.endsWith("waf") ? 403 : null, contentType: null, responseTimeMs: 20,
      outcome: url.endsWith("waf") ? "BLOCKED_BY_WAF" as const : "ERROR" as const, error: url.endsWith("timeout") ? "Browser TIMEOUT" : "Browser NETWORK_ERROR", redirects: [] }; }
  }
  const results: string[] = [];
  try {
    await crawl(base,scanOptions({maxPages:5,delayMs:1000,seedOnly:true,continueOnError:true,seeds:["/timeout","/waf","/network","/http-error","/last"].map(p => base+p)}),new AbortController().signal,
      async p => { results.push(pageCoverageResult(p)); },async () => {},new FixtureReader());
    assert.deepEqual(results,["TIMEOUT","BLOCKED_BY_WAF","NETWORK_ERROR","HTTP_ERROR","SUCCESS_HTTP"]);
  } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
});
