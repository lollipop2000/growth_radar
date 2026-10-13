import 'server-only';
import {DeepSeekProvider} from '../ai/deepseek';
import type {AiProviderResponse} from '../ai/provider';
import {AiError} from '../ai/provider';
import {publicData} from '../public-data';
import {evidenceItems,type PageSeoReviewInput,type ReviewResponse} from './contract';
import {MAX_INPUT_BYTES} from './evidence';
import {reviewMessages,PROMPT_VERSION} from './prompt';
import {validateSeoReview} from './validator';
import {knownProfileUrls,referencedUrls} from './quality';
import {envelopeSchema,recommendationSchema} from './schema';
import {resolveSavedUrls,savedLandingCandidates} from './url-resolution';
export interface SeoReviewProvider{review(input:PageSeoReviewInput):Promise<AiProviderResponse>}
export class DeepSeekSeoReviewProvider implements SeoReviewProvider{
 constructor(private transport=new DeepSeekProvider()){}
 review(input:PageSeoReviewInput){return this.transport.complete(reviewMessages(input));}
}
/** Exactly zero or one call. No hidden retries, persistence, or deterministic calculation. */
export async function reviewPage(input:PageSeoReviewInput,provider:SeoReviewProvider,resolveUrls=resolveSavedUrls,resolveLanding=savedLandingCandidates):Promise<ReviewResponse>{
 const inputBytes=Buffer.byteLength(JSON.stringify(input));if(inputBytes>MAX_INPUT_BYTES)throw new AiError('INPUT_TOO_LARGE');
 const useful=evidenceItems(input).some(e=>e.state==='KNOWN_PRESENT'&&(/^(content\.|technical\.|search\.query)/.test(e.kind)));
 const started=performance.now();let output:AiProviderResponse|undefined;
 if(useful)output=await provider.review(input);
 const providerMs=output?performance.now()-started:0,validationStart=performance.now();
 const empty={summary:{overallAssessment:'Недостаточно evidence.',strengths:[],keyOpportunities:[]},recommendations:[],limitations:[]};
 const raw=output?.text??JSON.stringify(empty);
 let urls:string[]=[];try{if(Buffer.byteLength(raw)<=60000){const envelope=envelopeSchema.safeParse(JSON.parse(raw));if(envelope.success)urls=envelope.data.recommendations.flatMap(x=>{const r=recommendationSchema.safeParse(x);return r.success?referencedUrls(r.data):[];});}}catch{}
 const profileUrls=knownProfileUrls(input),extra=urls.filter(u=>!profileUrls.has(u));
 const knownUrls=extra.length?await resolveUrls(input,extra):new Set<string>();
 const validated=validateSeoReview(raw,input,{knownUrls,allowGrowth:true,repairQueries:true});
 // Lookup only accepted hypotheses and only their grounded query strings.
 const landing=validated.result.recommendations.filter(r=>r.area==='LANDING_PAGE_HYPOTHESIS');
 if(landing.length){const candidates=await resolveLanding(input,landing.flatMap(r=>r.targetQueries??[]));for(const r of landing){r.evidence.push(...candidates);r.reasonCodes.push('SAVED_LANDING_LOOKUP_PARTIAL','CANNIBALIZATION_REVIEW_REQUIRED');r.status='NEEDS_REVIEW';}validated.result.limitations.push('Предварительная сверка известных Pages/aliases выполнена. Даже пустой результат не доказывает свободную нишу; нужна site-level проверка каннибализации.');}
 const response=publicData({...validated,metadata:{promptVersion:PROMPT_VERSION,model:output?.model??null,apiCalls:output?1:0,inputBytes,providerMs,validatorMs:performance.now()-validationStart}}) as ReviewResponse;
 // Numeric transport counters are not secrets; free text still passes publicData.
 if(output?.usage&&Number.isSafeInteger(output.usage.inputTokens)&&Number.isSafeInteger(output.usage.outputTokens)&&output.usage.inputTokens>=0&&output.usage.outputTokens>=0)response.metadata.usage={inputTokens:output.usage.inputTokens,outputTokens:output.usage.outputTokens};
 return response;
}
