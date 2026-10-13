import 'server-only';
import type {Json,PageSeoReviewInput,SeoRecommendation,Decision} from '../seo-review/contract';
import {evidenceItems} from '../seo-review/contract';
import {sameFact,bindQueries,unboundAbsence} from '../seo-review/quality';
export type DiagnosticDetail={code:string;itemIndex:number;fieldPath?:string;evidenceId?:string;jsonPath?:string;mismatchType?:string;expectedType?:string;actualType?:string;matchedRule?:string;explanation?:string;fragment?:string;numberToken?:string;numberCategory?:string;foundInCited?:boolean;checkedEvidenceIds?:string[];expressionType?:string;absenceClaimDeclared?:boolean;citedStates?:{id:string;state:string;coverage:string}[]};
const type=(v:unknown,missing=false)=>missing?'missing':v===null?'null':Array.isArray(v)?'array':typeof v;
export function factDifferences(expected:Json,actual:Json,path='$',limit=8):Omit<DiagnosticDetail,'code'|'itemIndex'>[]{
 const result:Omit<DiagnosticDetail,'code'|'itemIndex'>[]=[];
 function compare(a:Json,b:Json,p:string){if(result.length>=limit||sameFact(a,b))return;
  const at=type(a),bt=type(b);if(at!==bt){result.push({jsonPath:p,mismatchType:'TYPE_MISMATCH',expectedType:at,actualType:bt});return;}
  if(Array.isArray(a)&&Array.isArray(b)){if(a.length!==b.length)result.push({jsonPath:p,mismatchType:'ARRAY_LENGTH',expectedType:at,actualType:bt});for(let n=0;n<Math.min(a.length,b.length);n++)compare(a[n],b[n],p+'['+n+']');return;}
  if(a&&b&&typeof a==='object'&&typeof b==='object'&&!Array.isArray(a)&&!Array.isArray(b)){
   for(const key of [...new Set([...Object.keys(a),...Object.keys(b)])].sort()){
    if(result.length>=limit)break;const next=p+'['+JSON.stringify(key)+']';
    if(!Object.hasOwn(b,key))result.push({jsonPath:next,mismatchType:'MISSING_FIELD',expectedType:type(a[key]),actualType:'missing'});
    else if(!Object.hasOwn(a,key))result.push({jsonPath:next,mismatchType:'EXTRA_FIELD',expectedType:'missing',actualType:type(b[key])});else compare(a[key],b[key],next);
   }return;
  }result.push({jsonPath:p,mismatchType:'VALUE_MISMATCH',expectedType:at,actualType:bt});
 }compare(expected,actual,path);return result;
}
const numberPattern=/(?<![\p{L}\p{N}])\d+(?:[.,]\d+)?(?![\p{L}\p{N}])/gu;
const normalizeNumber=(s:string)=>s.replace(',','.');
export function numberCategory(text:string,index:number,token:string){
 const near=text.slice(Math.max(0,index-35),index+token.length+35);
 if(/\d{4}-\d{2}-\d{2}|\d{2}\.\d{2}\.\d{4}/u.test(near))return 'CALENDAR_DATE';
 if(/(?:^|\n)\s*\d+[.)]/u.test(text.slice(Math.max(0,index-4),index+token.length+1)))return 'LIST_ORDINAL';
 if(/\d+\s*w\s*[-–]?\s*\d+/iu.test(near))return 'TECHNICAL_NAME';
 if(/SKU|артикул|код\s+товара/iu.test(near)||/^\d{8,}$/.test(token))return 'PRODUCT_CODE';
 if(/\d+(?:[.,]\d+)?\s*[%×*/+÷=]/u.test(near))return /[%]/u.test(near)?'METRIC_PERCENT':'ARITHMETIC_EXPRESSION';
 if(/показ|клик|CTR|позици|выруч|заказ|визит/iu.test(near))return 'METRIC';
 return 'UNCLASSIFIED_NUMBER';
}
export function expressionType(text:string){
 if(/нельзя|не следует|не утвержд|не означает|не доказ/iu.test(text))return 'NEGATIVE_CAVEAT';
 if(/если|при условии|в случае/iu.test(text))return 'CONDITIONAL';
 if(/возможно|гипотез|предполож|может/iu.test(text))return 'HYPOTHESIS';
 if(/проверить|есть ли|наличи.*\?/iu.test(text))return 'QUESTION_OR_CHECK';
 return 'ASSERTION';
}
export function validationDetails(original:SeoRecommendation,input:PageSeoReviewInput,decision:Decision):DiagnosticDetail[]{
 const r=bindQueries(original,input).recommendation,index=new Map(evidenceItems(input).map(e=>[e.id,e])),cited=r.evidenceIds.flatMap(id=>index.has(id)?[index.get(id)!]:[]),details:DiagnosticDetail[]=[];
 const add=(d:Omit<DiagnosticDetail,'itemIndex'>)=>{if(details.length<64)details.push({itemIndex:decision.index,...d});};
 r.claims.forEach((c,n)=>{const e=index.get(c.evidenceId);if(!e){add({code:'INVALID_EVIDENCE_ID',fieldPath:`claims[${n}].evidenceId`,evidenceId:c.evidenceId,mismatchType:'UNKNOWN_EVIDENCE_ID'});return;}
  if(c.relation==='VALUE')for(const d of factDifferences(e.value,c.value))add({code:'FACT_VALUE_MISMATCH',evidenceId:e.id,fieldPath:`claims[${n}].value`,...d,explanation:'Exact registry value differs; partial/paraphrased claims are not automatically accepted.'});
  if(c.relation==='ABSENT')add({code:e.supportsAbsenceClaim&&e.state==='KNOWN_ABSENT'&&e.coverage==='FULL'&&!e.truncated?'ABSENCE_BOUND':e.state==='KNOWN_PRESENT'?'EXISTING_CONTENT':'UNSUPPORTED_ABSENCE',fieldPath:`claims[${n}]`,evidenceId:e.id,citedStates:[{id:e.id,state:e.state,coverage:e.coverage}],absenceClaimDeclared:true,matchedRule:'production.ABSENT-requires-known-absent-full-not-truncated',explanation:'Declared relation alone is insufficient: state, coverage and supportsAbsenceClaim are checked by production.'});
 });
 const fields:[string,string][]=[['finding',r.finding],['rationale',r.rationale],['proposedAction',r.proposedAction],['proposedContent.suggestedText',r.proposedContent?.suggestedText??''],['uncertainty',r.uncertainty??''],...(r.verificationSteps??[]).map((s,n)=>[`verificationSteps[${n}]`,s] as [string,string])];
 const known=new Set((cited.map(e=>JSON.stringify(e.value)).join(' ').match(numberPattern)??[]).map(normalizeNumber));
 for(const [fieldPath,text]of fields){
  for(const sentence of text.split(/[.!?;\n]+/u)){
   const absenceMatch=/отсутств|не содержит|не хватает|missing|absent|есть ли|если|нет\s+(?:Title|H1|Description|CTA|schema|входящих)/iu.exec(sentence);
   if(absenceMatch)add({code:unboundAbsence(sentence)&&!r.claims.some(c=>['ABSENT','MISSING_TERM'].includes(c.relation))?'UNBOUND_ABSENCE_CLAIM':'ABSENCE_EXPRESSION_OBSERVATION',fieldPath,matchedRule:unboundAbsence(sentence)?'production.unboundAbsence=true':'production.unboundAbsence=false',expressionType:expressionType(sentence),fragment:sentence.slice(Math.max(0,absenceMatch.index-60),absenceMatch.index+120),absenceClaimDeclared:r.claims.some(c=>['ABSENT','MISSING_TERM'].includes(c.relation)),citedStates:cited.map(e=>({id:e.id,state:e.state,coverage:e.coverage})),explanation:'Sentence-level diagnostic label only; a preceding caveat does not exempt a separate assertion. No production decision changes.'});
  }
  for(const m of [...text.matchAll(numberPattern)].slice(0,12)){const found=known.has(normalizeNumber(m[0]));add({code:found?'NUMBER_SUPPORTED_TOKEN':'INVENTED_NUMBER',fieldPath,numberToken:m[0],numberCategory:numberCategory(text,m.index,m[0]),foundInCited:found,checkedEvidenceIds:cited.map(e=>e.id),fragment:text.slice(Math.max(0,m.index-45),m.index+m[0].length+45),matchedRule:found?'production.numeric-token-in-cited':'production.INVENTED_NUMBER',explanation:'Token identity is not semantic metric grounding. Ordinals/dates/arithmetic may be possible false rejects; not repaired.'});}
  if(/CTR/iu.test(text)){
   const low=/низк.{0,15}CTR|CTR.{0,15}(?:низк|low)|low\s+CTR/iu.test(text),promise=/(?:гарант|увелич|повыс|рост).{0,35}CTR/iu.test(text),cause=/из-за|вызван|является\s+причин|caused\s+by|due\s+to/iu.test(text);
   const at=text.search(/CTR/iu);
   add({code:low?'UNSUPPORTED_CTR':promise?'PROMISED_METRIC_EFFECT':cause?'UNSUPPORTED_CAUSE':'CTR_EXPRESSION_OBSERVATION',fieldPath,fragment:text.slice(Math.max(0,at-60),at+120),expressionType:promise?'PROMISE':cause?'CAUSAL':expressionType(text),matchedRule:[low?'production.UNSUPPORTED_CTR':null,promise?'production.PROMISED_METRIC_EFFECT':null,cause?'production.UNSUPPORTED_CAUSE':null].filter(Boolean).join(',')||'CTR_NEUTRAL_OR_RECORDED_VALUE',checkedEvidenceIds:cited.filter(e=>e.kind.startsWith('search.')).map(e=>e.id),explanation:low?'No comparable CTR benchmark in current profile; negative/conditional wording may still match the unchanged lexical guard.':'Recorded metric is distinct from low-CTR comparison or uplift promise.'});
  }
 }
 // Preserve every production code even when expanded observations reach their bound.
 for(const code of decision.reasonCodes)if(!details.some(d=>d.code===code)){if(details.length>=64)details.pop();details.unshift({code,itemIndex:decision.index,matchedRule:'production.validator',explanation:'Unchanged production reason; expanded observations are diagnostic, not repair.'});}
 return details;
}
