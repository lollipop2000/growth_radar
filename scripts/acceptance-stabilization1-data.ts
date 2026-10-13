import assert from 'node:assert/strict';
import {db} from '../src/lib/db';
import {prepareDataset} from '../src/lib/opportunities/dataset';
import {commerceForPage} from '../src/lib/opportunities/page-commerce';
import {searchDataset,analyticsSearchDataset,analyticsSearchSelect} from '../src/lib/search/dataset';
import {seoDataset} from '../src/lib/seo-actions/service';
import {normalizeUrl} from '../src/lib/scanner/url';
import {day,period,shift} from '../src/lib/yandex/dates';
const site=await db.site.create({data:{name:'Stabilization equivalence fixture',baseUrl:`http://127.0.0.1:48999/equivalence-${Date.now()}/`}});
const pages:Awaited<ReturnType<typeof db.page.create>>[]=[];for(const name of ['one','two','conflict']){const url=site.baseUrl+name+'/';pages.push(await db.page.create({data:{siteId:site.id,url,normalizedUrl:normalizeUrl(url),path:new URL(url).pathname,aliasesJson:name==='one'?[normalizeUrl(site.baseUrl+'old/')]:[]}}));}
const mapping=await db.import.create({data:{siteId:site.id,kind:'MAPPING',filename:'fixture.csv',status:'COMPLETED',sizeBytes:1}}),stock=await db.import.create({data:{siteId:site.id,kind:'STOCK',filename:'fixture.csv',status:'COMPLETED',sizeBytes:1}});
let row=1;for(const [sku,group,url,active]of [['sku1','group1',pages[0].url,true],['sku2','group1',site.baseUrl+'old/',true],['sku3','ambiguous',pages[0].url,true],['sku4','ambiguous',pages[1].url,true],['sku5','inactive',pages[0].url,false]]){await db.businessRecord.create({data:{siteId:site.id,importId:mapping.id,rowNumber:row++,sku:String(sku),productGroup:String(group),productName:String(sku),rawUrl:String(url),attributesJson:{active}}});}
await db.businessRecord.create({data:{siteId:site.id,importId:stock.id,rowNumber:1,sku:'sku1',stock:20,date:day(period(28).to),attributesJson:{'Единица измерения':'кг'}}});
const sales=await db.import.create({data:{siteId:site.id,kind:'SALES',filename:'fixture.csv',status:'COMPLETED_WITH_ERRORS',sizeBytes:1,salesImportMode:'TRANSACTIONAL',coverageFrom:day(period(28).from),coverageTo:day(period(28).to),sheetName:'CSV',dataJson:{sheets:[{name:'CSV',headers:['SKU'],rows:[['sku1'],['sku2'],['rejected-sku']]}]}}});
await db.businessRecord.create({data:{siteId:site.id,importId:sales.id,rowNumber:1,sku:'sku1',date:day(period(28).to),quantityKg:0,revenue:0,attributesJson:{businessKind:'SALES'}}});
const d=await prepareDataset(28,{siteId:site.id});for(const p of d.pages){const actual=await commerceForPage(p.id,28);assert.deepEqual(JSON.parse(JSON.stringify(actual.commerce)),JSON.parse(JSON.stringify(p.commerce)));assert.deepEqual(JSON.parse(JSON.stringify(actual.business)),JSON.parse(JSON.stringify(p.business)));}
const start=period(28).from,month=start.slice(0,7)+'-01',to=period(28).to;
for(const [grain,date,impressions,pageId]of [['MONTH',month,100,pages[0].id],['DAY',start,3,pages[0].id]])await db.webmasterQueryDaily.create({data:{siteId:site.id,hostId:'fixture',date:day(String(date)),url:pages[0].url,normalizedUrl:pages[0].normalizedUrl,query:'fixture query',normalizedQuery:'fixture query',rowKey:String(grain),grain:String(grain),periodMonth:grain==='MONTH'?month.slice(0,7):null,impressions:Number(impressions),clicks:1,source:'WEBMASTER_IMPORT',pageId:String(pageId)}});
const expected=await searchDataset({siteId:site.id,date:{gte:day(start),lte:day(to)}}),seo=await seoDataset(28,{siteId:site.id});assert.deepEqual(seo.rows,expected);
// API precedence must survive page-local reads if the winning duplicate is unmatched.
await db.webmasterQueryDaily.create({data:{siteId:site.id,hostId:'fixture',date:day(start),url:pages[0].url,normalizedUrl:pages[0].normalizedUrl,query:'fixture query',normalizedQuery:'fixture query',rowKey:'API',grain:'DAY',impressions:7,clicks:1,source:'WEBMASTER_API',pageId:null}});
const siteRows=await searchDataset({siteId:site.id,date:{gte:day(start),lte:day(to)}},'fixture'),pageRows=await searchDataset({siteId:site.id,pageId:pages[0].id,date:{gte:day(start),lte:day(to)}},'fixture');assert.deepEqual(pageRows,siteRows.filter(r=>r.pageId===pages[0].id));
for(const host of [undefined,'fixture','foreign']){
 const where={siteId:site.id,date:{gte:day(month),lte:day(to)}},wide=await searchDataset(where,host),narrow=await analyticsSearchDataset(where,host);
 const projected=wide.map(r=>Object.fromEntries(Object.keys(analyticsSearchSelect).map(k=>[k,r[k as keyof typeof r]])));
 assert.deepEqual(narrow,projected,'SQL summary transport preserves every effective field and host filtering');
}
console.log('PASS page Commerce mapping/aliases/inactive/ambiguous groups and Search current capture/precedence');await db.$disconnect();
