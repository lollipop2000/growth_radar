import type {ScanPage} from '@prisma/client';
export type ContentSignals={visibleText:string;topText:string;commercial:Record<string,{present:boolean;evidence:string}>};
export function extractSignals(text:string,topText:string,h1:string|null,structured:string[]):ContentSignals {
 const patterns:Record<string,RegExp>={price:/\d[\d\s.,]*\s*(?:₽|руб|rub)/i,availability:/в наличии|нет в наличии|под заказ|доступен/i,packaging:/\d+\s*л\b|\d+\s*л(?=\s|$)|бочк|канистр/i,cta:/купить|в корзину|заказать/i,characteristics:/характеристик|вязкост|плотност/i,application:/применени|гидросистем|редуктор|компрессор|двигател/i,specifications:/\b(?:API|ACEA|SAE|ISO|DIN)\b|ГОСТ|допуск/i,documentation:/документ|паспорт|сертификат|\.pdf/i,alternatives:/аналог|замен|альтернатив/i,related:/похожие|сопутствующие|рекомендуемые товары/i,faq:/частые вопросы|вопросы и ответы|FAQ/i};
 const commercial:ContentSignals['commercial']={productName:{present:!!h1,evidence:h1??''}};
 for(const [k,re] of Object.entries(patterns)){const m=text.match(re);commercial[k]={present:!!m,evidence:m?text.slice(Math.max(0,m.index!-45),m.index!+100):''};}
 commercial.productSchema={present:structured.includes('Product'),evidence:structured.includes('Product')?'Product':''};commercial.offerSchema={present:structured.some(t=>['Offer','AggregateOffer'].includes(t)),evidence:structured.filter(t=>['Offer','AggregateOffer'].includes(t)).join(', ')};
 return {visibleText:text.slice(0,100000),topText:topText.slice(0,4000),commercial};
}
export function meaningfulDiff(a:Pick<ScanPage,'title'|'description'|'h1'|'h2Json'|'wordCount'|'structuredDataJson'|'contentHash'>,b:typeof a){
 const diff:Record<string,{before:unknown;after:unknown}>={};for(const key of ['title','description','h1','h2Json','wordCount','structuredDataJson'] as const)if(JSON.stringify(a[key])!==JSON.stringify(b[key]))diff[key]={before:a[key],after:b[key]};
 if(a.contentHash&&b.contentHash&&a.contentHash!==b.contentHash)diff.contentChanged={before:a.contentHash,after:b.contentHash};return diff;
}
