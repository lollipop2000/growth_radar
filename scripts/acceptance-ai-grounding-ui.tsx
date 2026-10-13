import React from 'react';
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {renderToStaticMarkup} from 'react-dom/server';
import {AiAnalysisOutput} from '../src/components/ai-analysis-output-v2';
import {aiInput,aiResult,recommendation,commerceInput,commerceRecommendation} from '../tests/fixtures/ai-v2';
import {validateAiResult} from '../src/lib/ai/validator-v2';
import {evidenceItems,type AiAnalysisResponseV2 as AiAnalysisResponse} from '../src/lib/ai/contract';
const invalid=recommendation();invalid.title='REJECTED TEXT MUST NOT APPEAR';invalid.evidenceIds.push('CONTENT_99');
const cases=[{name:'partial',input:aiInput(),result:aiResult([recommendation(),invalid])},{name:'allRejected',input:aiInput(),result:aiResult([invalid])},{name:'empty',input:{...aiInput(),findings:[]},result:aiResult([])},{name:'check',input:commerceInput(),result:aiResult([commerceRecommendation()])}];
const results=[];
for(const c of cases){const v=validateAiResult(JSON.stringify(c.result),c.input),analysis:AiAnalysisResponse={...v,evidence:evidenceItems(c.input),metadata:{provider:'DEEPSEEK',model:'fixture',promptVersion:'AI_ANALYST_V2',latencyMs:1,timings:{providerMs:0,validatorMs:1},apiCalls:0}};
 const html=renderToStaticMarkup(<AiAnalysisOutput analysis={analysis}/>);assert.ok(!html.includes(invalid.title));
 if(c.name==='partial'){assert.ok(html.includes('1 предложения не прошли'));assert.ok(html.includes('Предлагаемое изменение'));assert.ok(html.includes('Что известно'));assert.ok(html.includes('Предлагаемый текст'));}
 if(c.name==='allRejected'){assert.ok(html.includes('предложения не прошли проверку достоверности'));assert.ok(!html.includes('нет достаточных оснований'));}
 if(c.name==='empty'){assert.ok(html.includes('нет достаточных оснований'));assert.ok(!html.includes('проверку достоверности'));}
 if(c.name==='check'){assert.ok(html.includes('Рекомендуется проверить'));assert.ok(!html.includes('Предлагаемый текст'));}
 writeFileSync('test-results/sprint4-1-ui-'+c.name+'.html',html);results.push({case:c.name,status:'PASS',outcome:v.validation.outcome});
}
writeFileSync('test-results/sprint4-1-ui-fixtures.json',JSON.stringify(results,null,2));console.log('PASS fixture UI CHANGE/CHECK, partial, all-rejected, valid-empty');
