// Read-only existing database evidence; never contacts the target site.
import { db } from "../src/lib/db";
import { mkdirSync, writeFileSync } from "node:fs";
const scan = await db.scan.findUniqueOrThrow({where:{id:"cmuwa0o6o000o208s90v4ou8e"},select:{id:true,status:true,pagesScanned:true,configJson:true}});
const results = await db.scanPage.groupBy({by:["source","outcome","httpStatusCode","statusCode"],where:{scanId:scan.id},_count:true});
const successfulBrowser = await db.scanPage.count({where:{page:{siteId:"cmuv42bst000020wcam8pixal"},source:"BROWSER",outcome:"OK",statusCode:200,scanId:{not:scan.id}}});
const c = (scan.configJson as {coverage:{progress:unknown}}).coverage;
const report = {capturedAt:new Date().toISOString(),productionRequestsMade:0,scan:{id:scan.id,status:scan.status,pagesScanned:scan.pagesScanned,progress:c.progress},results,otherHistoricalBrowser200:successfulBrowser,limitation:"Historical records lack individual attempt timings/stages; exact WAF rule cannot be inferred."};
mkdirSync("test-results",{recursive:true}); writeFileSync("test-results/waf-history.json",JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2)); await db.$disconnect();
