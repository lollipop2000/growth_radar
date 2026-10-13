import {normalizeQuery} from '../../search/model';
import {technicalContains} from '../../seo-actions/technical-token';
import type {Input,Recommendation,ResolvedReference,Detail} from './contract';
import {textFields} from './semantics';
const N='\\d+(?:[.,]\\d+)?';
const numeric=/(?<![\p{L}\p{N}])\d+(?:[.,]\d+)?(?![\p{L}\p{N}])/gu;
const parse=(s:string)=>Number(s.replace(',','.'));
export function matchesNumber(display:string,source:number,kind:string){if(!Number.isFinite(source))return false;const n=parse(display);if(n===source)return true;if(!['ctr','avgPosition'].includes(kind))return false;const decimals=(display.split(/[.,]/)[1]??'').length;if(decimals>6)return false;return Number(source.toFixed(decimals))===n;}
type Span={start:number;end:number};
export function numericDetails(r:Recommendation,input:Input,resolved:ResolvedReference[]):Detail[]{
 const out:Detail[]=[];const queryRefs=resolved.filter(x=>x.kind==='search.query');
 const queries=input.search.queries.map(e=>({id:e.id,query:String((e.value as Record<string,unknown>).query)}));
 const technical=resolved.filter(x=>x.coverage==='FULL'&&x.state==='KNOWN_PRESENT'&&(x.kind==='product'||/^content\.(title|description|h1|specifications|packaging)$/.test(x.kind))).map(x=>String(x.value)).join(' ');
 const dates=resolved.filter(x=>x.reference.fieldPath==='observedAt'||x.reference.fieldPath.startsWith('period.')||x.kind==='page.metadata'&&x.reference.fieldPath==='value.snapshotAt').map(x=>String(x.value).slice(0,10));
 for(const [fieldPath,text]of textFields(r)){
  const handled:Span[]=[];const mark=(start:number,len:number)=>handled.push({start,end:start+len});
  for(const m of text.matchAll(/https?:\/\/[^\s<>"')]+/g))mark(m.index,m[0].length); // URL safety is checked separately, not as a numeric metric.
  const add=(code:string,token:string,rule:string)=>out.push({code,fieldPath,token,rule});
  const anchors=[...text.matchAll(/[«"]([^»"]+)[»"]/gu)].flatMap(m=>{const q=queries.find(q=>normalizeQuery(q.query)===normalizeQuery(m[1]));return q?[{id:q.id,index:m.index,end:m.index+m[0].length}]:[];});
  // Unquoted exact query mentions must not fall back to an unrelated singleton metric.
  const lower=text.toLowerCase();for(const q of [...queries].sort((a,b)=>b.query.length-a.query.length)){
   const query=q.query.toLowerCase();if(!query.length)continue;let from=0,index:number;
   while((index=lower.indexOf(query,from))>=0){const end=index+query.length;from=end;if(!anchors.some(a=>index<a.end&&end>a.index))anchors.push({id:q.id,index,end});}
  }
  for(const m of text.matchAll(/\bE\d{3}\b/g))if(queries.some(q=>q.id===m[0]))anchors.push({id:m[0],index:m.index,end:m.index+m[0].length});
  const contextQuery=(index:number)=>{const previous=anchors.filter(a=>a.index<=index).sort((a,b)=>b.index-a.index)[0];const next=anchors.filter(a=>a.index>index).sort((a,b)=>a.index-b.index)[0];return previous&&index-previous.end<350?previous.id:next&&next.index-index<120?next.id:undefined;};
  for(const m of text.matchAll(/\b(?:\d{4}-\d{2}-\d{2}|\d{2}\.\d{2}\.\d{4})\b/g)){
   const iso=m[0].includes('.')?m[0].split('.').reverse().join('-'):m[0];mark(m.index,m[0].length);if(!dates.includes(iso))add('UNBOUND_DATE',m[0],'DATE_MUST_MATCH_EXPLICIT_METADATA_REFERENCE');
  }
  for(const m of text.matchAll(/(?:^|\n)\s*(\d+)[.)]\s+/g))mark(m.index,m[0].length);
  for(const m of text.matchAll(/(?<![\p{L}\p{N}])(?:\d+\s*w\s*[-–]?\s*\d+|(?:SAE|ISO\s*(?:VG)?|HLP|HVLP)\s*\d+|\d+(?:[.,]\d+)?\s*(?:л|кг))(?![\p{L}\p{N}])/giu)){
   mark(m.index,m[0].length);if(!technicalContains(technical,m[0]))add('UNVERIFIED_TECHNICAL_VALUE',m[0],'REQUIRES_ATTRIBUTABLE_PRODUCT_FACT');
  }
  for(const x of resolved.filter(x=>x.kind==='product'&&x.reference.fieldPath.endsWith('.sku')&&typeof x.value==='string')){
   for(const m of text.matchAll(numeric))if(m[0]===x.value)mark(m.index,m[0].length);
  }
  for(const m of text.matchAll(new RegExp('(?:позици\\p{L}*|CTR)\\s*[:=]?\\s*('+N+')\\s*[–—-]\\s*('+N+')','giu'))){
   mark(m.index,m[0].length);const metric=/CTR/iu.test(m[0])?'ctr':'avgPosition',q=contextQuery(m.index),sources=queryRefs.filter(x=>x.reference.fieldPath==='value.'+metric&&(!q||x.reference.evidenceId===q));
   if(!sources.length||sources.some(x=>typeof x.value!=='number'||x.value<parse(m[1])||x.value>parse(m[2])))add('INVALID_METRIC_RANGE',m[1]+'–'+m[2],'RANGE_EXCLUDES_BOUND_SOURCE');
  }
  const patterns:[RegExp,string,number][]=[
   [new RegExp('('+N+')\\s*показ\\p{L}*','giu'),'impressions',1],[new RegExp('('+N+')\\s*клик\\p{L}*','giu'),'clicks',1],
   [new RegExp('(?:CTR|кликабельность)\\s*(?:равен|составляет|=|:)?\\s*('+N+')\\s*%?','giu'),'ctr',1],
   [new RegExp('(?:поз\\.|позици\\p{L}*)\\s*(?:равна|составляет|=|:)?\\s*('+N+')','giu'),'avgPosition',1],
   [new RegExp('(?:показы|показов)\\s*[:=]\\s*('+N+')','giu'),'impressions',1],[new RegExp('(?:клики|кликов)\\s*[:=]\\s*('+N+')','giu'),'clicks',1]
  ];
  for(const [pattern,metric,capture]of patterns)for(const m of text.matchAll(pattern)){
   if(handled.some(s=>m.index>=s.start&&m.index<s.end))continue;mark(m.index,m[0].length);
   const q=contextQuery(m.index),sources=queryRefs.filter(x=>x.reference.fieldPath==='value.'+metric&&(!q||x.reference.evidenceId===q));
   const ids=new Set(sources.map(x=>x.reference.evidenceId));
   if(!sources.length||!q&&ids.size!==1){add('UNBOUND_NUMERIC_ASSERTION',m[capture],'EXPLICIT_QUERY_METRIC_REFERENCE_REQUIRED');continue;}
   if(sources.some(x=>typeof x.value!=='number'||!matchesNumber(m[capture],x.value,metric)))add('QUERY_METRIC_MISMATCH',m[capture],'NUMBER_CONTRADICTS_THIS_QUERY_FIELD');
  }
  for(const m of text.matchAll(numeric))if(!handled.some(s=>m.index>=s.start&&m.index<s.end)){
   // Reference IDs and observed query names may contain numbers (service3.0 / product names).
   if(anchors.some(a=>m.index>=a.index&&m.index<a.end))continue;
   add('UNBOUND_NUMERIC_ASSERTION',m[0],'NO_UNAMBIGUOUS_TYPED_NUMERIC_BINDING');
  }
 }
 return out;
}
