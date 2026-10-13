import type {Recommendation,Detail,ResolvedReference} from './contract';
/** Bounded clause detector. No field-wide exemption; independent assertions are checked separately. */
export function clauses(text:string){return text.split(/[.!?]\s+|;\s*|\n|,\s+(?=(?:но|однако|а\s+не|если|это|изменение|CTR|schema|описание|Description|H1|он|она)(?!\p{L}))|\s+(?=и\s+изменение(?!\p{L}))/iu).map(s=>s.trim()).filter(Boolean);}
export function expression(text:string):'CAVEAT'|'CONDITIONAL'|'QUESTION'|'ASSERTION'{
 const s=text.trim();
 if(/^(?:без\s+[^,.]{1,45}\s+)?(?:нельзя|невозможно|не\s+следует|не\s+можем)\s+(?:гарантир|обещ|счит|утверж|заключ|делать\s+вывод|подтверд|доказ)/iu.test(s)||/^(?:это\s+[^,;]{0,30},\s*)?(?:а\s+)?не\s+(?:прогноз|обещани|гаранти)/iu.test(s)||/^(?:рост|эффект|отсутствие|частичный\s+граф|coverage\s+PARTIAL)[^.;]{0,80}(?:не\s+гарантирован|не\s+подтвержден|не\s+доказывает)/iu.test(s))return 'CAVEAT';
 if(/^если(?!\p{L})|^при\s+(?:подтвержден|подтверждён|условии|фактическ)/iu.test(s))return 'CONDITIONAL';
 if(/^(?:проверить|выяснить|уточнить)\s*[:,]?\s*(?:есть\s+ли|содержит\s+ли|отсутствует\s+ли|отсутствуют\s+ли)/iu.test(s))return 'QUESTION';
 return 'ASSERTION';
}
export function textFields(r:Recommendation):[string,string][]{return [['finding',r.finding],['rationale',r.rationale],['proposedAction',r.proposedAction],['proposedContent.suggestedText',r.proposedContent?.suggestedText??''],['uncertainty',r.uncertainty??''],...r.verificationSteps?.map((s,n)=>[`verificationSteps[${n}]`,s] as [string,string])??[],...r.statements.map((s,n)=>[`statements[${n}].text`,s.text] as [string,string])];}
const absence=/(?:отсутствует|отсутствуют|не\s+содержит|не\s+хватает|нет\s+(?:Title|Description|H1|schema|схемы|входящих|описания)|\bmissing\b|\babsent\b)/iu;
const promise=/(?:гарант|увелич|повыс|рост|выраст|увеличит).{0,40}(?:CTR|конверси|выруч|продаж|позици|трафик)/iu;
const low=/низк.{0,15}CTR|CTR.{0,15}(?:низк|low)|low\s+CTR/iu;
export function semanticDetails(r:Recommendation,resolved:ResolvedReference[]):Detail[]{
 const out:Detail[]=[];for(const [fieldPath,text]of textFields(r))for(const clause of clauses(text)){
  const scope=expression(clause),conditional=r.recommendationType==='CHECK'&&scope==='CONDITIONAL',caveat=scope==='CAVEAT';
  // A negation only exempts its own proposition. Conservative ambiguous language stays human-reviewed.
  if(low.test(clause)&&!caveat)out.push({code:'UNSUPPORTED_CTR',fieldPath,rule:'NO_COMPARABLE_BENCHMARK'});
  if(promise.test(clause)&&!caveat)out.push({code:'PROMISED_METRIC_EFFECT',fieldPath,rule:'UNSUPPORTED_UPLIFT_ASSERTION'});
  if(absence.test(clause)&&!caveat&&!conditional&&scope!=='QUESTION'){
   const bound=resolved.some(x=>['ABSENT','MISSING_TERM'].includes(x.reference.purpose)&&
    (x.kind==='content.title'&&/Title|заголов/iu.test(clause)||x.kind==='content.description'&&/Description|метаописан/iu.test(clause)||x.kind==='content.h1'&&/H1/iu.test(clause)||x.kind==='technical.schema'&&/schema|разметк/iu.test(clause)));
   const snapshotLimit=/snapshot|снимок/iu.test(clause)&&/не\s+содержит\s+исходн.{0,10}HTML/iu.test(clause);
   if(!bound&&!snapshotLimit)out.push({code:'UNBOUND_ABSENCE_CLAIM',fieldPath,rule:'UNPROVEN_CURRENT_ABSENCE'});
  }
 }
 return out;
}
const qualifiers=[['WHOLESALE_PRICE',/оптов\p{L}*\s+цен/iu],['OFFICIAL',/официальн\p{L}*\s+(?:интернет[- ]?)?магазин/iu],['WHOLESALE',/оптов\p{L}*|(?<!\p{L})оптом(?!\p{L})/iu],['BEST_PRICE',/лучш\p{L}*\s+цен/iu],['NATIONAL_DELIVERY',/доставк\p{L}*\s+по\s+всей\s+России/iu],['CERTIFIED_SUPPLIER',/сертифицирован\p{L}*\s+поставщик/iu]] as const;
export function commercialDetails(r:Recommendation,resolved:ResolvedReference[]):Detail[]{
 const full=resolved.filter(x=>/^content\.(title|description|h1)$/.test(x.kind)&&x.state==='KNOWN_PRESENT'&&x.coverage==='FULL'&&typeof x.value==='string').map(x=>String(x.value));
 const out:Detail[]=[];for(const [fieldPath,original]of textFields(r))for(const [category,pattern]of qualifiers){
  let text=original;
  if(fieldPath!=='proposedContent.suggestedText')for(const q of resolved.filter(x=>x.kind==='search.query'&&x.reference.fieldPath==='value.query'&&x.reference.purpose==='OBSERVE')){
   const escaped=String(q.value).replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
   text=text.replace(new RegExp('запрос(?:у|а|е)?\\s*[«"]'+escaped+'[»"]','giu'),'цитируемый поисковый запрос');
  }
  const positiveProof=full.some(v=>clauses(v).some(c=>pattern.test(c)&&expression(c)==='ASSERTION'&&!/(?<!\p{L})не(?!\p{L})/iu.test(c)&&!/не\s+\p{L}*\s*(?:оптов|официальн|лучш|сертифицирован)|не\s+(?:оптов|официальн|лучш|сертифицирован)|не\s+осуществля/iu.test(c)));
  if(!pattern.test(text)||positiveProof)continue;
  const conditional=fieldPath!=='proposedContent.suggestedText'&&clauses(text).filter(s=>pattern.test(s)).every(s=>
   ['CONDITIONAL','QUESTION','CAVEAT'].includes(expression(s))||
   /^(?:проверить|подтвердить|выяснить)(?!\p{L})/iu.test(s)||
   /не\s+подтвержден|не\s+подтверждён/iu.test(s)||
   /^(?:поисковый\s+запрос|запрос|цитируемый\s+поисковый\s+запрос|сохранённые\s+данные|данные|ссылка)[^.;]{0,70}не\s+(?:подтвержда|доказыва)/iu.test(s)||
   /^гипотеза[^.;]{0,80}требу\p{L}*\s+подтверждения/iu.test(s));
  if(!conditional)out.push({code:'UNVERIFIED_COMMERCIAL_QUALIFIER',fieldPath,category,rule:'REQUIRES_CITED_FULL_CONTENT_PROOF'});
 }return out;
}
/** Narrow, explicit current-content assertions. Other prose remains NEEDS_REVIEW. */
export function contentFactDetails(r:Recommendation,resolved:ResolvedReference[]):Detail[]{
 const out:Detail[]=[];
 for(const [fieldPath,text]of textFields(r)){
  if(!/^(finding|rationale|statements\[)/.test(fieldPath))continue;
  for(const m of text.matchAll(/(?:текущий\s+|сохранённый\s+|сохраненный\s+)?(Title|Description|H1)\s*(?:равен|содержит|составляет|указан|:|—|–)\s*[«"]([^»"]+)[»"]/giu)){
   const kind={title:'content.title',description:'content.description',h1:'content.h1'}[m[1].toLowerCase()];
   const source=resolved.filter(x=>x.kind===kind&&x.reference.fieldPath==='value'&&x.reference.purpose==='OBSERVE');
   if(!source.length||!source.some(x=>x.value===m[2]))out.push({code:'CONTENT_FACT_MISMATCH',fieldPath,rule:'EXPLICIT_CURRENT_SCALAR_MUST_EQUAL_CITED_VALUE'});
  }
 }
 return out;
}
