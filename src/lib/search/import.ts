import type {Sheet} from '../business/import';
import {normalizeQuery,searchIdentity} from './model';
import {matchUrl,type MatchPage} from '../yandex/matching';
export const searchFields=['date','url','query','impressions','clicks','ctr','avgPosition','region'] as const;
export type SearchField=typeof searchFields[number];
export type SearchMapping=Partial<Record<SearchField,number>>;
export const searchLabels:Record<SearchField,string>={date:'Дата',url:'URL',query:'Запрос',impressions:'Показы',clicks:'Клики',ctr:'CTR, %',avgPosition:'Средняя позиция',region:'Регион (необязательно)'};
const aliases:Record<SearchField,string[]>={date:['date','дата'],url:['url','адрес','ссылка'],query:['query','запрос','поисковыйзапрос'],impressions:['impressions','показы','показов'],clicks:['clicks','клики'],ctr:['ctr','ctr%','ctr,%'],avgPosition:['averageposition','avgposition','средняяпозиция','позиция'],region:['region','регион','регион(необязательно)']};
export function suggestSearchMapping(headers:string[]):SearchMapping{return Object.fromEntries(searchFields.flatMap(f=>{const found=headers.flatMap((h,i)=>aliases[f].includes(h.toLowerCase().replace(/[\s_-]/g,''))?[i]:[]);return found.length===1?[[f,found[0]]]:[];}));}
export function validateSearch(sheet:Sheet,mapping:SearchMapping,site:{id:string;baseUrl:string},pages:MatchPage[]){
 for(const f of searchFields.filter(f=>f!=='region'))if(mapping[f]===undefined)throw new Error('Сопоставьте все обязательные колонки поисковых данных.');
 if(Object.entries(mapping).some(([f,i])=>!searchFields.includes(f as SearchField)||!Number.isInteger(i)||i!<0||i!>=sheet.headers.length)||new Set(Object.values(mapping)).size!==Object.values(mapping).length)throw new Error('Колонки должны быть различными и существовать в выбранном листе.');
 const records=[],errors:{row:number;message:string}[]=[],seen=new Set<string>();let skipped=0;
 for(const [i,values] of sheet.rows.entries()){if(values.every(v=>!v.trim())){skipped++;continue;}try{
 const get=(f:SearchField)=>mapping[f]===undefined?'':(values[mapping[f]!]??'').trim();if(values.some(v=>v.includes('[FORMULA_NOT_SUPPORTED]')||v==='[INVALID_CELL]'))throw new Error('Формулы не поддерживаются. Сохраните значения.');
 let rawDate=get('date');if(/^\d{2}\.\d{2}\.\d{4}$/.test(rawDate))rawDate=rawDate.split('.').reverse().join('-');const date=new Date(rawDate+'T00:00:00Z');if(!/^\d{4}-\d{2}-\d{2}$/.test(rawDate)||!Number.isFinite(+date)||date.toISOString().slice(0,10)!==rawDate)throw new Error('Дата: YYYY-MM-DD или ДД.ММ.ГГГГ.');
 const url=new URL(get('url'));if(!['http:','https:'].includes(url.protocol)||url.origin!==new URL(site.baseUrl).origin||url.username||url.password||url.hash||/[?&](?:token|password|access_token|session|auth)=/i.test(url.href))throw new Error('Нужен URL этого магазина без учётных данных и секретных параметров.');
 const query=values[mapping.query!]??'';if(!query.trim()||query.length>1000)throw new Error('Запрос: от 1 до 1000 символов.');
 const num=(f:SearchField,nullable=false)=>{const raw=get(f).replace(/[\s\u00a0]/g,'').replace(',','.').replace(/%$/,'');if(!raw&&nullable)return null;if(!/^\d+(?:\.\d+)?$/.test(raw))throw new Error('Некорректное число: '+searchLabels[f]);const n=Number(raw);if(!Number.isFinite(n)||n>1e12)throw new Error('Число вне диапазона.');return n;};
 const impressions=num('impressions')!,clicks=num('clicks')!,ctr=num('ctr',true),avgPosition=num('avgPosition',true);if(!Number.isInteger(impressions)||!Number.isInteger(clicks)||clicks>impressions||ctr!=null&&ctr>100||avgPosition!=null&&avgPosition<1)throw new Error('Проверьте показы, клики, CTR и позицию.');
 if(ctr!=null&&(impressions===0?ctr!==0:Math.abs(ctr-clicks/impressions*100)>.1))throw new Error('CTR должен быть в процентах и соответствовать кликам / показам (допуск 0,1 п.п.).');
 const row={siteId:site.id,date,url:get('url'),query,normalizedQuery:normalizeQuery(query),region:get('region')||null,impressions,clicks,ctr:impressions?clicks/impressions*100:null,avgPosition,...matchUrl(get('url'),site.baseUrl,pages)};
 const identity=searchIdentity(row);if(seen.has(identity))throw new Error('Повтор identity дата / URL / запрос / регион.');seen.add(identity);records.push(row);
 }catch(e){errors.push({row:i+2,message:e instanceof Error?e.message:'Ошибка строки.'});}}
 return {records,errors,skipped,total:sheet.rows.length};
}
