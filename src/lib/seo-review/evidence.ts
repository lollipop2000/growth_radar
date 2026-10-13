import 'server-only';
import type {Page,ScanPage,SeoAction,Opportunity} from '@prisma/client';
import {db} from '../db';
import {targetUrl} from '../health';
import {publicData} from '../public-data';
import {seoPageView} from '../seo-actions/service';
import {aggregateQueries} from '../seo-actions/engine';
import {classifyQuery} from '../seo-actions/intent';
import {searchCoverage} from '../search/metrics';
import {searchAggregate} from '../opportunities/aggregate';
import {commerceForPage} from '../opportunities/page-commerce';
import {modernSignals} from '../seo-actions/eligibility';
import type {ContentSignals} from '../scanner/content';
import {AiError} from '../ai/provider';
import {normalizeQuery} from '../search/model';
import type {PageSeoReviewInput,Evidence,Json,State,Coverage} from './contract';
type View=Awaited<ReturnType<typeof seoPageView>>;
type Commerce=Awaited<ReturnType<typeof commerceForPage>>;
type LinkedPage={url:string;pageType:string;links:string[]|null;at:string|null;source:string|null};
export const MAX_INPUT_BYTES=80000;
const clean=(s:string)=>publicData(s).replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi,'[email скрыт]').replace(/(?:bearer\s+|(?:token|password|api[_-]?key|cookie)\s*[:=]\s*)[^\s,;]+/gi,'[секрет скрыт]');
/** Scalar strings are complete or refused; collections/excerpts are explicitly bounded. */
export function projectSeoReview(p:Page,s:ScanPage|null,v:View,cv:Commerce,seo:SeoAction[],opps:Opportunity[],pages:LinkedPage[],htmlAt:string|null):PageSeoReviewInput{
 pages=[...pages].sort((a,b)=>a.url.localeCompare(b.url));
 const safe=(v:unknown):Json=>typeof v==='string'?clean(v):v==null?null:typeof v==='number'||typeof v==='boolean'?v:Array.isArray(v)?v.map(safe):typeof v==='object'?Object.fromEntries(Object.entries(publicData(v)).map(([k,x])=>[k,safe(x)])):null;
 let next=0;const registry=(kind:string,value:unknown,state?:State,coverage:Coverage='FULL',truncated=false):Evidence=>({id:'E'+String(++next).padStart(3,'0'),kind,value:safe(value),state:state??(value==null?'UNKNOWN':'KNOWN_PRESENT'),coverage:value==null?'UNKNOWN':coverage,source:kind.startsWith('content.')||kind.startsWith('technical.')?'SAVED_SNAPSHOT:'+String(s?.source??'UNKNOWN'):kind.startsWith('search.')?'SAVED_WEBMASTER':kind.startsWith('links.')?'SAVED_LINK_GRAPH':kind==='product'?'CONFIRMED_MAPPING':kind.startsWith('finding.')?'SAVED_ACTIVE_FINDING':'SAVED_COMMERCE',observedAt:kind.startsWith('content.')||kind.startsWith('technical.')?s?.scannedAt.toISOString()??null:null,truncated,supportsAbsenceClaim:false});
 const signals=modernSignals(s?.contentSignalsJson)?s!.contentSignalsJson as ContentSignals:null;
 const content:Record<string,Evidence>={};
 for(const key of ['title','description','h1'] as const){const raw=s?.[key]??null,checked=!!s&&['HTTP','BROWSER'].includes(s.source)&&!!signals;
  content[key]=registry('content.'+key,typeof raw==='string'?clean(raw):null,raw==null?'UNKNOWN':raw.trim()?'KNOWN_PRESENT':checked?'KNOWN_ABSENT':'UNKNOWN');content[key].supportsAbsenceClaim=content[key].state==='KNOWN_ABSENT';}
 const h2=Array.isArray(s?.h2Json)?s.h2Json.filter((x):x is string=>typeof x==='string'):[];
 content.h2=registry('content.h2',s?h2.slice(0,25).map(clean):null,undefined,h2.length>25?'PARTIAL':'FULL',h2.length>25);
 const top=signals?.topText??null,body=signals?.visibleText??null;
 content.topText=registry('content.topText',top?clean(top.slice(0,4000)):null,undefined,'PARTIAL',!!top&&top.length>4000);
 // Multiple deterministic windows preserve material beyond the opening paragraph.
 const windows=body?[...new Set([0,Math.max(0,Math.floor(body.length/2)-1500),Math.max(0,body.length-3000)])].map(start=>({start,text:clean(body.slice(start,start+3000))})):null;
 content.excerpts=registry('content.excerpts',windows,undefined,'PARTIAL',!!body&&body.length>3000);
 for(const key of ['application','specifications','packaging','cta','price','availability','documentation','characteristics']){
  const observed=signals?.commercial[key];content[key]=registry('content.'+key,observed?.evidence?clean(observed.evidence):null,observed?.present?'KNOWN_PRESENT':observed?'NOT_OBSERVED':'UNKNOWN','PARTIAL');}
 const queries=aggregateQueries(v.page.allQueries).sort((a,b)=>b.impressions-a.impressions||a.query.localeCompare(b.query)),period={from:v.d.period.from,to:v.d.period.to};
 const selected=selectSearchQueries(queries,q=>classifyQuery(q.query,v.c).tags);
 const rawQueries=new Map<string,string>();for(const row of v.page.allQueries){const key=normalizeQuery(row.query),prior=rawQueries.get(key);if(prior===undefined||row.query.localeCompare(prior)<0)rawQueries.set(key,row.query);}
 const aggregate=searchAggregate(v.page.allQueries,v.d.period),summary=aggregate?Object.fromEntries(Object.entries(aggregate).filter(([k])=>k!=='demand')):null;
 const search={period,summary:registry('search.summary',v.page.allQueries.length?summary:null),coverage:registry('search.coverage',searchCoverage(v.page.allQueries,v.d.period)),queries:selected.map(({demand: _demand,...q})=>registry('search.query',{...q,query:clean(rawQueries.get(q.query)??q.query),pageId:p.id,intents:classifyQuery(q.query,v.c).tags})),totalQueries:queries.length,truncated:queries.length>25,trend:registry('search.trend',null)};
 for(const e of [search.summary,search.coverage,...search.queries]){e.period=period;e.coverage=searchCoverage(v.page.allQueries,v.d.period).ratio===1?'FULL':v.page.allQueries.length?'PARTIAL':'UNKNOWN';}
 const schema=Array.isArray(s?.structuredDataJson)?s.structuredDataJson:[];
 const technical={httpStatus:registry('technical.httpStatus',s?.statusCode),canonical:registry('technical.canonical',s?.canonical),robots:registry('technical.robots',s?.robots),indexable:registry('technical.indexable',s?.indexable),finalUrl:registry('technical.finalUrl',s?.finalUrl),redirects:registry('technical.redirects',s?.redirectsJson),schema:registry('technical.schema',s?schema:null,schema.length?'KNOWN_PRESENT':s?'NOT_OBSERVED':'UNKNOWN','PARTIAL')};
 const observedPages=pages.filter(p=>p.links!==null).length,graph=registry('links.summary',{observedPages,totalPages:pages.length,inbound:pages.filter(x=>x.links?.includes(p.url)).length,outbound:s?.internalLinksCount??null},observedPages?'KNOWN_PRESENT':'UNKNOWN',observedPages?'PARTIAL':'UNKNOWN');
 const linked=(x:LinkedPage,kind:string)=>{const e=registry(kind,{url:clean(x.url),pageType:x.pageType},undefined,'PARTIAL');e.observedAt=x.at;e.source='SAVED_LINK_GRAPH:'+String(x.source??'UNKNOWN');return e;};
 const outboundUrls=Array.isArray(s?.internalLinksJson)?s.internalLinksJson.filter((x):x is string=>typeof x==='string'):[];
 const linkRank=(x:LinkedPage)=>x.pageType==='category'?0:x.pageType==='product'?1:2;
 const inbound=pages.filter(x=>x.links?.includes(p.url)),outbound=pages.filter(x=>outboundUrls.includes(x.url)).sort((a,b)=>linkRank(a)-linkRank(b)||a.url.localeCompare(b.url)),related=pages.filter(x=>x.url!==p.url&&x.pageType===p.pageType).sort((a,b)=>a.url.localeCompare(b.url));
 const c=cv.commerce,cp={from:cv.period.from,to:cv.period.to},known=c?.sales?.days??0;
 const commerce={summary:registry('commerce.summary',{visits:cv.traffic?.visits??null,orders:c?.salesComplete?c.sales?.orders??null:null,revenue:c?.salesComplete?c.sales?.revenue??null:null,salesState:c?.salesComplete?'KNOWN_PRESENT':'UNKNOWN'},undefined,c?.salesComplete?'FULL':'PARTIAL'),coverage:registry('commerce.coverage',{knownDays:known,expectedDays:cv.period.days,provenance:c?.salesProvenance.map(x=>({mode:x.mode,coverageFrom:x.coverageFrom,coverageTo:x.coverageTo}))??[]},known?'KNOWN_PRESENT':'UNKNOWN',c?.salesComplete?'FULL':known?'PARTIAL':'UNKNOWN')};
 Object.values(commerce).forEach(e=>e.period=cp);
 const products=c?.groups.slice(0,15).map(g=>({code:clean(g.code),name:clean(g.name)}))??[];
 const productTruncated=(c?.groups.length??0)>15||(c?.skus.length??0)>20;
 const product=registry('product',products.length?{groups:products,skus:c?.skus.slice(0,20).map(x=>({sku:clean(x.sku),name:clean(x.name),productGroup:clean(x.productGroup)}))??[],category:c?.category??null}:null,undefined,productTruncated?'PARTIAL':'FULL',productTruncated);
 const existingFindings=[...seo.map(a=>registry('finding.seo',{rule:a.actionId,title:clean(a.title),area:a.category,priority:a.priority,period:{from:a.periodFrom.toISOString().slice(0,10),to:a.periodTo.toISOString().slice(0,10)}})),...opps.map(o=>registry('finding.commerce',{rule:o.ruleId,title:clean(o.title),priority:o.severity,period:{from:o.periodFrom.toISOString().slice(0,10),to:o.periodTo.toISOString().slice(0,10)}}))];
 const limits=['Сохранённые данные не подтверждают текущее состояние live-сайта. Дата snapshot указана отдельно.','Фрагменты текста и сигналы PARTIAL: ненаблюдение не означает отсутствие.','Search trends: UNKNOWN — сопоставимый тренд в этом профиле не рассчитан.','Граф PARTIAL: только сохранённые точные URL ссылок. Счётчики — наблюдаемый минимум; aliases и неполные снимки не доказывают orphan. Анализ всех посадочных сайта не проведён.','INVENTORY не входит в SEO Review. AI priority не изменяет deterministic score.'];
 if(productTruncated)limits.push('Product mapping ограничен: до 15 групп и 20 SKU.');
 if(!c?.salesComplete)limits.push(`Продажи UNKNOWN вне подтверждённого покрытия: ${known}/${cv.period.days} дней периода; это не нулевые продажи.`);
 if(!search.queries.length)limits.push('Search запросы UNKNOWN: рекомендации не могут ссылаться на выдуманный спрос.');
 if(search.truncated)limits.push(`Search: до 25 из ${queries.length}: TOP 15 по impressions, представители существующих intent classes, затем оставшиеся TOP; без новых кластеров.`);
 if(observedPages<pages.length)limits.push(`Граф PARTIAL: ${observedPages}/${pages.length} страниц. Нельзя доказать orphan.`);
 if(!signals)limits.push('Saved modern content signals UNKNOWN.');
 if(inbound.length>10||outbound.length>15||related.length>10)limits.push('Списки links ограничены: inbound 10, outbound 15, related 10.');
 for(const key of ['title','description','h1'])if(content[key].state==='UNKNOWN')limits.push(`${key}: UNKNOWN — null в сохранённом snapshot; исходный HTML не хранится, отсутствие тега не доказано.`);
 limits.push('Текст main/body смешивает фильтры, списки и рекомендации товаров. Semantic blocks не сохранены: свойства отдельного товара нельзя переносить на всю категорию или соседний товар.');
 limits.push('Search impressions/clicks — наблюдения этой страницы за указанный период; CTR = clicks/impressions × 100; avgPosition взвешена по impressions. demand из импортированного *_demand исключён: семантика источника не подтверждена, это не показы страницы.');
 for(const key of ['subcategoryStructure','filterStructure','productListStructure','categoryInformationBlock'])content[key]=registry('content.'+key,null,'UNKNOWN','UNKNOWN');
 const input:PageSeoReviewInput={version:'PAGE_SEO_PROFILE_V1',page:{pageId:p.id,currentUrl:clean(p.url),canonicalUrl:s?.canonical?clean(s.canonical):null,pageType:p.pageType,snapshotId:s?.id??null,snapshotSource:s?.source??null,snapshotAt:s?.scannedAt.toISOString()??null,lastSuccessfulHtmlAt:htmlAt,aliases:(Array.isArray(p.aliasesJson)?p.aliasesJson.filter((x):x is string=>typeof x==='string'):[]).slice(0,30).map(clean)},search,content,technical,internalLinks:{summary:graph,inbound:inbound.slice(0,10).map(x=>linked(x,'links.inbound')),outbound:outbound.slice(0,15).map(x=>linked(x,'links.outbound')),related:related.slice(0,10).map(x=>linked(x,'links.related')),knownPages:[]},commerce,product,existingFindings,evidenceQuality:{limitations:limits}};
 if(Array.isArray(p.aliasesJson)&&p.aliasesJson.length>30)limits.push('Aliases ограничены первыми 30 сохранёнными значениями.');
 // Fail closed for unusually large full scalars. No silent scalar truncation.
 if(Buffer.byteLength(JSON.stringify(input))>MAX_INPUT_BYTES)throw new AiError('INPUT_TOO_LARGE');
 input.evidenceQuality.inputBytes=Buffer.byteLength(JSON.stringify(input));return input;
}
export async function buildPageSeoReviewInput(pageId:string,selection:string='M3'):Promise<PageSeoReviewInput>{
 if(!/^[a-zA-Z0-9_-]{1,100}$/.test(pageId)||! /^(M1|M3|M6|M12|M18|ALL|7|28|30|90)$/.test(selection))throw new AiError('INVALID_PAGE');
 const baseUrl=await targetUrl(),site=baseUrl?await db.site.findUnique({where:{baseUrl}}):null;
 if(!site)throw new AiError('INVALID_PAGE');const p=await db.page.findFirst({where:{id:pageId,siteId:site.id}});if(!p)throw new AiError('INVALID_PAGE');
 const [s,html,v,cv,seo,opps,pages]=await Promise.all([
 db.scanPage.findFirst({where:{pageId,outcome:'OK',statusCode:{gte:200,lt:400}},orderBy:[{scannedAt:'desc'},{id:'desc'}]}),
 db.scanPage.findFirst({where:{pageId,outcome:'OK',source:{in:['HTTP','BROWSER']},statusCode:{gte:200,lt:400}},orderBy:{scannedAt:'desc'},select:{scannedAt:true}}),
 seoPageView(pageId,/^\d+$/.test(selection)?Number(selection):selection,false),commerceForPage(pageId,28),
 db.seoAction.findMany({where:{siteId:site.id,pageId,status:'ACTIVE',isCurrent:true},orderBy:{actionId:'asc'},take:5}),
 db.opportunity.findMany({where:{siteId:site.id,pageId,status:'ACTIVE',isCurrent:true,domain:'COMMERCE'},orderBy:[{score:'desc'},{id:'asc'}],take:5}),
 db.page.findMany({where:{siteId:site.id,active:true},select:{url:true,pageType:true,scanPages:{where:{outcome:'OK',statusCode:{gte:200,lt:400}},orderBy:{scannedAt:'desc'},take:1,select:{internalLinksJson:true,scannedAt:true,source:true}}}})]);
 return projectSeoReview(p,s,v,cv,seo,opps,pages.map(p=>({url:p.url,pageType:p.pageType,links:Array.isArray(p.scanPages[0]?.internalLinksJson)?p.scanPages[0].internalLinksJson.filter((x):x is string=>typeof x==='string'):null,at:p.scanPages[0]?.scannedAt.toISOString()??null,source:p.scanPages[0]?.source??null})),html?.scannedAt.toISOString()??null);
}

/** Fixed bound, original intent classifier, deterministic representatives; no new scoring. */
export function selectSearchQueries<T extends {query:string;impressions:number}>(queries:T[],intents:(q:T)=>readonly string[]):T[]{
 const ranked=[...queries].sort((a,b)=>b.impressions-a.impressions||a.query.localeCompare(b.query)),selected=new Map(ranked.slice(0,15).map(q=>[q.query,q]));
 const representatives=new Map<string,T>();for(const q of ranked)for(const tag of intents(q))if(!representatives.has(tag))representatives.set(tag,q);
 for(const [,q]of [...representatives].sort(([a],[b])=>a.localeCompare(b)))if(selected.size<25)selected.set(q.query,q);
 for(const q of ranked)if(selected.size<25)selected.set(q.query,q);
 return [...selected.values()];
}
