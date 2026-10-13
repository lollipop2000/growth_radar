import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { scanOptions } from "../src/lib/scanner/options";
import { coverageSettings } from "../src/lib/scanner/coverage";
import { Pacer, readHttp } from "../src/lib/scanner/http";
import { BrowserReader } from "../src/lib/scanner/browser";
import { crawl } from "../src/lib/scanner/engine";

test("scan defaults are sequential with 3-second delay and allow slower 60-second pacing", () => {
  for (const mode of ["HTTP", "BROWSER"] as const) {
    const options = scanOptions({ mode, maxPages: 1 });
    assert.equal(options.delayMs, 3000); assert.equal(options.concurrency, 1);
    assert.equal(scanOptions({ mode, maxPages: 1, delayMs: 60000 }).delayMs, 60000);
    assert.throws(() => scanOptions({ mode, maxPages: 1, delayMs: 60001 }));
  }
  assert.equal(coverageSettings().delayMs, 3000);
  assert.equal(coverageSettings({ delayMs: 30000 }).delayMs, 30000);
  assert.throws(() => coverageSettings({ delayMs: 60001 }));
});

test("one pacer spaces HTTP, Browser fallback and the next HTTP URL", async () => {
  const events: { adapter: string; time: number }[] = [];
  const server = createServer((req, res) => {
    if (req.url === "/robots.txt") return res.end("User-agent: *");
    events.push({ adapter: "HTTP", time: Date.now() });
    res.setHeader("content-type", "text/html");
    if (req.url === "/first/") { res.statusCode = 403; return res.end("Denied fixture"); }
    res.end("<h1>Readable fixture content</h1>");
  });
  class FixtureReader extends BrowserReader {
    async read(url: string) {
      events.push({ adapter: "BROWSER", time: Date.now() });
      return { html: "<h1>Readable fixture product content</h1>", finalUrl: url, statusCode: 200, contentType: "text/html",
        responseTimeMs: 0, outcome: "OK" as const, error: null, redirects: [] };
    }
  }
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  try {
    const summary = await crawl(base, scanOptions({ maxPages: 2, delayMs: 1000, seedOnly: true, continueOnError: true,
      seeds: [base + "/first/", base + "/second/"] }), new AbortController().signal, async () => {}, async () => {}, new FixtureReader());
    assert.equal(summary.scanned, 2);
    assert.deepEqual(events.map(e => e.adapter), ["HTTP", "BROWSER", "HTTP"]);
    for (let i = 1; i < events.length; i++) assert.ok(events[i].time - events[i-1].time >= 950);
  } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
});

test("long pacing is cancellable and redirect waits do not exhaust network timeout", async () => {
  const pacer = new Pacer(60000), controller = new AbortController(); let calls = 0;
  await pacer.run(controller.signal, async () => { calls++; });
  const waiting = pacer.run(controller.signal, async () => { calls++; });
  controller.abort(); await assert.rejects(waiting); assert.equal(calls, 1);
  const server = createServer((req, res) => {
    if (req.url === "/a") { res.writeHead(302, { location: "/b" }); return res.end(); }
    res.end("Readable local fixture");
  });
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  try {
    const r = await readHttp(base + "/a", base, new AbortController().signal, new Pacer(1200), [], 1000);
    assert.equal(r.outcome, "OK"); assert.equal(r.statusCode, 200); assert.equal(r.timeoutStage, undefined);
    assert.equal(r.finalUrl, base + "/b"); assert.ok(r.responseTimeMs >= 1150);
  } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
});
