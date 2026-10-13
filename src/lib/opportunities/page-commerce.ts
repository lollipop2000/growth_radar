import 'server-only';
import {db} from '../db';
import {mappingRegistry} from '../business/typed-import';
import {businessRevisionSelect,confirmedStatuses} from '../business/revision';
import type {Workbook} from '../business/import';
import {normalizeUrl} from '../scanner/url';
import {matchUrl} from '../yandex/matching';
import {config,readIntegration} from '../yandex/settings';
import {goalConfig} from '../yandex/goal-types';
import {day,shift} from '../yandex/dates';
import {trafficAggregate,businessAggregate} from './aggregate';
import {commerceProfile} from './commerce';
import {searchRange} from '../search/periods';
import {loadRulesConfig} from './dataset';
/** Page-local read. Group ambiguity and latest mapping per SKU retain the calculation rules. */
export async function commerceForPage(pageId:string,n=28){
 const page=await db.page.findUniqueOrThrow({where:{id:pageId},include:{site:true}}),current=searchRange(n,[]),previous={from:shift(current.from,-n),to:shift(current.from,-1),days:n},siteId=page.siteId;
 if(!page.active)return {commerce:null,business:null,traffic:null,previousTraffic:null,period:current,previous};
 const aliases=Array.isArray(page.aliasesJson)?page.aliasesJson.filter((v):v is string=>typeof v==='string'):[],identities=[page.normalizedUrl,...aliases];
 const mappingWhere={siteId,import:{kind:'MAPPING',status:{in:confirmedStatuses}}};
 const seeds=await db.businessRecord.findMany({where:{...mappingWhere,OR:[{pageId},{normalizedUrl:{in:identities}},{normalizedUrl:null}]},select:{productGroup:true,rawUrl:true}});
 const groups=[...new Set(seeds.flatMap(r=>{try{return r.productGroup&&r.rawUrl&&identities.includes(normalizeUrl(r.rawUrl,page.site.baseUrl))?[r.productGroup]:[];}catch{return [];}}))];
 const groupRows=groups.length?await db.businessRecord.findMany({where:{...mappingWhere,productGroup:{in:groups}},orderBy:[{createdAt:'desc'},{id:'desc'}]}):[];
 const skuIds=[...new Set(groupRows.flatMap(r=>r.sku?[r.sku]:[]))];
 // Include newer mappings of these SKUs to other groups before choosing the winning mapping.
 const mappingRows=skuIds.length?await db.businessRecord.findMany({where:{...mappingWhere,sku:{in:skuIds}},orderBy:[{createdAt:'desc'},{id:'desc'}]}):[];
 const registry=mappingRegistry(mappingRows).filter(r=>r.active&&groups.includes(r.productGroup)),urls=[...new Set(registry.map(r=>normalizeUrl(r.rawUrl,page.site.baseUrl)))];
 const matchPages=urls.length?await db.page.findMany({where:{siteId,active:true,OR:[{normalizedUrl:{in:urls}},...urls.map(url=>({aliasesJson:{array_contains:[url]}}))]},select:{id:true,normalizedUrl:true,aliasesJson:true}}):[];
 const groupPages=new Map<string,Set<string|null>>();for(const p of registry){const ids=groupPages.get(p.productGroup)??new Set();ids.add(matchUrl(p.rawUrl,page.site.baseUrl,matchPages).pageId);groupPages.set(p.productGroup,ids);}
 const products=registry.filter(p=>{const ids=groupPages.get(p.productGroup)!;return ids.size===1&&ids.has(pageId);});
 const [records,mi,c,imports]=await Promise.all([
 db.businessRecord.findMany({where:{siteId,import:{status:{in:confirmedStatuses}},OR:[{pageId},{sku:{in:products.map(p=>p.sku)}}]},include:{import:{select:{kind:true}}},orderBy:[{createdAt:'desc'},{id:'desc'}]}),readIntegration('METRIKA'),loadRulesConfig(siteId),
 products.length?db.import.findMany({where:{siteId,kind:'SALES',status:{in:confirmedStatuses}},select:{...businessRevisionSelect,sheetName:true,dataJson:true}}):[]
 ]);
 const m=config(mi?.configJson),counter=m.siteId===siteId&&m.counterId===process.env.YANDEX_METRIKA_COUNTER_ID?m.counterId:undefined;
 const trafficRows=counter?await db.metrikaPageDaily.findMany({where:{siteId,pageId,counterId:counter,date:{gte:day(previous.from),lte:day(current.to)}},select:{date:true,visits:true,visitors:true,goalConversionsJson:true}}):[];
 const traffic=trafficAggregate(trafficRows.filter(r=>r.date>=day(current.from)),goalConfig(counter?m:{})),previousTraffic=trafficAggregate(trafficRows.filter(r=>r.date<day(current.from)),goalConfig(counter?m:{}));
 const salesSkus=imports.length?await db.businessRecord.findMany({where:{importId:{in:imports.map(i=>i.id)},sku:{in:products.map(p=>p.sku)}},select:{importId:true,sku:true}}):[];
 const selectedSkus=new Set(products.map(p=>p.sku));
 const salesImports=imports.map(i=>{const stored=new Set(salesSkus.filter(r=>r.importId===i.id).map(r=>r.sku)),sheet=(i.dataJson as unknown as Workbook)?.sheets?.find(s=>s.name===i.sheetName),index=sheet?.headers.findIndex(h=>h.trim().toLowerCase()==='sku')??-1;return {...i,excludedSkus:index>=0?[...new Set(sheet!.rows.map(r=>r[index]?.trim()).filter(s=>s&&selectedSkus.has(s)&&!stored.has(s)))]:[]};});
 const skuSet=new Set(products.map(p=>p.sku)),commerce=commerceProfile(products,records.filter(r=>skuSet.has(r.sku??'')).map(r=>({...r,kind:r.import.kind})),current,previous,c,shift(current.to,1),traffic,previousTraffic,salesImports);
 const business=businessAggregate(records.filter(r=>r.pageId===pageId),current,previous);
 if(business&&commerce){business.stock=commerce.freshness.stock.fresh?commerce.stock:null;business.price=commerce.priceAvg;business.available=commerce.available;business.sales=commerce.sales;business.previousSales=commerce.previousSales;business.productGroup=commerce.groups.map(g=>g.code).join(', ');}
 return {commerce,business,traffic,previousTraffic,period:current,previous};
}
