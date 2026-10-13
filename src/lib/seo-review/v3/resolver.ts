import {evidenceItems,type Evidence,type Json,type PageSeoReviewInput} from '../contract';
import {technicalContains} from '../../seo-actions/technical-token';
import type {EvidenceReference,ResolvedReference} from './contract';
export class ReferenceError extends Error{constructor(readonly code:string){super(code);}}
const scalars=new Set(['title','description','h1','topText','application','specifications','packaging','cta','price','availability','documentation','characteristics']);
export function registry(input:PageSeoReviewInput):Evidence[]{return [...evidenceItems(input),{id:'E_PAGE',kind:'page.metadata',value:{pageId:input.page.pageId,snapshotAt:input.page.snapshotAt,currentUrl:input.page.currentUrl,pageType:input.page.pageType},state:'KNOWN_PRESENT',coverage:'FULL',source:'SAVED_PAGE_METADATA',observedAt:input.page.snapshotAt,truncated:false,supportsAbsenceClaim:false}];}
type Expected='string'|'number'|'boolean'|'strings'|'json';
export function fieldAllowlist(e:Evidence):Map<string,Expected>{
 const paths=new Map<string,Expected>();const add=(p:string,t:Expected)=>paths.set(p,t);
 if(e.kind==='search.query'){add('value.query','string');for(const k of ['impressions','clicks','ctr','avgPosition'])add('value.'+k,'number');}
 else if(e.kind==='page.metadata'){for(const k of ['snapshotAt','currentUrl','pageType'])add('value.'+k,'string');}
 else if(e.kind.startsWith('content.')){
  const key=e.kind.slice(8);if(scalars.has(key))add('value','string');
  if(key==='h2')add('value','strings');
  if(key==='excerpts')for(let n=0;n<3;n++)add(`value[${n}].text`,'string');
 }else if(e.kind.startsWith('technical.')){const key=e.kind.slice(10);if(['canonical','robots','finalUrl'].includes(key))add('value','string');if(key==='httpStatus')add('value','number');if(key==='indexable')add('value','boolean');if(key==='schema')add('value','json');}
 else if(e.kind==='links.summary')for(const k of ['observedPages','totalPages','inbound','outbound'])add('value.'+k,'number');
 else if(/^links\.(inbound|outbound|related|knownPage)$/.test(e.kind)){add('value.url','string');add('value.pageType','string');}
 else if(e.kind==='product'){
  add('value.category','string');for(let n=0;n<15;n++)for(const k of ['name','code'])add(`value.groups[${n}].${k}`,'string');
  for(let n=0;n<20;n++)for(const k of ['sku','name','productGroup'])add(`value.skus[${n}].${k}`,'string');
 }else if(e.kind.startsWith('finding.'))for(const k of ['rule','title','area','priority'])add('value.'+k,'string');
 if(e.observedAt!==null)add('observedAt','string');
 if(e.period){add('period.from','string');add('period.to','string');}
 return paths;
}
export function validDate(value:string){const date=value.slice(0,10);return /^\d{4}-\d{2}-\d{2}$/.test(date)&&Number.isFinite(Date.parse(value))&&new Date(date).toISOString().slice(0,10)===date;}
export function resolveReference(ref:EvidenceReference,input:PageSeoReviewInput):ResolvedReference{
 const matches=registry(input).filter(e=>e.id===ref.evidenceId);if(matches.length!==1)throw new ReferenceError(matches.length?'AMBIGUOUS_EVIDENCE_ID':'INVALID_EVIDENCE_ID');const e=matches[0];
 if(/__proto__|prototype|constructor|\.\.|[\/\\]/.test(ref.fieldPath))throw new ReferenceError('UNSAFE_REFERENCE_PATH');
 const expected=fieldAllowlist(e).get(ref.fieldPath);if(!expected)throw new ReferenceError('REFERENCE_PATH_NOT_ALLOWED');
 if(e.kind==='search.query'){
  const v=e.value as Record<string,Json>;if(!v||Array.isArray(v)||typeof v!=='object'||v.pageId!==input.page.pageId)throw new ReferenceError('QUERY_PAGE_MISMATCH');
  if(!e.period||e.period.from!==input.search.period.from||e.period.to!==input.search.period.to)throw new ReferenceError('QUERY_PERIOD_MISMATCH');
 }
 if(e.value&&typeof e.value==='object'&&!Array.isArray(e.value)&&Object.hasOwn(e.value,'pageId')&&e.value.pageId!==input.page.pageId)throw new ReferenceError('REFERENCE_PAGE_MISMATCH');
 let value:unknown=e;for(const key of ref.fieldPath.replace(/\[(\d+)\]/g,'.$1').split('.')){
  if(!value||typeof value!=='object'||!Object.hasOwn(value,key))throw new ReferenceError('REFERENCE_FIELD_MISSING');value=(value as Record<string,unknown>)[key];
 }
 const nullable=value===null&&ref.purpose==='INSPECT';
 const correct=expected==='json'?Array.isArray(value)&&value.every(x=>typeof x==='string'):expected==='strings'?Array.isArray(value)&&value.every(x=>typeof x==='string'):expected==='number'?typeof value==='number'&&Number.isFinite(value):typeof value===expected;
 if(!nullable&&!correct)throw new ReferenceError('REFERENCE_TYPE_MISMATCH');
 if((ref.fieldPath==='observedAt'||ref.fieldPath.startsWith('period.')||ref.fieldPath==='value.snapshotAt')&&typeof value==='string'&&!validDate(value))throw new ReferenceError('INVALID_REFERENCE_DATE');
 const metadata=ref.fieldPath==='observedAt'||ref.fieldPath.startsWith('period.');
 if(ref.purpose==='OBSERVE'&&e.state!=='KNOWN_PRESENT'&&!metadata)throw new ReferenceError('UNOBSERVED_FACT');
 if(ref.purpose==='ABSENT'&&(ref.fieldPath!=='value'||!e.supportsAbsenceClaim||e.state!=='KNOWN_ABSENT'||e.coverage!=='FULL'||e.truncated))throw new ReferenceError('UNSUPPORTED_ABSENCE');
 if(ref.purpose==='MISSING_TERM'){
  if(!['content.title','content.description','content.h1'].includes(e.kind)||ref.fieldPath!=='value'||!ref.term||typeof value!=='string'||e.state!=='KNOWN_PRESENT'||e.coverage!=='FULL'||e.truncated)throw new ReferenceError('UNSUPPORTED_MISSING_TERM');
  if(technicalContains(value,ref.term)??value.toLowerCase().includes(ref.term.toLowerCase()))throw new ReferenceError('EXISTING_CONTENT');
 }
 if(ref.purpose==='ABSENT'&&value!==''&&!(Array.isArray(value)&&value.length===0))throw new ReferenceError('UNSUPPORTED_ABSENCE');
 return {reference:ref,value:value as Json,kind:e.kind,state:e.state,coverage:e.coverage,observedAt:e.observedAt,period:e.period};
}
