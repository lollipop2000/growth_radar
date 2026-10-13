import type {Input,Recommendation,ResolvedReference,Detail,Response} from './contract';
import type {SeoRecommendation,Decision} from '../contract';
import {envelopeSchema,recommendationSchema} from './schema';
import {ReferenceError,resolveReference,registry} from './resolver';
import {diagnoseRecommendation} from '../validator';
import {knownProfileUrls,outcomeFor,qualityFor,unsafeConditions,queryValue} from '../quality';
import {semanticDetails,commercialDetails,contentFactDetails,textFields} from './semantics';
import {numericDetails} from './numbers';
import {AiError} from '../../ai/provider';
import {queryRelevance,oilTopic} from './intent';
const key=(x:{evidenceId:string;fieldPath:string;purpose:string;term?:string})=>JSON.stringify([x.evidenceId,x.fieldPath,x.purpose,x.term??null]);
export function diagnoseV3(r:Recommendation,input:Input,knownUrls=new Set<string>()){
 const details:Detail[]=[],resolved:ResolvedReference[]=[];
 for(const [n,ref]of r.evidenceReferences.entries())try{resolved.push(resolveReference(ref,input));}catch(e){details.push({code:e instanceof ReferenceError?e.code:'INVALID_REFERENCE',fieldPath:`evidenceReferences[${n}]`,evidenceId:ref.evidenceId,referencePath:ref.fieldPath});}
 const referenceKeys=new Set(r.evidenceReferences.map(key));
 for(const [n,s]of r.statements.entries()){
  if(s.kind==='OBSERVED_FACT'&&!s.references.length)details.push({code:'UNBOUND_OBSERVED_FACT',fieldPath:`statements[${n}]`});
  for(const ref of s.references){if(!referenceKeys.has(key(ref)))details.push({code:'STATEMENT_REFERENCE_NOT_DECLARED',fieldPath:`statements[${n}]`,evidenceId:ref.evidenceId,referencePath:ref.fieldPath});
   if(s.kind==='OBSERVED_FACT'&&ref.purpose==='INSPECT')details.push({code:'UNKNOWN_AS_OBSERVED_FACT',fieldPath:`statements[${n}]`});}
 }
 const all=registry(input),ids=[...new Set(r.evidenceReferences.map(x=>x.evidenceId))].filter(id=>id!=='E_PAGE');
 const evidence=all.filter(e=>ids.includes(e.id));
 // Reuse unchanged V2 target/security/content gates. Only dedicated V3 checks replace
 // lexical absence/number/CTR gates; model values are never injected into claims.
 const old:SeoRecommendation={...r,evidenceIds:ids,claims:r.evidenceReferences.filter(x=>x.evidenceId!=='E_PAGE').flatMap(ref=>{const e=all.find(e=>e.id===ref.evidenceId);return e?[{evidenceId:e.id,relation:ref.purpose==='ABSENT'?'ABSENT' as const:ref.purpose==='MISSING_TERM'?'MISSING_TERM' as const:'VALUE' as const,value:ref.purpose==='MISSING_TERM'?ref.term??'':e.value}]:[];}),finding:r.finding+'\n'+r.statements.map(s=>s.text).join('\n')};
 const legacy=diagnoseRecommendation(old,input,{knownUrls,allowGrowth:true});
 const replaced=new Set(['INVENTED_NUMBER','UNSUPPORTED_CTR','UNBOUND_ABSENCE_CLAIM','PROMISED_METRIC_EFFECT']);
 const urls=textFields(r).flatMap(([,t])=>t.match(/https?:\/\/[^\s<>"')]+/g)??[]),known=new Set([...knownProfileUrls(input),...knownUrls]);
 const auditWithoutNewDestination=r.area==='INTERNAL_LINKING'&&r.recommendationType==='CHECK'&&!r.targetUrl&&urls.every(u=>known.has(u));
 for(const code of legacy.rejected)if(!replaced.has(code)&&!(code==='UNKNOWN_TARGET_URL'&&auditWithoutNewDestination))details.push({code,rule:'V2_PRESERVED_TARGET_SECURITY_GATE'});
 details.push(...semanticDetails(r,resolved),...numericDetails(r,input,resolved),...commercialDetails(r,resolved),...contentFactDetails(r,resolved));
 for(const [fieldPath,text]of textFields(r))for(const code of unsafeConditions(text))details.push({code,fieldPath});
 for(const q of r.targetQueries??[]){const entries=input.search.queries.filter(e=>queryValue(e)?.query===q);if(entries.length!==1){details.push({code:'QUERY_NOT_IN_CURRENT_PROFILE'});continue;}
  if(!resolved.some(x=>x.reference.evidenceId===entries[0].id&&x.reference.fieldPath==='value.query'&&x.reference.purpose==='OBSERVE'))details.push({code:'QUERY_NOT_CITED',evidenceId:entries[0].id});
 }
 const growth=r.recommendationType!=='CHECK';const qvalues=(r.targetQueries??[]).map(q=>({q,...queryRelevance(q,input.page.pageType)}));
 const productIntent=qvalues.some(x=>oilTopic.test(x.q)&&['ADJACENT','TARGET_B2B'].includes(x.classification)&&!/(?:подбор|заправк|АЗС|маркет)/iu.test(x.q));
 const pagePurposeOkay=input.page.pageType==='category'||input.page.pageType==='product'?productIntent:qvalues.some(x=>x.classification!=='UNCERTAIN');
 if(growth&&!pagePurposeOkay)details.push({code:'INSUFFICIENT_TARGET_INTENT',rule:'OBSERVED_NAVIGATION_IS_NOT_PRODUCT_B2B_PROOF'});
 if(growth&&!resolved.some(x=>x.kind.startsWith('content.')&&x.reference.purpose==='OBSERVE'&&x.state==='KNOWN_PRESENT'))details.push({code:'UNBOUND_GROWTH_CONTENT',rule:'INSPECT_REFERENCE_IS_NOT_OBSERVED_CONTENT_PROOF'});
 if(growth&&(!r.proposedContent?.suggestedText||!r.uncertainty||!r.verificationSteps?.length))details.push({code:'INCOMPLETE_GROWTH_SOLUTION'});
 if(growth&&r.proposedContent?.suggestedText&&/^(?:улучшить\s+SEO|оптимизировать\s+(?:страницу|контент)|проверить\s+(?:Title|Description|H1))[.!\s]*$/iu.test(r.proposedContent.suggestedText))details.push({code:'INSUFFICIENT_GROWTH_CONTENT'});
 if(r.statements.some(s=>s.kind==='GROWTH_HYPOTHESIS')&&r.recommendationType==='CHECK')details.push({code:'STATEMENT_OUTCOME_MISMATCH'});
 const review=[...legacy.review,'HUMAN_SEO_REVIEW_REQUIRED'];
 if(qvalues.some(x=>['NAVIGATIONAL','UNCERTAIN'].includes(x.classification)||/подбор|заправк|АЗС/iu.test(x.q)))review.push('PAGE_INTENT_NEEDS_REVIEW');
 // References establish observed values, not arbitrary interpretation or SEO effect.
 return {details,resolved,evidence,old,codes:[...new Set(details.map(d=>d.code))],review:[...new Set(review)]};
}
export function validateV3(raw:string,input:Input,knownUrls=new Set<string>()):Pick<Response,'result'|'validation'>{
 if(Buffer.byteLength(raw)>60000)throw new AiError('OUTPUT_TOO_LARGE');let parsed:unknown;try{parsed=JSON.parse(raw);}catch{throw new AiError('INVALID_JSON');}
 const envelope=envelopeSchema.safeParse(parsed);if(!envelope.success)throw new AiError('INVALID_SCHEMA');
 const recommendations:Response['result']['recommendations']=[],decisions:Decision[]=[],seen=new Set<string>();
 for(const [index,item]of envelope.data.recommendations.entries()){
  const v=recommendationSchema.safeParse(item);if(!v.success){decisions.push({index,status:'REJECTED',reasonCodes:['ITEM_SCHEMA']});continue;}
  const r=v.data as Recommendation,d=diagnoseV3(r,input,knownUrls);if(seen.has(r.id))d.codes.push('DUPLICATE_ID');seen.add(r.id);
  if(d.codes.length){decisions.push({index,status:'REJECTED',reasonCodes:d.codes});continue;}
  const reasonCodes=d.review;decisions.push({index,status:'NEEDS_REVIEW',reasonCodes});
  recommendations.push({...r,status:'NEEDS_REVIEW',reasonCodes,evidence:d.evidence,evidenceIds:[...new Set(r.evidenceReferences.map(x=>x.evidenceId))],verifiedFacts:d.resolved,outcome:outcomeFor(d.old,d.evidence),quality:qualityFor(d.old,d.evidence)});
 }
 const outcomeCounts={READY_CHANGE:0,GROWTH_HYPOTHESIS:0,DATA_CHECK:0};for(const r of recommendations)outcomeCounts[r.outcome]++;
 return {result:{summary:{overallAssessment:recommendations.length?'Проверяемые предложения требуют ручной SEO-оценки; эффективность не подтверждена.':'На доступных данных проверяемые рекомендации не приняты.',strengths:[],keyOpportunities:recommendations.map(r=>`${r.area}: ${r.proposedAction}`)},recommendations,outcomeCounts,limitations:[...input.evidenceQuality.limitations,'Typed references подтверждают только разрешённые факты. SEO-выводы и гипотезы не являются SUPPORTED эффектом.']},validation:{generated:envelope.data.recommendations.length,accepted:recommendations.length,rejected:decisions.filter(d=>d.status==='REJECTED').length,decisions}};
}
