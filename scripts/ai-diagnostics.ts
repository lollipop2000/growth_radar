/** Local CLI only. No UI/HTTP entrypoint, no runtime env toggle. */
import {parseArgs} from 'node:util';
import {readFileSync,openSync,writeFileSync,closeSync,existsSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {diagnosticReplay,type DiagnosticArtifact} from '../src/lib/ai-diagnostics/engine';
import {catalogDiagnosticFixture} from '../src/lib/ai-diagnostics/fixtures';
import {DiagnosticStorage,DiagnosticError,assertLocal} from '../src/lib/ai-diagnostics/storage';
import {applyExpertReview} from '../src/lib/ai-diagnostics/review';
const safeOutput=(v:unknown)=>process.stdout.write(JSON.stringify(v)+'\n');
let calls=0;
try{
 const {values,positionals}=parseArgs({allowPositionals:true,strict:true,options:{'enable-local-diagnostics':{type:'boolean'},'authorize-one-live-call':{type:'boolean'},'run-id':{type:'string'},'review-file':{type:'string'},item:{type:'string'},all:{type:'boolean'},contract:{type:'string'}}});
 assertLocal();if(!values['enable-local-diagnostics'])throw new DiagnosticError('EXPLICIT_LOCAL_ENABLE_REQUIRED');
 const contractVersion=values.contract??'V2';if(contractVersion!=='V2'&&contractVersion!=='V3')throw new DiagnosticError('INVALID_CONTRACT_VERSION');
 const command=positionals[0];if(positionals.length!==1||!['replay','live','review','cleanup'].includes(command))throw new DiagnosticError('INVALID_COMMAND');
 if(command!=='live'&&values['authorize-one-live-call'])throw new DiagnosticError('INVALID_AUTHORIZATION_SCOPE');
 const storage=new DiagnosticStorage(),cleanupStart=performance.now(),expiredRemoved=storage.cleanup(),cleanupMs=performance.now()-cleanupStart;
 if(command==='cleanup'){safeOutput({status:'CLEANUP_PASS',removed:expiredRemoved+storage.cleanup(values.all),apiCalls:0,cleanupMs});}
 else if(command==='replay'){
  globalThis.fetch=async()=>{throw new DiagnosticError('OFFLINE_NETWORK_FORBIDDEN');};
  const f=contractVersion==='V3'?(await import('../src/lib/ai-diagnostics/v3-fixtures')).catalogV3Fixture():catalogDiagnosticFixture(),artifact=diagnosticReplay(f.raw,f.input,{contractVersion}),start=performance.now(),path=storage.write(artifact),writingMs=performance.now()-start;
  safeOutput({status:'SYNTHETIC_REPLAY_SAVED',runId:artifact.runId,path,summary:artifact.summary,timings:{...artifact.timings,writingMs,cleanupMs},apiCalls:0,rawOutputPrinted:false});
 }else if(command==='review'){
  if(!values['run-id']||!values['review-file']||!/^[0-4]$/.test(values.item??''))throw new DiagnosticError('REVIEW_ARGUMENTS_REQUIRED');
  const raw=readFileSync(values['review-file']);if(raw.byteLength>16000)throw new DiagnosticError('REVIEW_TOO_LARGE');
  const artifact=storage.read<DiagnosticArtifact>(values['run-id']),reviewed=applyExpertReview(artifact,Number(values.item),JSON.parse(raw.toString('utf8')));storage.write(reviewed);
  safeOutput({status:'REVIEW_SAVED',runId:artifact.runId,item:Number(values.item),validatorDecisionUnchanged:true,apiCalls:0});
 }else{
  if(!values['authorize-one-live-call'])throw new DiagnosticError('SEPARATE_ONE_CALL_AUTHORIZATION_REQUIRED');
  // One fresh series only. Safe ledger survives diagnostic TTL/cleanup and prevents replay.
  const ledgerFile=contractVersion==='V3'?'test-results/sprint5-3-live-diagnostic.json':'test-results/sprint5-2-live-diagnostic.json';if(existsSync(ledgerFile))throw new DiagnosticError('LIVE_LEDGER_ALREADY_EXISTS_NO_REPLAY');
  const {buildPageSeoReviewInput}=await import('../src/lib/seo-review/evidence');
  const {reviewPage,DeepSeekSeoReviewProvider}=await (contractVersion==='V3'?import('../src/lib/seo-review/v3/service'):import('../src/lib/seo-review/service'));
  const {db}=await import('../src/lib/db');const {aiConfig}=await import('../src/lib/ai/config');
  try{
   if(!aiConfig().enabled)throw new DiagnosticError('PROVIDER_UNAVAILABLE');
   const input=await buildPageSeoReviewInput('cmuvgasnz002t20tcltbmyjw4'),runId=randomUUID();
   // Verify actual write capability, redaction and ACL BEFORE reserving/calling provider.
   const initial=diagnosticReplay('{',input,{contractVersion,runId,mode:'AUTHORIZED_LIVE',model:aiConfig().model});storage.write(initial);
   const fd=openSync(ledgerFile,'wx');closeSync(fd);const ledger={series:contractVersion==='V3'?'Sprint5.3 diagnostic live':'Sprint5.2 diagnostic live',runId,maximum:1,totalCalls:0,retries:0,status:'PREPARED',finished:false};
   const save=()=>writeFileSync(ledgerFile,JSON.stringify(ledger,null,2));save();
   let response:import('../src/lib/ai/provider').AiProviderResponse|undefined,providerMs=0;
   const nativeFetch=globalThis.fetch;let requests=0,permitted=false;
   globalThis.fetch=async(url,options)=>{if(!permitted||String(url)!==aiConfig().baseUrl.replace(/\/$/,'')+'/chat/completions'||options?.method!=='POST'||requests>=1)throw new DiagnosticError('NETWORK_SCOPE_VIOLATION');requests++;return nativeFetch(url,options);};
   try{
    const reviewed=await reviewPage(input,{review:async(i)=>{if(calls||ledger.totalCalls)throw new DiagnosticError('RETRY_FORBIDDEN');calls++;ledger.totalCalls=1;ledger.status='REQUEST_RESERVED';save();const started=performance.now();try{permitted=true;response=await new DeepSeekSeoReviewProvider().review(i);return response;}finally{permitted=false;providerMs=performance.now()-started;}}});
    if(!response)throw new DiagnosticError('NO_RESPONSE');
    const artifact=diagnosticReplay(response.text,input,{contractVersion,runId,mode:'AUTHORIZED_LIVE',model:aiConfig().model,provider:{responseReceived:true,latencyMs:providerMs,...response.usage},decisions:reviewed.validation.decisions});storage.write(artifact);ledger.status='CAPTURED_REVIEW_PENDING';
   }catch{
    // Malformed JSON/envelope still captured. No repair or retry.
    if(response){const artifact=diagnosticReplay(response.text,input,{contractVersion,runId,mode:'AUTHORIZED_LIVE',model:aiConfig().model,provider:{responseReceived:true,latencyMs:providerMs,...response.usage}});storage.write(artifact);ledger.status='CAPTURED_VALIDATION_ERROR';}
    else ledger.status='PROVIDER_ERROR_NO_RETRY';
   }finally{permitted=false;ledger.finished=true;save();}
   safeOutput({status:ledger.status,runId,apiCalls:calls,retries:0,rawOutputPrinted:false});
  }finally{await db.$disconnect();}
 }
}catch(e){safeOutput({status:'REFUSED_OR_FAILED',code:e instanceof DiagnosticError?e.code:'DIAGNOSTIC_ERROR',apiCalls:calls,rawOutputPrinted:false});process.exitCode=1;}
