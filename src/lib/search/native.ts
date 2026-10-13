import type {Sheet} from '../business/import';
import {matchUrl,type MatchPage} from '../yandex/matching';
import {normalizeQuery,searchIdentity} from './model';
export const nativePattern=/^(\d{4}-\d{2})_(shows|position|demand|ctr|clicks)$/;
type Metric='shows'|'position'|'demand'|'ctr'|'clicks';
export function nativeFormat(headers:string[]){
 const query=headers.findIndex(h=>h.trim().toLowerCase()==='query'),url=headers.findIndex(h=>h.trim().toLowerCase()==='url'),blocks=new Map<string,Partial<Record<Metric,number>>>(),duplicates:string[]=[];
 headers.forEach((h,i)=>{const m=nativePattern.exec(h.trim());if(!m)return;const b=blocks.get(m[1])??{},key=m[2] as Metric;if(b[key]!=null)duplicates.push(h);b[key]=i;blocks.set(m[1],b);});
 const detected=query>=0&&url>=0&&[...blocks.values()].some(b=>b.shows!=null&&b.position!=null);
 const validMonth=(m:string)=>/^\d{4}-(0[1-9]|1[0-2])$/.test(m)&&Number(m.slice(0,4))>0;
 return {detected,query,url,blocks,months:[...blocks.keys()].filter(validMonth).sort(),invalidMonths:[...blocks.keys()].filter(m=>!validMonth(m)),duplicates};
}
export function monthEnd(month:string){const d=new Date(month+'-01T00:00:00Z');d.setUTCMonth(d.getUTCMonth()+1);d.setUTCDate(0);return d.toISOString().slice(0,10);}
export function resolveNativeUrl(raw:string,base:string){const u=new URL(raw,new URL(base).origin+'/');if(!raw.trim()||!['https:','http:'].includes(u.protocol)||u.origin!==new URL(base).origin||u.username||u.password||u.hash||/[?&](?:token|password|access_token|session|auth)=/i.test(u.href))throw new Error('URL другого origin или URL с учётными/секретными данными.');return u.href;}
export function validateNative(sheet:Sheet,site:{id:string;baseUrl:string},pages:MatchPage[]){
 const f=nativeFormat(sheet.headers);if(!f.detected)throw new Error('Не обнаружены Query, Url и месячный блок shows / position.');if(f.duplicates.length)throw new Error('Повторные колонки месяца: '+f.duplicates.join(', '));
 const records=[],errors:{row:number;month?:string;message:string}[]=[],seen=new Set<string>(),matchCache=new Map<string,ReturnType<typeof matchUrl>>(),badRows=new Set<number>(),goodRows=new Set<number>();
 let skipped=0,relativeUrls=0,foreignUrls=0,emptyQueries=0,invalidValues=0,clicksExceedShows=0;
 const error=(row:number,month:string|undefined,message:string)=>{badRows.add(row);if(errors.length<500)errors.push({row,month,message});};
 for(const [i,values] of sheet.rows.entries()){
  const row=i+2,query=values[f.query]??'',raw=values[f.url]??'';let url:string;
  if(!values.some(v=>v.trim())){skipped+=f.months.length;continue;}
  try{if([query,raw].some(v=>v==='[FORMULA_NOT_SUPPORTED]'||v==='[INVALID_CELL]'))throw new Error('Формулы и сложные ячейки идентификаторов не импортируются.');if(!query.trim()||query.length>1000){emptyQueries++;throw new Error('Пустой или слишком длинный запрос.');}if(!/^https?:\/\//i.test(raw))relativeUrls++;url=resolveNativeUrl(raw,site.baseUrl);}
  catch(e){if(query.trim())foreignUrls++;error(row,undefined,e instanceof Error?e.message:'Ошибка URL.');skipped+=f.months.length;continue;}
  const match=matchCache.get(url)??matchUrl(url,site.baseUrl,pages);matchCache.set(url,match);
  for(const month of f.months){const b=f.blocks.get(month)!,valuesForMonth=Object.values(b).map(index=>values[index!]??'');if(valuesForMonth.every(v=>!v.trim())){skipped++;continue;}
   try{
    const num=(key:Metric,required=false)=>{const rawValue=b[key]==null?'':(values[b[key]!]??'').trim().replace(/[\s\u00a0\u202f]/g,'').replace(',','.').replace(/%$/,'');if(!rawValue&&!required)return null;if(!/^\d+(?:\.\d+)?$/.test(rawValue))throw new Error('Неизвестное или некорректное значение '+key);const n=Number(rawValue);if(!Number.isFinite(n)||n>1e12)throw new Error('Число вне диапазона '+key);return n;};
    const impressions=num('shows',true)!,clicks=num('clicks',true)!,position=num('position'),ctr=num('ctr'),demand=num('demand');if(!Number.isInteger(impressions)||!Number.isInteger(clicks))throw new Error('Показы и клики должны быть целыми.');if(position!=null&&position>0&&position<1)throw new Error('Позиция должна быть не меньше 1.');if(clicks>impressions)clicksExceedShows++;
    const observation={siteId:site.id,grain:'MONTH',periodMonth:month,date:new Date(month+'-01T00:00:00Z'),url,query,normalizedQuery:normalizeQuery(query),region:null,impressions,clicks,avgPosition:position===0?null:position,ctr,demand,...match};
    const identity=searchIdentity(observation);if(seen.has(identity))throw new Error('Повтор месяца / URL / запроса.');seen.add(identity);records.push(observation);goodRows.add(row);
   }catch(e){invalidValues++;skipped++;error(row,month,e instanceof Error?e.message:'Ошибка метрик.');}
  }
 }
 const urls=new Set(records.map(r=>r.url)),unmatchedUrls=new Set(records.filter(r=>!r.pageId).map(r=>r.url));
 const summary={format:'YANDEX_NATIVE_MONTHLY',grain:'MONTH',excelRows:sheet.rows.length,months:f.months,periodFrom:f.months[0]?f.months[0]+'-01':null,periodTo:f.months.at(-1)?monthEnd(f.months.at(-1)!):null,observations:records.length,validRows:[...goodRows].filter(row=>!badRows.has(row)).length,rejectedRows:badRows.size,rejectedObservations:invalidValues,skippedObservations:skipped,invalidMonths:f.invalidMonths,missingColumns:f.months.flatMap(m=>['shows','position','clicks'].filter(k=>f.blocks.get(m)![k as Metric]==null).map(k=>m+'_'+k)),relativeUrls,foreignUrls,emptyQueries,invalidValues,clicksExceedShows,rawQueries:new Set(records.map(r=>r.query)).size,queries:new Set(records.map(r=>r.normalizedQuery)).size,urls:urls.size,matchedPages:new Set(records.flatMap(r=>r.pageId?[r.pageId]:[])).size,matchedUrls:urls.size-unmatchedUrls.size,unmatchedUrls:unmatchedUrls.size};
 return {records,errors,skipped,total:sheet.rows.length,summary};
}
