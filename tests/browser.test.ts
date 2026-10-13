import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { BrowserReader } from "../src/lib/scanner/browser";
import { crawl } from "../src/lib/scanner/engine";
import { scanOptions } from "../src/lib/scanner/options";
import type { PageResult } from "../src/lib/scanner/model";
test("Playwright reads HTML, blocks mutation requests and service URLs, and recognizes challenges", async () => {
  const hits: { url: string; method: string }[] = [];
  const server = createServer((req, res) => {
    hits.push({ url: req.url!, method: req.method! });
    res.setHeader("content-type", "text/html");
    if (req.url === "/challenge")
      res.end(
        '<title>Just a moment...</title><form id="challenge-form"></form>',
      );
    else if (req.url === "/deny") {
      res.setHeader("content-type", "text/plain");
      res.statusCode = 403;
      res.end("Denied");
    } else
      res.end(
        '<title>Browser fixture</title><h1>Readable content</h1><script>fetch("/mutate",{method:"POST"});fetch("/cart");fetch("/api/delete",{method:"DELETE"});</script>',
      );
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const base =
      "http://127.0.0.1:" + (server.address() as { port: number }).port,
    reader = new BrowserReader();
  try {
    const page = await reader.read(base, base, new AbortController().signal);
    assert.equal(page.outcome, "OK");
    assert.match(page.html, /Readable content/);
    assert.ok(hits.every((hit) => hit.method === "GET"));
    assert.ok(
      hits.every(
        (hit) => !["/mutate", "/cart", "/api/delete"].includes(hit.url),
      ),
    );
    assert.equal(
      (
        await reader.read(
          base + "/challenge",
          base,
          new AbortController().signal,
        )
      ).outcome,
      "BLOCKED_BY_WAF",
    );
    assert.equal(
      (await reader.read(base + "/deny", base, new AbortController().signal))
        .outcome,
      "BLOCKED_BY_WAF",
    );
  } finally {
    await reader.close();
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
test("HTTP 403 falls back to standard browser on fixture; browser challenge stops remaining queue", async () => {
  const hits: string[] = [];
  const server = createServer((req, res) => {
    hits.push(req.url!);
    res.setHeader("content-type", "text/html");
    if (req.url === "/challenge") {
      res.end("<title>Access denied</title>");
    } else if (req.headers["user-agent"]?.includes("G-market-Growth-Radar")) {
      res.statusCode = 403;
      res.end("HTTP blocked");
    } else
      res.end(
        "<title>Browser content</title><h1>Readable actual fixture content</h1>",
      );
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const base =
    "http://127.0.0.1:" + (server.address() as { port: number }).port;
  try {
    const pages: PageResult[] = [];
    await crawl(
      base,
      scanOptions({ maxPages: 1, single: true, seeds: [base], delayMs: 1000 }),
      new AbortController().signal,
      async (p) => {
        pages.push(p);
      },
      async () => {},
    );
    assert.equal(pages[0].source, "BROWSER");
    assert.equal(pages[0].httpStatusCode, 403);
    assert.equal(pages[0].statusCode, 200);
    assert.equal(pages[0].title, "Browser content");
    hits.length = 0;
    const blocked: PageResult[] = [];
    const summary = await crawl(
      base,
      scanOptions({
        mode: "BROWSER",
        delayMs: 1000,
        maxPages: 2,
        seeds: [base + "/challenge", base + "/other"],
      }),
      new AbortController().signal,
      async (p) => {
        blocked.push(p);
      },
      async () => {},
    );
    assert.equal(summary.blocked, true);
    assert.equal(blocked.length, 1);
    assert.ok(!hits.includes("/other"));
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
