import {readFileSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {buildAiPageEvidence} from '../src/lib/ai/evidence';
import {buildActionContexts} from '../src/lib/ai/action-context';
import {pageAiAnalysis} from '../src/app/ai-actions';
import {db} from '../src/lib/db';
const pages=JSON.parse(readFileSync('test-results/sprint4-acceptance-pages.json','utf8')) as {case:string;page:{id:string}}[];
let networkCalls=0;const originalFetch=globalThis.fetch;globalThis.fetch=async()=>{networkCalls++;throw new Error('Diagnostic forbids external requests');};
try{
 const contexts=[];for(const p of pages){const start=performance.now(),input=await buildAiPageEvidence(p.page.id);contexts.push({case:p.case,pageId:p.page.id,evidenceBuilderMs:Math.round(performance.now()-start),contexts:buildActionContexts(input).map(({subject,...context})=>context)});}
 const c=pages.find(p=>p.case==='C')!,result=await pageAiAnalysis(c.page.id);assert.ok(result.ok);assert.equal(result.analysis.validation.outcome,'VALID_EMPTY');assert.equal(result.analysis.result.actions.length,0);assert.equal(result.analysis.metadata.apiCalls,0);assert.equal(networkCalls,0);
 const {evidence,...diagnostic}=result.analysis;
 writeFileSync('test-results/sprint4-2-contexts-c-diagnostic.json',JSON.stringify({contexts,c:diagnostic,networkCalls},null,2));console.log('PASS real server C: VALID_EMPTY / actions 0 / external requests 0');
}finally{globalThis.fetch=originalFetch;await db.$disconnect();}
