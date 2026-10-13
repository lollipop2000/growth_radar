import {z} from 'zod';
import type {DiagnosticArtifact} from './engine';
import {scrub} from './redact';
const status=z.enum(['PASS','QUESTIONABLE','FAIL','NOT_REVIEWED']);
const criteria=z.object({status,explanation:z.string().min(1).max(1000)}).strict();
export const expertReviewSchema=z.object({reviewer:z.enum(['CODEX_EXPERT_ASSESSMENT','USER_ASSESSMENT']),status,disposition:z.enum(['VALIDATOR_TRUE_REJECT','POSSIBLE_FALSE_REJECT','VALIDATOR_DEFECT_CONFIRMED','INSUFFICIENT_EVIDENCE_TO_DECIDE']),rationale:z.string().min(1).max(2000),criteria:z.object({pagePurpose:criteria,factualCorrectness:criteria,searchIntent:criteria,specificity:criteria,seoRationale:criteria,b2bUsefulness:criteria,handoff:criteria,uncertainty:criteria}).strict(),humanReview:z.literal('PENDING_HUMAN_REVIEW')}).strict();
export type ExpertReview=z.infer<typeof expertReviewSchema>;
export function applyExpertReview(artifact:DiagnosticArtifact,index:number,raw:unknown){
 const review=expertReviewSchema.parse(raw),clone=structuredClone(artifact),proposal=clone.proposals.find(p=>p.itemIndex===index);if(!proposal)throw Error('INVALID_ITEM_INDEX');
 // Review is a separate assessment, even when it disagrees with REJECTED. Decisions never change.
 proposal.expertReview=scrub(review);clone.summary.reviewRequired=clone.proposals.filter(p=>!p.expertReview||p.expertReview.status==='NOT_REVIEWED').length;return clone;
}
