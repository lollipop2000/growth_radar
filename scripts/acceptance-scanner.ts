import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { db } from "../src/lib/db";
import { crawl } from "../src/lib/scanner/engine";
import { scanOptions } from "../src/lib/scanner/options";
import { saveScanPage } from "../src/lib/scanner/store";
import { importCrawl } from "../src/lib/scanner/import-service";
import { createScan, stopScan } from "../src/lib/scanner/service";
import { writeFile, mkdir } from "node:fs/promises";
const server = createServer((req, res) => {
  res.setHeader(
    "content-type",
    req.url?.endsWith(".xml") ? "application/xml" : "text/html",
  );
  if (req.url === "/robots.txt")
    res.end("User-agent: *\nSitemap: /sitemap.xml");
  else if (req.url === "/sitemap.xml")
    res.end(
      "<urlset><url><loc>/product/a</loc></url><url><loc>/product/b</loc></url></urlset>",
    );
  else if (req.url === "/challenge") res.end("<title>Just a moment...</title>");
  else
    res.end(
      '<html><title>Local acceptance fixture</title><meta name="description" content="Fixture only"><h1>Local fixture</h1><p>Read only acceptance fixture content.</p></html>',
    );
});
server.listen(0, "127.0.0.1");
await once(server, "listening");
const baseUrl =
  "http://127.0.0.1:" + (server.address() as { port: number }).port;
const savedIntegration = await db.integration.findUnique({
  where: { type: "Target Site" },
});
try {
  const site = await db.site.create({
    data: { name: "Local Acceptance Fixture", baseUrl },
  });
  for (let run = 0; run < 2; run++) {
    const scan = await db.scan.create({
      data: { siteId: site.id, mode: "HTTP", status: "RUNNING" },
    });
    const summary = await crawl(
      baseUrl,
      scanOptions({ maxPages: 2, delayMs:500, browserFallback: false }),
      new AbortController().signal,
      (p) => saveScanPage(scan.id, site.id, p),
      async () => {},
    );
    await db.scan.update({
      where: { id: scan.id },
      data: {
        status: "COMPLETED",
        finishedAt: new Date(),
        pagesScanned: summary.scanned,
        pagesDiscovered: summary.discovered,
        errorsCount: summary.errors,
      },
    });
  }
  assert.equal(await db.page.count({ where: { siteId: site.id } }), 2);
  assert.equal(
    await db.scanPage.count({ where: { page: { siteId: site.id } } }),
    4,
  );
  const original = await db.page.findFirstOrThrow({
    where: { siteId: site.id, path: "/product/a" },
  });
  await db.page.update({
    where: { id: original.id },
    data: { manualType: true, pageType: "article" },
  });
  await db.integration.upsert({
    where: { type: "Target Site" },
    create: { type: "Target Site", configJson: { baseUrl } },
    update: { configJson: { baseUrl } },
  });
  const csv = [
    "URL,Status Code,Title,Meta Description,H1,H2,Canonical,Robots,Word Count",
    `${baseUrl}/product/a,200,Imported fixture title,Fixture import,H1,A; B,,index,12`,
    `${baseUrl}/product/a?utm_source=x,200,Duplicate,Fixture,H1,H2,,index,12`,
  ].join("\n");
  const imported = await importCrawl(
    new File([csv], "acceptance-crawl.csv", { type: "text/csv" }),
  );
  assert.equal(imported.imported, 1);
  assert.equal(imported.skipped, 1);
  assert.equal(await db.page.count({ where: { siteId: site.id } }), 2);
  const page = await db.page.findUniqueOrThrow({
    where: { id: original.id },
    include: { latestScanPage: true },
  });
  assert.equal(page.latestScanPage?.source, "IMPORT");
  assert.equal(page.latestScanPage?.title, "Imported fixture title");
  assert.equal(page.pageType, "article");
  assert.equal(page.manualType, true);
  const browserScan = await db.scan.create({
    data: { siteId: site.id, mode: "BROWSER", status: "RUNNING" },
  });
  const browserSummary = await crawl(
    baseUrl,
    scanOptions({
      delayMs:1000,
      mode: "BROWSER",
      maxPages: 1,
      single: true,
      seeds: [baseUrl + "/product/a"],
    }),
    new AbortController().signal,
    (p) => saveScanPage(browserScan.id, site.id, p),
    async () => {},
  );
  await db.scan.update({
    where: { id: browserScan.id },
    data: {
      status: "COMPLETED",
      finishedAt: new Date(),
      pagesScanned: browserSummary.scanned,
      pagesDiscovered: browserSummary.discovered,
    },
  });
  assert.equal(
    (
      await db.page.findUniqueOrThrow({
        where: { id: original.id },
        include: { latestScanPage: true },
      })
    ).latestScanPage?.source,
    "BROWSER",
  );
  assert.equal(await db.page.count({ where: { siteId: site.id } }), 2);
  const queued = await createScan({
    maxPages: 1,
    single: true,
    seeds: [baseUrl + "/product/a"],
    browserFallback: false,
  });
  await stopScan(queued.id);
  assert.equal(
    (await db.scan.findUniqueOrThrow({ where: { id: queued.id } })).status,
    "STOPPED",
  );
  const report = {
    checkedAt: new Date().toISOString(),
    site: baseUrl,
    production: false,
    pageCount: 2,
    sources: ["HTTP", "BROWSER", "IMPORT"],
    duplicatePrevention: "PASS",
    history: "PASS",
    manualTypePreserved: "PASS",
    queuedStop: "PASS",
  };
  await mkdir("test-results", { recursive: true });
  await writeFile(
    "test-results/scanner-acceptance.json",
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report, null, 2));
} finally {
  if (savedIntegration)
    await db.integration.update({
      where: { id: savedIntegration.id },
      data: { configJson: savedIntegration.configJson as object },
    });
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await db.$disconnect();
}
