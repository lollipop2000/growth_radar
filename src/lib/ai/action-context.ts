import {evidenceItems,type AiActionContext,type AiPageAnalysisInput,type DeterministicFinding,type Evidence,type RecommendationArea,type ValidatedAiAction} from './contract';
const seoAreas:Record<string,RecommendationArea>={A01:'TITLE',A02:'DESCRIPTION',A03:'H1',A04:'PACKAGING',A05:'FIRST_SCREEN',A06:'APPLICATION',A07:'SPECIFICATION',A08:'CONTENT',A10:'CONTENT',A11:'OTHER',A12:'INTERNAL_LINKING'};
const elements:Partial<Record<RecommendationArea,string>>={TITLE:'title',DESCRIPTION:'description',H1:'h1',FIRST_SCREEN:'topText',CONTENT:'visibleExcerpt',APPLICATION:'application',SPECIFICATION:'specifications',PACKAGING:'packaging',CTA:'cta'};
const text=(e:Evidence|undefined)=>typeof e?.value==='string'?e.value:null;
const record=(v:unknown)=>v&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,unknown>:{};
function sufficient(e:Evidence|undefined,scalar:boolean){return !!e&&e.coverage==='FULL'&&!e.truncated&&
 (scalar?e.state==='KNOWN_PRESENT'||e.state==='KNOWN_ABSENT'&&e.supportsAbsenceClaim===true:e.state==='KNOWN_ABSENT'&&e.supportsAbsenceClaim===true);}
export function buildActionContexts(input:AiPageAnalysisInput):AiActionContext[]{
 const contexts:AiActionContext[]=[];
 for(const f of input.findings){
  if(f.state!=='KNOWN_PRESENT'||!f.findingId||!/^FINDING_\d{2}$/.test(f.id))continue;
  const code=f.rule.split(':')[0];let areas:RecommendationArea[],types:('CHANGE'|'CHECK')[]=['CHECK'];
  if(f.kind==='SEO_ACTION'){
   const area=seoAreas[code];if(!area)continue;
   areas=[area];const scalar=['TITLE','H1','DESCRIPTION'].includes(area);
   if(sufficient(input.content[elements[area]??''],scalar))types=['CHANGE','CHECK'];
  }else{
   if(!['RULE_11','RULE_16'].includes(code))continue;
   const v=record(f.value);if(code==='RULE_11'&&(v.salesComplete!==true||v.orders!==0||typeof v.visits!=='number'||v.visits<=0))continue;
   areas=code==='RULE_11'?['CTA','FIRST_SCREEN','PACKAGING','CONTENT','OTHER']:['CTA','FIRST_SCREEN','CONTENT','OTHER'];
  }
  const evidenceIds=[f.id];
  for(const area of areas){const e=input.content[elements[area]??''];if(e&&!evidenceIds.includes(e.id))evidenceIds.push(e.id);}
  if(areas.includes('OTHER')&&code==='A11')evidenceIds.push(input.technical.structuredDataObserved.id);
  if(areas.includes('INTERNAL_LINKING'))evidenceIds.push(input.evidenceQuality.graph.id);
  if(areas.includes('SPECIFICATION')&&input.content.technicalTokens)evidenceIds.push(input.content.technicalTokens.id);
  // Title/H1 anchor the subject, never justify an unrelated Title change.
  for(const e of [input.content.title,input.content.h1])if(e&&!evidenceIds.includes(e.id))evidenceIds.push(e.id);
  const restrictions=['Только задача данного сохранённого сигнала, без новых диагнозов.','Не воспроизводить показатели, даты, исходные тексты или перечень характеристик в action/rationale/questions.',
   'CHECK — конкретная проверка, без готового replacement example и без утверждения дефекта.','Не отправлять формы, не менять корзину/checkout, только чтение и ручная проверка.',
   'Не добавлять известные технические значения, не выдумывать новые характеристики или условия заказа.'];
  if(!types.includes('CHANGE'))restrictions.push('Достоверности для CHANGE недостаточно; только CHECK. Отсутствие в excerpt/UNKNOWN/NOT_OBSERVED не доказывает дефект.');
  if(f.kind==='OPPORTUNITY')restrictions.push('Причина коммерческого результата не установлена. Диагностика видимости CTA, пути оформления, информации для профессионального покупателя. Никаких складских действий, SEO диагнозов или причинных утверждений.');
  if(input.stock.summary.state!=='KNOWN_PRESENT')restrictions.push('stockKg/Days of Stock UNKNOWN: запрещены складские рекомендации и выводы.');
  if(code==='A12')restrictions.push('При частичном графе только предварительный CHECK, не доказанный orphan.');
  if(code==='A11')restrictions.push('NOT_OBSERVED schema не физическое отсутствие; проверка HTML до изменений.');
  contexts.push({contextId:'CTX_'+String(contexts.length+1).padStart(2,'0'),findingId:f.findingId,findingEvidenceId:f.id,findingType:code,allowedActionTypes:types,allowedAreas:areas,evidenceIds,restrictions,
   subject:{pageType:input.page.pageType,title:text(input.content.title),h1:text(input.content.h1),description:text(input.content.description)}});
 }
 return contexts;
}
export function findingForContext(input:AiPageAnalysisInput,context:AiActionContext):DeterministicFinding {
 const finding=input.findings.find(f=>f.id===context.findingEvidenceId&&f.findingId===context.findingId);if(!finding)throw new Error('Invalid server context');return finding;
}
export function factsForContext(input:AiPageAnalysisInput,context:AiActionContext):ValidatedAiAction['observedFacts'] {
 const f=findingForContext(input,context),v=record(f.value),facts:ValidatedAiAction['observedFacts']=[];
 const add=(label:string,value:unknown,evidenceId:string)=>facts.push({label,value:value==null?'UNKNOWN':typeof value==='string'?value:JSON.stringify(value),evidenceId});
 add('Сохранённый сигнал',f.title,f.id);add('Период сигнала',`${f.period.from} — ${f.period.to}`,f.id);
 if(f.kind==='OPPORTUNITY'){
  add('Посещения за период сигнала',v.visits,f.id);add('Онлайн-заказы за период сигнала',v.salesComplete===true?v.orders:null,f.id);
  add('Выручка за период сигнала',v.salesComplete===true?v.revenue:null,f.id);add('Полное покрытие продаж',v.salesComplete,f.id);add('Известные дни продаж',v.salesKnownDays,f.id);
 }else{
  for(const area of context.allowedAreas){const e=input.content[elements[area]??''];if(e)add(area,`${e.state}: ${e.value==null?'UNKNOWN':typeof e.value==='string'?e.value:JSON.stringify(e.value)}`,e.id);}
 }
 for(const key of ['title','h1']){const e=input.content[key];if(e&&!facts.some(f=>f.evidenceId===e.id))add(key.toUpperCase(),e.value,e.id);}
 if(context.allowedAreas.includes('SPECIFICATION')&&input.content.technicalTokens)add('Наблюдаемые характеристики',input.content.technicalTokens.value,input.content.technicalTokens.id);
 return facts;
}
export function limitationsForContext(input:AiPageAnalysisInput,context:AiActionContext):string[]{
 const f=findingForContext(input,context),limits=['Действие не выполняется автоматически; перед изменением требуется ручная проверка актуальной страницы.'];
 if(f.kind==='OPPORTUNITY')limits.push(`Наблюдения относятся только к периоду ${f.period.from} — ${f.period.to}. Причина коммерческого результата не установлена.`);
 if(f.kind==='OPPORTUNITY'&&input.stock.summary.state!=='KNOWN_PRESENT')limits.push('Запас в кг и Days of Stock UNKNOWN; складские выводы недоступны.');
 for(const area of context.allowedAreas){const e=input.content[elements[area]??''];if(e&&(e.coverage!=='FULL'||['UNKNOWN','NOT_OBSERVED'].includes(e.state)))limits.push(`${area}: ${e.state}, охват ${e.coverage??'UNKNOWN'}; отсутствие/дефект элемента не доказаны.`);}
 if(context.findingType==='A11')limits.push('Структурированные данные не полностью наблюдались в snapshot; физическое отсутствие не подтверждено.');
 if(context.findingType==='A12')limits.push(`Граф: ${JSON.stringify(input.evidenceQuality.graph.value)}. При частичном охвате отсутствие входящих ссылок не доказано; предварительная проверка с LOW уверенностью.`);
 return [...new Set(limits)];
}
export function actionEvidence(input:AiPageAnalysisInput,contexts:AiActionContext[]){const ids=new Set(contexts.flatMap(c=>c.evidenceIds));return evidenceItems(input).filter(e=>ids.has(e.id));}
