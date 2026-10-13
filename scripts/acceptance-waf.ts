import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { mkdirSync, writeFileSync } from "node:fs";
import { db } from "../src/lib/db";
import { createCoverageScan, runCoverageScan, coverageConfig, coverageControl, ACTIVE_SCANS } from "../src/lib/scanner/coverage";
import { type Transport } from "../src/lib/scanner/diagnostics";
import { day, yesterday } from "../src/lib/yandex/dates";
import { rowKey } from "../src/lib/yandex/store";
if (await db.scan.count({where:{status:{in:ACTIVE_SCANS}}})) throw new Error("Stop active scanner jobs before fixture acceptance.");
const hits: {path:string;method:string;http:boolean}[] = [];
let blockBrowser = true;
const server = createServer((req,res) => {
  const http = Boolean(req.headers["user-agent"]?.includes("G-market-Growth-Radar"));
  hits.push({path:req.url!,method:req.method!,http});
  if (req.url === "/robots.txt") return res.end("User-agent: *");
  res.setHeader("content-type","text/html");
  res.setHeader("set-cookie","private=not-diagnostic-data");
  if (req.url?.startsWith("/item") && (http || blockBrowser)) { res.statusCode=403; return res.end("<title>Access denied</title>"); }
  res.end("<title>Local readable WAF fixture</title><h1>Fixture content</h1><p>Only read this page.</p><script>fetch('/mutate',{method:'POST'});fetch('/cart')</script>");
});
server.listen(0,"127.0.0.1"); await once(server,"listening");
const base = "http://127.0.0.1:"+(server.address() as {port:number}).port+"/";
const site = await db.site.create({data:{name:"Local Sprint 2.2.1 WAF diagnostics",baseUrl:base}}), counterId="waf-fixture";
const reports: object[] = [];
try {
  const integration=await db.integration.findUniqueOrThrow({where:{type:"Yandex Metrika"}}), date=day(yesterday());
  const job=await db.jobRun.create({data:{siteId:site.id,integrationId:integration.id,source:"METRIKA",mode:"FIXTURE_WAF",status:"COMPLETED",dateFrom:date,dateTo:date,configJson:{counterId}}});
  for (let i=1;i<=4;i++) { const url=base+"item"+i; await db.metrikaPageDaily.create({data:{siteId:site.id,counterId,date,url,normalizedUrl:url,rowKey:rowKey(url),visits:10-i,visitors:1,pageviews:1,jobRunId:job.id}}); }
  const run = async (mode:Transport,limit:number,batchSize=50,testUrl?:string) => {
    hits.length=0;
    const s=await createCoverageScan(30,"ALL",batchSize,true,site.id,counterId,{transport:mode,diagnosticLimit:limit,testUrl,delayMs:1000});
    await db.scan.update({where:{id:s.id},data:{status:"RUNNING",heartbeatAt:new Date()}});
    await runCoverageScan(s.id,new AbortController().signal);
    const r=await db.scan.findUniqueOrThrow({where:{id:s.id}}),c=coverageConfig(r.configJson)!;
    assert.ok(hits.every(h=>h.method==="GET" && h.path!=="/mutate" && h.path!=="/cart"));
    assert.ok(!JSON.stringify(c.queue.map(q=>q.diagnostics)).includes("not-diagnostic-data"));
    reports.push({scanId:s.id,transport:mode,limit,status:r.status,processed:r.pagesScanned,remaining:c.progress?.remaining,reason:c.pauseReason,diagnostics:c.queue.filter(q=>q.result).map(q=>q.diagnostics)});
    return {r,c,hits:[...hits]};
  };
  const browser=await run("BROWSER_ONLY",4,2);
  assert.equal(browser.r.status,"PAUSED"); assert.equal(browser.r.pagesScanned,3); assert.equal(browser.c.queue[3].result,undefined);
  assert.equal(browser.c.batches.length,2); assert.match(browser.r.lastError!,/3 URL/);
  assert.ok(browser.hits.filter(h=>h.path.startsWith("/item")).every(h=>!h.http));
  assert.equal(browser.c.queue[0].diagnostics?.http,undefined); assert.equal(browser.c.queue[0].diagnostics?.browser?.statusCode,403);
  const before=browser.c.queue.slice(0,3).map(q=>q.processedAt);
  // Explicit local-fixture Resume preserves committed results and resets the guard.
  await coverageControl(browser.r.id,"RESUME");
  await db.scan.update({where:{id:browser.r.id},data:{status:"RUNNING"}}); hits.length=0;
  await runCoverageScan(browser.r.id,new AbortController().signal);
  const resumed=coverageConfig((await db.scan.findUniqueOrThrow({where:{id:browser.r.id}})).configJson)!;
  assert.deepEqual(resumed.queue.slice(0,3).map(q=>q.processedAt),before);
  assert.ok(hits.filter(h=>h.path.startsWith("/item")).every(h=>h.path==="/item4"));
  const http=await run("HTTP_ONLY",4);
  assert.equal(http.r.status,"PAUSED"); assert.equal(http.r.pagesScanned,3);
  assert.ok(http.hits.every(h=>h.http)); assert.equal(http.c.queue[0].diagnostics?.browser,undefined);
  const fallback=await run("HTTP_BROWSER",4);
  assert.equal(fallback.r.status,"PAUSED"); assert.equal(fallback.r.pagesScanned,3);
  assert.equal(fallback.c.queue[0].diagnostics?.http?.statusCode,403); assert.equal(fallback.c.queue[0].diagnostics?.browser?.statusCode,403);
  assert.ok(!fallback.hits.some(h=>h.path==="/item4" && !h.http), "Third WAF result must abort the next browser fallback waiting in the pacer");
  blockBrowser=false;
  const recovered=await run("HTTP_BROWSER",3);
  assert.equal(recovered.r.status,"COMPLETED"); assert.equal(recovered.c.wafStreak,0);
  assert.ok(recovered.c.queue.every(q=>q.result==="SUCCESS_BROWSER" && q.diagnostics?.http?.statusCode===403 && q.diagnostics.browser?.statusCode===200));
  const one=await run("BROWSER_ONLY",1,50,base+"item1");
  assert.equal(one.c.queue.length,1); assert.equal(one.r.status,"COMPLETED"); assert.ok(one.hits.filter(h=>h.path.startsWith("/item")).every(h=>h.path==="/item1" && !h.http));
  const capped=await run("HTTP_ONLY",2);
  assert.equal(capped.c.queue.length,2); assert.equal(capped.r.status,"COMPLETED_WITH_ERRORS");
  assert.ok(capped.hits.every(h=>!["/item3","/item4"].includes(h.path)));
  await assert.rejects(createCoverageScan(30,"ALL",50,true,site.id,counterId,{diagnosticLimit:1,testUrl:base+"item1?csrftoken=secret"}));
  mkdirSync("test-results",{recursive:true}); writeFileSync("test-results/waf-acceptance.json",JSON.stringify({status:"PASS",productionScanStarted:false,siteId:site.id,scanId:browser.r.id,cases:reports},null,2));
  console.log("PASS: local modes, bounded diagnostics, persisted WAF pause across batches, explicit resume, read-only, no cookie/header persistence.");
} finally { server.closeAllConnections(); await new Promise<void>(resolve=>server.close(()=>resolve())); await db.$disconnect(); }
