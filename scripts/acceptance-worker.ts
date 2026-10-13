import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { once } from "node:events";
import { setTimeout as delay } from "node:timers/promises";
import { db } from "../src/lib/db";
import { stopScan } from "../src/lib/scanner/service";
import { scanOptions } from "../src/lib/scanner/options";
const server = createServer((req, res) => {
  if (req.url === "/robots.txt") res.end("User-agent: *");
  else if (req.url === "/sitemap.xml") {
    res.statusCode = 404;
    res.end();
  } else {
    res.setHeader("content-type", "text/html");
    res.end(
      '<title>Worker fixture</title><h1>Local worker fixture</h1><p>Enough readable content words.</p><a href="/a">A</a><a href="/b">B</a><a href="/c">C</a>',
    );
  }
});
server.listen(0, "127.0.0.1");
await once(server, "listening");
const baseUrl =
  "http://127.0.0.1:" + (server.address() as { port: number }).port;
const site = await db.site.create({
  data: { baseUrl, name: "Local Worker Acceptance Fixture" },
});
const child = spawn(
  process.execPath,
  ["--conditions=react-server", "--import=tsx", "scripts/worker.ts"],
  { stdio: ["ignore", "pipe", "pipe"], env: process.env },
);
let logs = "";
child.stdout.on("data", (data) => {
  logs += String(data);
});
child.stderr.on("data", (data) => {
  logs += String(data);
});
async function until(check: () => Promise<boolean>) {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    if (await check()) return;
    await delay(200);
  }
  throw new Error("Worker acceptance timeout. " + logs);
}
try {
  const options = scanOptions({
    maxPages: 5,
    concurrency: 1,
    delayMs: 1000,
    seeds: [baseUrl],
    browserFallback: false,
  });
  const scan = await db.scan.create({
    data: { siteId: site.id, configJson: { ...options } },
  });
  await until(async () => {
    const state = await db.scan.findUniqueOrThrow({ where: { id: scan.id } });
    return state.pagesScanned >= 1;
  });
  await stopScan(scan.id);
  await until(
    async () =>
      (await db.scan.findUniqueOrThrow({ where: { id: scan.id } })).status ===
      "STOPPED",
  );
  const state = await db.scan.findUniqueOrThrow({ where: { id: scan.id } });
  assert.ok(state.finishedAt);
  const count = await db.scanPage.count({ where: { scanId: scan.id } });
  await delay(1200);
  assert.equal(await db.scanPage.count({ where: { scanId: scan.id } }), count);
  const stale = await db.scan.create({
    data: {
      siteId: scan.siteId,
      status: "RUNNING",
      heartbeatAt: new Date(Date.now() - 120000),
    },
  });
  await until(
    async () =>
      (await db.scan.findUniqueOrThrow({ where: { id: stale.id } })).status ===
      "INTERRUPTED",
  );
  const missingHeartbeat = await db.scan.create({
    data: {
      siteId: scan.siteId,
      status: "STOPPING",
      startedAt: new Date(Date.now() - 120000),
      heartbeatAt: null,
    },
  });
  await until(async () =>
    (await db.scan.findUniqueOrThrow({ where: { id: missingHeartbeat.id } })).status === "INTERRUPTED",
  );
  console.log(
    "PASS: worker claims persisted queue, Stop interrupts running scan, stale heartbeat recovers; local fixture only.",
  );
} finally {
  child.kill();
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await db.$disconnect();
}
