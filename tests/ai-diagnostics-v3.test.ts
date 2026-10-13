import {test} from 'node:test';
import assert from 'node:assert/strict';
import {catalogV3Fixture} from '../src/lib/ai-diagnostics/v3-fixtures';
import {diagnosticReplay} from '../src/lib/ai-diagnostics/engine';
import {redactDiagnostic} from '../src/lib/ai-diagnostics/redact';
import {SYSTEM_PROMPT} from '../src/lib/seo-review/v3/prompt';
test('V3 diagnostic captures typed original and safe per-condition fields without model repair',()=>{
 const f=catalogV3Fixture(),r=diagnosticReplay(f.raw,f.input,{contractVersion:'V3'});
 assert.equal(r.pageContext.promptVersion,'PAGE_SEO_REVIEW_V3');assert.ok(r.queryRelevance.every(q=>q.source==='V3_LOCAL_REVIEW_INTENT_NOT_SEARCH_CLASSIFIER'));assert.equal(r.summary.accepted,1);assert.ok('evidenceReferences' in (r.proposals[0].original as object));assert.equal(r.proposals[0].projectionLimited,false);
 const raw=JSON.parse(f.raw);raw.recommendations[0].evidenceReferences[0].fieldPath='__proto__.value';raw.recommendations[0].rationale='CTR низкий.';
 const rejected=diagnosticReplay(JSON.stringify(raw),f.input,{contractVersion:'V3'}).proposals[0];assert.equal(rejected.status,'REJECTED');assert.ok(rejected.details.some(d=>d.code==='UNSAFE_REFERENCE_PATH'&&d.fieldPath));assert.ok(rejected.details.some(d=>d.code==='UNSUPPORTED_CTR'&&d.matchedRule));
 assert.equal(redactDiagnostic(SYSTEM_PROMPT),'[OMITTED_PROMPT]');
});
