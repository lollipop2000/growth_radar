import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {specificityCases,specificityProposal} from '../tests/fixtures/ai-specificity';
import {aiInput} from '../tests/fixtures/ai-v2';
import {specificityReasons} from '../src/lib/ai/specificity';
import {diagnoseProposal} from '../src/lib/ai/validator';
// Local fixture diagnosis. Writes only stable IDs/codes, never proposal text.
const checks:{fixtureId:string;reasons:string[];status:string}[]=specificityCases.map(f=>{const reasons=specificityReasons(specificityProposal(f.text,f.type));assert.deepEqual(reasons,f.reasons,f.id);return {fixtureId:f.id,reasons,status:'PASS'};});
const combined=diagnoseProposal({...specificityProposal('Правка'),area:'TITLE'},aiInput());
assert.deepEqual(combined,['ACTION_AREA_MISMATCH','ACTION_TOO_SHORT','ACTION_NOT_ACTIONABLE']);
checks.push({fixtureId:'independent-failed-conditions',reasons:combined,status:'PASS'});
writeFileSync('test-results/sprint4-2-1-specificity-diagnostic.json',JSON.stringify({apiCalls:0,checks},null,2));
console.log(JSON.stringify({apiCalls:0,checks}));
