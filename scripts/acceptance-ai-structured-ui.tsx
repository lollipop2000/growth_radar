import React from 'react';
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {renderToStaticMarkup} from 'react-dom/server';
import {AiAnalysisOutput} from '../src/components/ai-analysis-output';
import {aiInput,commerceInput} from '../tests/fixtures/ai-v2';
import {validateAiResult} from '../src/lib/ai/validator';
import {evidenceItems,type AiAnalysisResponse,type AiActionProposal,type AiPageAnalysisInput} from '../src/lib/ai/contract';
const good:AiActionProposal={contextId:'CTX_01',actionType:'CHANGE',area:'DESCRIPTION',proposedAction:'Подготовить метаописание с назначением страницы для профессионального покупателя.',rationale:'Поможет покупателю понять назначение страницы.',example:'Контакты и реквизиты компании.'};
const check:AiActionProposal={contextId:'CTX_01',actionType:'CHECK',area:'CTA',proposedAction:'Проверить видимость кнопки на мобильном экране и зафиксировать условия оформления.',rationale:'Уточнит доступность коммерческого сценария.',questionsToVerify:['Видна ли кнопка на первом экране?']};
const bad={...good,contextId:'CTX_99',proposedAction:'REJECTED TEXT MUST NOT APPEAR'};
const results=[];
for(const [name,input,proposals]of [['partial',aiInput(),[good,bad]],['allRejected',aiInput(),[bad]],['empty',{...aiInput(),findings:[]},[]],['check',commerceInput(),[check]]] as [string,AiPageAnalysisInput,unknown[]][]){
 const v=validateAiResult(JSON.stringify({proposals}),input),analysis:AiAnalysisResponse={...v,evidence:evidenceItems(input),metadata:{provider:'DEEPSEEK',model:'fixture',promptVersion:'AI_ANALYST_V3',latencyMs:1,apiCalls:0,timings:{providerMs:0,validatorMs:1,contextBuilderMs:0},...name==='empty'?{emptyReason:'NO_FINDINGS' as const}:{}}};
 const html=renderToStaticMarkup(<AiAnalysisOutput analysis={analysis}/>);assert.ok(!html.includes(bad.proposedAction));
 if(name==='partial'){assert.ok(html.includes('1 предложения не прошли'));assert.ok(html.includes('Предлагаемый текст'));assert.ok(html.includes('данные сервера'));}
 if(name==='allRejected'){assert.ok(html.includes('предложения не прошли проверку достоверности'));assert.ok(!html.includes('нет достаточных оснований'));}
 if(name==='empty'){assert.ok(html.includes('DeepSeek не вызывался'));}
 if(name==='check'){assert.ok(html.includes('Вопросы для проверки'));assert.ok(!html.includes('Предлагаемый текст'));assert.ok(html.includes('97'));assert.ok(html.includes('2026-10-06'));}
 writeFileSync('test-results/sprint4-2-ui-'+name+'.html',html);results.push({case:name,status:'PASS',outcome:v.validation.outcome});
}
writeFileSync('test-results/sprint4-2-ui-fixtures.json',JSON.stringify(results,null,2));console.log('PASS structured UI CHANGE/CHECK, partial, all-rejected, valid-empty');
