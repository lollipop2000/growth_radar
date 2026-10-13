import {z} from 'zod';
import {AREAS,PLACEMENTS} from './contract';
const text=z.string().trim().min(1).max(2000),short=z.string().trim().min(1).max(150);
export const recommendationSchema=z.object({id:short,area:z.enum(AREAS),priority:z.enum(['HIGH','MEDIUM','LOW']),recommendationType:z.enum(['CHANGE','CHECK','CREATE_HYPOTHESIS']),finding:text,rationale:text,proposedAction:text,
 placement:z.enum(PLACEMENTS),operation:z.enum(['REWRITE','ADD','INSPECT','COMPARE','PROPOSE']),
 proposedContent:z.object({currentText:text.optional(),suggestedText:text.optional(),placement:z.enum(PLACEMENTS).optional()}).strict().optional(),
 targetQueries:z.array(z.string().min(1).max(500)).max(10).optional(),targetUrl:z.string().url().max(2000).optional(),evidenceIds:z.array(short).min(1).max(15),uncertainty:text.optional(),verificationSteps:z.array(text).max(8).optional(),
 claims:z.array(z.object({evidenceId:short,relation:z.enum(['VALUE','ABSENT','MISSING_TERM']),value:z.json()}).strict()).max(15)
}).strict();
// Isolate invalid items: envelope does not validate individual recommendations.
export const envelopeSchema=z.object({summary:z.object({overallAssessment:text,strengths:z.array(text).max(5),keyOpportunities:z.array(text).max(5)}).strict(),recommendations:z.array(z.unknown()).max(5),limitations:z.array(text).max(10)}).strict();
export const outputJsonSchema=z.toJSONSchema(envelopeSchema.extend({recommendations:z.array(recommendationSchema).max(5)}));
