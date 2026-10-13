import {evidenceItems,type AiPageAnalysisInput,type AiRecommendationV2,type Evidence,type AiValidationSummary,type AiPageAnalysisResultV2} from './contract';
import {envelopeSchema,recommendationSchema} from './schema-v2';
import {AiError} from './provider';
import {technicalContains,normalizeTechnicalText} from '../seo-actions/technical-token';
export {outputSchema as resultSchema} from './schema-v2';
const uncertain=/UNKNOWN|NOT_OBSERVED|неизвест|не доказ|не подтверж|не установ|не наблюдал|не наблюдает|нет\s+(?:данных|основан|подтвержд)|unknown|not\s+(?:proven|observed|known)/iu;
const inventory=/склад|запас|дефицит|избыт|пополн|остат[ок]|stockKg|daysOfStock|days\s*of\s*stock|inventory|stock|replenish|shortage|overstock/iu;
const absence=/(?<![\p{L}\p{N}])(?:нет|отсутств\p{L}*|пуст\p{L}*|missing|absent|empty)(?![\p{L}\p{N}])|не\s+(?:содержит|отражает|представлен)|не хватает/iu;
const causal=/из-за|вызван|приводит\s+к|объясня(?:ет|ют)\s+(?:низк|нул|отсут|потер)|является\s+причин|caused\s+by|due\s+to|leads\s+to/iu;
const lowCtr=/низк.{0,12}CTR|CTR.{0,12}(?:низк|low)|low\s+CTR/iu;
const verify=/провер|оцен|сопостав|подтверд|verify|inspect|check/iu;
const growthEffect=/(?:рост|увелич|повыс|прирост|сниж).{0,45}(?:CTR|конверс|продаж|выруч|revenue|conversion|sales)|(?:CTR|конверс|продаж|выруч).{0,30}(?:выраст|увелич|повыс)/iu;
const numericEffect=/\d[\d\s.,]*\s*(?:%|процент|руб|₽|доллар|\$|евро|€|раз(?:а|ов)?(?![\p{L}]))|(?:рост|увелич|сниз|сократ|прирост|эконом).{0,25}\s\d+(?![\p{L}\p{N}])/iu;
const scalarArea:Record<string,string>={TITLE:'title',H1:'h1',DESCRIPTION:'description'};
const rules:Record<string,string[]>={A01:['TITLE'],A02:['DESCRIPTION'],A03:['H1'],A04:['PACKAGING','FIRST_SCREEN'],A05:['FIRST_SCREEN','CTA'],A06:['APPLICATION'],A07:['SPECIFICATION'],A08:['CONTENT'],A09:['OTHER'],A10:['CONTENT'],A11:['OTHER'],A12:['INTERNAL_LINKING']};
function sentences(s:string){return s.split(/[.!?](?:\s|$)|[\n;]|,(?!\d)/u).filter(Boolean);}
function assertions(s:string){return sentences(s).filter(x=>!/(?:не\s+(?:доказан\p{L}*|подтвержден\p{L}*|подтверждён\p{L}*|установлен\p{L}*|доказывает|означает)|(?:нельзя|не\s+(?:следует|нужно))\s+(?:утверждать|делать\s+вывод)|не\s+(?:утверждать|делать\s+вывод)|нет\s+(?:данных|оснований)\s+(?:для|о|утверждать)|not\s+(?:proven|confirmed))/iu.test(x)).join(' ')
 .replace(/не\s+нулев\p{L}*\s+(?:продаж\p{L}*|онлайн[- ]?заказ\p{L}*)/giu,'неизвестный коммерческий результат');}
function meaningful(e:Evidence){return !e.id.startsWith('QUALITY_')&&['KNOWN_PRESENT','KNOWN_ABSENT'].includes(e.state);}
function permittedAbsence(e:Evidence|undefined){return e?.state==='KNOWN_ABSENT'&&e.supportsAbsenceClaim===true&&e.coverage==='FULL'&&!e.truncated;}
function semanticText(s:string,input:AiPageAnalysisInput,refs:string[]):string|null {
 const claim=assertions(s);
 if(causal.test(claim))return 'UNSUPPORTED_CAUSE';
 if(lowCtr.test(claim)&&!input.findings.some(f=>{const v=f.value as {ctr?:number;ctrBenchmark?:number}|null;return f.rule==='RULE_01'&&refs.includes(f.id)&&typeof v?.ctr==='number'&&typeof v?.ctrBenchmark==='number'&&v.ctr<v.ctrBenchmark;}))return 'UNSUPPORTED_CTR';
 if(input.stock.summary.state!=='KNOWN_PRESENT'&&inventory.test(claim)&&/(?:слишком|избыточ|дефицит|избыток|критическ|недостат|нет\s+остат|остат.{0,25}отсутств|excess|insufficient)/iu.test(claim))return 'UNKNOWN_INVENTORY';
 const subjects:[RegExp,Evidence|undefined][]=[[/Title|заголов/iu,input.content.title],[/H1|основн.{0,12}заголов/iu,input.content.h1],
 [/description|метаопис|мета.?опис/iu,input.content.description],[/CTA|кнопк|призыв/iu,input.content.cta],
 [/фасов|packaging/iu,input.content.packaging],[/применени|application/iu,input.content.application],
 [/характеристик|спецификац|specification/iu,input.content.specifications],[/schema|разметк|Product|Offer/iu,input.technical.structuredDataObserved]];
 for(const sentence of sentences(claim))if(absence.test(sentence))for(const [subject,e] of subjects){
   if(e===input.content.title&&/H1|основн.{0,12}заголов/iu.test(sentence)&&!/Title/iu.test(sentence))continue;
   if(subject.test(sentence)&&!permittedAbsence(e))return e?.state==='KNOWN_PRESENT'?'EXISTING_CONTENT':'UNSUPPORTED_ABSENCE';
 }
 // A zero claim must be grounded in its own completely covered saved period, not current partial KPIs.
 if(/(?:0|нул\p{L}*)\s*(?:заказ|онлайн|продаж)|нет\s+(?:зафиксированн\p{L}*\s+)?(?:онлайн[- ]?)?(?:продаж|заказ)|(?:продаж|заказ).{0,35}(?:равны\s+нулю|отсутств|\b0\b)/iu.test(claim)){
   const covered=input.findings.some(f=>{
     const v=f.value as {salesComplete?:boolean;orders?:number;revenue?:number}|null;
     return ['RULE_11','RULE_16'].includes(f.rule)&&refs.includes(f.id)&&v?.salesComplete===true&&v.orders===0&&
       (claim.includes(f.period.from)&&claim.includes(f.period.to));
   });
   if(!covered)return 'SALES_PERIOD';
 }
 return null;
}
function numericTokens(value:unknown):Set<string>{
 return new Set((JSON.stringify(value).match(/(?<![\p{L}\p{N}])\d+(?:[.,]\d+)?(?![\p{L}\p{N}])/gu)??[]).map(n=>n.replace(',','.')));
}
export function validateRecommendation(r:AiRecommendationV2,input:AiPageAnalysisInput):string|null {
 const ids=new Map(evidenceItems(input).map(e=>[e.id,e]));
 if(!input.findings.length)return 'NO_FINDING';
 const allIds=[...r.evidenceIds,...r.findingIds,...r.observedFacts.flatMap(f=>f.evidenceIds)];
 if(allIds.some(id=>!ids.has(id)))return 'INVENTED_EVIDENCE';
 const findings=r.findingIds.map(id=>input.findings.find(f=>f.id===id));
 if(findings.some(f=>!f)||r.findingIds.some(id=>!r.evidenceIds.includes(id)))return 'INVALID_FINDING';
 if(!r.evidenceIds.some(id=>meaningful(ids.get(id)!)))return 'NO_MEANINGFUL_SUPPORT';
 for(const fact of r.observedFacts){
   if(fact.evidenceIds.some(id=>!r.evidenceIds.includes(id)))return 'FACT_REFERENCE';
   const es=fact.evidenceIds.map(id=>ids.get(id)!);
   const reason=semanticText(fact.statement,input,fact.evidenceIds);if(reason)return reason;
   if(!es.some(meaningful)&&!uncertain.test(fact.statement))return 'UNKNOWN_AS_FACT';
   const known=numericTokens(es.map(e=>({value:e.value,...('period'in e?{period:e.period}:{}),...('rule'in e?{rule:e.rule}:{})})));
   if([...numericTokens(fact.statement)].some(n=>!known.has(n)))return 'INVENTED_NUMBER';
 }
 // Keep semantic scope inside each field: a title/CTA mention in one field cannot qualify an absence in another.
 for(const field of [r.title,r.rationale,r.proposedAction.description,r.proposedAction.example??'']){const reason=semanticText(field,input,r.evidenceIds);if(reason)return reason;}
 // A hypothesis is explicitly labelled, but an asserted defect/causal diagnosis remains prohibited.
 if(r.hypothesis&&causal.test(r.hypothesis)&&!/(?:возмож|может|гипотез|предполож|possible|might)/iu.test(r.hypothesis))return 'UNSUPPORTED_CAUSE';
 if(r.hypothesis){const hReason=semanticText(r.hypothesis.replace(causal,''),input,r.evidenceIds);if(hReason)return hReason;}
 if(input.stock.summary.state!=='KNOWN_PRESENT'&&r.hypothesis&&inventory.test(assertions(r.hypothesis)))return 'UNKNOWN_INVENTORY';
 const action=r.proposedAction;
 const supported=findings.some(f=>f&&(f.kind==='SEO_ACTION'?(rules[f.rule.split(':')[0]]??[]).includes(action.area):
   ['RULE_11','RULE_16'].includes(f.rule)&&['FIRST_SCREEN','CTA','PACKAGING','APPLICATION','CONTENT','OTHER'].includes(action.area)));
 if(!supported)return 'FINDING_AREA';
 if(action.type==='CHECK'&&(action.example!==undefined||!verify.test(action.description)))return 'CHECK_AS_CHANGE';
 if(findings.every(f=>f?.kind==='OPPORTUNITY')&&action.type!=='CHECK')return 'UNPROVEN_CHANGE';
 if(action.type==='CHANGE'){
   const scalar=scalarArea[action.area];
   if(scalar&&input.content[scalar]?.coverage!=='FULL'&&!(action.area==='DESCRIPTION'&&findings.some(f=>f?.rule==='A02')))return 'INCOMPLETE_CHANGE';
   const element:Record<string,string>={FIRST_SCREEN:'topText',CONTENT:'visibleExcerpt',APPLICATION:'application',SPECIFICATION:'specifications',PACKAGING:'packaging',CTA:'cta'};
   if(!scalar){const e=input.content[element[action.area]];if(!e||!r.evidenceIds.includes(e.id)||e.coverage!=='FULL'||e.truncated||!meaningful(e))return 'INCOMPLETE_CHANGE';}
   if(action.area==='DESCRIPTION'&&input.content.description.state==='UNKNOWN'&&(!r.uncertainty||!uncertain.test(r.uncertainty)||!verify.test(action.description+' '+r.uncertainty)))return 'UNKNOWN_DESCRIPTION_REVIEW';
 }
 const positive=action.description.replace(/не\s+(?:(?:нужно|следует)\s+)?(?:добавлять|добавляйте|включать|указывайте|дублировать|пополнять|планировать)[^.!?;\n]*/giu,'');
 if(input.stock.summary.state!=='KNOWN_PRESENT'&&inventory.test(positive))return 'UNKNOWN_INVENTORY_ACTION';
 const tokens=(input.content.technicalTokens.value as {observed:string;state:string}[]|null)??[];
 if(action.type==='CHANGE'&&tokens.some(t=>t.state==='KNOWN_PRESENT'&&
   (/добав|включ|укаж|встав|add|include/iu.test(positive)&&technicalContains(positive,t.observed)||
    action.area==='SPECIFICATION'&&technicalContains(action.example??'',t.observed))))return 'EXISTING_TECHNICAL_VALUE';
 const scalar=scalarArea[action.area];
 if(action.type==='CHANGE'&&scalar&&/добав|включ/iu.test(positive)){
   const current=input.content[scalar]?.value;
   if(typeof current==='string'&&['контакты','реквизиты'].some(term=>normalizeTechnicalText(current).includes(term)&&normalizeTechnicalText(positive).includes(term)))return 'EXISTING_CONTENT';
 }
 const graph=input.evidenceQuality.graph.value as {status?:string}|null;
 if(action.area==='INTERNAL_LINKING'&&graph?.status!=='AVAILABLE'&&(action.type!=='CHECK'||r.confidence!=='LOW'||!r.uncertainty||!/(?:частич|неполн|PARTIAL|UNKNOWN)/iu.test(r.uncertainty)))return 'PARTIAL_GRAPH';
 if(/schema|разметк|Product.?Offer/iu.test(action.description)&&input.technical.structuredDataObserved.state!=='KNOWN_PRESENT'&&action.type!=='CHECK')return 'SCHEMA_NOT_OBSERVED';
 if(numericEffect.test(r.expectedEffect))return 'NUMERIC_EFFECT';
 if(growthEffect.test(r.expectedEffect))return 'PROMISED_METRIC_EFFECT';
 return null;
}
export function validateAiResult(raw:string,input:AiPageAnalysisInput):{result:AiPageAnalysisResultV2;validation:AiValidationSummary}{
 if(Buffer.byteLength(raw,'utf8')>40000)throw new AiError('OUTPUT_TOO_LARGE');
 let value:unknown;try{value=JSON.parse(raw);}catch{throw new AiError('INVALID_JSON');}
 const envelope=envelopeSchema.safeParse(value);if(!envelope.success)throw new AiError('INVALID_SCHEMA');
 if(envelope.data.pageId!==input.page.pageId)throw new AiError('PAGE_IDENTITY');
 const generalReason=[envelope.data.executiveSummary,...envelope.data.limitations].map(field=>semanticText(field,input,input.findings.map(f=>f.id))).find(Boolean);
 if(generalReason)throw new AiError('UNSAFE_ENVELOPE_'+generalReason,{generatedCount:envelope.data.recommendations.length});
 const knownNumbers=numericTokens({evidence:evidenceItems(input),findingCount:input.findings.length});
 if([...numericTokens(envelope.data.executiveSummary)].some(n=>!knownNumbers.has(n)))throw new AiError('UNSAFE_ENVELOPE_INVENTED_NUMBER',{generatedCount:envelope.data.recommendations.length});
 const accepted:AiRecommendationV2[]=[],validation:AiValidationSummary={generatedCount:envelope.data.recommendations.length,acceptedCount:0,rejectedCount:0,rejectedByReason:{},decisions:[],outcome:'SUCCESS'};
 envelope.data.recommendations.forEach((item,index)=>{
   const parsed=recommendationSchema.safeParse(item),reason=parsed.success?validateRecommendation(parsed.data,input):'RECOMMENDATION_SCHEMA';
   if(reason){validation.rejectedCount++;validation.rejectedByReason[reason]=(validation.rejectedByReason[reason]??0)+1;validation.decisions.push({decision:'REJECT',recommendationIndex:index,reasonCode:reason});}
   else{accepted.push(parsed.data!);validation.decisions.push({decision:'ACCEPT',recommendationIndex:index});}
 });
 validation.acceptedCount=accepted.length;validation.outcome=validation.generatedCount===0?'VALID_EMPTY':accepted.length===0?'ALL_REJECTED':validation.rejectedCount?'PARTIAL_SUCCESS':'SUCCESS';
 return {result:{pageId:envelope.data.pageId,executiveSummary:envelope.data.executiveSummary,recommendations:accepted,
   limitations:[...new Set([...input.evidenceQuality.limitations,...envelope.data.limitations])]},validation};
}
