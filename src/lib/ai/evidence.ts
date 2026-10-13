import 'server-only';
import type {Page,ScanPage,SeoAction,Opportunity} from '@prisma/client';
import {db} from '../db';
import {targetUrl} from '../health';
import {seoPageView} from '../seo-actions/service';
import {aggregateQueries} from '../seo-actions/engine';
import {classifyQuery} from '../seo-actions/intent';
import {normalizeTechnicalToken,technicalContains} from '../seo-actions/technical-token';
import {searchCoverage} from '../search/metrics';
import {searchAggregate} from '../opportunities/aggregate';
import {commerceForPage} from '../opportunities/page-commerce';
import {seoEligibility,modernSignals} from '../seo-actions/eligibility';
import {publicData} from '../public-data';
import type {ContentSignals} from '../scanner/content';
import type {AiPageAnalysisInput,DeterministicFinding,Evidence,EvidenceState,Json} from './contract';
import {AiError} from './provider';
type SeoView=Awaited<ReturnType<typeof seoPageView>>;
type CommerceView=Awaited<ReturnType<typeof commerceForPage>>;
const iso=(v:Date)=>v.toISOString().slice(0,10);
function redactString(value:string){return publicData(value).replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi,'[email скрыт]')
  .replace(/(?:bearer\s+|(?:token|password|api[_-]?key|cookie)\s*[:=]\s*)[^\s,;]+/gi,'[секрет скрыт]');}
/** Bound recursively; explicitly redact potential credentials/PII in untrusted stored strings. */
export function compactValue(value:unknown,depth=0):Json {
  if(depth>4)return '[truncated]';
  if(value==null)return null;
  if(typeof value==='number')return Number.isFinite(value)?value:null;
  if(typeof value==='boolean')return value;
  if(typeof value==='string')return redactString(value).slice(0,600);
  if(Array.isArray(value))return value.slice(0,15).map(v=>compactValue(v,depth+1));
  if(typeof value==='object')return Object.fromEntries(Object.entries(value).slice(0,35).filter(([k])=>!/(?:token|password|cookie|session|auth|secret|email|phone|customer|userId)/i.test(k)).map(([k,v])=>[k,compactValue(v,depth+1)]));
  return null;
}
const observed=(value:unknown):EvidenceState=>value==null?'UNKNOWN':typeof value==='string'&&!value.trim()?'KNOWN_ABSENT':'KNOWN_PRESENT';
function opportunityEvidence(value:unknown) {
  const record=(v:unknown)=>v&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,unknown>:{};
  const root=record(value),page=record(root.page),signal=record(root.signal),evidence=record(signal.evidence);
  const commerce=record(page.commerce??evidence.commerce),sales=record(commerce.sales),traffic=record(page.traffic);
  return {period:root.period??signal.period,description:signal.description,
    visits:evidence.visits??traffic.visits??null,trafficKnownDays:traffic.days??null,
    orders:sales.orders??null,revenue:sales.revenue??null,salesKg:sales.quantityKg??null,
    salesKnownDays:sales.days??null,salesComplete:commerce.salesComplete??null,
    salesModes:commerce.salesModes??[],salesProvenance:commerce.salesProvenance??[],
    classification:evidence.classification??null};
}
export function projectAiEvidence(p:Page,s:ScanPage|null,view:SeoView,cv:CommerceView,seo:SeoAction[],opps:Opportunity[]):AiPageAnalysisInput {
  const counters=new Map<string,number>(),item=(prefix:string,value:unknown,state:EvidenceState=observed(value),truncated=false):Evidence=>{
    const n=(counters.get(prefix)??0)+1;counters.set(prefix,n);const compact=compactValue(value);
    const shortened=value!=null&&JSON.stringify(value).length>JSON.stringify(compact).length;
    return {id:prefix+'_'+String(n).padStart(2,'0'),value:compact,state,observationState:state,
      source:prefix==='CONTENT'||prefix==='TECH'?`SAVED_SNAPSHOT:${s?.source??'UNKNOWN'}`:prefix==='FINDING'?'SAVED_ACTIVE_FINDING':prefix==='SEARCH'?'SAVED_WEBMASTER':prefix==='QUALITY'?'SAVED_GRAPH':'SAVED_COMMERCE',
      observedAt:prefix==='CONTENT'||prefix==='TECH'?s?.scannedAt.toISOString()??null:null,
      coverage:value==null?'UNKNOWN':truncated||shortened?'PARTIAL':'FULL',supportsAbsenceClaim:false,...(truncated||shortened?{truncated:true}:{})};
  };
  const signals=modernSignals(s?.contentSignalsJson)?s!.contentSignalsJson as ContentSignals:null;
  const aliases=Array.isArray(p.aliasesJson)?p.aliasesJson.filter((v):v is string=>typeof v==='string'):[];
  const findings:DeterministicFinding[]=[...seo.map(a=>({...item('FINDING',a.evidenceJson),findingId:a.id,kind:'SEO_ACTION' as const,rule:a.actionId,area:a.category,title:compactValue(a.title) as string,priority:a.priority,score:null,confidence:a.confidence,period:{from:iso(a.periodFrom),to:iso(a.periodTo)},isCurrent:a.isCurrent})),
    ...opps.map(o=>({...item('FINDING',opportunityEvidence(o.evidenceJson)),findingId:o.id,kind:'OPPORTUNITY' as const,rule:o.ruleId,title:compactValue(o.title) as string,priority:o.severity,score:o.score,confidence:'UNKNOWN',period:{from:iso(o.periodFrom),to:iso(o.periodTo)},isCurrent:o.isCurrent}))];
  findings.forEach((f,n)=>{const saved=n<seo.length?seo[n]:opps[n-seo.length];f.source=`SAVED_ACTIVE_${f.kind}`;f.observedAt=saved.createdAt?.toISOString()??null;});
  const queries=aggregateQueries(view.page.allQueries).sort((a,b)=>b.impressions-a.impressions||a.query.localeCompare(b.query)),selected=queries.slice(0,15);
  const content:Record<string,Evidence>={};
  for(const key of ['title','description','h1'] as const){
    const raw=s?.[key]??null,e=item('CONTENT',raw);
    // Exact saved scalar; null is not proof of absence. Empty imported fields are equally unknown.
    const checked=!!s&&['HTTP','BROWSER'].includes(s.source)&&s.outcome==='OK'&&!!signals;
    e.value=typeof raw==='string'?redactString(raw):null;e.truncated=false;
    e.coverage=raw==null?'UNKNOWN':'FULL';
    if(typeof raw==='string'&&!raw.trim()&&!checked)e.state='UNKNOWN';
    e.observationState=e.state;e.supportsAbsenceClaim=e.state==='KNOWN_ABSENT'&&checked;
    content[key]=e;
  }
  content.h2=item('CONTENT',s?.h2Json??null,s?'KNOWN_PRESENT':'UNKNOWN',Array.isArray(s?.h2Json)&&s.h2Json.length>15);
  content.topText=item('CONTENT',signals?.topText??null,observed(signals?.topText),!!signals&&signals.topText.length>600);
  content.visibleExcerpt=item('CONTENT',signals?.visibleText??null,observed(signals?.visibleText),!!signals&&signals.visibleText.length>600);
  for(const key of ['application','specifications','packaging','cta','price','availability','documentation']){
    const v=signals?.commercial[key];content[key]=item('CONTENT',v?.evidence??null,v?.present?'KNOWN_PRESENT':v?'NOT_OBSERVED':'UNKNOWN');
    content[key].coverage=v?'PARTIAL':'UNKNOWN';content[key].supportsAbsenceClaim=false;
  }
  content.topText.coverage=signals?'PARTIAL':'UNKNOWN';content.visibleExcerpt.coverage=signals?'PARTIAL':'UNKNOWN';
  const originalText=[s?.title,s?.h1,signals?.visibleText].filter(Boolean).join(' ');
  const candidateTokens=[...originalText.matchAll(/(?<![\p{L}\p{N}])\d+\s*w\s*[-–]?\s*\d+(?![\p{L}\p{N}])|(?<![\p{L}\p{N}])\d+(?:[.,]\d+)?\s*(?:л(?:итр(?:а|ов)?)?|l|кг|kg)(?![\p{L}\p{N}])|\b(?:ISO\s*(?:VG\s*)?|HVLP\s*|HLP\s*)\d+(?:[.,]0+)?|\bGL-\d+|\bATF\s+[IVX]+/giu)].map(m=>m[0]);
  const unique=[...new Map(candidateTokens.map(t=>[normalizeTechnicalToken(t),t])).values()];
  content.technicalTokens=item('CONTENT',unique.map(t=>({observed:t,normalized:normalizeTechnicalToken(t),state:technicalContains(originalText,t)?'KNOWN_PRESENT':'NOT_OBSERVED'})),unique.length?'KNOWN_PRESENT':signals?'NOT_OBSERVED':'UNKNOWN',unique.length>15);
  content.technicalTokens.coverage=signals?'PARTIAL':'UNKNOWN';
  const schema=Array.isArray(s?.structuredDataJson)?s.structuredDataJson.filter((v):v is string=>typeof v==='string'):[];
  const c=cv.commerce,known=c?.sales?.days??0,stockKnown=!!c&&c.stockKgCoverage===1&&c.freshness.stock.fresh&&c.stockKg!=null&&c.daysOfStock!=null;
  const provenance=c?.salesProvenance??[];
  const coverageFrom=provenance.flatMap(p=>p.coverageFrom?[p.coverageFrom]:[]).sort()[0]??null;
  const coverageTo=provenance.flatMap(p=>p.coverageTo?[p.coverageTo]:[]).sort().at(-1)??null;
  const graph=view.graph.get(p.id);
  const limits=['AI предлагает изменения, не меняя сайт или deterministic score/priority.','Search и Commerce имеют независимые периоды; каждый finding также содержит свой период.'];
  if(!stockKnown)limits.push('Остаток в кг и Days of Stock UNKNOWN: складские выводы и рекомендации пополнения недоступны.');
  if(!schema.includes('Product')||!schema.some(v=>['Offer','AggregateOffer'].includes(v)))limits.push('Product/Offer не полностью наблюдались в snapshot; физическое отсутствие schema не доказано, нужна проверка HTML.');
  if(!graph||graph.observedPages<graph.totalPages)limits.push(`Граф PARTIAL/UNKNOWN: наблюдалось ${graph?.observedPages??0}/${graph?.totalPages??0} source Pages. Нельзя доказать orphan; internal-link hypotheses только LOW.`);
  if(known<cv.period.days)limits.push(`Продажи покрывают ${known}/${cv.period.days} дней периода; остальные дни UNKNOWN, не нулевые продажи. Источник подтверждён по ${coverageTo??'неизвестную дату'}.`);
  if(!signals)limits.push('Modern content signals не сохранены: коммерческие элементы UNKNOWN.');
  limits.push('Excerpt и длинные evidence ограничены; отсутствие в excerpt не доказывает отсутствие на странице. Finding evidence может быть усечён.');
  const input:AiPageAnalysisInput={version:'AI_EVIDENCE_V1',businessContext:'B2B интернет-магазин производителя смазочных материалов. Покупатель: юридическое лицо / профессиональный покупатель. Минимальный заказ и другие ограничения не подтверждены.',
    page:{pageId:p.id,currentUrl:publicData(p.url),canonicalUrl:s?.canonical?publicData(s.canonical):null,observedAliases:aliases.slice(0,30).map(v=>publicData(v)),pageType:p.pageType,snapshotId:s?.id??null,snapshotSource:s?.source??null,snapshotObservedAt:s?.scannedAt.toISOString()??null},
    findings,search:{period:{from:view.d.period.from,to:view.d.period.to},coverage:item('SEARCH',searchCoverage(view.page.allQueries,view.d.period),'KNOWN_PRESENT'),summary:item('SEARCH',searchAggregate(view.page.allQueries,view.d.period)),queries:selected.map(q=>item('SEARCH',{...q,query:q.query,intents:classifyQuery(q.query,view.c).tags})),truncated:queries.length>15},content,
    technical:{httpStatus:item('TECH',s?.statusCode??null),canonical:item('TECH',s?.canonical??null),robots:item('TECH',s?.robots??null),eligibility:item('TECH',seoEligibility(p.url,s,aliases)),structuredDataObserved:item('TECH',{product:schema.includes('Product')?'KNOWN_PRESENT':'NOT_OBSERVED',offer:schema.some(v=>['Offer','AggregateOffer'].includes(v))?'KNOWN_PRESENT':'NOT_OBSERVED',observed:schema},schema.includes('Product')&&schema.some(v=>['Offer','AggregateOffer'].includes(v))?'KNOWN_PRESENT':'NOT_OBSERVED')},
    commerce:{period:{from:cv.period.from,to:cv.period.to},summary:item('COMMERCE',{visits:cv.traffic?.visits??null,businessConversion:cv.traffic?.conversion??null,revenue:c?.salesComplete?c.sales?.revenue??null:null,orders:c?.salesComplete?c.sales?.orders??null:null,salesKg:c?.salesComplete?c.sales?.quantityKg??null:null,partial:!c?.salesComplete,salesState:c?.salesComplete?'KNOWN_PRESENT':'UNKNOWN'},c?.sales||cv.traffic?'KNOWN_PRESENT':'UNKNOWN'),coverage:item('COMMERCE',{coverageFrom,coverageTo,knownDays:known,unknownDays:cv.period.days-known,salesModes:c?.salesModes??[],provenance},known?'KNOWN_PRESENT':'UNKNOWN')},
    stock:{summary:item('COMMERCE',{stockKg:stockKnown?c!.stockKg:null,daysOfStock:stockKnown?c!.daysOfStock:null,coefficientSku:c?.skus.filter(s=>s.kgPerUnit!=null&&s.kgPerUnit>0).length??0,totalSku:c?.skus.length??0,stockUnits:c?.stock??null,freshness:c?.freshness.stock??null},stockKnown?'KNOWN_PRESENT':'UNKNOWN')},
    evidenceQuality:{graph:item('QUALITY',{status:graph&&graph.observedPages===graph.totalPages?'AVAILABLE':graph?'PARTIAL':'UNKNOWN',observedSource:graph?.observedPages??null,totalPages:graph?.totalPages??null,inbound:graph?.inbound??null},graph?'KNOWN_PRESENT':'UNKNOWN'),limitations:limits}};
  input.technical.structuredDataObserved.coverage='PARTIAL';input.technical.structuredDataObserved.supportsAbsenceClaim=false;
  input.evidenceQuality.graph.coverage=graph&&graph.observedPages===graph.totalPages?'FULL':graph?'PARTIAL':'UNKNOWN';
  input.commerce.summary.coverage=c?.salesComplete?'FULL':'PARTIAL';input.commerce.coverage.coverage=known===cv.period.days?'FULL':known?'PARTIAL':'UNKNOWN';
  input.stock.summary.coverage=stockKnown?'FULL':'UNKNOWN';
  return input;
}
export async function buildAiPageEvidence(pageId:string):Promise<AiPageAnalysisInput> {
  if(typeof pageId!=='string'||!/^[a-zA-Z0-9_-]{1,100}$/.test(pageId))throw new AiError('INVALID_PAGE');
  const baseUrl=await targetUrl(),site=baseUrl?await db.site.findUnique({where:{baseUrl},select:{id:true}}):null;
  if(!site)throw new AiError('INVALID_PAGE');
  const page=await db.page.findFirst({where:{id:pageId,siteId:site.id}});if(!page)throw new AiError('INVALID_PAGE');
  const [snapshot,view,cv,seo,opps]=await Promise.all([
    db.scanPage.findFirst({where:{pageId,outcome:'OK',statusCode:{gte:200,lt:400}},orderBy:[{scannedAt:'desc'},{id:'desc'}]}),
    seoPageView(pageId,'M3',true),commerceForPage(pageId,28),
    db.seoAction.findMany({where:{siteId:site.id,pageId,status:'ACTIVE',isCurrent:true},orderBy:[{priority:'asc'},{actionId:'asc'}],take:5}),
    db.opportunity.findMany({where:{siteId:site.id,pageId,status:'ACTIVE',domain:'COMMERCE'},orderBy:[{periodTo:'desc'},{score:'desc'},{id:'asc'}],take:5})]);
  const input=projectAiEvidence(page,snapshot,view,cv,seo,opps);
  if(Buffer.byteLength(JSON.stringify(input),'utf8')>60000)throw new AiError('INPUT_TOO_LARGE');
  return input;
}
