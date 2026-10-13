import type {AiPageAnalysisInput} from './contract';
export class AiError extends Error {
  constructor(public readonly code:string,public readonly diagnostics?:{generatedCount?:number;apiCalls?:number;timings?:{providerMs:number;validatorMs:number}}){super(code);this.name='AiError';}
}
export interface AiProviderResponse {text:string;model:string;usage?:{inputTokens:number;outputTokens:number}}
export interface AiProvider {analyzePage(input:AiPageAnalysisInput):Promise<AiProviderResponse>}
