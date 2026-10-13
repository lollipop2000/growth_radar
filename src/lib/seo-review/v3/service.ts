import 'server-only';
import {DeepSeekProvider} from '../../ai/deepseek';
import type {AiProviderResponse} from '../../ai/provider';
import {AiError} from '../../ai/provider';
import {publicData} from '../../public-data';
import {MAX_INPUT_BYTES} from '../evidence';
import {evidenceItems} from '../contract';
import {resolveSavedUrls,savedLandingCandidates} from '../url-resolution';
import {knownProfileUrls} from '../quality';
import {validateV3} from './validator';
import {textFields} from './semantics';
import {envelopeSchema,recommendationSchema} from './schema';
import {PROMPT_VERSION,reviewMessages} from './prompt';
import type {Input,Recommendation,Response} from './contract';
export interface Provider{review(input:Input):Promise<AiProviderResponse>}
export class DeepSeekSeoReviewProvider implements Provider{constructor(private transport=new DeepSeekProvider()){}review(input:Input){return this.transport.complete(reviewMessages(input));}}
export async function reviewPage(input:Input,provider:Provider,resolveUrls=resolveSavedUrls,resolveLanding=savedLandingCandidates):Promise<Response>{
 const inputBytes=Buffer.byteLength(JSON.stringify(input));if(inputBytes>MAX_INPUT_BYTES)throw new AiError('INPUT_TOO_LARGE');
 const useful=evidenceItems(input).some(e=>e.state==='KNOWN_PRESENT'&&/^(content\.|technical\.|search\.query)/.test(e.kind));
 const start=performance.now(),output=useful?await provider.review(input):undefined,providerMs=performance.now()-start,validationStart=performance.now();
 const raw=output?.text??JSON.stringify({summary:{overallAssessment:'Недостаточно данных',strengths:[],keyOpportunities:[]},recommendations:[],limitations:[]});
 let urls:string[]=[];try{if(Buffer.byteLength(raw)<=60000){const parsed=envelopeSchema.safeParse(JSON.parse(raw));if(parsed.success)urls=parsed.data.recommendations.flatMap(item=>{const r=recommendationSchema.safeParse(item);return r.success?[...(r.data.targetUrl?[r.data.targetUrl]:[]),...textFields(r.data as Recommendation).flatMap(([,t])=>t.match(/https?:\/\/[^\s<>"')]+/g)??[])]:[];});}}catch{}
 const known=knownProfileUrls(input),extra=urls.filter(u=>!known.has(u)),resolved=extra.length?await resolveUrls(input,extra):new Set<string>();
 const result=validateV3(raw,input,resolved),landing=result.result.recommendations.filter(r=>r.area==='LANDING_PAGE_HYPOTHESIS');
 if(landing.length){const candidates=await resolveLanding(input,landing.flatMap(r=>r.targetQueries??[]));for(const r of landing){r.evidence.push(...candidates);r.reasonCodes.push('SAVED_LANDING_LOOKUP_PARTIAL','CANNIBALIZATION_REVIEW_REQUIRED');}}
 const response=publicData({...result,metadata:{promptVersion:PROMPT_VERSION,model:output?.model??null,apiCalls:output?1:0,inputBytes,providerMs,validatorMs:performance.now()-validationStart}}) as Response;
 if(output?.usage&&Object.values(output.usage).every(x=>Number.isSafeInteger(x)&&x>=0))response.metadata.usage=output.usage;
 return response;
}
