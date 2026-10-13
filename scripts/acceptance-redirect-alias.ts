import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {writeFileSync} from 'node:fs';
import {db} from '../src/lib/db';
import {json} from '../src/lib/yandex/settings';
import {createScan} from '../src/lib/scanner/service';
import {scanOptions} from '../src/lib/scanner/options';
import {crawl} from '../src/lib/scanner/engine';
import {saveScanPage} from '../src/lib/scanner/store';
import {emptyResult} from '../src/lib/scanner/model';
import {normalizeUrl} from '../src/lib/scanner/url';
import {completeTargetedScan} from '../src/lib/yandex/targeted';
import {rematchSite} from '../src/lib/yandex/store';
import {searchDataset} from '../src/lib/search/dataset';
import {historicalUrls} from '../src/lib/scanner/alias-view';
import {day,yesterday} from '../src/lib/yandex/dates';
import {redirectHops} from '../src/lib/scanner/redirects';
if(!/^\/radar_stabilization1_\d+$/.test(new URL(process.env.DATABASE_URL!).pathname))throw Error('Isolated fixture DB required');
const path='/catalog/gazpromneft-premium-n-5w-40-kanistra-4-l/',legacyPath='/catalog/14134/';
const server=createServer((req,res)=>{
 const redirects:Record<string,[number,string]>={[legacyPath]:[301,path],'/temporary/':[302,path],'/chain-a/':[302,'/chain-b/'],'/chain-b/':[301,path],'/cross/':[301,'http://127.0.0.1:1/outside/']};
 const redirect=redirects[req.url!];if(redirect){res.writeHead(redirect[0],{location:redirect[1]});res.end();return;}
 if(req.url==='/dead/'){res.writeHead(404);res.end('missing');return;}
 if(req.url==='/waf/'){res.writeHead(403);res.end('blocked');return;}
 if(req.url==='/restricted/'){res.writeHead(401);res.end('auth');return;}
 res.writeHead(200,{'content-type':'text/html'});res.end(`<html><head><title>Fixture oil</title><link rel="canonical" href="${path}"></head><body><h1>Oil</h1>fixture</body></html>`);
});
await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const base=`http://127.0.0.1:${(server.address() as any).port}/`,source=new URL(legacyPath,base).href,final=new URL(path,base).href;
const target=await db.integration.findUniqueOrThrow({where:{type:'Target Site'}}),web=await db.integration.findUniqueOrThrow({where:{type:'Yandex Webmaster'}}),met=await db.integration.findUniqueOrThrow({where:{type:'Yandex Metrika'}});
function raw(r:any){const {pageId,matchStatus,matchReason,normalizedUrl,updatedAt,...rest}=r;return rest;}
try{
 const site=await db.site.create({data:{baseUrl:base,name:'Redirect lifecycle fixture'}});
 await db.integration.update({where:{id:target.id},data:{configJson:json({baseUrl:base})}});await db.integration.update({where:{id:web.id},data:{configJson:json({siteId:site.id,hostId:'alias-fixture'})}});await db.integration.update({where:{id:met.id},data:{configJson:json({siteId:site.id,counterId:'alias-counter'})}});
 const initial=await db.scan.create({data:{siteId:site.id,status:'COMPLETED'}});await saveScanPage(initial.id,site.id,{...emptyResult(final,'HTTP'),statusCode:200});await saveScanPage(initial.id,site.id,{...emptyResult(source,'HTTP'),statusCode:200});
 const page=await db.page.findUniqueOrThrow({where:{siteId_normalizedUrl:{siteId:site.id,normalizedUrl:normalizeUrl(final)}}});
 const month=new Date();month.setUTCDate(1);month.setUTCMonth(month.getUTCMonth()-1);month.setUTCHours(0,0,0,0);const date=day(yesterday());
 const job=await db.jobRun.create({data:{siteId:site.id,integrationId:met.id,source:'METRIKA',mode:'FIXTURE',status:'COMPLETED',dateFrom:date,dateTo:date}});
 await db.webmasterQueryDaily.createMany({data:[{url:final,pageId:page.id,impressions:100,clicks:10,hostId:'file-new',avgPosition:3,importedAt:new Date('2026-10-07')},{url:source,pageId:null,impressions:200,clicks:20,hostId:'file-new',avgPosition:7,importedAt:new Date('2026-10-07')},{url:source,pageId:null,impressions:190,clicks:19,hostId:'file-old',avgPosition:7,importedAt:new Date('2026-10-06')}].map((r,i)=>({...r,siteId:site.id,date:month,grain:'MONTH',periodMonth:month.toISOString().slice(0,7),source:'WEBMASTER_IMPORT',query:'fixture oil',normalizedQuery:'fixture oil',normalizedUrl:normalizeUrl(r.url),rowKey:'row-'+i,matchStatus:r.pageId?'MATCHED':'UNMATCHED',ctr:10,rawJson:{url:r.url,originalMetric:r.impressions}}))});
 await db.metrikaPageDaily.createMany({data:[{url:final,pageId:page.id,visits:5},{url:source,pageId:null,visits:7}].map((r,i)=>({...r,siteId:site.id,jobRunId:job.id,counterId:'alias-counter',date,normalizedUrl:normalizeUrl(r.url),rowKey:'traffic-'+i,visitors:1,pageviews:1,rawJson:{sourceUrl:r.url}}))});
 const baselineSearch=await db.webmasterQueryDaily.findMany({where:{siteId:site.id},orderBy:{id:'asc'}}),baselineMetrika=await db.metrikaPageDaily.findMany({where:{siteId:site.id},orderBy:{id:'asc'}});
 const before=await searchDataset({siteId:site.id,pageId:page.id});assert.equal(before.reduce((n,r)=>n+r.impressions,0),100);
 async function read(url:string,mode:'HTTP'|'BROWSER'='HTTP'){
  const scan=await createScan({mode,maxPages:1,single:true,seeds:[url],delayMs:mode==='BROWSER'?1000:500,concurrency:1,browserFallback:false},{searchTargeted:{source:'TEST_ONE',scope:'SINGLE',batch:1,selected:[url],state:'PENDING'}});
  await crawl(base,scanOptions(scan.configJson as any),new AbortController().signal,r=>saveScanPage(scan.id,site.id,r),async()=>{});
  await db.scan.update({where:{id:scan.id},data:{status:'COMPLETED',finishedAt:new Date()}});await completeTargetedScan(scan.id);return db.scan.findUniqueOrThrow({where:{id:scan.id},include:{pages:true}});
 }
 const first=await read(source),snapshot=first.pages[0];assert.equal(redirectHops(snapshot.redirectsJson)[0].statusCode,301);assert.equal(snapshot.pageId,page.id);
 assert.equal((first.configJson as any).searchTargeted.outcomes[0].resolutionStatus,'RESOLVED_REDIRECT');
 assert.equal((await db.page.findFirstOrThrow({where:{siteId:site.id,normalizedUrl:normalizeUrl(source)}})).active,false);
 let matched=await db.webmasterQueryDaily.findMany({where:{siteId:site.id},orderBy:{id:'asc'}}),traffic=await db.metrikaPageDaily.findMany({where:{siteId:site.id},orderBy:{id:'asc'}});
 assert.equal(matched.filter(r=>r.url===source&&r.pageId===page.id&&r.matchReason==='observed redirect alias').length,2);assert.equal(traffic.find(r=>r.url===source)?.pageId,page.id);
 assert.deepEqual(matched.map(raw),baselineSearch.map(raw));assert.deepEqual(traffic.map(raw),baselineMetrika.map(raw));
 const after=await searchDataset({siteId:site.id,pageId:page.id});assert.equal(after.reduce((n,r)=>n+r.impressions,0),300);assert.equal(after.reduce((n,r)=>n+r.clicks,0),30);assert.equal(after.length,2);assert.equal(traffic.filter(r=>r.pageId===page.id).reduce((n,r)=>n+r.visits,0),12);
 const aliasCount=(await db.page.findUniqueOrThrow({where:{id:page.id}})).aliasesJson;await read(source);await rematchSite(site.id,[source]);assert.deepEqual((await db.page.findUniqueOrThrow({where:{id:page.id}})).aliasesJson,aliasCount);assert.equal((await searchDataset({siteId:site.id,pageId:page.id})).reduce((n,r)=>n+r.impressions,0),300);
 const temporary=await read(base+'temporary/');assert.equal(redirectHops(temporary.pages[0].redirectsJson)[0].statusCode,302);assert.equal(temporary.pages[0].pageId,page.id);
 const browser=await read(base+'temporary/','BROWSER');assert.equal(browser.pages[0].source,'BROWSER');assert.equal(redirectHops(browser.pages[0].redirectsJson)[0].statusCode,302);assert.equal(browser.pages[0].pageId,page.id);
 const chain=await read(base+'chain-a/');assert.equal(chain.pages[0].pageId,page.id);assert.deepEqual(redirectHops(chain.pages[0].redirectsJson).map(h=>h.statusCode),[302,301]);
 const dead=await read(base+'dead/'),waf=await read(base+'waf/'),auth=await read(base+'restricted/');assert.equal((dead.configJson as any).searchTargeted.outcomes[0].resolutionStatus,'HISTORICAL_DEAD');assert.equal((waf.configJson as any).searchTargeted.outcomes[0].resolutionStatus,'UNRESOLVED');assert.equal((auth.configJson as any).searchTargeted.outcomes[0].resolutionStatus,'UNRESOLVED');
 await read(base+'canonical-only/');await read(base+'cross/');const aliases=(await db.page.findUniqueOrThrow({where:{id:page.id}})).aliasesJson as string[];
 for(const suffix of ['chain-b/','dead/','waf/','restricted/','canonical-only/','cross/'])assert.ok(!aliases.includes(normalizeUrl(base+suffix)),suffix);
 await assert.rejects(()=>saveScanPage(initial.id,site.id,{...emptyResult(base+'external/','HTTP'),finalUrl:'https://other.invalid/',statusCode:200,redirectsJson:[base+'external/']}),/Cross-site/);
 const view=await historicalUrls(page.id,28,'M1'),alias=view!.rows.find(r=>r.url===normalizeUrl(source))!;assert.equal(alias.statusCode,301);assert.equal(alias.impressions,200);assert.equal(alias.clicks,20);assert.equal(alias.visits,7);
 matched=await db.webmasterQueryDaily.findMany({where:{siteId:site.id},orderBy:{id:'asc'}});traffic=await db.metrikaPageDaily.findMany({where:{siteId:site.id},orderBy:{id:'asc'}});assert.deepEqual(matched.map(raw),baselineSearch.map(raw));assert.deepEqual(traffic.map(raw),baselineMetrika.map(raw));
 writeFileSync('test-results/redirect-alias-fixtures.json',JSON.stringify({status:'PASS',siteId:site.id,pageId:page.id,scanId:first.id,source,final,searchRematched:2,metrikaRematched:1,rawUrlAndMetricsPreserved:true,impressionsBefore:100,impressionsAfter:300,aliasImpressions:200,visitsBefore:5,visitsAfter:12,aliasVisits:7,doubleCount:false,idempotency:true,observed301:true,observed302:true,chainFinalTarget:true,noIntermediateAlias:true,canonicalNotRedirect:true,deadNoAlias:true,wafAuthUnresolved:true,crossSiteRejected:true,oldExactPageArchived:true,aliasViewPageFiltered:true},null,2));console.log('PASS redirect alias lifecycle fixtures');
}finally{server.close();await db.integration.update({where:{id:target.id},data:{configJson:json(target.configJson)}});await db.integration.update({where:{id:web.id},data:{configJson:json(web.configJson)}});await db.integration.update({where:{id:met.id},data:{configJson:json(met.configJson)}});await db.$disconnect();}
