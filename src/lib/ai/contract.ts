export type EvidenceState = 'KNOWN_PRESENT' | 'KNOWN_ABSENT' | 'NOT_OBSERVED' | 'UNKNOWN';
export type Json = null | boolean | number | string | Json[] | {[key:string]:Json};
export type EvidenceCoverage='FULL'|'PARTIAL'|'UNKNOWN';
export interface Evidence<T = Json> {id:string; state:EvidenceState; value:T; truncated?:boolean;
  observationState?:EvidenceState;coverage?:EvidenceCoverage;source?:string;observedAt?:string|null;supportsAbsenceClaim?:boolean}
export interface CompetitiveEvidence {
  status:'NOT_AVAILABLE'|'PARTIAL'|'AVAILABLE';
  benchmarks:{competitor:string;sourceUrl:string;comparableElements:{element:string;ourState:EvidenceState;competitorState:EvidenceState}[]}[];
}
export interface PageEvidence {
  pageId:string;currentUrl:string;canonicalUrl:string|null;observedAliases:string[];pageType:string;
  snapshotId:string|null;snapshotSource:string|null;snapshotObservedAt:string|null;
}
export interface DeterministicFinding extends Evidence {
  findingId:string;kind:'SEO_ACTION'|'OPPORTUNITY';rule:string;title:string;priority:string;
  score:number|null;confidence:string;period:{from:string;to:string};isCurrent:boolean;
  area?:string;
}
export interface AiPageAnalysisInput {
  version:'AI_EVIDENCE_V1';businessContext:string;page:PageEvidence;
  search:{period:{from:string;to:string};coverage:Evidence;summary:Evidence;queries:Evidence[];truncated:boolean};
  content:Record<string,Evidence>;technical:Record<string,Evidence>;
  commerce:{period:{from:string;to:string};summary:Evidence;coverage:Evidence};
  stock:{summary:Evidence};findings:DeterministicFinding[];
  evidenceQuality:{graph:Evidence;limitations:string[]};competitiveEvidence?:CompetitiveEvidence;
  actionContexts?:AiActionContext[];
}
export type RecommendationArea='TITLE'|'DESCRIPTION'|'H1'|'FIRST_SCREEN'|'CONTENT'|'APPLICATION'|'SPECIFICATION'|'PACKAGING'|'INTERNAL_LINKING'|'CTA'|'OTHER';
export interface AiPageAnalysisResult {
  executiveSummary:string;
  recommendations:{title:string;problem:string;recommendation:string;rationale:string;expectedEffect:string;
    confidence:'HIGH'|'MEDIUM'|'LOW';evidenceIds:string[];uncertainty?:string;
    proposedChange?:{area:RecommendationArea;example?:string}}[];
  limitations:string[];
}
export interface AiAnalysisResponseV2 {
  result:AiPageAnalysisResultV2;evidence:Evidence[];validation:AiValidationSummary;
  metadata:{provider:'DEEPSEEK';model:string;promptVersion:'AI_ANALYST_V2';latencyMs:number;
    timings:{providerMs:number;validatorMs:number;evidenceBuilderMs?:number};apiCalls:number};
}
export interface AiActionContext {
 contextId:string;findingId:string;findingEvidenceId:string;findingType:string;
 allowedActionTypes:('CHANGE'|'CHECK')[];allowedAreas:RecommendationArea[];evidenceIds:string[];restrictions:string[];
 subject:{pageType:string;title:string|null;h1:string|null;description:string|null};
}
export interface AiActionProposal {
 contextId:string;actionType:'CHANGE'|'CHECK';area:RecommendationArea;proposedAction:string;rationale:string;
 example?:string;questionsToVerify?:string[];
}
export interface ValidatedAiAction {
 contextId:string;finding:{id:string;title:string;ruleId:string;priority:string;score:number|null;confidence:string;period:{from:string;to:string}};
 observedFacts:{label:string;value:string;evidenceId:string}[];
 action:{type:'CHANGE'|'CHECK';area:RecommendationArea;description:string;rationale:string;example?:string;questionsToVerify?:string[]};
 limitations:string[];evidenceIds:string[];
}
export interface AiAnalysisResponse {
 result:{pageId:string;executiveSummary:string;actions:ValidatedAiAction[]};evidence:Evidence[];validation:AiValidationSummary;
 metadata:{provider:'DEEPSEEK';model:string;promptVersion:'AI_ANALYST_V3';latencyMs:number;apiCalls:number;
  timings:{providerMs:number;validatorMs:number;evidenceBuilderMs?:number;contextBuilderMs:number};
  usage?:{inputTokens:number;outputTokens:number};emptyReason?:'NO_FINDINGS'|'NO_ALLOWED_CONTEXT'|'MODEL_EMPTY'};
}
export interface AiRecommendationV2 {
  title:string;findingIds:string[];observedFacts:{statement:string;evidenceIds:string[]}[];
  hypothesis?:string;rationale:string;
  proposedAction:{type:'CHANGE'|'CHECK';area:RecommendationArea;description:string;example?:string};
  expectedEffect:string;confidence:'HIGH'|'MEDIUM'|'LOW';evidenceIds:string[];uncertainty?:string;
}
export interface AiPageAnalysisResultV2 {pageId:string;executiveSummary:string;recommendations:AiRecommendationV2[];limitations:string[]}
export interface AiValidationSummary {
  generatedCount:number;acceptedCount:number;rejectedCount:number;rejectedByReason:Record<string,number>;
  decisions:{decision:'ACCEPT'|'REJECT';recommendationIndex:number;reasonCode?:string}[];
  outcome:'SUCCESS'|'PARTIAL_SUCCESS'|'ALL_REJECTED'|'VALID_EMPTY';
}
export type AiActionState={ok:true;analysis:AiAnalysisResponse}|{ok:false;code:string;message:string};
export function evidenceItems(input:AiPageAnalysisInput):Evidence[] {
  return [...input.findings,input.search.coverage,input.search.summary,...input.search.queries,
    ...Object.values(input.content),...Object.values(input.technical),input.commerce.summary,
    input.commerce.coverage,input.stock.summary,input.evidenceQuality.graph];
}
