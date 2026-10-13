import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import ExcelJS from "exceljs";
import { db } from "../src/lib/db";
import { currentSite, json } from "../src/lib/yandex/settings";
import { uploadBusiness, validateBusiness, commitBusiness } from "../src/lib/business/service";
import { suggestedMapping } from "../src/lib/business/import";
import { calculateOpportunities } from "../src/lib/opportunities/service";
import { period, day, shift, days } from "../src/lib/yandex/dates";
const target=await db.integration.findUnique({where:{type:"Target Site"}}),original=target?.configJson;
const site=await db.site.create({data:{name:"Sprint 3 local fixture",baseUrl:`http://127.0.0.1:41003/${Date.now()}/`}});
try{
  assert.ok(target);await db.integration.update({where:{id:target.id},data:{configJson:json({baseUrl:site.baseUrl})}});
  // Resolve the exact existing settings key without creating a new matching path.
  if((await currentSite()).id!==site.id) {
    const old=original as Record<string,unknown>;
    await db.integration.update({where:{id:target.id},data:{configJson:json({...old,url:site.baseUrl,baseUrl:site.baseUrl})}});
  }
  assert.equal((await currentSite()).id,site.id);
  const pages=await Promise.all([0,1,2].map(i=>db.page.create({data:{siteId:site.id,url:`${site.baseUrl}product-${i}/`,normalizedUrl:`${site.baseUrl}product-${i}`,path:`/product-${i}`,pageType:"product"}})));
  const scan=await db.scan.create({data:{siteId:site.id,mode:"IMPORT",status:"COMPLETED",finishedAt:new Date()}});
  for(const p of pages){const s=await db.scanPage.create({data:{scanId:scan.id,pageId:p.id,source:"IMPORT",statusCode:200,title:"Товар",description:null,h1:"Товар",wordCount:50,indexable:true}});await db.page.update({where:{id:p.id},data:{latestScanPageId:s.id}});}
  const integration=await db.integration.upsert({where:{type:`Sprint3 fixture:${site.id}`},create:{type:`Sprint3 fixture:${site.id}`},update:{}});
  const dates=period(28),range=days(shift(dates.from,-28),dates.to);
  const job=await db.jobRun.create({data:{siteId:site.id,integrationId:integration.id,source:"FIXTURE",mode:"INITIAL",status:"COMPLETED",dateFrom:day(range[0]),dateTo:day(range.at(-1)!)}});
  await db.metrikaPageDaily.createMany({data:pages.flatMap((p,i)=>range.map(date=>({siteId:site.id,pageId:p.id,counterId:"fixture",date:day(date),url:p.url,normalizedUrl:p.normalizedUrl,rowKey:p.id,visits:100,visitors:80,pageviews:120,goalConversionsJson:json({g:i===0?0:10}),matchStatus:"MATCHED",jobRunId:job.id})))});
  await db.webmasterQueryDaily.createMany({data:pages.flatMap((p,i)=>range.map(date=>({siteId:site.id,pageId:p.id,hostId:"fixture",date:day(date),url:p.url,normalizedUrl:p.normalizedUrl,rowKey:p.id,query:"тестовый запрос",impressions:100,clicks:i===0?1:10,avgPosition:8,matchStatus:"MATCHED",jobRunId:job.id})))});
  const book=new ExcelJS.Workbook();book.addWorksheet("Описание").addRow(["Документ для локальной приёмки"]);const sheet=book.addWorksheet("Данные");sheet.addRow(["URL","SKU","Цена","Наличие","Приоритет","Дата","Заказы","Выручка","Мой параметр"]);
  for(const date of range)sheet.addRow([pages[0].url,"fixture-sku","1 234,56","Нет","80",date,date>=dates.from?1:10,date>=dates.from?10:100,"сохранено"]);
  sheet.addRows([["","sku-only","10","Да","","","","","не сопоставлено"],[`${site.baseUrl}missing/`,"missing","10","Да","","","","","не сопоставлено"],[pages[0].url,"bad","oops","Да","","","","","ошибка"],[pages[0].url,"formula",{formula:"1+1",result:2},"Да","","","","","ошибка"]]);
  const buffer=Buffer.from(await book.xlsx.writeBuffer());writeFileSync("test-results/sprint3-import-fixture.xlsx",buffer);
  const draft=await uploadBusiness(buffer,"sprint3-import-fixture.xlsx");assert.equal(await db.businessRecord.count({where:{importId:draft.id}}),0);
  // Stored workbook headers use zero-based column indexes.
  const headers=(draft.dataJson as unknown as {sheets:{name:string;headers:string[]}[]}).sheets.find(s=>s.name==="Данные")!.headers;
  const selection={sheetName:"Данные",mapping:suggestedMapping(headers),dateFormat:"ISO",numericFormat:"RU",profileName:"Еженедельная выгрузка"};
  const preview=await validateBusiness(draft.id,selection);assert.equal(preview.errors.length,2);assert.equal(preview.matched,56);assert.equal(preview.unmatched,2);
  const imported=await commitBusiness(draft.id);assert.equal(imported.rowsImported,58);assert.equal(imported.rowsErrors,2);assert.ok(imported.profileId);assert.equal(await db.importProfile.count({where:{siteId:site.id}}),1);
  await Promise.all([commitBusiness(draft.id),commitBusiness(draft.id)]);assert.equal(await db.businessRecord.count({where:{importId:draft.id}}),58);
  const repeat=await uploadBusiness(buffer,"repeat.xlsx");await validateBusiness(repeat.id,{...selection,profileName:undefined,profileId:imported.profileId!});await commitBusiness(repeat.id);assert.equal(await db.import.count({where:{siteId:site.id}}),2);
  const options={siteId:site.id,counterId:"fixture",hostId:"fixture",primaryGoals:["g"],goalConfig:{goals:[{id:"g",name:"Тестовая покупка"}],goalTypes:{g:"BUSINESS_CONVERSION" as const}}},first=await calculateOpportunities(28,options);
  assert.equal(first.dataset.pages[0].business?.sales?.orders??first.dataset.pages.find(p=>p.id===pages[0].id)!.business!.sales!.orders,28);
  assert.ok(first.signals>=8);const count=await db.opportunity.count({where:{siteId:site.id}}),o=await db.opportunity.findFirstOrThrow({where:{siteId:site.id},orderBy:{score:"desc"}});
  await db.opportunity.update({where:{id:o.id},data:{status:"DISMISSED"}});await calculateOpportunities(28,options);assert.equal(await db.opportunity.count({where:{siteId:site.id}}),count);assert.equal((await db.opportunity.findUniqueOrThrow({where:{id:o.id}})).status,"DISMISSED");
  const snapshot=JSON.stringify((await db.opportunity.findUniqueOrThrow({where:{id:o.id}})).evidenceJson);await db.metrikaPageDaily.updateMany({where:{siteId:site.id},data:{visits:50}});assert.equal(JSON.stringify((await db.opportunity.findUniqueOrThrow({where:{id:o.id}})).evidenceJson),snapshot);
  await db.opportunity.update({where:{id:o.id},data:{status:"ACTIVE"}});
  writeFileSync("test-results/sprint3-acceptance.json",JSON.stringify({status:"PASS",siteId:site.id,importId:draft.id,repeatImportId:repeat.id,profileId:imported.profileId,pageId:pages[0].id,opportunityId:o.id,imports:2,recordsPerImport:58,rowErrors:2,matched:56,unmatched:2,opportunities:count,rules:first.counts},null,2));console.log("Sprint 3 fixture acceptance PASS: XLSX, preview, mapping, profile/replay, malformed rows, business aggregation, rules, snapshot, dedup, dismissal/restore.");
}finally{if(target&&original)await db.integration.update({where:{id:target.id},data:{configJson:original}});await db.$disconnect();}
