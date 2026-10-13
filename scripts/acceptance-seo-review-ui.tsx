import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import assert from 'node:assert/strict';
import {PageSeoReviewOutput} from '../src/components/page-seo-review-output';
import type {ReviewResponse} from '../src/lib/seo-review/contract';
const base:ReviewResponse={result:{summary:{overallAssessment:'Ручная проверка',strengths:[],keyOpportunities:[]},recommendations:[],limitations:['PARTIAL не означает отсутствие']},validation:{generated:2,accepted:1,rejected:1,decisions:[{index:1,status:'REJECTED',reasonCodes:['ACTION_AREA_MISMATCH']}]},metadata:{promptVersion:'fixture',model:'fake',apiCalls:0,inputBytes:10,providerMs:0,validatorMs:0}};
const item={id:'r',area:'DESCRIPTION',priority:'MEDIUM',recommendationType:'CHECK',placement:'META_DESCRIPTION',operation:'INSPECT',finding:'Проверить поле',rationale:'Гипотеза',proposedAction:'Сверить метатег с сохранённой строкой.',claims:[],evidenceIds:['E001'],verificationSteps:['Открыть HTML без изменения сайта.'],reasonCodes:['HUMAN_SEO_REVIEW_REQUIRED'],evidence:[{id:'E001',kind:'content.description',value:'<script>alert(1)</script>',state:'KNOWN_PRESENT',coverage:'FULL',source:'SAVED_SNAPSHOT:BROWSER',observedAt:'2026-10-06',truncated:false,supportsAbsenceClaim:false}]} as const;
for(const status of ['SUPPORTED','NEEDS_REVIEW'] as const){const review=JSON.parse(JSON.stringify(base)) as ReviewResponse;review.result.recommendations=[{...item,status} as unknown as ReviewResponse['result']['recommendations'][number]];const html=renderToStaticMarkup(<PageSeoReviewOutput review={review}/>);for(const s of ['META_DESCRIPTION','2026-10-06','ACTION_AREA_MISMATCH','FULL','SAVED_SNAPSHOT','Как проверить'])assert.ok(html.includes(s)||s==='META_DESCRIPTION'&&html.includes('description'));assert.ok(!html.includes('<script>'));assert.ok(html.includes('&lt;script&gt;'));}
for(const outcome of ['READY_CHANGE','GROWTH_HYPOTHESIS','DATA_CHECK'] as const){
 const review=JSON.parse(JSON.stringify(base)) as ReviewResponse;
 review.result.recommendations=[{...item,status:'NEEDS_REVIEW',outcome,quality:{confirmedSearch:[],b2bIntent:'UNKNOWN',seoValue:'Проверяемая гипотеза',implementationComplexity:'UNKNOWN',evidenceConfidence:'PARTIAL'}} as unknown as ReviewResponse['result']['recommendations'][number]];
 const html=renderToStaticMarkup(<PageSeoReviewOutput review={review}/>);assert.ok(html.includes(outcome));assert.ok(html.includes('без публикации'));assert.ok(html.includes('Сложность: UNKNOWN'));assert.ok(html.includes('B2B-интент: UNKNOWN'));
}
assert.ok(renderToStaticMarkup(<PageSeoReviewOutput review={base}/>).includes('Ограничения'));console.log('PASS SEO Review UI: supported/review/empty/partial rejection, explicit target, escaped text, evidence metadata');
