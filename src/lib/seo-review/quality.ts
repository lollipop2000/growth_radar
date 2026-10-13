import {normalizeQuery} from '../search/model';
import type {Evidence,Json,PageSeoReviewInput,SeoRecommendation,RecommendationOutcome} from './contract';
/** Exact structural equality. Object order is irrelevant; arrays, types and missing keys are not. */
export function sameFact(a:Json,b:Json):boolean{
 if(a===b)return true;
 if(a===null||b===null||typeof a!==typeof b)return false;
 if(Array.isArray(a)||Array.isArray(b))return Array.isArray(a)&&Array.isArray(b)&&a.length===b.length&&a.every((v,n)=>sameFact(v,b[n]));
 if(typeof a!=='object'||typeof b!=='object')return false;
 const keys=Object.keys(a);return keys.length===Object.keys(b).length&&keys.every(k=>Object.hasOwn(b,k)&&sameFact(a[k],b[k]));
}
export function queryValue(e:Evidence):({[key:string]:Json;query:string})|null{return e.value&&typeof e.value==='object'&&!Array.isArray(e.value)&&typeof e.value.query==='string'?e.value as {[key:string]:Json;query:string}:null;}
/** Formatting identity only; never fuzzy, never attach another period's query. Input is not mutated. */
export function bindQueries(r:SeoRecommendation,i:PageSeoReviewInput){
 const repairs:string[]=[],codes:string[]=[],ids=[...r.evidenceIds];
 const targetQueries=r.targetQueries?.map(q=>{
  const candidates=i.search.queries.filter(e=>{const v=queryValue(e);return v&&normalizeQuery(v.query as string)===normalizeQuery(q);});
  if(!candidates.length){codes.push('QUERY_NOT_IN_CURRENT_PROFILE');return q;}
  if(candidates.length!==1){codes.push('QUERY_AMBIGUOUS');return q;}
  const e=candidates[0];
  const value=queryValue(e)!;
  if(value.pageId!==undefined&&value.pageId!==i.page.pageId){codes.push('QUERY_PAGE_MISMATCH');return q;}
  if(!e.period||e.period.from!==i.search.period.from||e.period.to!==i.search.period.to){codes.push('QUERY_PERIOD_MISMATCH');return q;}
  if(!ids.includes(e.id)){ids.push(e.id);repairs.push('QUERY_ID_RESTORED');}
  const actual=queryValue(e)!.query as string;if(actual!==q)repairs.push('QUERY_FORMAT_NORMALIZED');return actual;
 });
 return {recommendation:{...r,targetQueries,evidenceIds:ids},codes:[...new Set(codes)],repairs:[...new Set(repairs)]};
}
export function knownProfileUrls(i:PageSeoReviewInput){return new Set([i.page.currentUrl,...i.page.aliases,...[...i.internalLinks.inbound,...i.internalLinks.outbound,...i.internalLinks.related,...i.internalLinks.knownPages].flatMap(e=>e.value&&typeof e.value==='object'&&!Array.isArray(e.value)&&typeof e.value.url==='string'?[e.value.url]:[])]);}
export function referencedUrls(r:SeoRecommendation){return [...new Set([...(r.targetUrl?[r.targetUrl]:[]),...[r.finding,r.rationale,r.proposedAction,r.proposedContent?.suggestedText??'',r.uncertainty??'',...r.verificationSteps??[]].flatMap(s=>s.match(/https?:\/\/[^\s<>"')]+/g)??[])])];}
export function unsafeConditions(text:string){
 const codes:string[]=[];
 if(/<script\b|javascript:/iu.test(text))codes.push('UNSAFE_EXECUTABLE_TEXT');
 if(/ignore.{0,30}instructions|system prompt|игнориру\p{L}*.{0,30}инструкц/iu.test(text))codes.push('UNSAFE_INSTRUCTION');
 if(/\b(?:api[ _-]?key|password|access token|bearer token)\b|(?<![\p{L}\p{N}])(?:парол(?:ь|я|ей|ем|ю|и|ями|ях)|токен(?:а|ов|ы|ом|ами|ах|у|е)?)(?![\p{L}\p{N}])/iu.test(text))codes.push('UNSAFE_SECRET_REFERENCE');
 if(/\b(?:POST|PUT|DELETE)\b/iu.test(text))codes.push('UNSAFE_HTTP_MUTATION');
 return codes;
}
/** Check sentences independently; a caveat in one sentence cannot exempt an assertion in another. */
export function unboundAbsence(text:string){return text.split(/[.!?;\n]+/u).some(sentence=>{
 const absence=/(?:отсутствует|отсутствуют|не содержит|не хватает|\bmissing\b|\babsent\b|нет\s+(?:Title|H1|Description|CTA|schema|входящих))/iu;
 if(!absence.test(sentence))return false;
 const question=/^\s*(?:проверить|уточнить|выяснить)\s*[:,]?\s*(?:есть ли|содержит ли|отсутствует ли|отсутствуют ли)/iu;
 if(question.test(sentence))return absence.test(sentence.replace(question,''));
 // Explicit epistemic caveats, without a second independent absence assertion.
 const caveat=/^\s*(?:нельзя|невозможно|не следует|не можем)\s+(?:утверждать|считать|подтвердить|заключить|доказать)\s*,?\s*(?:что\s+)?(?:описание|контент|блок|H1|Description|schema|Title|CTA|ссылки)\s+(?:отсутствует|отсутствуют|не содержит)/iu;
 return caveat.test(sentence)?absence.test(sentence.replace(caveat,'')):true;
});}
export function outcomeFor(r:SeoRecommendation,evidence:Evidence[]):RecommendationOutcome{
 if(r.recommendationType==='CHECK')return 'DATA_CHECK';
 if(r.recommendationType==='CREATE_HYPOTHESIS')return 'GROWTH_HYPOTHESIS';
 const relevant=evidence.filter(e=>e.kind.startsWith('content.')||e.kind.startsWith('technical.'));
 if(r.proposedContent?.suggestedText&&relevant.length&&relevant.every(e=>e.state==='KNOWN_PRESENT'&&e.coverage==='FULL'&&!e.truncated))return 'READY_CHANGE';
 return 'GROWTH_HYPOTHESIS';
}
export function qualityFor(r:SeoRecommendation,evidence:Evidence[]){
 const queries=evidence.filter(e=>e.kind==='search.query').map(e=>{const v=queryValue(e);return {evidenceId:e.id,query:v?.query??null,impressions:typeof v?.impressions==='number'?v.impressions:null,clicks:typeof v?.clicks==='number'?v.clicks:null,ctr:typeof v?.ctr==='number'?v.ctr:null,avgPosition:typeof v?.avgPosition==='number'?v.avgPosition:null,intents:Array.isArray(v?.intents)?v.intents.filter((x):x is string=>typeof x==='string'):[],period:e.period};});
 const intents=[...new Set(queries.flatMap(q=>q.intents))];
 return {confirmedSearch:queries,b2bIntent:intents.includes('B2B')?'OBSERVED' as const:'UNKNOWN' as const,
  seoValue:r.rationale,implementationComplexity:'UNKNOWN' as const,
  evidenceConfidence:evidence.every(e=>e.state==='KNOWN_PRESENT'&&e.coverage==='FULL'&&!e.truncated)?'FULL' as const:'PARTIAL' as const};
}
