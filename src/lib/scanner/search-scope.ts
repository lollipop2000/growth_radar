import 'server-only';
import {db} from '../db';
import {currentSite,readIntegration,config} from '../yandex/settings';
import {analyticsSearchDataset} from '../search/dataset';
import {rangeForSite} from '../search/range';
import {day} from '../yandex/dates';
import {modernSignals,seoEligibility,searchUrlKind} from '../seo-actions/eligibility';
import {safeDatasetUrl} from '../yandex/dataset';
import {selectRequestUrl} from './url';
import {createScan} from './service';
import type {Transport} from './diagnostics';
export type SearchScanSource='SEO_RESCAN'|'SEARCH_UNMATCHED';
export type SearchCandidate={url:string;pageId:string|null;pageType:string;impressions:number;clicks:number;position:number|null;topQuery:string;kind:string;matchStatus:string;eligibility:string;reason:string;snapshotDate:string|null;modern:boolean};
const snapshotSelect={scannedAt:true,statusCode:true,outcome:true,source:true,canonical:true,robots:true,indexable:true,finalUrl:true,contentSignalsJson:true} as const;
export async function searchScope(){
 const site=await currentSite(),range=await rangeForSite(site.id,'ALL'),w=config((await readIntegration('WEBMASTER'))?.configJson);
 const [rows,pages,actions]=await Promise.all([analyticsSearchDataset({siteId:site.id,date:{gte:day(range.from),lte:day(range.to)}},w.siteId===site.id?w.hostId:undefined),db.page.findMany({where:{siteId:site.id,active:true},select:{id:true,url:true,pageType:true,aliasesJson:true,latestScanPage:{select:snapshotSelect},scanPages:{where:{outcome:'OK',statusCode:{gte:200,lt:400}},orderBy:{scannedAt:'desc'},take:1,select:snapshotSelect}}}),db.seoAction.findMany({where:{siteId:site.id,isCurrent:true,status:'ACTIVE',priority:{in:['HIGH','VERY_HIGH']}},select:{pageId:true}})]);
 const pageIndex=new Map(pages.map(p=>[p.id,p])),high=new Set(actions.map(a=>a.pageId)),byUrl=new Map<string,typeof rows>();for(const r of rows){const list=byUrl.get(r.url)??[];list.push(r);byUrl.set(r.url,list);}
 const urls:SearchCandidate[]=[...byUrl].map(([url,rs])=>{const p=pageIndex.get(rs.find(r=>r.pageId)?.pageId??''),snapshot=p?.scanPages[0],latest=p?.latestScanPage,queries=new Map<string,number>();for(const r of rs)queries.set(r.query,(queries.get(r.query)??0)+r.impressions);const known=rs.filter(r=>r.avgPosition!=null),weight=known.reduce((n,r)=>n+r.impressions,0),e=seoEligibility(p?.url??url,latest??snapshot,Array.isArray(p?.aliasesJson)?p.aliasesJson.filter((v):v is string=>typeof v==='string'):[]);return {url,pageId:p?.id??null,pageType:p?.pageType??'unknown',impressions:rs.reduce((n,r)=>n+r.impressions,0),clicks:rs.reduce((n,r)=>n+r.clicks,0),position:weight?known.reduce((n,r)=>n+r.impressions*r.avgPosition!,0)/weight:null,topQuery:[...queries].sort((a,b)=>b[1]-a[1])[0]?.[0]??'',kind:searchUrlKind(url),matchStatus:p?'MATCHED':'UNMATCHED',eligibility:e.status,reason:e.reason,snapshotDate:snapshot?.scannedAt.toISOString()??null,modern:modernSignals(snapshot?.contentSignalsJson)};}).sort((a,b)=>b.impressions-a.impressions||b.clicks-a.clicks||a.url.localeCompare(b.url));
 const unmatched=urls.filter(r=>!r.pageId),matchedIds=new Set(urls.flatMap(r=>r.pageId?[r.pageId]:[])),candidates=new Map<string,SearchCandidate>();
 const resolutions=await db.scan.findMany({where:{siteId:site.id,configJson:{path:['searchTargeted','state'],equals:'DONE'}},orderBy:{startedAt:'asc'},select:{configJson:true}}),resolved=new Map<string,string>();
 for(const scan of resolutions){const outcomes=(scan.configJson as {searchTargeted?:{outcomes?:{requestedUrl:string;resolutionStatus:string}[]}})?.searchTargeted?.outcomes??[];for(const outcome of outcomes)resolved.set(outcome.requestedUrl,outcome.resolutionStatus);}
 for(const row of unmatched)if(resolved.get(row.url)==='HISTORICAL_DEAD'){row.matchStatus='HISTORICAL_DEAD';row.reason='Последний targeted scan: HTTP 404; исторический URL не удалён из Search данных';}
 for(const r of urls){if(!r.pageId||r.modern)continue;const p=pageIndex.get(r.pageId)!;const kind=searchUrlKind(p.url);if(kind==='DOCUMENT'||kind==='MALFORMED_OTHER'||!safeDatasetUrl(p.url,site.baseUrl)||r.eligibility==='NOT_ELIGIBLE'||kind==='QUERY_FILTER'&&r.eligibility!=='ELIGIBLE')continue;const old=candidates.get(r.pageId);if(old){old.impressions+=r.impressions;old.clicks+=r.clicks;}else candidates.set(r.pageId,{...r,url:p.url,reason:'Нет modern contentSignals; '+r.reason});}
 const rescan=[...candidates.values()].sort((a,b)=>b.impressions-a.impressions||Number(high.has(b.pageId!))-Number(high.has(a.pageId!))||Number(['product','category'].includes(b.pageType))-Number(['product','category'].includes(a.pageType))||a.url.localeCompare(b.url));
 const matchedPages=pages.filter(p=>matchedIds.has(p.id)),modern=matchedPages.filter(p=>modernSignals(p.scanPages[0]?.contentSignalsJson)).length;
 return {site:{id:site.id,baseUrl:site.baseUrl},period:range,urls,unmatched,rescan,documents:urls.filter(r=>r.kind==='DOCUMENT'),filters:urls.filter(r=>r.kind==='QUERY_FILTER'),summary:{searchUrls:urls.length,matchedUrls:urls.length-unmatched.length,matchedPages:matchedIds.size,unmatchedUrls:unmatched.length,matchRate:urls.length?100*(urls.length-unmatched.length)/urls.length:0,modernPages:modern,requiringRescan:matchedIds.size-modern,eligibleRescan:rescan.length,groups:Object.fromEntries(['LEGACY_NUMERIC','DOCUMENT','OTHER_HTML','QUERY_FILTER','MALFORMED_OTHER'].map(k=>[k,unmatched.filter(r=>r.kind===k).length]))}};
}
export async function searchScanPreview(source:SearchScanSource,scope:string){
 if(!['TOP50','TOP100','ALL'].includes(scope))throw Error('Некорректный Search scope');const data=await searchScope();
 const pool=source==='SEO_RESCAN'?data.rescan:data.unmatched.slice(0,100).filter(r=>r.matchStatus!=='HISTORICAL_DEAD'&&['LEGACY_NUMERIC','OTHER_HTML'].includes(r.kind)&&safeDatasetUrl(r.url,data.site.baseUrl));
 const limit=source==='SEARCH_UNMATCHED'?100:scope==='ALL'?pool.length:scope==='TOP50'?50:100;
 return {source,scope,period:data.period,summary:data.summary,rows:pool.slice(0,limit),batches:Math.ceil(Math.min(pool.length,limit)/50)};
}
export async function createSearchScan(source:SearchScanSource,scope:string,selectedUrls:string[],batch:number,transport:Transport,delayMs:number){
 const preview=await searchScanPreview(source,scope),data=await currentSite();
 if(!selectedUrls.length||selectedUrls.length>5000||!Number.isInteger(batch)||batch<1||batch>Math.ceil(selectedUrls.length/50))throw Error('Некорректная пачка Search URL; выполните preview');
 const selected=selectedUrls.slice((batch-1)*50,batch*50),available=new Set(preview.rows.map(r=>r.url));
 if(selected.some(url=>!available.has(url)))throw Error('Search scope изменился. Повторите preview.');
 const seeds=selected.map(url=>selectRequestUrl(url,[url],data.baseUrl)!);
 return createScan({mode:transport==='BROWSER_ONLY'?'BROWSER':'HTTP',browserFallback:transport==='HTTP_BROWSER',maxPages:seeds.length,concurrency:1,delayMs,seeds,seedOnly:true,single:false},{searchTargeted:{source,scope,batch,selected,scopeUrls:selectedUrls,state:'PENDING',before:preview.summary,period:preview.period}});
}
