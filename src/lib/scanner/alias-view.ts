import 'server-only';
import {db} from '../db';
import {normalizeUrl} from './url';
import {observedRedirect,redirectHops} from './redirects';
import {searchDataset} from '../search/dataset';
import {defaultSearchSelection,rangeForSite} from '../search/range';
import {readIntegration,config} from '../yandex/settings';
import {day,period} from '../yandex/dates';
export async function historicalUrls(pageId:string,n:number,searchSelection?:string){
 const page=await db.page.findUniqueOrThrow({where:{id:pageId},select:{id:true,siteId:true,normalizedUrl:true,aliasesJson:true,site:{select:{baseUrl:true}}}});
 const aliases=[...new Set(Array.isArray(page.aliasesJson)?page.aliasesJson.filter((v):v is string=>typeof v==='string'&&v!==page.normalizedUrl):[])];
 if(!aliases.length)return null;
 const [w,m]=await Promise.all([readIntegration('WEBMASTER'),readIntegration('METRIKA')]),wc=config(w?.configJson),mc=config(m?.configJson),searchPeriod=await rangeForSite(page.siteId,await defaultSearchSelection(page.siteId,searchSelection,n)),trafficPeriod=period(n);
 const [snapshots,search,traffic]=await Promise.all([
  db.scanPage.findMany({where:{pageId,outcome:'OK',requestedUrl:{not:null}},orderBy:{scannedAt:'desc'},take:100,select:{requestedUrl:true,finalUrl:true,statusCode:true,outcome:true,source:true,redirectsJson:true,scannedAt:true}}),
  searchDataset({siteId:page.siteId,pageId,date:{gte:day(searchPeriod.from),lte:day(searchPeriod.to)}},wc.siteId===page.siteId?wc.hostId:undefined),
  mc.siteId===page.siteId&&mc.counterId?db.metrikaPageDaily.findMany({where:{siteId:page.siteId,pageId,counterId:mc.counterId,normalizedUrl:{in:aliases},date:{gte:day(trafficPeriod.from),lte:day(trafficPeriod.to)}},select:{url:true,visits:true}}):[],
 ]);
 return {searchPeriod,trafficPeriod,rows:aliases.map(url=>{
  const evidence=snapshots.find(s=>s.requestedUrl&&normalizeUrl(s.requestedUrl)===url&&observedRedirect(s,page.site.baseUrl));
  const rows=search.filter(r=>normalizeUrl(r.url)===url),visits=traffic.filter(r=>normalizeUrl(r.url)===url);
  return {url,sourceUrl:evidence?.requestedUrl??url,finalUrl:evidence?.finalUrl??null,statusCode:evidence?redirectHops(evidence.redirectsJson)[0]?.statusCode??null:null,observedAt:evidence?.scannedAt??null,type:evidence?'OBSERVED_REDIRECT':'LEGACY_ALIAS',source:evidence?'SCANNER':null,chain:evidence?.redirectsJson??null,impressions:rows.reduce((n,r)=>n+r.impressions,0),clicks:rows.reduce((n,r)=>n+r.clicks,0),visits:visits.length?visits.reduce((n,r)=>n+r.visits,0):null};
 })};
}
