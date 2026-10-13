import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ExcelJS from "exceljs";
import { formats, kinds, type BusinessKind } from "../src/lib/business/formats";
import { mappingRegistry, typedMapping, validateTypedRows, type ProductMapping } from "../src/lib/business/typed-import";
import { readWorkbook } from "../src/lib/business/import";
import { salesAggregate, type BusinessInput } from "../src/lib/opportunities/aggregate";
const base="https://fixture.invalid/", pages=[{id:"p",normalizedUrl:`${base}product`,aliasesJson:[]}];
const registry:ProductMapping[]=[{sku:"000001",productGroup:"000GC",productName:"Товар",rawUrl:`${base}product/`,active:true}];
const sheet=(kind:BusinessKind,rows:string[][])=>({name:"Данные",headers:formats[kind].columns.map(c=>c.name),rows});
const validate=(kind:BusinessKind,rows:string[][],products=registry)=>validateTypedRows(sheet(kind,rows),kind,base,pages,products);
test("Typed import enforces required headers, unique columns and at least one sales metric",()=>{
  for(const kind of kinds)assert.throws(()=>typedMapping({name:"x",headers:["SKU"],rows:[]},kind),/колонка/);
  assert.throws(()=>typedMapping({name:"x",headers:["Дата","SKU"],rows:[]},"SALES"),/хотя бы одна/);
  assert.throws(()=>typedMapping({name:"x",headers:["SKU","SKU","Дата","Остаток"],rows:[]},"STOCK"),/Повторяется/);
});
test("Mapping preserves text identifiers, matches pages and separates activity from availability",()=>{
  const r=validate("MAPPING",[["000001","000GC","Товар",`${base}product/`,"Бренд","Категория","Нет"]],[]);
  assert.equal(r.errors.length,0);assert.equal(r.records[0].sku,"000001");assert.equal(r.records[0].productGroup,"000GC");assert.equal(r.records[0].pageId,"p");assert.equal(r.records[0].attributesJson.active,"false");assert.equal(r.records[0].available,null);
});
test("Mapping detects duplicate SKU, conflicting group URLs and URLs outside the current store",()=>{
  const duplicate=validate("MAPPING",[["s","g1","Товар",`${base}product/`],["s","g2","Товар",`${base}product/`]],[]);
  assert.equal(duplicate.records.length,0);assert.ok(duplicate.errors.some(e=>e.message.includes("двум активным")));
  const conflict=validate("MAPPING",[["s2","000GC","Товар",`${base}other/`]]);
  assert.equal(conflict.records.length,0);assert.match(conflict.errors[0].message,/несколько активных URL/);
  assert.ok(validate("MAPPING",[["s","g","Товар","https://other.invalid/p/"]],[]).errors.length);
  assert.ok(validate("MAPPING",[["s","g","Товар","/product/"]],[]).errors.length);
});
test("Unknown SKU is visible and never imported; missing SKU, date and negative amounts are rejected",()=>{
  const r=validate("STOCK",[["000001","06.10.2026","140"],["unknown","2026-10-06","2"],["","06.10.2026","3"],["000001","31.02.2026","4"],["000001","06.10.2026","-1"]]);
  assert.equal(r.records.length,1);assert.equal(r.records[0].pageId,"p");assert.equal(r.unknownSkuCount,1);assert.ok(r.errors.some(e=>e.message==="SKU не найден в маппинге товаров."));assert.ok(r.errors.some(e=>e.message.includes("«SKU»")));
  assert.equal(validate("STOCK",[["000001","06.10.2026","0"]],[]).records.length,0);
});
test("Price accepts comma and point; dates accept DMY and ISO; optional dimensions persist",()=>{
  const r=validate("PRICES",[["000001","06.10.2026","54800,50","Оптовая","RUB"],["000001","2026-10-07","54800.50","Розничная","RUB"]]);
  assert.equal(r.errors.length,0);assert.equal(r.records[0].price,54800.5);assert.equal(r.records[1].price,54800.5);assert.equal(r.records[0].date,"2026-10-06");assert.equal(r.records[0].attributesJson["Тип цены [4]"],"Оптовая");
});
test("Sales accepts quantity-only, treats zero as known and blank metrics as missing",()=>{
  const r=validate("SALES",[["01.10.2026","000001","","5","",""],["02.10.2026","000001","0","","",""],["03.10.2026","000001","","","",""]]);
  assert.equal(r.records.length,2);assert.equal(r.records[0].quantity,5);assert.equal(r.records[0].orders,null);assert.equal(r.records[1].orders,0);assert.ok(r.errors.some(e=>e.message.includes("показатель продаж")));
});
test("Duplicate keys and identical rows are errors; warehouses differentiate stock keys",()=>{
  const duplicate=validate("STOCK",[["000001","06.10.2026","1"],["000001","06.10.2026","1"]]);
  assert.equal(duplicate.records.length,0);assert.equal(duplicate.skipped,0);assert.equal(new Set(duplicate.errors.map(e=>e.row)).size,2);
  assert.equal(validate("STOCK",[["000001","06.10.2026","1","A"],["000001","06.10.2026","2","B"]]).records.length,2);
});
test("Latest mapping retains historical versions and honors inactive state",()=>{
  const row={sku:"s",productGroup:"g",productName:"p",rawUrl:`${base}product/`,brand:null,category:null,attributesJson:{active:"false"}};
  const r=mappingRegistry([row,{...row,productGroup:"old",attributesJson:{active:"true"}}]);assert.equal(r.length,1);assert.equal(r[0].active,false);assert.equal(r[0].productGroup,"g");
});
test("Separate stock and price uploads never replace sales; partial uploads preserve other SKU",()=>{
  const row:BusinessInput={importId:"sales1",date:new Date("2026-10-01"),createdAt:new Date("2026-10-02"),attributesJson:{businessKind:"SALES"},sku:"s1",productName:null,category:null,productGroup:null,brand:null,price:null,stock:null,available:null,package:null,priority:null,orders:2,quantity:5,quantityKg:10,revenue:100};
  const r=salesAggregate([row,{...row,sku:"s2",orders:3,quantity:7},{...row,importId:"sales2",createdAt:new Date("2026-10-03"),orders:4,quantity:6},{...row,importId:"stock",createdAt:new Date("2026-10-04"),attributesJson:{businessKind:"STOCK"},orders:null,quantity:null}],{from:"2026-10-01",to:"2026-10-01",days:1});
  assert.equal(r?.orders,7);assert.equal(r?.quantity,13);assert.equal(r?.days,1);
});
test("All four static XLSX templates match UI schema, contain examples and a description sheet",async()=>{
  for(const kind of kinds){const f=formats[kind],buffer=readFileSync(`public/templates/${f.filename}`),w=await readWorkbook(buffer,f.filename);
    assert.equal(w.sheets.length,2);assert.equal(w.sheets[0].name,"Данные");assert.deepEqual(w.sheets[0].headers,f.columns.map(c=>c.name));assert.equal(w.sheets[0].rows.length,1);assert.equal(w.sheets[1].name,"Описание");assert.equal(w.sheets[1].rows.length,f.columns.length+(kind==='SALES'?1:0));
    const book=new ExcelJS.Workbook();await book.xlsx.load(buffer as unknown as Parameters<typeof book.xlsx.load>[0]);const skuIndex=f.columns.findIndex(c=>c.field==="sku");assert.equal(typeof book.worksheets[0].getRow(2).getCell(skuIndex+1).value,"string");
    const dateIndex=f.columns.findIndex(c=>c.field==="date");if(dateIndex>=0){const cell=book.worksheets[0].getRow(2).getCell(dateIndex+1);assert.ok(cell.value instanceof Date);assert.equal(cell.numFmt,"dd.mm.yyyy");assert.equal(w.sheets[0].rows[0][dateIndex],String(f.columns[dateIndex].example).split(".").reverse().join("-"));}
    typedMapping(w.sheets[0],kind);
  }
});
