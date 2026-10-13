import 'server-only';
import {db} from '../db';
import type {BusinessSummaryContext} from './context';
import {mappingRegistry} from './typed-import';
import {groupBy} from '../yandex/views';
import {productRegistry} from './service';
import {matchUrl,urlMatcher} from '../yandex/matching';
import {latestRows,fresh,attribute} from '../opportunities/commerce';
import {loadRulesConfig} from '../opportunities/dataset';
import {shift,yesterday} from '../yandex/dates';
import type {Workbook} from './import';
async function readBusinessQuality(site:{id:string;baseUrl:string},now=new Date(),context?:BusinessSummaryContext,details=true){
  const [registry,records,pages,imports,c]=await Promise.all([context?mappingRegistry(context.records.filter(r=>r.import.kind==='MAPPING')):productRegistry(db,site.id),context?.records??db.businessRecord.findMany({where:{siteId:site.id,import:{status:{in:['COMPLETED','COMPLETED_WITH_ERRORS']}}},include:{import:{select:{kind:true}}},orderBy:[{createdAt:'desc'},{id:'desc'}]}),context?.pages??db.page.findMany({where:{siteId:site.id,active:true},select:{id:true,url:true,normalizedUrl:true,aliasesJson:true}}),context?.files??db.import.findMany({where:{siteId:site.id,kind:{in:['STOCK','PRICES','SALES']},status:{in:['COMPLETED','COMPLETED_WITH_ERRORS']}},select:{id:true,kind:true,dataJson:true}}),loadRulesConfig(site.id)]);
  const match=urlMatcher(site.baseUrl,pages);
  const today=shift(yesterday(now),1),known=new Set(registry.map(p=>p.sku)),linked=registry.map(p=>({...p,pageId:match(p.rawUrl).pageId})),groups=new Set(registry.map(p=>p.productGroup)),mappedGroups=new Set(linked.filter(p=>p.pageId).map(p=>p.productGroup));
  const unknown=new Set(records.filter(r=>r.sku&&!known.has(r.sku)).map(r=>r.sku!));
  const unknownByKind:Record<string,Set<string>>={STOCK:new Set(),PRICES:new Set(),SALES:new Set()};
  for(const imp of imports){const workbook=imp.dataJson as unknown as Workbook;if(!Array.isArray(workbook?.sheets))continue;for(const sheet of workbook.sheets){const index=sheet.headers.findIndex(h=>h.trim().toLowerCase()==='sku');if(index<0)continue;for(const row of sheet.rows){const sku=row[index]?.trim();if(sku&&!known.has(sku)){unknown.add(sku);unknownByKind[imp.kind]?.add(sku);}}}}
  const commercial=records.map(r=>({...r,kind:r.import.kind})),bySku=groupBy(commercial,r=>r.sku??'');
  const summary=(type:'STOCK'|'PRICES',max:number)=>{const rows=registry.flatMap(p=>latestRows((bySku.get(p.sku)??[]),type,today));return {currentRecords:rows.length,outdated:rows.filter(r=>!fresh(r.date?.toISOString().slice(0,10)??null,today,max).fresh).length,unknownSku:unknownByKind[type].size};};
  const sales=records.filter(r=>r.import.kind==='SALES'),dates=sales.flatMap(r=>r.date?[r.date.toISOString().slice(0,10)]:[]).sort();
  const missingGroups=[...groups].filter(g=>!mappedGroups.has(g)),withoutGroup=[...new Set(records.filter(r=>r.sku&&!r.productGroup).map(r=>r.sku!))];
  const salesSkus=new Set(sales.map(r=>r.sku)),pagesWithoutSales=details?[...new Set(linked.filter(p=>p.pageId&&!salesSkus.has(p.sku)).map(p=>p.pageId!))].filter(id=>!linked.some(p=>p.pageId===id&&salesSkus.has(p.sku))).map(id=>pages.find(p=>p.id===id)!.url):[];
  const price=summary('PRICES',c.priceFreshDays),anomalies=details?[...new Set(linked.filter(p=>p.pageId).map(p=>p.productGroup))].filter(code=>{const skus=linked.filter(p=>p.productGroup===code),rows=skus.flatMap(p=>latestRows((bySku.get(p.sku)??[]),'PRICES',today));if(skus.length<2||!rows.length||rows.some(r=>attribute(r,'Валюта')&&!/^RUB$/i.test(attribute(r,'Валюта'))))return false;const values=rows.map(r=>Number(r.price));return Math.min(...values)===0?Math.max(...values)>0:Math.max(...values)/Math.min(...values)>c.priceRatio;}).length:0;
  return {mapping:{totalSku:registry.length,withCoefficient:registry.filter(p=>p.kgPerUnit!=null).length,withoutCoefficient:registry.filter(p=>p.kgPerUnit==null).length,mappedSku:linked.filter(p=>p.pageId).length,productGroups:groups.size,groupsWithPage:mappedGroups.size,unmatchedGroups:missingGroups.length},stock:summary('STOCK',c.stockFreshDays),prices:{...price,anomalies},sales:{first:dates[0]??null,last:dates.at(-1)??null,totalRows:sales.length,skuCoverage:salesSkus.size,totalSku:known.size,unknownSku:unknownByKind.SALES.size},unmatched:{skuWithoutGroup:withoutGroup,groupsWithoutPage:missingGroups,importedUnknownSku:[...unknown].sort(),pagesWithoutSales}};
}
export function businessQuality(site:{id:string;baseUrl:string},now=new Date(),context?:BusinessSummaryContext){return readBusinessQuality(site,now,context,true);}
/** Omit uncomputed diagnostics, rather than exposing their placeholders as zeros. */
export async function businessQualitySummary(site:{id:string;baseUrl:string},now=new Date(),context?:BusinessSummaryContext){
 const {mapping,stock,prices,sales,unmatched}=await readBusinessQuality(site,now,context,false);
 const {anomalies,...priceSummary}=prices;
 return {mapping,stock,prices:priceSummary,sales,unmatched:{importedUnknownSku:unmatched.importedUnknownSku}};
}

