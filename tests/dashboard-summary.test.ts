import test from 'node:test';
import assert from 'node:assert/strict';
import {commerceSummary} from '../src/lib/business/dashboard-summary';
import type {BusinessSummaryContext} from '../src/lib/business/context';
import {defaults} from '../src/lib/opportunities/model';
const range={from:'2026-09-09',to:'2026-10-06',days:28};
function fixture({excluded=false,nullRevenue=false,conflict=false}={}){
 const base='https://fixture.invalid/',url=base+'catalog/oil/',createdAt=new Date('2026-10-07'),mapping={sku:'A',productGroup:'G',productName:'Oil',rawUrl:url,attributesJson:{active:true},kgPerUnit:null,brand:null,category:null,import:{kind:'MAPPING'},id:'mapping',importId:'mapping',date:null,pageId:null,createdAt};
 const sale={...mapping,id:'sale',importId:'sales',date:new Date(range.to),pageId:'p',attributesJson:{businessKind:'SALES'},import:{kind:'SALES'},orders:2,quantity:3,quantityKg:4,revenue:nullRevenue?null:50};
 return {pages:[{id:'p',url,normalizedUrl:url.slice(0,-1),aliasesJson:[]},{id:'q',url:base+'catalog/other/',normalizedUrl:base+'catalog/other',aliasesJson:[]}],records:[mapping,...(conflict?[{...mapping,id:'other',sku:'B',rawUrl:base+'catalog/other/'}]:[]),...(excluded?[]:[sale])],imports:[{id:'sales',kind:'SALES',salesImportMode:'TRANSACTIONAL',coverageFrom:new Date(range.from),coverageTo:new Date(range.to),createdAt,finishedAt:createdAt}],files:[{id:'sales',kind:'SALES',sheetName:'Sales',dataJson:{sheets:[{name:'Sales',headers:['SKU'],rows:[[excluded?'A':'A']]}]}}]} as unknown as BusinessSummaryContext;
}
test('summary preserves transaction totals and unknown cells',()=>{
 const r=commerceSummary(fixture(),'https://fixture.invalid/',range,defaults);
 assert.deepEqual(r.sales,{orders:2,quantity:3,quantityKg:4,revenue:50,days:28});assert.equal(r.zeroSalesPages,0);assert.equal(r.incompleteStockKgPages,1);
 assert.equal(commerceSummary(fixture({nullRevenue:true}),'https://fixture.invalid/',range,defaults).sales?.revenue,null);
});
test('transactional absence is zero only inside confirmed coverage; rejected SKU excluded',()=>{
 const context=fixture();context.records=context.records.filter(r=>r.importId!=='sales');context.files=[];
 const zero=commerceSummary(context,'https://fixture.invalid/',range,defaults);assert.equal(zero.sales?.revenue,0);assert.equal(zero.zeroSalesPages,1);
 const outside=commerceSummary(context,'https://fixture.invalid/',{from:'2026-10-07',to:'2026-10-08',days:2},defaults);assert.equal(outside.sales,null);assert.equal(outside.zeroSalesPages,0);
 const rejected=commerceSummary(fixture({excluded:true}),'https://fixture.invalid/',range,defaults);assert.equal(rejected.sales,null);assert.equal(rejected.zeroSalesPages,0);
});
test('conflicting group mappings are not granted transactional zero coverage',()=>{
 const c=fixture({conflict:true});c.records=c.records.filter(r=>r.importId!=='sales');c.files=[];
 const r=commerceSummary(c,'https://fixture.invalid/',range,defaults);assert.equal(r.sales,null);assert.equal(r.zeroSalesPages,0);assert.equal(r.incompleteStockKgPages,0);
});
