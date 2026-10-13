import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { Pacer, readHttp } from "../src/lib/scanner/http";
import { attempt, unresolvedWaf, redactUrl } from "../src/lib/scanner/diagnostics";
import { emptyResult } from "../src/lib/scanner/model";
import { coverageSettings } from "../src/lib/scanner/coverage";
import { allowedUrl, BrowserReader } from "../src/lib/scanner/browser";

test("WAF evidence distinguishes successful fallback, unresolved 403, timeout and authentication", () => {
  const p = emptyResult("https://fixture.example/a", "HTTP");
  const http = attempt({ outcome: "BLOCKED_BY_WAF", statusCode: 403, responseTimeMs: 4, error: null });
  assert.equal(unresolvedWaf({ ...p, source: "BROWSER", statusCode: 200, diagnostics: { mode: "HTTP_BROWSER", http, elapsedMs: 10, classification: "OK" } }), false);
  assert.equal(unresolvedWaf({ ...p, outcome: "ERROR", diagnostics: { mode: "HTTP_BROWSER", http, elapsedMs: 10, classification: "TIMEOUT" } }), true);
  assert.equal(unresolvedWaf({ ...p, outcome: "ERROR", error: "TIMEOUT" }), false);
  assert.equal(unresolvedWaf({ ...p, outcome: "AUTH_REQUIRED", statusCode: 401 }), false);
  assert.equal(unresolvedWaf({ ...p, outcome: "BLOCKED_BY_WAF", statusCode: 200 }), true);
  assert.throws(() => coverageSettings({ diagnosticLimit: 51 }));
  assert.throws(() => coverageSettings({ testUrl: p.requestedUrl, diagnosticLimit: 2 }));
  assert.throws(() => coverageSettings({ transport: "wrong" as never }));
  assert.equal(coverageSettings().transport, "HTTP_BROWSER");
  assert.equal(allowedUrl("https://fixture.example/a?csrftoken=private", "https://fixture.example"), false);
  assert.ok(!redactUrl("https://fixture.example/?access_token=private").includes("private"));
});

test("HTTP diagnostics retain headers/body timeout, excluding intentional pacing from the network budget", async () => {
  const server = createServer((req,res) => {
    if (req.url === "/headers") return;
    res.setHeader("set-cookie", "private=must-not-be-stored");
    res.writeHead(200, { "content-type": "text/html" }); res.flushHeaders();
    if (req.url === "/body") res.write("<title>Unfinished</title>"); else res.end("ok");
  });
  server.listen(0,"127.0.0.1"); await once(server,"listening");
  const base = "http://127.0.0.1:" + (server.address() as {port:number}).port;
  try {
    for (const [path,stage] of [["headers","HEADERS"],["body","BODY"]]) {
      const r = await readHttp(base+"/"+path,base,new AbortController().signal,new Pacer(0),[],2000);
      assert.equal(r.timeoutStage,stage); assert.equal(attempt(r).classification,"TIMEOUT");
      assert.ok(!JSON.stringify(attempt(r)).includes("must-not-be-stored"));
    }
    const pacer = new Pacer(1000);
    await readHttp(base,base,new AbortController().signal,pacer,[],5000);
    const r = await readHttp(base,base,new AbortController().signal,pacer,[],1000);
    assert.equal(r.outcome,"OK"); assert.equal(r.timeoutStage,undefined);
    assert.ok(r.responseTimeMs >= 950);
  } finally { server.closeAllConnections(); await new Promise<void>(resolve=>server.close(()=>resolve())); }
});

test("Browser retains confirmed 403 when DOMContentLoaded times out on a local fixture", async () => {
  const server = createServer((req,res) => {
    if (req.url === "/stall.js") return;
    res.writeHead(403,{"content-type":"text/html"});
    res.end("<title>Access denied</title><script src='/stall.js'></script>");
  });
  server.listen(0,"127.0.0.1"); await once(server,"listening");
  const base="http://127.0.0.1:"+(server.address() as {port:number}).port;
  const reader=new BrowserReader();
  try {
    const r=await reader.read(base,base,new AbortController().signal);
    assert.equal(r.statusCode,403); assert.equal(r.outcome,"BLOCKED_BY_WAF");
    assert.equal(r.timeoutStage,"NAVIGATION"); assert.equal(r.html,"");
  } finally { await reader.close(); server.closeAllConnections(); await new Promise<void>(resolve=>server.close(()=>resolve())); }
});
