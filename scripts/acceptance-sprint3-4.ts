import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {db} from '../src/lib/db';
import {currentSite,json} from '../src/lib/yandex/settings';
import {uploadBusiness,validateBusiness,commitBusiness,updateSalesMetadata,productRegistry} from '../src/lib/business/service';
import {prepareDataset} from '../src/lib/opportunities/dataset';
import {calculateOpportunities} from '../src/lib/opportunities/service';
import {mainTop} from '../src/lib/opportunities/top';
const target=await db.integration.findUniqueOrThrow({where:{type:'Target Site'}}),original=target.configJson;
const site=await db.site.create({data:{name:'Sprint 3.4 local fixture',baseUrl:`http://127.0.0.1:43400/${Date.now()}/`}});
const selection={sheetName:'CSV',mapping:{},dateFormat:'DMY',numericFormat:'RU'};
try{
 await db.integration.update({where:{id:target.id},data:{configJson:json({...original as object,url:site.baseUrl,baseUrl:site.baseUrl})}});assert.equal((await currentSite()).id,site.id);
 const p=await db.page.create({data:{siteId:site.id,url:site.baseUrl+'product/',normalizedUrl:site.baseUrl+'product',path:'/product/',pageType:'product'}});
 async function upload(kind:'MAPPING'|'STOCK'|'SALES',csv:string,metadata={}){const imp=await uploadBusiness(Buffer.from(csv),'fixture.csv',kind);await validateBusiness(imp.id,{...selection,...metadata});await commitBusiness(imp.id);return imp.id;}
 await upload('MAPPING',`SKU;Групповой код;Наименование группового кода;URL магазина;Кг в единице SKU\n000001;G;Товар;${p.url};180\n000002;G;Товар;${p.url};100`);
 const reg=await productRegistry(db,site.id);assert.equal(reg[0].sku.length,6);assert.equal(reg.find(r=>r.sku==='000001')!.kgPerUnit,180);
 await upload('STOCK','SKU;Дата;Остаток;Единица измерения\n000001;05.10.2026;10;шт\n000002;05.10.2026;2;шт');
 const salesId=await upload('SALES','Дата;SKU;Заказы;Количество;Количество кг;Выручка\n01.10.2026;000001;1;1;300;10000');
 const options={siteId:site.id,now:new Date('2026-10-06T12:00:00Z'),counterId:'local-no-metrika',hostId:'local-no-webmaster'};
 let x=(await prepareDataset(7,options)).pages[0].commerce!;assert.equal(x.salesComplete,false);assert.equal(x.daysOfStock,null);
 const rawBefore=JSON.stringify(await db.businessRecord.findMany({where:{importId:salesId},orderBy:{id:'asc'}}));
 await assert.rejects(updateSalesMetadata(salesId,{salesImportMode:'TRANSACTIONAL',coverageFrom:'2026-10-02',coverageTo:'2026-10-05'}),/вне заявленного/);
 await updateSalesMetadata(salesId,{salesImportMode:'TRANSACTIONAL',coverageFrom:'2026-09-29',coverageTo:'2026-10-05'});
 assert.equal(JSON.stringify(await db.businessRecord.findMany({where:{importId:salesId},orderBy:{id:'asc'}})),rawBefore);
 x=(await prepareDataset(7,options)).pages[0].commerce!;assert.equal(x.salesComplete,true);assert.equal(x.sales!.days,7);assert.equal(x.stockKg,2000);assert.equal(x.stockKgCoverage,1);assert.equal(x.daysOfStock,2000/(300/7));assert.equal(x.skus.find(s=>s.sku==='000002')!.sales!.revenue,0);
 const emptyId=await upload('SALES','Дата;SKU;Заказы;Количество;Количество кг;Выручка\n',{salesImportMode:'TRANSACTIONAL',coverageFrom:'2026-09-29',coverageTo:'2026-10-05',profileName:'Транзакционный профиль'});
 assert.equal(await db.businessRecord.count({where:{importId:emptyId}}),0);assert.equal((await db.importProfile.findUniqueOrThrow({where:{siteId_name:{siteId:site.id,name:'Транзакционный профиль'}}})).salesImportMode,'TRANSACTIONAL');
 x=(await prepareDataset(7,options)).pages[0].commerce!;assert.equal(x.sales!.quantityKg,0);assert.equal(x.sales!.revenue,0);assert.equal(x.zeroSales,true);assert.equal(x.daysOfStock,null);
 const result=await calculateOpportunities(7,options);assert.equal(result.counts.RULE_14,1);
 const opportunities=await db.opportunity.findMany({where:{siteId:site.id},orderBy:{score:'desc'}});assert.ok(mainTop(opportunities).every(o=>o.domain!=='DATA_QUALITY'));
 await calculateOpportunities(7,options);assert.equal(await db.opportunity.count({where:{siteId:site.id}}),opportunities.length);
 await updateSalesMetadata(emptyId,{salesImportMode:'PARTIAL'});x=(await prepareDataset(7,options)).pages[0].commerce!;assert.equal(x.sales!.quantityKg,300,'Empty PARTIAL does not overwrite older transactional coverage');
 await assert.rejects(updateSalesMetadata(salesId,{salesImportMode:'TRANSACTIONAL',coverageFrom:'2026-10-01',coverageTo:'2026-09-01'}));
 const unknown=await upload('SALES','Дата;SKU;Количество кг\n01.10.2026;unknown;5\n01.10.2026;000001;5');
 await updateSalesMetadata(unknown,{salesImportMode:'TRANSACTIONAL',coverageFrom:'2026-09-29',coverageTo:'2026-10-05'});
 const bad=await uploadBusiness(Buffer.from('Дата;SKU;Количество кг\n01.10.2026;000001;bad'),'fixture.csv','SALES');await assert.rejects(validateBusiness(bad.id,{...selection,salesImportMode:'TRANSACTIONAL',coverageFrom:'2026-09-29',coverageTo:'2026-10-05'}),/содержит ошибки/);
 const report={status:'PASS',siteId:site.id,pageId:p.id,salesId,emptyId,opportunityId:opportunities.find(o=>o.ruleId==='RULE_14')!.id,metadataPreservesRawRecords:true,zeroFillCreatesNoRows:true,leadingZeros:true,kgPerUnit:true,daysOfStock:2000/(300/7),zeroSalesOverstock:true,profileRemembersMode:true,repeatWithoutDuplicates:true};writeFileSync('test-results/sprint3-4-acceptance.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{await db.integration.update({where:{id:target.id},data:{configJson:json(original)}});await db.$disconnect();}
