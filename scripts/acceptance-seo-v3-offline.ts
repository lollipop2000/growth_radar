import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {db} from '../src/lib/db';
import {buildPageSeoReviewInput} from '../src/lib/seo-review/evidence';
import {reviewPage} from '../src/lib/seo-review/v3/service';
import {reviewMessages} from '../src/lib/seo-review/v3/prompt';
import type {Recommendation,EvidenceReference} from '../src/lib/seo-review/v3/contract';
let network=0;globalThis.fetch=async()=>{network++;throw Error('OFFLINE_NETWORK_FORBIDDEN');};
const rows:unknown[]=[],benchmark=process.argv.includes('--benchmark');
try{
 for(let iteration=0;iteration<(benchmark?6:1);iteration++)for(const [scenario,id] of [['B','cmuvgasnz002t20tcltbmyjw4'],['A','cmuwrqlp100bi20e8ml03fpch'],['E','cmuv6w2wt000120goxunx7su2'],['D','cmuwrqlp000a220e84edhlg83']]){
  const start=performance.now(),input=await buildPageSeoReviewInput(id),builderMs=performance.now()-start;
  const queries=input.search.queries.filter(e=>/масл|5w|10w/iu.test((e.value as {query:string}).query)&&!/подбор|заправк|АЗС|маркет|оптом/iu.test((e.value as {query:string}).query));
  const q=scenario==='E'?input.search.queries[0]:queries[0];let calls=0;
  const reference=(evidenceId:string,fieldPath='value'):EvidenceReference=>({evidenceId,fieldPath,purpose:'OBSERVE'});
  const r:Recommendation|undefined=q?{id:'offline-'+scenario,area:'TITLE',priority:'MEDIUM',recommendationType:'CREATE_HYPOTHESIS',placement:'HTML_TITLE',operation:'PROPOSE',finding:'Сохранённый заголовок позволяет проверить иной порядок представления товарной темы.',rationale:'Это интерпретация подтверждённых поисковых наблюдений, а не доказанный эффект.',proposedAction:'Подготовить конкретный вариант Title и сверить его с ассортиментом и назначением страницы.',proposedContent:{currentText:String(input.content.title.value),suggestedText:scenario==='B'?'Каталог масел Газпромнефть':scenario==='A'?'Gazpromneft Premium N 5W-40 — канистра 4 л':'Масла Газпромнефть для юридических лиц',placement:'HTML_TITLE'},targetQueries:[(q.value as {query:string}).query],evidenceReferences:[reference(input.content.title.id),reference(input.content.topText.id),reference(q.id,'value.query')],statements:[{kind:'OBSERVED_FACT',text:'Сохранённый Title доступен для сравнения.',references:[reference(input.content.title.id)]},{kind:'GROWTH_HYPOTHESIS',text:'Уточнение порядка слов и товарной темы требует ручной проверки.',references:[reference(q.id,'value.query')]}],uncertainty:'До внедрения проверить широту ассортимента, назначение и пересечения с известными посадочными.',verificationSteps:['Сравнить с ассортиментом и известными страницами; отклонить вариант при сужении темы или дублировании.']}:undefined;
  const result=await reviewPage(input,{review:async()=>{calls++;return {text:JSON.stringify({summary:{overallAssessment:'SYNTHETIC ONLY',strengths:[],keyOpportunities:[]},recommendations:r?[r]:[],limitations:[]}),model:'SYNTHETIC_NO_MODEL'};}});
  assert.equal(calls,scenario==='D'?0:1);assert.equal(result.validation.accepted,scenario==='D'?0:1,JSON.stringify({scenario,query:q?.value,validation:result.validation}));
  if(scenario==='E')assert.equal(input.existingFindings.length,0);
  rows.push({iteration,scenario,url:input.page.currentUrl,synthetic:true,fakeProviderCalls:calls,apiCalls:0,inputBytes:Buffer.byteLength(JSON.stringify(input)),requestBytes:Buffer.byteLength(JSON.stringify(reviewMessages(input))),builderMs,validatorMs:result.metadata.validatorMs,offlineTotalMs:performance.now()-start,validation:result.validation,outcomeCounts:result.result.outcomeCounts});
 }
 assert.equal(network,0);writeFileSync(benchmark?'test-results/sprint5-3-offline-performance.json':'test-results/sprint5-3-offline-acceptance.json',JSON.stringify({status:'OFFLINE_PASS_LIVE_USEFULNESS_UNPROVEN',apiCalls:0,networkRequests:network,rows},null,2));console.log(JSON.stringify({status:'OFFLINE_PASS',scenarios:4,apiCalls:0,networkRequests:network}));
}finally{await db.$disconnect();}
