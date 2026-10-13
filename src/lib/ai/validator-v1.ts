import {z} from 'zod';
import {evidenceItems,type AiPageAnalysisInput,type AiPageAnalysisResult} from './contract';
import {AiError} from './provider';
import {normalizeTechnicalText,technicalContains} from '../seo-actions/technical-token';
const text=z.string().trim().min(1).max(2000);
export const resultSchema=z.strictObject({
  executiveSummary:text,
  recommendations:z.array(z.strictObject({title:text.max(200),problem:text,recommendation:text,rationale:text,
    expectedEffect:text.max(500),confidence:z.enum(['HIGH','MEDIUM','LOW']),
    evidenceIds:z.array(z.string().regex(/^(SEARCH|CONTENT|TECH|COMMERCE|FINDING|QUALITY)_\d{2}$/)).min(1).max(15),
    uncertainty:text.optional(),proposedChange:z.strictObject({area:z.enum(['TITLE','DESCRIPTION','H1','FIRST_SCREEN','CONTENT','APPLICATION','SPECIFICATION','PACKAGING','INTERNAL_LINKING','CTA','OTHER']),example:text.optional()}).optional()
  })).max(5),limitations:z.array(text.max(800)).max(15)
});
const stockWords=/склад|запас|дефицит|избыт|пополн|остат[ок]|days\s*of\s*stock|inventory|stock|replenish|shortage|overstock/i;
const schemaWords=/schema|json.?ld|разметк|product\s*(?:schema|схем)|offer\s*(?:schema|схем)/i;
const verify=/провер|подтверд|verify|inspect|check/i;
const links=/внутренн.{0,20}ссыл|входящ.{0,20}ссыл|сирот|orphan|internal.?link|inbound/i;
const incomplete=/неполн|частич|наблюдаем|partial|неизвест|unknown|провер/i;
function reject(reason='REFERENCE'){throw new AiError('INVALID_EVIDENCE_'+reason);}
export function validateAiResult(raw:string,input:AiPageAnalysisInput):AiPageAnalysisResult {
  if(Buffer.byteLength(raw,'utf8')>40000)throw new AiError('OUTPUT_TOO_LARGE');
  let value:unknown;try{value=JSON.parse(raw);}catch{throw new AiError('INVALID_JSON');}
  const parsed=resultSchema.safeParse(value);if(!parsed.success)throw new AiError('INVALID_SCHEMA');
  if(!input.findings.length&&parsed.data.recommendations.length)reject('NO_FINDING');
  const result=parsed.data,items=evidenceItems(input),ids=new Map(items.map(e=>[e.id,e]));
  const hasStock=input.stock.summary.state==='KNOWN_PRESENT';
  const schema=input.technical.structuredDataObserved;
  const partialGraph=(input.evidenceQuality.graph.value as {status?:string})?.status!=='AVAILABLE';
  const presentTokens=(input.content.technicalTokens.value as {observed:string;normalized:string;state:string}[]|null)??[];
  const salesPartial=Number((input.commerce.coverage.value as {unknownDays?:number}|null)?.unknownDays??1)>0;
  const allResultText=JSON.stringify(result);
  // Definitive contradictions are invalid even in executiveSummary/limitations.
  if(!hasStock&&/(?:слишком\s+(?:больш|мал)|избыточн|критическ|недостаточн|excessive|insufficient).{0,30}(?:запас|остат|stock)|(?:дефицит|избыток)\s+(?:товар|на\s+склад)|(?:запас|stock).{0,20}(?:слишком|избыточ|недостат|excessive)/i.test(allResultText))reject('INVENTORY_ASSERTION');
  if(schema?.state!=='KNOWN_PRESENT'&&/(?<![\p{L}\p{N}])(?:отсутствует|отсутствуют|нет|missing|absent|no)(?![\p{L}\p{N}]).{0,40}(?:schema|разметк)|(?:schema|разметк).{0,30}(?<![\p{L}\p{N}])(?:отсутствует|отсутствуют|missing|absent)(?![\p{L}\p{N}])/iu.test(allResultText))reject('SCHEMA_ASSERTION');
  for(const r of result.recommendations) {
    const refs=r.evidenceIds.map(id=>{const e=ids.get(id);if(!e)reject();return e!;});
    if(!refs.some(e=>e.state==='KNOWN_PRESENT'||e.state==='KNOWN_ABSENT'))reject('UNKNOWN_ONLY');
    if(refs.every(e=>e.id.startsWith('QUALITY_')))reject('QUALITY_ONLY');
    const action=[r.title,r.problem,r.recommendation,r.rationale,r.proposedChange?.example??''].join(' ');
    if(salesPartial&&/(?:нулев.{0,15}продаж|нет\s+(?:онлайн[- ]?)?продаж|продаж.{0,20}(?:равны\s+нулю|отсутствуют)|zero\s+sales|no\s+sales)/i.test(action)){
      const coveredFinding=input.findings.some(f=>{
        const display=(date:string)=>date.slice(8,10)+'.'+date.slice(5,7)+'.'+date.slice(0,4);
        const namedPeriod=action.includes(f.period.from)&&action.includes(f.period.to)||action.includes(display(f.period.from))&&action.includes(display(f.period.to));
        const explicitlyCovered=/подтвержд.{0,20}период|полностью\s+покрыт.{0,20}период|covered\s+period/i.test(action);
        return f.kind==='OPPORTUNITY'&&['RULE_11','RULE_16'].includes(f.rule)&&r.evidenceIds.includes(f.id)&&(namedPeriod||explicitlyCovered);
      });
      if(!coveredFinding)reject('SALES_PERIOD');
    }
    if(!hasStock&&stockWords.test(action))reject('INVENTORY_PROPOSAL');
    if(schema?.state!=='KNOWN_PRESENT'&&schemaWords.test(action)&&!verify.test(r.recommendation))reject('SCHEMA_VERIFICATION');
    if(partialGraph&&(r.proposedChange?.area==='INTERNAL_LINKING'||links.test(action))&&
      (r.confidence!=='LOW'||!r.uncertainty||!incomplete.test(r.uncertainty)))reject('GRAPH');
    // B2B, M3 and specification names containing digits are not quantitative promises.
    if(/\d[\d\s.,]*\s*(?:%|процент|руб|₽|доллар|\$|евро|€|раз(?:а|ов)?(?![\p{L}]))|(?<![\p{L}\p{N}])(?:рост|увелич|сниз|сократ|прирост|эконом|выруч|конверс|трафик|продаж|growth|increase|reduce).{0,35}(?<![\p{L}\p{N}])\d+(?![\p{L}\p{N}])/iu.test(r.expectedEffect))reject('NUMERIC_EFFECT');
    if(/(?:низк.{0,10}ctr|ctr.{0,10}(?:низк|low)|low\s+ctr)/i.test(action)&&
      !input.findings.some(f=>f.rule==='RULE_01'&&r.evidenceIds.includes(f.id)))reject('CTR');
    const positiveProposal=r.recommendation.replace(/не\s+(?:(?:нужно|следует)\s+)?(?:добавлять|добавляйте|включать|указывайте|дублировать)[^.!?;\n]*/gi,'');
    if((/добав|включ|укаж|встав|add|include/i.test(positiveProposal)||r.proposedChange?.area==='SPECIFICATION')) {
      for(const token of presentTokens)if(token.state==='KNOWN_PRESENT'&&technicalContains(positiveProposal,token.observed)===true)reject('TECHNICAL_ADDITION');
    }
    // Technical spelling in a proposed literal addition is checked after exact normalization.
    if(r.proposedChange?.area==='SPECIFICATION'&&normalizeTechnicalText(positiveProposal).includes('5w-40')&&
      presentTokens.some(t=>t.state==='KNOWN_PRESENT'&&t.normalized==='5w-40'))reject('TECHNICAL_ADDITION');
  }
  // Deterministic limitations cannot be removed by a model.
  result.limitations=[...new Set([...input.evidenceQuality.limitations,...result.limitations])];
  return result;
}
