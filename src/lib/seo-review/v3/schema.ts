import {z} from 'zod';
import {recommendationSchema as old,envelopeSchema} from '../schema';
export const referenceSchema=z.object({evidenceId:z.string().min(1).max(150),fieldPath:z.string().min(1).max(100),purpose:z.enum(['OBSERVE','INSPECT','ABSENT','MISSING_TERM']).default('OBSERVE'),term:z.string().min(1).max(150).optional()}).strict();
export const recommendationSchema=old.omit({claims:true,evidenceIds:true}).extend({evidenceReferences:z.array(referenceSchema).min(1).max(25),statements:z.array(z.object({kind:z.enum(['OBSERVED_FACT','SEO_INFERENCE','GROWTH_HYPOTHESIS']),text:z.string().trim().min(1).max(1500),references:z.array(referenceSchema).max(10)}).strict()).min(1).max(8)}).strict();
export {envelopeSchema};
export const outputJsonSchema=z.toJSONSchema(envelopeSchema.extend({recommendations:z.array(recommendationSchema).max(5)}));
