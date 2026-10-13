import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { db } from "../src/lib/db";
import { landingDataset } from "../src/lib/yandex/dataset";
import { previewPriority, savePriority } from "../src/lib/yandex/priority";
import { enqueueSync } from "../src/lib/yandex/jobs";
import { config, readIntegration } from "../src/lib/yandex/settings";
import type { TargetDiagnostic } from "../src/lib/yandex/targeted";
try {
  const data = await landingDataset();
  const integration = (await readIntegration("WEBMASTER"))!;
  assert.equal(await db.jobRun.count({ where: { status: "RUNNING" } }),0,"Stop Yandex worker for acceptance");
  const uncertain = await db.jobRun.findFirstOrThrow({ where: { siteId: data.site.id, source: "WEBMASTER", status: { in: ["PARTIAL","FAILED"] }, checkpointJson: { path:["phase"], equals:"SUBMITTING" } } });
  const countBefore = await db.jobRun.count({ where: { siteId: data.site.id, source:"WEBMASTER" } });
  const preview = await previewPriority();
  const selection = await savePriority("TOP20",preview.rows.map(r=>r.url),preview.fingerprint);
  assert.equal(selection.urls.length,20);
  await assert.rejects(enqueueSync("WEBMASTER","INITIAL",7),/EXPORT_SUBMISSION_UNCERTAIN/);
  assert.equal(await db.jobRun.count({ where: { siteId: data.site.id, source:"WEBMASTER" } }),countBefore);
  assert.equal((await db.jobRun.findUniqueOrThrow({ where:{id:uncertain.id} })).status,uncertain.status);
  const scan = await db.scan.findFirstOrThrow({ where:{siteId:data.site.id,configJson:{path:["targeted","kind"],equals:"TOP_UNMATCHED"}},orderBy:{startedAt:"desc"}});
  const diagnostic = (scan.configJson as unknown as {targeted:TargetDiagnostic}).targeted;
  assert.equal(diagnostic.state,"DONE");
  assert.equal(diagnostic.before.totalVisits,diagnostic.after!.totalVisits);
  const report = { checkedAt:new Date().toISOString(),production:true,site:data.site.baseUrl,dates:data.dates,missingMetrikaDays:data.missingDays,
    landingUrls:{raw:data.rawUrls,normalized:data.coverage.totalUrls,matched:data.coverage.matchedUrls,unmatched:data.coverage.unmatchedUrls},
    currentTrafficCoverage:data.coverage, targetScan:{id:scan.id,status:scan.status,scanned:scan.pagesScanned,selected:diagnostic.selected,before:diagnostic.before,after:diagnostic.after,dates:diagnostic.dates,cohortCapturedAt:diagnostic.capturedAt},
    priorityScope:{mode:selection.mode,urls:preview.rows.map(r=>({url:r.url,visits:r.visits,pageId:r.pageId,pageType:r.pageType,matchStatus:r.matchStatus,webmasterDiscovery:r.discovery,hasSearch:r.hasSearch,reason:r.inclusionReason})),searchPages:preview.rows.filter(r=>r.hasSearch).length,
      quotaFor7Days:{urlDays:selection.urls.length*7,minimumQuotaDays:Math.ceil(selection.urls.length*7/100)},newExportPosts:0,uncertainPostGuard:"PASS",uncertainJobId:uncertain.id,
      mvpAcceptance:preview.rows.every(r=>r.hasSearch)?"EXISTING_DATA_AVAILABLE; check date completeness":"INCOMPLETE: TOP20 Search data missing; unresolved POST remains blocked"},
    optionalFullHostExport:"Not required for MVP; no new 690-URL export job created",
    counterId:data.counterId,webmasterUserId:config(integration.configJson).userId,hostId:config(integration.configJson).hostId,
  };
  writeFileSync("test-results/sprint2-1-production.json",JSON.stringify(report,null,2));
  console.log(JSON.stringify(report));
} finally { await db.$disconnect(); }
