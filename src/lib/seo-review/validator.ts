import {envelopeSchema,recommendationSchema} from './schema';
import {evidenceItems,type PageSeoReviewInput,type SeoRecommendation,type ReviewResponse,type Evidence} from './contract';
import {technicalContains} from '../seo-actions/technical-token';
import {AiError} from '../ai/provider';
import {sameFact,bindQueries,knownProfileUrls,unsafeConditions,unboundAbsence,outcomeFor,qualityFor} from './quality';
export type ValidationPolicy={knownUrls?:Set<string>;allowGrowth?:boolean;repairQueries?:boolean};
const targets:Record<SeoRecommendation['area'],SeoRecommendation['placement'][]>={TITLE:['HTML_TITLE'],DESCRIPTION:['META_DESCRIPTION'],H1:['H1'],CONTENT:['BODY_CONTENT'],SEARCH_INTENT:['SEARCH_INTENT_REVIEW'],APPLICATION:['APPLICATION_BLOCK'],SPECIFICATION:['SPECIFICATION_BLOCK'],PACKAGING:['PACKAGING_BLOCK'],INTERNAL_LINKING:['INTERNAL_LINK'],TECHNICAL_SEO:['CANONICAL','ROBOTS','STRUCTURED_DATA','HTTP_STATUS'],B2B_UX:['CTA'],LANDING_PAGE_HYPOTHESIS:['LANDING_HYPOTHESIS']};
const norm=(s:string)=>s.toLowerCase().replace(/ё/g,'е').replace(/\s+/g,' ').trim();
const textValue=(e:Evidence)=>typeof e.value==='string'?e.value:JSON.stringify(e.value);
const numbers=(s:string)=>s.match(/(?<![\p{L}\p{N}])\d+(?:[.,]\d+)?(?![\p{L}\p{N}])/gu)?.map(s=>s.replace(',','.'))??[];
/** Bounded policy checks, not a claim to prove arbitrary natural-language SEO reasoning. */
export function diagnoseRecommendation(r:SeoRecommendation,i:PageSeoReviewInput,policy:ValidationPolicy={}):{rejected:string[];review:string[];evidence:Evidence[]}{
 const all=evidenceItems(i),index=new Map(all.map(e=>[e.id,e])),rejected:string[]=[],review:string[]=[];
 const evidence=r.evidenceIds.flatMap(id=>index.has(id)?[index.get(id)!]:[]),has=(prefix:string)=>evidence.some(e=>e.kind.startsWith(prefix)&&e.state==='KNOWN_PRESENT');
 if(evidence.length!==r.evidenceIds.length||r.claims.some(c=>!r.evidenceIds.includes(c.evidenceId)))rejected.push('INVALID_EVIDENCE_ID');
 if(!targets[r.area].includes(r.placement)||r.proposedContent?.placement&&r.proposedContent.placement!==r.placement)rejected.push('ACTION_AREA_MISMATCH');
 const scalar=r.area==='TITLE'?i.content.title:r.area==='DESCRIPTION'?i.content.description:r.area==='H1'?i.content.h1:undefined;
 if(r.recommendationType==='CHECK'){
  if(!['INSPECT','COMPARE'].includes(r.operation)||r.proposedContent?.suggestedText)rejected.push('CHECK_AS_CHANGE');
  if(!r.verificationSteps?.length)rejected.push('MISSING_VERIFICATION');
 }else if(r.recommendationType==='CHANGE'){
  if(!['REWRITE','ADD'].includes(r.operation))rejected.push('INVALID_OPERATION');
  if(scalar&&(!evidence.includes(scalar)||scalar.state==='UNKNOWN'))rejected.push('UNKNOWN_TARGET');
  if(scalar&&!has('search.query'))rejected.push('INSUFFICIENT_SEARCH_SUPPORT');
 }else if(r.operation!=='PROPOSE')rejected.push('INVALID_OPERATION');
 if(scalar&&r.proposedContent?.currentText!==undefined&&r.proposedContent.currentText!==scalar.value)rejected.push('CURRENT_TEXT_MISMATCH');
 if(['CONTENT','APPLICATION','SPECIFICATION','PACKAGING','B2B_UX'].includes(r.area)&&!has('content.'))rejected.push('INSUFFICIENT_CONTENT_SUPPORT');
 if(r.recommendationType==='CHANGE'&&['CONTENT','APPLICATION','SPECIFICATION','PACKAGING'].includes(r.area)&&!has('search.query')&&!has('product'))rejected.push('INSUFFICIENT_PRODUCT_OR_SEARCH');
 if(r.recommendationType==='CHANGE'&&r.area==='CONTENT'&&!has('content.excerpts')&&!has('content.topText'))rejected.push('UNKNOWN_CONTENT_TARGET');
 if(r.recommendationType==='CHANGE'&&['APPLICATION','SPECIFICATION','PACKAGING','B2B_UX'].includes(r.area)){
  const key={APPLICATION:'application',SPECIFICATION:'specifications',PACKAGING:'packaging',B2B_UX:'cta'}[r.area as 'APPLICATION'|'SPECIFICATION'|'PACKAGING'|'B2B_UX'];
  const e=i.content[key];if(!e||!evidence.includes(e)||e.state!=='KNOWN_PRESENT'&&!e.supportsAbsenceClaim)rejected.push('UNOBSERVED_CONTENT_CHANGE');
 }
 if(r.area==='TECHNICAL_SEO'){
  const key={CANONICAL:'canonical',ROBOTS:'robots',STRUCTURED_DATA:'schema',HTTP_STATUS:'httpStatus'}[r.placement as 'CANONICAL'|'ROBOTS'|'STRUCTURED_DATA'|'HTTP_STATUS'];
  const e=key?i.technical[key]:undefined;
  if(!e||!evidence.includes(e))rejected.push('INSUFFICIENT_TECHNICAL_SUPPORT');
  if(e&&['UNKNOWN','NOT_OBSERVED'].includes(e.state)&&r.recommendationType!=='CHECK')rejected.push('UNOBSERVED_TECHNICAL_CHANGE');
  if(r.placement==='STRUCTURED_DATA'&&r.operation==='ADD'&&r.recommendationType!=='CHECK')rejected.push('UNPROVEN_SCHEMA_ADDITION');
 }
 const knownUrls=new Set([...knownProfileUrls(i),...policy.knownUrls??[]]);
 if(r.targetUrl&&!knownUrls.has(r.targetUrl))rejected.push('UNKNOWN_TARGET_URL');
 if(['informational','article','info','content'].includes(i.page.pageType)&&r.area==='B2B_UX'&&r.recommendationType!=='CHECK')rejected.push('PAGE_TYPE_REQUIRES_CHECK');
 if(r.area==='INTERNAL_LINKING'){
  if(!evidence.some(e=>e.kind==='links.summary'&&e.state==='KNOWN_PRESENT'))rejected.push('INSUFFICIENT_LINK_SUPPORT');
  if(!r.targetUrl||!knownUrls.has(r.targetUrl))rejected.push('UNKNOWN_TARGET_URL');
  if(r.operation==='ADD'&&i.internalLinks.outbound.some(e=>e.value&&typeof e.value==='object'&&!Array.isArray(e.value)&&e.value.url===r.targetUrl))rejected.push('EXISTING_INTERNAL_LINK');
  if(i.internalLinks.summary.coverage!=='FULL')review.push('PARTIAL_GRAPH');
 }
 if(r.area==='LANDING_PAGE_HYPOTHESIS'){
  if(r.recommendationType!=='CREATE_HYPOTHESIS'||r.targetUrl)rejected.push('LANDING_HYPOTHESIS_ONLY');
  if(new Set((r.targetQueries??[]).map(norm)).size<2)rejected.push('INSUFFICIENT_QUERY_CLUSTER');
  review.push('SITE_ANALYSIS_NOT_PERFORMED');
 }else if(r.recommendationType==='CREATE_HYPOTHESIS'){
  if(!policy.allowGrowth)rejected.push('INVALID_HYPOTHESIS_AREA');
  else{
   if(!['TITLE','DESCRIPTION','H1','CONTENT','SEARCH_INTENT','INTERNAL_LINKING'].includes(r.area))rejected.push('INVALID_HYPOTHESIS_AREA');
   if(!has('search.query')||!has('content.'))rejected.push('INSUFFICIENT_GROWTH_SUPPORT');
   if(scalar&&(scalar.state!=='KNOWN_PRESENT'||!evidence.includes(scalar)))rejected.push('UNKNOWN_TARGET');
   if(scalar&&!evidence.some(e=>e.id!==scalar.id&&e.state==='KNOWN_PRESENT'&&(e.kind.startsWith('content.')||e.kind==='product')))rejected.push('INSUFFICIENT_GROWTH_CONTENT');
   if(scalar&&!r.proposedContent?.suggestedText)rejected.push('MISSING_HYPOTHESIS_CONTENT');
   if(!r.uncertainty||!r.verificationSteps?.length)rejected.push('MISSING_HYPOTHESIS_VERIFICATION');
   review.push('GROWTH_HYPOTHESIS_REQUIRES_REVIEW');
  }
 }
 if(policy.allowGrowth&&r.recommendationType==='CHANGE'&&scalar&&!r.proposedContent?.suggestedText)rejected.push('MISSING_PROPOSED_CONTENT');
 if(i.page.pageType==='category'&&r.area==='SPECIFICATION'&&r.recommendationType!=='CHECK')rejected.push('CATEGORY_NOT_PRODUCT_SPECIFICATION');
 const queries=new Set(i.search.queries.flatMap(e=>e.value&&typeof e.value==='object'&&!Array.isArray(e.value)&&typeof e.value.query==='string'?[e.value.query]:[]));
 if(r.targetQueries?.some(q=>!queries.has(q)))rejected.push('INVENTED_QUERY');
 if(r.targetQueries?.some(q=>!evidence.some(e=>e.kind==='search.query'&&e.value&&typeof e.value==='object'&&!Array.isArray(e.value)&&e.value.query===q)))rejected.push('QUERY_NOT_CITED');
 for(const c of r.claims){const e=index.get(c.evidenceId);if(!e)continue;
  if(c.relation==='VALUE'&&!sameFact(c.value,e.value))rejected.push('FACT_VALUE_MISMATCH');
  if(c.relation==='ABSENT'&&(!e.supportsAbsenceClaim||e.state!=='KNOWN_ABSENT'||e.coverage!=='FULL'||e.truncated))rejected.push(e.state==='KNOWN_PRESENT'?'EXISTING_CONTENT':'UNSUPPORTED_ABSENCE');
  if(c.relation==='MISSING_TERM'){
   if(typeof c.value!=='string'||typeof e.value!=='string'||e.coverage!=='FULL'||e.truncated||e.state!=='KNOWN_PRESENT'||!['content.title','content.description','content.h1'].includes(e.kind))rejected.push('UNSUPPORTED_MISSING_TERM');
   else if(technicalContains(e.value,c.value)??norm(e.value).includes(norm(c.value)))rejected.push('EXISTING_CONTENT');
  }
 }
 if(!evidence.some(e=>e.state==='KNOWN_PRESENT'||e.supportsAbsenceClaim))rejected.push('INSUFFICIENT_EVIDENCE');
 const fields=[r.finding,r.rationale,r.proposedAction,r.proposedContent?.suggestedText??'',r.uncertainty??'',...r.verificationSteps??[]];
 const knownNumbers=new Set(numbers(evidence.map(e=>JSON.stringify(e.value)).join(' ')));
 // A body window can contain neighbouring product cards. Only attributable scalars/mapping
 // may establish a technical value for suggested copy; partial snippets cannot do so.
 const productFacts=[i.content.title,i.content.h1,i.content.description,i.product].filter(e=>e?.state==='KNOWN_PRESENT'&&e.coverage==='FULL'&&!e.truncated).map(textValue).join(' ');
 const suggested=r.proposedContent?.suggestedText??'';
 const technicalTokens=suggested.match(/\b(?:API\s+[A-Z]{2}|ACEA\s+[A-Z]\d+|(?:ISO\s*(?:VG\s*)?|HLP\s*|HVLP\s*)\d+)|(?<![\p{L}\p{N}])\d+\s*w\s*[-–]?\s*\d+(?![\p{L}\p{N}])/giu)??[];
 if(technicalTokens.some(t=>!technicalContains(productFacts,t)))rejected.push('UNVERIFIED_TECHNICAL_VALUE');
 for(const field of fields){
  const unsafe=unsafeConditions(field);if(unsafe.length)rejected.push('UNSAFE_TEXT',...unsafe);
  for(const u of field.match(/https?:\/\/[^\s<>"')]+/g)??[])if(!knownUrls.has(u))rejected.push('UNKNOWN_TARGET_URL');
  if(numbers(field).some(n=>!knownNumbers.has(n)))rejected.push('INVENTED_NUMBER');
  if(/из-за|вызван|является\s+причин|caused\s+by|due\s+to/iu.test(field))rejected.push('UNSUPPORTED_CAUSE');
  if(/низк.{0,15}CTR|CTR.{0,15}(?:низк|low)|low\s+CTR/iu.test(field))rejected.push('UNSUPPORTED_CTR');
  if(/(?:гарант|увелич|повыс|рост).{0,35}(?:CTR|конверси|выруч|продаж|позици)/iu.test(field))rejected.push('PROMISED_METRIC_EFFECT');
  if(/пополн|дефицит|избыточн.{0,10}запас|daysOfStock|replenish|inventory/iu.test(field))rejected.push('INVENTORY_OUT_OF_SCOPE');
  if(/соответствует.{0,20}(?:API|ACEA|ГОСТ)|допуск.{0,20}(?:OEM|API|ACEA)|сертифицир|совместим.{0,20}(?:для|с\s)/iu.test(field))rejected.push('UNVERIFIED_TECHNICAL_CLAIM');
  if(/(?:отправ|заполн|оформи[тм]).{0,25}(?:форм|заказ)|(?:добав|полож).{0,25}корзин/iu.test(field))rejected.push('UNSAFE_INTERACTION');
  // Narrow known counterexamples. No inference of action area from keywords.
  if(r.placement==='META_DESCRIPTION'&&/(?:под\s+H1|вводн\p{L}*\s+абзац|перв\p{L}*\s+абзац|видим\p{L}*\s+описани)/iu.test(field))rejected.push('ACTION_TARGET_CONTRADICTION');
  if(r.placement==='HTML_TITLE'&&/под\s+H1|вводн\p{L}*\s+абзац/iu.test(field))rejected.push('ACTION_TARGET_CONTRADICTION');
  if(/(?:нет|отсутств\p{L}*).{0,20}(?:продаж|заказ)|нулев\p{L}*\s+(?:продаж|заказ)/iu.test(field)&&i.commerce.summary.coverage!=='FULL')rejected.push('UNKNOWN_SALES');
  // Unstructured absence claims require the same explicit, full, server-checked assertion.
  if(unboundAbsence(field)&&!r.claims.some(c=>['ABSENT','MISSING_TERM'].includes(c.relation)))rejected.push('UNBOUND_ABSENCE_CLAIM');
 }
 if(r.operation==='ADD'&&['APPLICATION','SPECIFICATION','PACKAGING','B2B_UX'].includes(r.area)){
  const key={APPLICATION:'application',SPECIFICATION:'specifications',PACKAGING:'packaging',B2B_UX:'cta'}[r.area as 'APPLICATION'|'SPECIFICATION'|'PACKAGING'|'B2B_UX'];
  if(i.content[key]?.state==='KNOWN_PRESENT')rejected.push('EXISTING_CONTENT');
 }
 if(r.operation==='ADD'&&scalar?.state==='KNOWN_PRESENT'&&!r.claims.some(c=>c.relation==='MISSING_TERM'&&c.evidenceId===scalar.id))rejected.push('EXISTING_CONTENT');
 if(r.proposedAction.trim().length<8)rejected.push('ACTION_TOO_SHORT');
 if(/^(?:улучшить|оптимизировать|доработать)\s+(?:SEO|страницу|контент)[.!]?$/iu.test(r.proposedAction.trim()))rejected.push('ACTION_NOT_ACTIONABLE');
 if(!r.verificationSteps?.length)review.push('MANUAL_VERIFICATION_REQUIRED');
 if(evidence.some(e=>e.coverage!=='FULL'||e.truncated||['UNKNOWN','NOT_OBSERVED'].includes(e.state)))review.push('INCOMPLETE_EVIDENCE');
 // Natural-language rationale and suggested copy are interpretations, not machine-proven facts.
 review.push('HUMAN_SEO_REVIEW_REQUIRED');
 return {rejected:[...new Set(rejected)],review:[...new Set(review)],evidence};
}
export function validateSeoReview(raw:string,i:PageSeoReviewInput,policy:ValidationPolicy={}):Pick<ReviewResponse,'result'|'validation'>{
 if(Buffer.byteLength(raw)>60000)throw new AiError('OUTPUT_TOO_LARGE');
 let value:unknown;try{value=JSON.parse(raw);}catch{throw new AiError('INVALID_JSON');}
 const envelope=envelopeSchema.safeParse(value);if(!envelope.success)throw new AiError('INVALID_SCHEMA');
 const recommendations:ReviewResponse['result']['recommendations']=[],decisions:ReviewResponse['validation']['decisions']=[],ids=new Set<string>();
 envelope.data.recommendations.forEach((raw,index)=>{const parsed=recommendationSchema.safeParse(raw);
  if(!parsed.success){decisions.push({index,status:'REJECTED',reasonCodes:['ITEM_SCHEMA']});return;}
  const binding=bindQueries(parsed.data as SeoRecommendation,i),r=policy.repairQueries?binding.recommendation:parsed.data as SeoRecommendation,d=diagnoseRecommendation(r,i,policy);
  if(policy.repairQueries){d.rejected.push(...binding.codes);d.review.push(...binding.repairs);}
  if(ids.has(r.id))d.rejected.push('DUPLICATE_ID');ids.add(r.id);
  if(d.rejected.length){decisions.push({index,status:'REJECTED',reasonCodes:d.rejected});return;}
  // SUPPORTED is reserved for a mechanically checkable comparison of exact values.
  const supported=r.recommendationType==='CHECK'&&r.operation==='COMPARE'&&r.claims.length>0&&r.claims.every(c=>c.relation==='VALUE')&&d.review.every(c=>c==='HUMAN_SEO_REVIEW_REQUIRED');
  const status=supported?'SUPPORTED':'NEEDS_REVIEW';decisions.push({index,status,reasonCodes:d.review});recommendations.push({...r,status,reasonCodes:d.review,evidence:d.evidence,outcome:outcomeFor(r,d.evidence),quality:qualityFor(r,d.evidence)});
 });
 const strengths=['title','description','h1'].flatMap(k=>i.content[k]?.state==='KNOWN_PRESENT'?[`В сохранённом snapshot наблюдается ${k}: ${String(i.content[k].value)}`]:[]);
 // Never forward ungrounded envelope assertions, including strengths and limitations.
 return {result:{summary:{overallAssessment:recommendations.length?`Гипотез для ручной SEO-проверки: ${recommendations.length}. Эффективность не подтверждена.`:'На доступных данных дополнительные проверяемые рекомендации не приняты.',strengths,keyOpportunities:recommendations.map(r=>`${r.area}: ${r.proposedAction}`)},recommendations,limitations:[...i.evidenceQuality.limitations,'SUPPORTED подтверждает проверяемую опору на данные, а не SEO-эффект. Все предложения требуют human review.']},validation:{generated:envelope.data.recommendations.length,accepted:recommendations.length,rejected:decisions.filter(d=>d.status==='REJECTED').length,decisions}};
}
