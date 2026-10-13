import {type AiActionProposal,type AiPageAnalysisInput,type AiAnalysisResponse,type AiValidationSummary} from './contract';
import {actionsEnvelopeSchema,proposalSchema} from './schema-v3';
import {buildActionContexts,findingForContext,factsForContext,limitationsForContext} from './action-context';
import {AiError} from './provider';
import {technicalContains,normalizeTechnicalText} from '../seo-actions/technical-token';
export {actionsSchema as resultSchema} from './schema-v3';
import {specificityReasons} from './specificity';
// Scope is each model field separately. Server facts are never semantically revalidated.
function assertions(field:string){return field
 .replace(/(?:не\s+считать|нельзя\s+считать)\s+отсутствие\s+заказов\s+доказательством\s+дефекта/giu,'')
 .replace(/причина\s+(?:неизвестна|не установлена)|нет\s+подтверждённой\s+причины/giu,'')
 .replace(/(?:без\s+отправки|не\s+отправлять)\s+форм/giu,'')
 .replace(/без\s+(?:изменения\s+(?:состояния|корзины)|взаимодействия\s+с\s+(?:корзиной|checkout))/giu,'');}
function fieldReason(field:string,input:AiPageAnalysisInput,p:AiActionProposal):string|null{
 const s=assertions(field);
 if(/ignore.{0,20}instructions|system prompt|api.?key|парол|токен|credentials|<script|javascript:|https?:\/\/|\b(?:POST|PUT|DELETE)\b/iu.test(s))return 'UNSAFE_TEXT';
 if(/из-за|вызван|приводит\s+к|является\s+причин|caused\s+by|due\s+to|почему.{0,45}(?:нет|отсутств)|причин.{0,35}(?:нул|отсутств)/iu.test(s))return 'UNSUPPORTED_CAUSE';
 if(p.actionType==='CHECK'&&/(?:слом\p{L}*|неработающ\p{L}*|неудобн\p{L}*|некорректн\p{L}*|неправильн\p{L}*)\s+(?:CTA|кноп\p{L}*|фасов\p{L}*|оформлен\p{L}*|услови\p{L}*)|(?:CTA|кноп\p{L}*|фасов\p{L}*)\s+(?:слом\p{L}*|не работает)|мешает\s+(?:покуп|оформ|заказ)/iu.test(s))return 'UNPROVEN_DEFECT';
 if(/низк.{0,15}CTR|CTR.{0,15}(?:низк|low)|low\s+CTR/iu.test(s))return 'UNSUPPORTED_CTR';
 if(/\d[\d\s.,]*\s*(?:%|процент|руб|₽)|(?:рост|увелич|повыс|сниз).{0,40}(?:конверс|CTR|продаж|выруч)|(?:конверс|CTR|продаж|выруч).{0,30}(?:выраст|повыс|увелич)/iu.test(s))return 'PROMISED_METRIC_EFFECT';
 if(/\d{4}-\d{2}-\d{2}|\d+\s*(?:посещ|визит|visits|заказ|orders|продаж)|(?:нулев|ноль|0)\s*(?:продаж|заказ)|(?:нет|отсутств\p{L}*)\s+(?:онлайн[- ]?)?(?:заказ|продаж)|(?:заказ|продаж).{0,20}(?:отсутств|равн\p{L}*\s+нул)/iu.test(s))return 'MODEL_FACT';
 if(input.stock.summary.state!=='KNOWN_PRESENT'&&/склад|запас|дефицит|избыт|пополн|остат[ок]|stockKg|daysOfStock|inventory|replenish/iu.test(s))return 'UNKNOWN_INVENTORY';
 if(/минимальн.{0,15}(?:заказ|парти)|минимум.{0,15}заказ|minimum order/iu.test(s)&&/(?:состав\p{L}*|равен|от|не менее)\s*\d/iu.test(s))return 'UNKNOWN_ORDER_CONDITION';
 if(/(?:отправ|заполн|оформи[тм]|размест).{0,25}(?:форм|заказ)|(?:добав|полож).{0,25}(?:корзин)|(?:submit|add to cart)/iu.test(s))return 'UNSAFE_INTERACTION';
 const subjects:[RegExp,string][]=[[/\bTitle\b|заголовок\s+страниц/iu,'title'],[/\bH1\b/iu,'h1'],[/description|метаопис|мета.?опис/iu,'description'],[/CTA|кнопк|призыв/iu,'cta'],[/фасов|packaging/iu,'packaging'],[/применени|application/iu,'application'],[/характеристик|спецификац/iu,'specifications'],[/schema|разметк|Product|Offer/iu,'schema']];
 // Synonyms now pass specificity; they must not become a bypass for absence guards.
 // Bind ambiguous nouns to the already-authorized area, never infer a new area.
 if(p.area==='DESCRIPTION')subjects.push([/описани|анонс|сниппет|метатег/iu,'description']);
 if(p.area==='TITLE'||p.area==='H1')subjects.push([/заголов/iu,p.area==='TITLE'?'title':'h1']);
 if(/(?<![\p{L}])(?:нет|отсутств\p{L}*|пуст\p{L}*|missing|absent)(?![\p{L}])|не\s+содержит|не хватает|недостающ/iu.test(s))for(const [subject,key]of subjects)if(subject.test(s)){
  const e=key==='schema'?input.technical.structuredDataObserved:input.content[key];
  if(p.actionType==='CHECK'||!e||e.state!=='KNOWN_ABSENT'||!e.supportsAbsenceClaim||e.coverage!=='FULL'||e.truncated)return e?.state==='KNOWN_PRESENT'?'EXISTING_CONTENT':'UNSUPPORTED_ABSENCE';
 }
 const tokens=(input.content.technicalTokens?.value as {observed:string;state:string}[]|null)??[];
 if(p.actionType==='CHANGE'&&/добав|включ|укаж|встав|add|include/iu.test(s)&&tokens.some(t=>t.state==='KNOWN_PRESENT'&&technicalContains(s,t.observed)))return 'EXISTING_TECHNICAL_VALUE';
 if(p.actionType==='CHANGE'&&p.area==='SPECIFICATION'&&tokens.some(t=>t.state==='KNOWN_PRESENT'&&technicalContains(s,t.observed)))return 'EXISTING_TECHNICAL_VALUE';
 if(/совместим.{0,30}(?:с|для)|соответствует.{0,20}(?:API|ACEA|ГОСТ)|допуск.{0,20}(?:API|ACEA|ГОСТ)|сертифицир|температура.{0,20}(?:равна|составляет)/iu.test(s))return 'UNKNOWN_TECHNICAL_CLAIM';
 if(/(?:доказан|является).{0,20}orphan|(?:нет|отсутств\p{L}*).{0,20}входящ.{0,10}ссыл/iu.test(s)&&input.evidenceQuality.graph.coverage!=='FULL')return 'PARTIAL_GRAPH';
 const numbers=s.match(/(?<![\p{L}\p{N}])\d+(?:[.,]\d+)?(?![\p{L}\p{N}])/gu)??[];
 const known=new Set((JSON.stringify([input.content.title?.value,input.content.h1?.value,input.content.description?.value]).match(/(?<![\p{L}\p{N}])\d+(?:[.,]\d+)?(?![\p{L}\p{N}])/gu)??[]).map(n=>n.replace(',','.')));
 if(numbers.some(n=>!known.has(n.replace(',','.'))))return 'INVENTED_NUMBER';
 return null;
}
/** Safe local diagnosis: reason codes only, no proposal text or snippets. */
export function diagnoseProposal(p:AiActionProposal,input:AiPageAnalysisInput):string[]{
 const reasons:string[]=[],ctx=buildActionContexts(input).find(c=>c.contextId===p.contextId);
 if(!ctx)reasons.push('INVALID_CONTEXT');
 else{
  if(!ctx.allowedActionTypes.includes(p.actionType))reasons.push('UNPROVEN_CHANGE');
  if(!ctx.allowedAreas.includes(p.area))reasons.push('ACTION_AREA_MISMATCH');
 }
 if(p.actionType==='CHECK'&&p.example!==undefined)reasons.push('CHECK_AS_CHANGE');
 if(p.actionType==='CHANGE'&&p.questionsToVerify?.length)reasons.push('CHANGE_AS_CHECK');
 for(const field of [p.proposedAction,p.rationale,p.example??'',...p.questionsToVerify??[]]){const reason=fieldReason(field,input,p);if(reason)reasons.push(reason);}
 reasons.push(...specificityReasons(p));
 if(p.actionType==='CHANGE'&&['TITLE','H1'].includes(p.area)&&/добав|включ/iu.test(p.proposedAction)){
  const current=input.content[p.area==='TITLE'?'title':'h1']?.value;
  if(typeof current==='string'&&['контакты','реквизиты'].some(t=>normalizeTechnicalText(current).includes(t)&&normalizeTechnicalText(p.proposedAction).includes(t)))reasons.push('EXISTING_CONTENT');
 }
 return [...new Set(reasons)];
}
export function validateProposal(p:AiActionProposal,input:AiPageAnalysisInput):string|null{return diagnoseProposal(p,input)[0]??null;}
export function validateAiResult(raw:string,input:AiPageAnalysisInput):{result:AiAnalysisResponse['result'];validation:AiValidationSummary}{
 if(Buffer.byteLength(raw,'utf8')>40000)throw new AiError('OUTPUT_TOO_LARGE');
 let value:unknown;try{value=JSON.parse(raw);}catch{throw new AiError('INVALID_JSON');}
 const envelope=actionsEnvelopeSchema.safeParse(value);if(!envelope.success)throw new AiError('INVALID_SCHEMA');
 const contexts=buildActionContexts(input),actions:AiAnalysisResponse['result']['actions']=[],seen=new Set<string>();
 const validation:AiValidationSummary={generatedCount:envelope.data.proposals.length,acceptedCount:0,rejectedCount:0,rejectedByReason:{},decisions:[],outcome:'SUCCESS'};
 envelope.data.proposals.forEach((item,index)=>{
  const parsed=proposalSchema.safeParse(item);let reason=parsed.success?validateProposal(parsed.data,input):'PROPOSAL_SCHEMA';
  const p=parsed.data,key=p?JSON.stringify([p.contextId,p.actionType,p.area,normalizeTechnicalText(p.proposedAction).replace(/\s+/g,' ').trim()]):'';
  if(!reason&&seen.has(key))reason='DUPLICATE';
  if(reason){validation.rejectedCount++;validation.rejectedByReason[reason]=(validation.rejectedByReason[reason]??0)+1;validation.decisions.push({decision:'REJECT',recommendationIndex:index,reasonCode:reason});return;}
  seen.add(key);const ctx=contexts.find(c=>c.contextId===p!.contextId)!,f=findingForContext(input,ctx);
  actions.push({contextId:ctx.contextId,finding:{id:f.findingId,title:f.title,ruleId:f.rule,priority:f.priority,score:f.score,confidence:f.confidence,period:f.period},observedFacts:factsForContext(input,ctx),
   action:{type:p!.actionType,area:p!.area,description:p!.proposedAction,rationale:p!.rationale,...p!.example?{example:p!.example}:{},...p!.questionsToVerify?{questionsToVerify:p!.questionsToVerify}:{}},limitations:limitationsForContext(input,ctx),evidenceIds:ctx.evidenceIds});
  validation.decisions.push({decision:'ACCEPT',recommendationIndex:index});
 });
 validation.acceptedCount=actions.length;validation.outcome=validation.generatedCount===0?'VALID_EMPTY':!actions.length?'ALL_REJECTED':validation.rejectedCount?'PARTIAL_SUCCESS':'SUCCESS';
 const executiveSummary=actions.length?`Принято действий: ${actions.length}. Изменений: ${actions.filter(a=>a.action.type==='CHANGE').length}; проверок: ${actions.filter(a=>a.action.type==='CHECK').length}. Все факты и ограничения взяты из сохранённых данных.`:validation.generatedCount?'Предложения не прошли проверку достоверности.':'Дополнительные действия на имеющихся данных не предложены.';
 return {result:{pageId:input.page.pageId,executiveSummary,actions},validation};
}
