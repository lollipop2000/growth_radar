import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { once } from "node:events";
import { networkError, safeUrl, testConnection } from "../src/lib/connection";
async function fixture(run: (base: string) => Promise<void>) {
  const server: Server = createServer((req, res) => {
    if (req.url === "/redirect") {
      res.writeHead(302, { location: "/" });
      res.end();
    } else if (req.url === "/loop") {
      res.writeHead(302, { location: "/loop" });
      res.end();
    } else if (req.url === "/external") {
      res.writeHead(302, { location: "https://example.com/" });
      res.end();
    } else if (req.url === "/slow") {
      setTimeout(() => res.end("late"), 150);
    } else if (req.url === "/401" || req.url === "/403") {
      res.writeHead(Number(req.url.slice(1)));
      res.end("denied");
    } else {
      res.writeHead(200, { "content-type": "text/html" });
      res.end("<html><title>Магазин &amp; тест</title></html>");
    }
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address() as { port: number };
  try {
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}
test("HTTP response, title, bytes and redirect", async () =>
  fixture(async (base) => {
    const result = await testConnection(base + "/redirect");
    assert.equal(result.statusCode, 200);
    assert.equal(result.title, "Магазин & тест");
    assert.equal(result.resolvedUrl, base + "/");
    assert.equal(result.error, null);
    assert.ok(result.sizeBytes > 0);
  }));
test("401 and 403 remain explicit", async () =>
  fixture(async (base) => {
    for (const code of [401, 403]) {
      const result = await testConnection(`${base}/${code}`);
      assert.equal(result.statusCode, code);
      assert.match(result.error!, new RegExp(String(code)));
    }
  }));
test("timeout covers request and errors are sanitized", async () =>
  fixture(async (base) => {
    const result = await testConnection(base + "/slow", { timeoutMs: 20 });
    assert.match(result.error!, /время ожидания/);
  }));
test("redirect loops and external hosts stop", async () =>
  fixture(async (base) => {
    assert.match((await testConnection(base + "/loop")).error!, /лимит/);
    assert.match(
      (await testConnection(base + "/external")).error!,
      /заблокировано/,
    );
  }));
test("response size is bounded", async () =>
  fixture(async (base) => {
    assert.match(
      (await testConnection(base, { maxBytes: 10 })).error!,
      /лимит/,
    );
  }));
test("credentials, query secrets and non HTTP protocols are rejected", () => {
  for (const url of [
    "file:///etc/passwd",
    "https://user:secret@example.com/",
    "https://example.com/?token=secret",
  ])
    assert.throws(() => safeUrl(url));
});
test("DNS and certificate failures do not expose raw exception text", async () => {
  for (const [code, pattern] of [
    ["ENOTFOUND", /DNS/],
    ["CERT_HAS_EXPIRED", /сертификата/],
  ] as const) {
    assert.match(networkError({ cause: { code }, message: "secret" }), pattern);
    const fetcher = (async () => {
      throw Object.assign(new Error("SECRET_VALUE"), { cause: { code } });
    }) as typeof fetch;
    const result = await testConnection("https://example.com", { fetcher });
    assert.match(result.error!, pattern);
    assert.doesNotMatch(JSON.stringify(result), /SECRET_VALUE/);
  }
});
