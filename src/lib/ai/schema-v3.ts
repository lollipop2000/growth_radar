import {z} from 'zod';
const text=z.string().trim().min(1).max(2000);
export const proposalSchema=z.strictObject({contextId:z.string().regex(/^CTX_\d{2}$/),actionType:z.enum(['CHANGE','CHECK']),
 area:z.enum(['TITLE','DESCRIPTION','H1','FIRST_SCREEN','CONTENT','APPLICATION','SPECIFICATION','PACKAGING','INTERNAL_LINKING','CTA','OTHER']),
 proposedAction:text,rationale:text,example:text.optional(),questionsToVerify:z.array(text.max(500)).max(6).optional()});
export const actionsSchema=z.strictObject({proposals:z.array(proposalSchema).max(5)});
export const actionsEnvelopeSchema=actionsSchema.extend({proposals:z.array(z.unknown()).max(5)});
export const outputJsonSchema=z.toJSONSchema(actionsSchema);
