import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import type {PageSeoReviewInput,SeoRecommendation,Json} from '../seo-review/contract';
export function catalogDiagnosticFixture(){
 const input=JSON.parse(readFileSync(fileURLToPath(new URL('../../..',import.meta.url))+'/tests/fixtures/seo-review-catalog.json','utf8')) as PageSeoReviewInput;
 const q=input.search.queries.find(e=>(e.value as {query?:string})?.query==='газпромнефть масло')!;
 const base:SeoRecommendation={id:'synthetic-catalog-title',area:'TITLE',priority:'MEDIUM',recommendationType:'CREATE_HYPOTHESIS',placement:'HTML_TITLE',operation:'PROPOSE',finding:'Сохранённый Title обозначает каталог без уточнения товарной темы.',rationale:'Проверяемая гипотеза более явного соответствия продуктовому запросу.',proposedAction:'Рассмотреть уточнение темы в Title, сверив широту ассортимента.',proposedContent:{currentText:String(input.content.title.value),suggestedText:'Каталог масел Газпромнефть',placement:'HTML_TITLE'},targetQueries:['газпромнефть масло'],evidenceIds:[input.content.title.id,input.content.excerpts.id,q.id],claims:[{evidenceId:input.content.title.id,relation:'VALUE',value:input.content.title.value}],uncertainty:'Это гипотеза: при более широком ассортименте вариант может сузить назначение каталога.',verificationSteps:['Сверить вариант с ассортиментом и существующими посадочными; отклонить сужение темы.']};
 const proposals:SeoRecommendation[]=[base,
  {...base,id:'synthetic-partial-query-object',claims:[{evidenceId:q.id,relation:'VALUE',value:{query:(q.value as {query:string}).query}}]},
  {...base,id:'synthetic-absence',finding:'Описание категории отсутствует.',claims:[]},
  {...base,id:'synthetic-number',verificationSteps:['1. Сверить вариант с ассортиментом.']},
  {...base,id:'synthetic-ctr-caveat',rationale:'Нельзя утверждать, что CTR низкий без сопоставимого benchmark.'}
 ];
 return {input,proposals,raw:JSON.stringify({summary:{overallAssessment:'SYNTHETIC ONLY',strengths:[],keyOpportunities:[]},recommendations:proposals,limitations:[]})};
}
