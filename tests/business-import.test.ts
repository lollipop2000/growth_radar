import test from "node:test";import assert from "node:assert/strict";import ExcelJS from "exceljs";
import {readWorkbook,validateRows,suggestedMapping,profileMapping} from "../src/lib/business/import";
test("XLSX multi-sheet preview, mappings, row errors, URL matching and unknown columns",async()=>{
  const w=new ExcelJS.Workbook();w.addWorksheet("Описание").addRow(["Инструкция"]);const s=w.addWorksheet("Продажи");s.addRows([["URL","SKU","Цена","Наличие","Приоритет","Дата","Заказы","Моя колонка"],["https://fixture.invalid/product/","s1","1 234,56","Да","80","05.10.2026","3","сохранить"],["","s2","100","Нет","","","","только SKU"],["https://fixture.invalid/missing/","s3","100","Да","20","","","без страницы"],["https://fixture.invalid/error/","s4","не число","Нет","","","","ошибка"],["https://fixture.invalid/formula/","s5",{formula:"1+1",result:2},"Да","","","","ошибка"]]);
  const parsed=await readWorkbook(Buffer.from(await w.xlsx.writeBuffer()),"sample.xlsx");assert.equal(parsed.sheets.length,2);assert.equal(parsed.sheets[1].rows.length,5);
  const data=validateRows(parsed.sheets[1],suggestedMapping(parsed.sheets[1].headers),"DMY","RU","https://fixture.invalid/",[{id:"p",normalizedUrl:"https://fixture.invalid/product",aliasesJson:[]}]);
  assert.equal(data.records.length,3);assert.equal(data.errors.length,2);assert.equal(data.matched,1);assert.equal(data.unmatched,2);assert.equal(data.records[0].price,1234.56);assert.equal(data.records[0].date,"2026-10-05");assert.equal(data.records[0].attributesJson["Моя колонка [8]"],"сохранить");assert.equal(data.records[1].pageId,null);
});
test("Business import rejects unsafe archives, file sizes, protocols, invalid dates and duplicate mappings",async()=>{
  await assert.rejects(readWorkbook(Buffer.alloc(5_000_001),"large.xlsx"));await assert.rejects(readWorkbook(Buffer.from("bad"),"bad.xlsx"));await assert.rejects(readWorkbook(Buffer.from("data"),"old.xls"));
  const sheet={name:"s",headers:["URL","Дата"],rows:[["javascript:alert(1)","2026-10-01"],["https://fixture.invalid/","2026-02-30"]]};assert.equal(validateRows(sheet,{rawUrl:0,date:1},"ISO","RU","https://fixture.invalid/",[]).errors.length,2);
  assert.throws(()=>validateRows(sheet,{rawUrl:0,sku:0},"ISO","RU","https://fixture.invalid/",[]));
});
test("CSV duplicate rows skip, incomplete optional fields stay null and significant queries remain distinct",async()=>{
  const file=Buffer.from('URL;SKU;Stock\nhttps://fixture.invalid/product/?size=1;s1;0\nhttps://fixture.invalid/product/?size=1;s1;0\nhttps://fixture.invalid/product/?size=2;s2;\n');
  const w=await readWorkbook(file,"a.csv"),s=w.sheets[0],r=validateRows(s,suggestedMapping(s.headers),"ISO","RU","https://fixture.invalid/",[{id:"p",normalizedUrl:"https://fixture.invalid/product?size=1",aliasesJson:[]}]);assert.equal(r.skipped,1);assert.equal(r.matched,1);assert.equal(r.unmatched,1);assert.equal(r.records[1].stock,null);
});
test("A reusable mapping profile follows unique header names after columns are reordered",()=>{assert.deepEqual(profileMapping({columns:{rawUrl:0,price:1},headers:["URL","Цена"]},["Цена","SKU","URL"]),{rawUrl:2,price:0});assert.deepEqual(profileMapping({columns:{rawUrl:0},headers:["URL"]},["URL","URL"]),{});});
