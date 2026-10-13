import type {PageSeoReviewInput} from '../seo-review/contract';
import {queryValue} from '../seo-review/quality';
export type QueryRelevance='TARGET_B2B'|'ADJACENT'|'NAVIGATIONAL'|'IRRELEVANT'|'UNCERTAIN';
export function queryRelevance(query:string,pageType:string){
 const q=query.toLowerCase().replace(/ё/g,'е'),catalog=['category','product','homepage'].includes(pageType);
 let classification:QueryRelevance='UNCERTAIN',rationale='Недостаточно page-level данных для уверенной оценки назначения запроса.',confidence:'LOW'|'MEDIUM'='LOW';
 if(/официальн.{0,12}сайт/u.test(q)){classification='NAVIGATIONAL';rationale='Явное желание перейти на официальный сайт; не доказательство потребности в конкретном ассортиментном блоке.';confidence='MEDIUM';}
 else if(/газпром\s*маркет/u.test(q)){classification='UNCERTAIN';rationale='Название может обозначать другой сервис; окончательная нерелевантность каталогу не доказана.';}
 else if(/подбор\s+масл/u.test(q)){classification='ADJACENT';rationale='Возможен сервисный подбор, требующий другой страницы; доступность такого сервиса не установлена.';confidence='MEDIUM';}
 else if(/ваканс|работа\s+в|заправк|азс/u.test(q)){classification='ADJACENT';rationale='Тема заправок/работы отличается от покупки смазочных материалов; происхождение и конечное намерение требуют review.';}
 else if(catalog&&/масл|смазк|антифриз/u.test(q)&&/оптом|поставщик|закупк|предприят|автопарк|промышлен/u.test(q)){classification='TARGET_B2B';rationale='Продуктовая тема совпадает с назначением каталога/товара и содержит явный B2B-сигнал; конкретный ассортимент ещё нужно сверить.';confidence='MEDIUM';}
 else if(catalog&&/масл|смазк|антифриз/u.test(q)){classification='ADJACENT';rationale='Продуктовая тема релевантна, но B2B-намерение и соответствие конкретной странице не подтверждены.';confidence='MEDIUM';}
 else if(/магазин/u.test(q)){classification='NAVIGATIONAL';rationale='Вероятен поиск магазина/бренда; товарная или B2B-задача не установлена.';}
 return {classification,rationale,confidence,source:'LOCAL_DIAGNOSTIC_RULES_V1_NOT_SEARCH_CLASSIFIER'};
}
export function profileRelevance(input:PageSeoReviewInput){return input.search.queries.slice(0,25).flatMap(e=>{const value=queryValue(e);return value?[{evidenceId:e.id,query:value.query,...queryRelevance(value.query,input.page.pageType)}]:[];});}
