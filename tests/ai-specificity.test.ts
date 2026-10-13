import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {specificityCases,specificityProposal} from './fixtures/ai-specificity';
import {aiInput,commerceInput} from './fixtures/ai-v2';
import {specificityReasons} from '../src/lib/ai/specificity';
import {diagnoseProposal,validateProposal,validateAiResult} from '../src/lib/ai/validator';
import {analyzePage} from '../src/lib/ai/service';
for(const f of specificityCases)test('Specificity: '+f.id,()=>assert.deepEqual(specificityReasons(specificityProposal(f.text,f.type)),f.reasons));
test('Context policy owns area, does not require name in free action text',()=>{
 const i=aiInput();for(const text of ['Проверить краткое описание.','Сверить анонс в HTML с назначением страницы.','Оценить понятность сниппета для профессионального покупателя.'])assert.equal(validateProposal(specificityProposal(text),i),null);
 assert.equal(validateProposal({...specificityProposal('Проверить краткое описание.'),area:'TITLE'},i),'ACTION_AREA_MISMATCH');
});
test('Short concrete action and long generic action are distinguished',()=>{
 const i=aiInput();i.findings[0].rule='A03';assert.equal(validateProposal({...specificityProposal('Проверить H1'),area:'H1'},i),null);
 assert.equal(validateProposal(specificityProposal('Улучшить SEO страницы и сделать её более качественной и эффективной.','CHANGE'),aiInput()),'ACTION_NOT_ACTIONABLE');
});
test('Diagnostics enumerate independent failures and never return text',()=>{
 const p={...specificityProposal('Правка'),area:'TITLE' as const};assert.deepEqual(diagnoseProposal(p,aiInput()),['ACTION_AREA_MISMATCH','ACTION_TOO_SHORT','ACTION_NOT_ACTIONABLE']);assert.equal(validateProposal(specificityProposal('Правка'),aiInput()),'ACTION_TOO_SHORT');assert.ok(!JSON.stringify(diagnoseProposal(p,aiInput())).includes(p.proposedAction));
});
test('UNKNOWN / NOT_OBSERVED remain CHECK only, synonyms cannot hide absent claims',()=>{
 const i=aiInput();i.content.description={...i.content.description,state:'UNKNOWN',value:null,coverage:'UNKNOWN',supportsAbsenceClaim:false};
 assert.equal(validateProposal(specificityProposal('Подготовить анонс со способами связи.','CHANGE'),i),'UNPROVEN_CHANGE');assert.equal(validateProposal(specificityProposal('Проверить краткое описание.'),i),null);
 for(const state of ['UNKNOWN','NOT_OBSERVED','KNOWN_PRESENT'] as const){i.content.description.state=state;for(const text of ['Проверить отсутствующий анонс в HTML страницы.','Проверить пустое краткое описание.'])assert.ok(['UNSUPPORTED_ABSENCE','EXISTING_CONTENT'].includes(validateProposal(specificityProposal(text),i)!));}
});
test('Known Title/H1 synonyms cannot contradict existing content',()=>{
 for(const [rule,area]of [['A01','TITLE'],['A03','H1']]as const){const i=aiInput();i.findings[0].rule=rule;assert.equal(validateProposal({...specificityProposal('Проверить отсутствующий заголовок.'),area},i),'EXISTING_CONTENT');}
});
test('Commerce synonyms stay actionable without old CTA keywords',()=>{
 for(const text of specificityCases.filter(f=>f.id.startsWith('commerce')).map(f=>f.text))assert.equal(validateProposal({...specificityProposal(text),area:'OTHER'},commerceInput()),null);
});
test('Questions/rationale cannot launder generic or negated action',()=>{
 const p={...specificityProposal('Проверить SEO страницы.'),questionsToVerify:['Отражает ли краткое описание способы связи?']};assert.equal(validateProposal(p,aiInput()),'ACTION_NOT_ACTIONABLE');assert.equal(validateProposal(specificityProposal('Не проверять краткое описание.'),aiInput()),'ACTION_NOT_ACTIONABLE');
});
test('Per-item validation: separate new codes, accepted-only result and preserved server facts',()=>{
 const input=aiInput(),before=JSON.stringify(input),ps=[specificityProposal('Сверить анонс в HTML с назначением страницы.'),specificityProposal('Правка'),specificityProposal('Улучшить SEO страницы.','CHANGE'),{...specificityProposal('Проверить краткое описание.'),area:'TITLE'}];
 const v=validateAiResult(JSON.stringify({proposals:ps}),input);assert.equal(v.validation.outcome,'PARTIAL_SUCCESS');assert.deepEqual(v.validation.rejectedByReason,{ACTION_TOO_SHORT:1,ACTION_NOT_ACTIONABLE:1,ACTION_AREA_MISMATCH:1});assert.equal(v.result.actions.length,1);assert.ok(!JSON.stringify(v.result).includes('Улучшить SEO'));assert.equal(JSON.stringify(input),before);
});
test('Hotfix offline A/B/C acceptance cannot call transport',async()=>{
 const originalFetch=globalThis.fetch;let transportAttempts=0,fakeCalls=0;globalThis.fetch=async()=>{transportAttempts++;throw new Error('External network forbidden by fixture');};
 try{
  const fake={analyzePage:async()=>{fakeCalls++;return {model:'fixture',text:JSON.stringify({proposals:[specificityProposal('Сверить анонс в HTML с назначением страницы.')]})};}};
  assert.equal((await analyzePage(aiInput(),fake,{maxProviderCalls:1})).validation.outcome,'SUCCESS');
  const b={analyzePage:async()=>{fakeCalls++;return {model:'fixture',text:JSON.stringify({proposals:[{...specificityProposal('Изучить процедуру оформления для юридического лица без отправки форм.'),area:'OTHER'}]})};}};
  assert.equal((await analyzePage(commerceInput(),b,{maxProviderCalls:1})).validation.outcome,'SUCCESS');
  assert.equal((await analyzePage({...aiInput(),findings:[]},fake)).metadata.apiCalls,0);assert.equal(fakeCalls,2);assert.equal(transportAttempts,0);
 }finally{globalThis.fetch=originalFetch;}
});
test('Safe local diagnostic command exposes all reason codes without free text',()=>{
 const r=spawnSync(process.execPath,['--conditions=react-server','--import=tsx','scripts/diagnose-ai-specificity.ts'],{encoding:'utf8'});assert.equal(r.status,0,r.stderr);
 const output=JSON.parse(readFileSync('test-results/sprint4-2-1-specificity-diagnostic.json','utf8'));assert.equal(output.apiCalls,0);assert.equal(output.checks.length,specificityCases.length+1);for(const f of specificityCases)if(f.text.trim())assert.ok(!r.stdout.includes(f.text));
});
