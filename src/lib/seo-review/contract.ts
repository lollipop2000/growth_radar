/** Independent read-only contract; never a deterministic finding or AiActionContext. */
export type Json=null|boolean|number|string|Json[]|{[key:string]:Json};
export type State='KNOWN_PRESENT'|'KNOWN_ABSENT'|'NOT_OBSERVED'|'UNKNOWN';
export type Coverage='FULL'|'PARTIAL'|'UNKNOWN';
export type Evidence={id:string;kind:string;value:Json;state:State;coverage:Coverage;source:string;observedAt:string|null;period?:{from:string;to:string};truncated:boolean;supportsAbsenceClaim:boolean};
export type PageSeoReviewInput={
 version:'PAGE_SEO_PROFILE_V1';
 page:{pageId:string;currentUrl:string;canonicalUrl:string|null;pageType:string;snapshotId:string|null;snapshotSource:string|null;snapshotAt:string|null;lastSuccessfulHtmlAt:string|null;aliases:string[]};
 search:{period:{from:string;to:string};summary:Evidence;coverage:Evidence;queries:Evidence[];totalQueries:number;truncated:boolean;trend:Evidence};
 content:Record<string,Evidence>;technical:Record<string,Evidence>;
 internalLinks:{summary:Evidence;inbound:Evidence[];outbound:Evidence[];related:Evidence[];knownPages:Evidence[]};
 commerce:Record<string,Evidence>;product:Evidence;
 existingFindings:Evidence[];evidenceQuality:{limitations:string[];inputBytes?:number};
};
export const AREAS=['TITLE','DESCRIPTION','H1','CONTENT','SEARCH_INTENT','APPLICATION','SPECIFICATION','PACKAGING','INTERNAL_LINKING','TECHNICAL_SEO','B2B_UX','LANDING_PAGE_HYPOTHESIS'] as const;
export const PLACEMENTS=['HTML_TITLE','META_DESCRIPTION','H1','BODY_CONTENT','APPLICATION_BLOCK','SPECIFICATION_BLOCK','PACKAGING_BLOCK','INTERNAL_LINK','CANONICAL','ROBOTS','STRUCTURED_DATA','HTTP_STATUS','CTA','SEARCH_INTENT_REVIEW','LANDING_HYPOTHESIS'] as const;
export type SeoRecommendation={id:string;area:typeof AREAS[number];priority:'HIGH'|'MEDIUM'|'LOW';recommendationType:'CHANGE'|'CHECK'|'CREATE_HYPOTHESIS';finding:string;rationale:string;proposedAction:string;
 placement:typeof PLACEMENTS[number];operation:'REWRITE'|'ADD'|'INSPECT'|'COMPARE'|'PROPOSE';
 proposedContent?:{currentText?:string;suggestedText?:string;placement?:typeof PLACEMENTS[number]};
 targetQueries?:string[];targetUrl?:string;evidenceIds:string[];uncertainty?:string;verificationSteps?:string[];
 /** Facts are explicitly bound to server evidence. Free interpretation always needs human review. */
 claims:{evidenceId:string;relation:'VALUE'|'ABSENT'|'MISSING_TERM';value:Json}[];
};
export type PageSeoReviewResult={summary:{overallAssessment:string;strengths:string[];keyOpportunities:string[]};recommendations:SeoRecommendation[];limitations:string[]};
export type Decision={index:number;status:'SUPPORTED'|'NEEDS_REVIEW'|'REJECTED';reasonCodes:string[]};
export type RecommendationOutcome='READY_CHANGE'|'GROWTH_HYPOTHESIS'|'DATA_CHECK';
export type ReviewedRecommendation=SeoRecommendation&{status:'SUPPORTED'|'NEEDS_REVIEW';reasonCodes:string[];evidence:Evidence[];outcome:RecommendationOutcome;quality:ReturnType<typeof import('./quality').qualityFor>};
export type ReviewResponse={result:Omit<PageSeoReviewResult,'recommendations'>&{recommendations:ReviewedRecommendation[]};validation:{generated:number;accepted:number;rejected:number;decisions:Decision[]};metadata:{promptVersion:string;model:string|null;apiCalls:number;inputBytes:number;providerMs:number;validatorMs:number;builderMs?:number;totalMs?:number;usage?:{inputTokens:number;outputTokens:number}}};
export type ReviewActionState={ok:true;review:ReviewResponse}|{ok:false;code:string;message:string};
export function evidenceItems(i:PageSeoReviewInput):Evidence[]{return [i.search.summary,i.search.coverage,...i.search.queries,i.search.trend,...Object.values(i.content),...Object.values(i.technical),i.internalLinks.summary,...i.internalLinks.inbound,...i.internalLinks.outbound,...i.internalLinks.related,...i.internalLinks.knownPages,...Object.values(i.commerce),i.product,...i.existingFindings];}
