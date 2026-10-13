import 'server-only';
import {createHash,randomUUID} from 'node:crypto';
import type {PageSeoReviewInput,Decision,SeoRecommendation} from '../seo-review/contract';
import {validateSeoReview} from '../seo-review/validator';
import {envelopeSchema,recommendationSchema} from '../seo-review/schema';
import {PROMPT_VERSION} from '../seo-review/prompt';
import {validationDetails} from './details';
import {validateV3,diagnoseV3} from '../seo-review/v3/validator';
import {recommendationSchema as schemaV3} from '../seo-review/v3/schema';
import {PROMPT_VERSION as VERSION_V3} from '../seo-review/v3/prompt';
import type {Recommendation} from '../seo-review/v3/contract';
import {queryRelevance as v3Intent} from '../seo-review/v3/intent';
import {profileRelevance} from './relevance';
import {scrub} from './redact';
import {TTL_MS,DiagnosticError} from './storage';
import type {ExpertReview} from './review';
export type DiagnosticArtifact={diagnosticVersion:'LOCAL_AI_DIAGNOSTIC_V1';runId:string;createdAt:string;expiresAt:string;mode:'SYNTHETIC_REPLAY'|'AUTHORIZED_LIVE';pageContext:{pageType:string;pageId:string;snapshotId:string|null;evidenceHash:string;promptVersion:string;model:string};provider:{responseReceived:boolean;inputTokens?:number;outputTokens?:number;latencyMs?:number};proposals:{itemIndex:number;original:unknown;projectionLimited:boolean;status:Decision['status'];reasonCodes:string[];details:ReturnType<typeof validationDetails>;evidenceIds:string[];expertReview?:ExpertReview}[];summary:{generated:number;accepted:number;rejected:number;reviewRequired:number};queryRelevance:ReturnType<typeof profileRelevance>;envelopeFailure?:{code:string;fragment:string};timings:{parsingMs:number;validationMs:number;diagnosticMs:number};};
function originalFields(value:unknown,maxArray=20){
 const allowed=['id','area','priority','recommendationType','finding','rationale','proposedAction','placement','operation','proposedContent','targetQueries','targetUrl','evidenceIds','uncertainty','verificationSteps','claims','evidenceReferences','statements'];let limited=false;
 function bound(x:unknown,depth=0):unknown{if(depth>12){limited=true;return '[DEPTH_LIMIT]';}if(typeof x==='string'&&x.length>2000){limited=true;return x.slice(0,2000)+'[TRUNCATED]';}if(Array.isArray(x)){if(x.length>maxArray)limited=true;return x.slice(0,maxArray).map(v=>bound(v,depth+1));}if(x&&typeof x==='object'){const entries=Object.entries(x);if(entries.length>30)limited=true;return Object.fromEntries(entries.slice(0,30).map(([k,v])=>[k,bound(v,depth+1)]));}return x;}
 if(!value||typeof value!=='object'||Array.isArray(value))return {original:bound(value),limited:true};
 const source=value as Record<string,unknown>;const original=Object.fromEntries(allowed.filter(k=>Object.hasOwn(source,k)).map(k=>{const v=source[k];if(k==='claims'&&Buffer.byteLength(JSON.stringify(v))>5000){limited=true;return [k,{omitted:'OVERSIZED_CLAIMS',sha256:createHash('sha256').update(JSON.stringify(v)).digest('hex')}];}return [k,bound(v)];}));
 return {original,limited};
}
/** Observer only: original output is validated unchanged. No model repair, retries or acceptance override. */
export function diagnosticReplay(raw:string,input:PageSeoReviewInput,options:{contractVersion?:'V2'|'V3';mode?:DiagnosticArtifact['mode'];model?:string;runId?:string;createdAt?:Date;provider?:DiagnosticArtifact['provider'];decisions?:Decision[]}={}):DiagnosticArtifact{
 if(Buffer.byteLength(raw)>60000)throw new DiagnosticError('OUTPUT_TOO_LARGE');
 const started=performance.now(),created=options.createdAt??new Date();
 const relevance=profileRelevance(input);if(options.contractVersion==='V3')for(const q of relevance){q.classification=v3Intent(q.query,input.page.pageType).classification as typeof q.classification;q.rationale='V3-local page-purpose assessment; product relevance does not prove commercial conditions.';q.confidence=q.classification==='UNCERTAIN'?'LOW':'MEDIUM';q.source='V3_LOCAL_REVIEW_INTENT_NOT_SEARCH_CLASSIFIER';}
 const artifact:DiagnosticArtifact={diagnosticVersion:'LOCAL_AI_DIAGNOSTIC_V1',runId:options.runId??randomUUID(),createdAt:created.toISOString(),expiresAt:new Date(created.getTime()+TTL_MS).toISOString(),mode:options.mode??'SYNTHETIC_REPLAY',pageContext:{pageType:input.page.pageType,pageId:input.page.pageId,snapshotId:input.page.snapshotId,evidenceHash:createHash('sha256').update(JSON.stringify(input)).digest('hex'),promptVersion:options.contractVersion==='V3'?VERSION_V3:PROMPT_VERSION,model:options.model??'SYNTHETIC_NO_MODEL'},provider:options.provider??{responseReceived:false},proposals:[],summary:{generated:0,accepted:0,rejected:0,reviewRequired:0},queryRelevance:relevance,timings:{parsingMs:0,validationMs:0,diagnosticMs:0}};
 let parsed:unknown;try{parsed=JSON.parse(raw);}catch{artifact.envelopeFailure={code:'INVALID_JSON',fragment:/"(?:headers|messages|prompt|env|rawHttpResponse)"\s*:/i.test(raw)?'[OMITTED_FORBIDDEN_CONTAINER]':scrub(raw).slice(0,2048)};artifact.timings.parsingMs=performance.now()-started;return scrub(artifact);}
 const env=envelopeSchema.safeParse(parsed);artifact.timings.parsingMs=performance.now()-started;
 if(!env.success){artifact.envelopeFailure={code:'INVALID_SCHEMA',fragment:JSON.stringify({issues:env.error.issues.map(e=>({path:e.path,code:e.code})),projection:originalFields(scrub(parsed)).original}).slice(0,2048)};return scrub(artifact);}
 const validationStart=performance.now(),decisions=options.decisions??(options.contractVersion==='V3'?validateV3(raw,input):validateSeoReview(raw,input,{allowGrowth:true,repairQueries:true})).validation.decisions;
 artifact.timings.validationMs=performance.now()-validationStart;
 for(const [itemIndex,item]of env.data.recommendations.entries()){
  const decision=decisions.find(d=>d.index===itemIndex);if(!decision)throw new DiagnosticError('MISSING_VALIDATION_DECISION');
  const projection=originalFields(scrub(item),options.contractVersion==='V3'?25:20),valid=(options.contractVersion==='V3'?schemaV3:recommendationSchema).safeParse(item);
  artifact.proposals.push({itemIndex,original:projection.original,projectionLimited:projection.limited,status:decision.status,reasonCodes:decision.reasonCodes,details:valid.success?(options.contractVersion==='V3'?diagnoseV3(valid.data as Recommendation,input).details.map(d=>({code:d.code,itemIndex,fieldPath:d.fieldPath,evidenceId:d.evidenceId,jsonPath:d.referencePath,matchedRule:d.rule,numberToken:d.token,numberCategory:d.category})):validationDetails(valid.data as SeoRecommendation,input,decision)):[{code:'ITEM_SCHEMA',itemIndex,explanation:'Invalid item shape',fieldPath:valid.error.issues.map(e=>e.path.join('.')).join(',').slice(0,200)}],evidenceIds:valid.success?('evidenceReferences' in valid.data?[...new Set((valid.data as Recommendation).evidenceReferences.map(r=>r.evidenceId))]:(valid.data as SeoRecommendation).evidenceIds):[]});
 }
 artifact.summary={generated:artifact.proposals.length,accepted:artifact.proposals.filter(p=>p.status!=='REJECTED').length,rejected:artifact.proposals.filter(p=>p.status==='REJECTED').length,reviewRequired:artifact.proposals.length};
 artifact.timings.diagnosticMs=performance.now()-started-artifact.timings.parsingMs-artifact.timings.validationMs;
 return scrub(artifact);
}
