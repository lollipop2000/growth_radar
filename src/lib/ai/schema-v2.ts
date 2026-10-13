import {z} from 'zod';
const text=z.string().trim().min(1).max(2000);
const evidenceId=z.string().regex(/^(SEARCH|CONTENT|TECH|COMMERCE|FINDING|QUALITY)_\d{2}$/);
const ids=z.array(evidenceId).min(1).max(20);
export const recommendationSchema=z.strictObject({
 title:text.max(200),findingIds:z.array(z.string().regex(/^FINDING_\d{2}$/)).min(1).max(10),
 observedFacts:z.array(z.strictObject({statement:text,evidenceIds:ids})).min(1).max(8),
 hypothesis:text.optional(),rationale:text,
 proposedAction:z.strictObject({type:z.enum(['CHANGE','CHECK']),area:z.enum(['TITLE','DESCRIPTION','H1','FIRST_SCREEN','CONTENT','APPLICATION','SPECIFICATION','PACKAGING','INTERNAL_LINKING','CTA','OTHER']),description:text,example:text.optional()}),
 expectedEffect:text.max(500),confidence:z.enum(['HIGH','MEDIUM','LOW']),evidenceIds:ids,uncertainty:text.optional()
});
export const outputSchema=z.strictObject({pageId:z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/),executiveSummary:text,
 recommendations:z.array(recommendationSchema).max(5),limitations:z.array(text.max(800)).max(15)});
export const envelopeSchema=outputSchema.extend({recommendations:z.array(z.unknown()).max(5)});
export const outputJsonSchema=z.toJSONSchema(outputSchema);
