/** Offline acceptance. Local Next.js GETs only; model/provider are never imported. */
import assert from 'node:assert/strict';
import {existsSync,writeFileSync,readdirSync,rmdirSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
import {catalogDiagnosticFixture} from '../src/lib/ai-diagnostics/fixtures';
import {diagnosticReplay} from '../src/lib/ai-diagnostics/engine';
import {DiagnosticStorage,TTL_MS} from '../src/lib/ai-diagnostics/storage';
import {applyExpertReview,type ExpertReview} from '../src/lib/ai-diagnostics/review';
const nativeFetch=globalThis.fetch;let localRequests=0;
globalThis.fetch=async(url,options)=>{if(!String(url).startsWith('http://127.0.0.1:3000/')||options?.method&&options.method!=='GET')throw Error('NETWORK_FORBIDDEN');localRequests++;return nativeFetch(url,options);};
const fixture=catalogDiagnosticFixture();let artifact=diagnosticReplay(fixture.raw,fixture.input);
const assessments:[ExpertReview['status'],ExpertReview['disposition'],string][]=[
 ['QUESTIONABLE','INSUFFICIENT_EVIDENCE_TO_DECIDE','Concrete Title hypothesis and a real product-topic query. Catalog-wide assortment scope and B2B intent remain unproven; suggested narrowing requires human verification.'],
 ['FAIL','VALIDATOR_TRUE_REJECT','Partial query object is not the exact referenced Search fact. Useful SEO wording does not justify accepting a structurally inaccurate VALUE claim; not proof that the whole proposal is a hallucination.'],
 ['FAIL','VALIDATOR_TRUE_REJECT','Saved Description evidence is UNKNOWN. An unconditional absence assertion is unsupported by the available snapshot.'],
 ['QUESTIONABLE','INSUFFICIENT_EVIDENCE_TO_DECIDE','Ordinal is a checklist label, not an asserted performance metric. Acceptance of this lexical token does not prove SEO usefulness or B2B relevance.'],
 ['QUESTIONABLE','POSSIBLE_FALSE_REJECT','Negative caveat denies a low-CTR conclusion but matches the unchanged lexical guard. Review as possible false reject; actual Title usefulness and catalog scope still need independent human confirmation.']
];
for(const [n,[status,disposition,rationale]]of assessments.entries()){
 const review:ExpertReview={reviewer:'CODEX_EXPERT_ASSESSMENT',status,disposition,rationale,humanReview:'PENDING_HUMAN_REVIEW',criteria:{
  pagePurpose:{status:'QUESTIONABLE',explanation:'Catalog is broader than the synthetic oil-focused wording; verify assortment scope.'},
  factualCorrectness:{status:n===1||n===2?'FAIL':'PASS',explanation:n===1?'Partial VALUE object is not the registry value.':n===2?'Unknown Description does not establish absence.':'No invented product specification; caveat/ordinal must be read in context.'},
  searchIntent:{status:'QUESTIONABLE',explanation:'Product-topic query exists; B2B or category-wide suitability is unproven.'},
  specificity:{status:'PASS',explanation:'Concrete HTML Title variant and explicit verification of catalog breadth are present.'},
  seoRationale:{status:'QUESTIONABLE',explanation:'Topic clarification is testable; ranking/CTR effect is not established.'},
  b2bUsefulness:{status:'QUESTIONABLE',explanation:'No explicit B2B intent is established by this broad oil query.'},
  handoff:{status:'QUESTIONABLE',explanation:'SEO specialist can evaluate the hypothesis; implementation requires scope confirmation.'},
  uncertainty:{status:n===2?'FAIL':'PASS',explanation:n===2?'Unconditional absence conflicts with unknown extraction.':'Scope caveat and verification are retained; no guaranteed uplift.'}
 }};artifact=applyExpertReview(artifact,n,review);
}
const storage=new DiagnosticStorage(),writeStart=performance.now(),path=storage.write(artifact),writingMs=performance.now()-writeStart;
assert.equal(storage.read<typeof artifact>(artifact.runId).summary.reviewRequired,0);
const expired=diagnosticReplay(fixture.raw,fixture.input,{createdAt:new Date(Date.now()-TTL_MS-60000)});storage.write(expired);
const start=performance.now(),cli=spawnSync(process.execPath,['--conditions=react-server','--import=tsx','scripts/ai-diagnostics.ts','cleanup','--enable-local-diagnostics'],{encoding:'utf8',windowsHide:true,timeout:30000});
assert.equal(cli.status,0,cli.stdout);const cleanup=JSON.parse(cli.stdout.trim());assert.ok(cleanup.removed>=1);assert.ok(!existsSync(join(storage.root,expired.runId+'.json')));assert.ok(existsSync(path));
const cleanupMs=performance.now()-start;
const http=[];for(const route of ['/.growth-radar-local-ai-diagnostics/'+artifact.runId+'.json','/ai-diagnostics-local/'+artifact.runId+'.json','/api/ai-diagnostics?enable-local-diagnostics=true']){const response=await fetch('http://127.0.0.1:3000'+route);const text=await response.text();assert.equal(response.status,404);assert.ok(!text.includes('LOCAL_AI_DIAGNOSTIC_V1'));http.push({route,status:response.status});}
assert.ok(!existsSync('test-results/sprint5-2-live-diagnostic.json'));
// Remove only recognized diagnostic files in dedicated temporary roots left by an interrupted test.
for(const name of readdirSync(tmpdir()))if(/^gr-diag-[0-9a-f-]{36}$/.test(name)){const root=join(tmpdir(),name);new DiagnosticStorage(root).cleanup(true);rmdirSync(root);}
const report={status:'OFFLINE_PASS',syntheticOnly:true,apiCalls:0,modelImported:false,runId:artifact.runId,protectedArtifact:path,summary:artifact.summary,decisions:artifact.proposals.map(p=>({index:p.itemIndex,status:p.status,codes:p.reasonCodes,reviewStatus:p.expertReview?.status,disposition:p.expertReview?.disposition,humanReview:p.expertReview?.humanReview})),queryRelevance:artifact.queryRelevance.map(q=>({evidenceId:q.evidenceId,classification:q.classification,confidence:q.confidence})),timings:{...artifact.timings,writingMs,cleanupMs},cleanup:{expiredRemoved:cleanup.removed,expiredDeleted:true,currentRetained:true},http,localRequests};
writeFileSync('test-results/sprint5-2-offline-acceptance.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
