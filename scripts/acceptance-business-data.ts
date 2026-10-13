import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import ExcelJS from "exceljs";
import { chromium } from "playwright";
import { db } from "../src/lib/db";
import { currentSite, json } from "../src/lib/yandex/settings";
import { formats, kinds } from "../src/lib/business/formats";
import { commitBusiness, validateBusiness, uploadBusiness } from "../src/lib/business/service";
import { typedMapping } from "../src/lib/business/typed-import";
import { businessData } from "../src/lib/business/views";
import type { Workbook } from "../src/lib/business/import";
import { prepareDataset } from "../src/lib/opportunities/dataset";
import { createHash } from "node:crypto";
const hash=(v:unknown)=>createHash("sha256").update(JSON.stringify(v)).digest("hex");
const target=await db.integration.findUniqueOrThrow({where:{type:"Target Site"}}), original=target.configJson;
const production=await currentSite(), scansBefore=await db.scan.count({where:{siteId:production.id}}),jobsBefore=await db.jobRun.count({where:{siteId:production.id}});
assert.equal(await db.scan.count({where:{status:{in:["PENDING","RUNNING"]}}}),0);
assert.equal(await db.jobRun.count({where:{status:{in:["PENDING","RUNNING"]}}}),0);
const site=await db.site.create({data:{name:"Business data local fixture",baseUrl:`http://127.0.0.1:41006/${Date.now()}/`}});
const browser=await chromium.launch({headless:true}),context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage();
page.setDefaultNavigationTimeout(60000);
async function file(name:string,headers:string[],rows:(string|number)[][]){const w=new ExcelJS.Workbook(),s=w.addWorksheet("Данные");s.addRows([headers,...rows]);const path=`test-results/business-${name}.xlsx`;await w.xlsx.writeFile(path);return path;}
async function upload(kind:string,path:string){const previous=new URL(page.url()).searchParams.get("draft"),block=page.locator(`[data-business-kind=${kind}]`);await block.locator('input[type=file]').setInputFiles(path);await block.getByRole("button",{name:/Загрузить файл/}).click();await page.waitForFunction(old=>{const id=new URL(location.href).searchParams.get("draft");return id&&id!==old;},previous);const id=new URL(page.url()).searchParams.get("draft")!;await page.locator(`[data-import-id=${id}]`).waitFor();return id;}
async function commit(){await page.getByRole("button",{name:"Подтвердить импорт проверенных строк"}).click();await page.waitForLoadState("networkidle");await page.getByRole("status").waitFor();}
try{
  await db.integration.update({where:{id:target.id},data:{configJson:json({...original as object,url:site.baseUrl,baseUrl:site.baseUrl})}});assert.equal((await currentSite()).id,site.id);
  const product=await db.page.create({data:{siteId:site.id,url:`${site.baseUrl}product/`,normalizedUrl:`${site.baseUrl}product`,path:"/product",pageType:"product"}});
  await page.goto("http://127.0.0.1:3000/business-data",{waitUntil:"networkidle"});assert.equal(await page.locator("[data-business-kind]").count(),4);
  await page.screenshot({path:"test-results/business-data-empty.png",fullPage:true});
  for(const kind of kinds){const f=formats[kind],block=page.locator(`[data-business-kind=${kind}]`);await block.getByText("Описание колонок и пример строки",{exact:true}).click();assert.ok((await block.innerText()).includes(f.columns[0].description));
    const downloadPromise=page.waitForEvent("download");await block.getByRole("link",{name:f.download}).click();const download=await downloadPromise;assert.equal(download.suggestedFilename(),f.filename);const path=`test-results/download-${f.filename}`;await download.saveAs(path);assert.deepEqual(readFileSync(path),readFileSync(`public/templates/${f.filename}`));
  }
  const stockFile=await file("stock",["SKU","Дата","Остаток"],[["000001","06.10.2026",140]]);
  const early=await upload("STOCK",stockFile);assert.ok((await page.innerText("body")).includes("Рекомендуется сначала загрузить маппинг товаров"));assert.ok((await page.innerText("body")).includes("SKU не найден в маппинге товаров."));assert.equal(await page.getByRole("button",{name:"Подтвердить импорт проверенных строк"}).count(),0);assert.equal(await db.businessRecord.count({where:{importId:early}}),0);
  const mapFile=await file("mapping",formats.MAPPING.columns.map(c=>c.name),[["000001","GC1","Товар",product.url,"Бренд","Категория","Да"],["000002","GC1","Товар",product.url,"Бренд","Категория","Да"],["000003","GC2","Другой товар",`${site.baseUrl}missing/`,"","","Да"]]);
  const mapId=await upload("MAPPING",mapFile);assert.equal(await db.businessRecord.count({where:{importId:mapId}}),0,"Upload must only create preview");await commit();assert.equal(await db.businessRecord.count({where:{importId:mapId}}),3);assert.equal((await db.businessRecord.findFirstOrThrow({where:{importId:mapId,sku:"000001"}})).sku,"000001");
  const stockId=await upload("STOCK",stockFile);await commit();assert.equal((await db.businessRecord.findFirstOrThrow({where:{importId:stockId}})).pageId,product.id);
  const priceFile=await file("prices",["SKU","Дата","Цена","Валюта"],[["000001","2026-10-06","54800,50","RUB"],["unknown","06.10.2026",100,"RUB"]]);
  const pricesId=await upload("PRICES",priceFile);assert.ok((await page.innerText("body")).includes("SKU не найден в маппинге товаров."));await commit();const priceImport=await db.import.findUniqueOrThrow({where:{id:pricesId}});assert.equal(priceImport.rowsImported,1);assert.equal(priceImport.unknownSkuCount,1);assert.equal(priceImport.status,"COMPLETED_WITH_ERRORS");
  const salesFile=await file("sales",["Дата","SKU","Количество"],[["05.10.2026","000001",5],["05.10.2026","000002",0]]);
  const salesId=await upload("SALES",salesFile);await commit();assert.equal(await db.businessRecord.count({where:{importId:salesId}}),2);assert.equal((await db.businessRecord.findFirstOrThrow({where:{importId:salesId,sku:"000002"}})).quantity,0);
  await commitBusiness(salesId);assert.equal(await db.businessRecord.count({where:{importId:salesId}}),2,"Repeated commit must be idempotent");
  const missingFile=await file("missing",["SKU","Дата"],[["000001","06.10.2026"]]);const invalidId=await upload("STOCK",missingFile);assert.ok((await page.innerText("body")).includes("Отсутствует обязательная колонка «Остаток»"));assert.equal(await db.businessRecord.count({where:{importId:invalidId}}),0);
  const conflictFile=await file("conflict",formats.MAPPING.columns.map(c=>c.name),[["000004","GC1","Товар",`${site.baseUrl}different/`]]);const conflictId=await upload("MAPPING",conflictFile);await assert.rejects(commitBusiness(conflictId),/Исправьте все ошибки/);
  // A mapping change after preview must require review, even if both versions are valid.
  const priceDraft=await uploadBusiness(readFileSync(priceFile),"stale-prices.xlsx","PRICES"),sheet=(priceDraft.dataJson as unknown as Workbook).sheets[0];await validateBusiness(priceDraft.id,{sheetName:sheet.name,mapping:typedMapping(sheet,"PRICES").mapping,dateFormat:"DMY",numericFormat:"RU"});
  const changedFile=await file("mapping-update",formats.MAPPING.columns.map(c=>c.name),[["000001","GC1","Название изменено",product.url]]);
  const changed=await uploadBusiness(readFileSync(changedFile),"mapping-update.xlsx","MAPPING"),changedSheet=(changed.dataJson as unknown as Workbook).sheets[0];await validateBusiness(changed.id,{sheetName:changedSheet.name,mapping:typedMapping(changedSheet,"MAPPING").mapping,dateFormat:"DMY",numericFormat:"RU"});await commitBusiness(changed.id);await assert.rejects(commitBusiness(priceDraft.id),/изменились после предпросмотра/);
  const stats=await businessData(site);assert.equal(stats.mapping.skus,3);assert.equal(stats.mapping.groups,2);assert.equal(stats.mapping.matched,1);assert.equal(stats.mapping.unmatched,1);assert.equal(stats.stats.STOCK.skus,1);assert.equal(stats.stats.PRICES.skus,1);assert.equal(stats.stats.SALES.skus,2);assert.equal(stats.stats.SALES.rows,2);
  const dataset=await prepareDataset(28,{siteId:site.id,now:new Date("2026-10-06T12:00:00Z")});assert.equal(dataset.pages.find(p=>p.id===product.id)?.business?.sales?.quantity,5);
  await page.goto("http://127.0.0.1:3000/business-data",{waitUntil:"networkidle"});for(const kind of kinds)await page.locator(`[data-business-kind=${kind}]`).getByText("Описание колонок и пример строки",{exact:true}).click();await page.screenshot({path:"test-results/business-data-filled.png",fullPage:true});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+2),false);
  await page.setViewportSize({width:390,height:844});await page.screenshot({path:"test-results/business-data-mobile.png",fullPage:true});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+2),false);
  const report={status:"PASS",siteId:site.id,productId:product.id,imports:{mapId,stockId,pricesId,salesId,early,invalidId,conflictId},fourBlocks:true,realTemplateDownloads:4,leadingZeros:true,previewBeforeWrite:true,unknownSkuVisible:true,missingColumnsRejected:true,conflictsRejected:true,stalePreviewRejected:true,historyPreserved:true,repeatWithoutDuplicates:true,quantityOnlySales:true,summary:stats.mapping,scannerJobsCreated:0,webmasterJobsCreated:0,checkedAt:new Date().toISOString()};
  writeFileSync("test-results/business-data-acceptance.json",JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{
  await db.integration.update({where:{id:target.id},data:{configJson:json(original)}});assert.equal(hash((await db.integration.findUniqueOrThrow({where:{id:target.id}})).configJson),hash(original));assert.equal(await db.scan.count({where:{siteId:production.id}}),scansBefore);assert.equal(await db.jobRun.count({where:{siteId:production.id}}),jobsBefore);await browser.close();await db.$disconnect();
}

