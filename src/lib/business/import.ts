import ExcelJS from "exceljs";
import { parse } from "csv-parse/sync";
import { createHash } from "node:crypto";
import { validateArchive } from "../scanner/import";
import { normalizeUrl } from "../scanner/url";
import { matchUrl, type MatchPage } from "../yandex/matching";
export const fields = ["rawUrl", "sku", "productName", "category", "productGroup", "brand", "price", "stock", "available", "package", "priority", "date", "orders", "quantity", "quantityKg", "revenue", "kgPerUnit"] as const;
export type Field = typeof fields[number];
export type Mapping = Partial<Record<Field, number>>;
export type Sheet = { name: string; headers: string[]; rows: string[][] };
export type Workbook = { sheets: Sheet[] };
export function profileMapping(value:unknown,headers:string[]):Mapping {
  const saved=value as {columns?:Mapping;headers?:string[]};
  if(!saved?.columns||!saved.headers)return value as Mapping;
  return Object.fromEntries(Object.entries(saved.columns).flatMap(([field,index])=>{const header=saved.headers![index!],matches=headers.flatMap((name,i)=>name===header?[i]:[]);return matches.length===1?[[field,matches[0]]]:[];}));
}
const FORMULA = "[FORMULA_NOT_SUPPORTED]";
function value(cell: ExcelJS.CellValue): string {
  if (cell == null) return "";
  if (cell instanceof Date) return cell.toISOString().slice(0,10);
  if (typeof cell === "object") {
    if ("formula" in cell || "sharedFormula" in cell) return FORMULA;
    if ("richText" in cell) return cell.richText.map(v=>v.text).join("");
    if ("hyperlink" in cell) return String(cell.text ?? cell.hyperlink);
    return "[INVALID_CELL]";
  }
  return String(cell);
}
export async function readWorkbook(buffer: Buffer, filename: string): Promise<Workbook> {
  if (!buffer.length || buffer.length > 5_000_000) throw new Error("Размер файла должен быть от 1 байта до 5 МБ.");
  const sheets: Sheet[] = [];
  if (/\.xlsx$/i.test(filename)) {
    validateArchive(buffer);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as Parameters<typeof workbook.xlsx.load>[0]);
    if (workbook.worksheets.length > 20) throw new Error("Максимум 20 листов.");
    for (const sheet of workbook.worksheets) {
      if (sheet.columnCount > 100 || sheet.rowCount > 10001) throw new Error("Максимум 100 колонок и 10 000 строк на листе.");
      const rows: string[][] = [];
      for (let r=1; r<=sheet.rowCount; r++) rows.push(Array.from({length: sheet.columnCount}, (_,c)=>value(sheet.getRow(r).getCell(c+1).value)));
      sheets.push({name:sheet.name,headers:rows.shift() ?? [],rows});
    }
  } else if (/\.csv$/i.test(filename)) {
    const input=buffer.toString("utf8").replace(/^\uFEFF/,""), first=input.split(/\r?\n/)[0];
    const rows: string[][]=parse(input,{delimiter:first.includes(";")?";":",",skip_empty_lines:true,max_record_size:100000});
    if (rows.length>10001 || rows.some(r=>r.length>100)) throw new Error("Максимум 100 колонок и 10 000 строк.");
    sheets.push({name:"CSV",headers:rows.shift()??[],rows});
  } else throw new Error("Поддерживаются XLSX и CSV в UTF-8; XLS не поддерживается.");
  if (!sheets.length || sheets.some(s=>s.headers.some(h=>h.length>1000) || s.rows.some(r=>r.some(v=>v.length>10000))) || Buffer.byteLength(JSON.stringify(sheets))>20_000_000) throw new Error("Нет листов или превышен лимит объёма значений.");
  return {sheets};
}
export function suggestedMapping(headers: string[]): Mapping {
  const aliases: Record<Field,string[]> = {rawUrl:["url","адрес","ссылка","urlмагазина"],sku:["sku","артикул"],productName:["productname","название","наименование","наименованиегрупповогокода"],category:["category","категория"],productGroup:["productgroup","товарнаягруппа","групповойкод"],brand:["brand","бренд"],price:["price","цена"],stock:["stock","остаток"],available:["available","наличие"],package:["package","упаковка"],priority:["priority","приоритет"],date:["date","дата"],orders:["orders","заказы"],quantity:["quantity","количество"],quantityKg:["quantitykg","кг","количествокг"],kgPerUnit:["kgperunit","кгвединицеsku"],revenue:["revenue","выручка"]};
  return Object.fromEntries(fields.flatMap(f=>{const i=headers.findIndex(h=>aliases[f].includes(h.toLowerCase().replace(/[\s_-]/g,""))); return i<0?[]:[[f,i]];}));
}
function numeric(raw: string, format: string) {
  const text=raw.replace(/[\s\u00a0\u202f]/g,"");
  const parsed=format==="RU"?text.replace(",","."):text;
  if (!/^-?\d+(?:\.\d+)?$/.test(parsed)) throw new Error("Некорректный формат числа.");
  const n=Number(parsed); if(!Number.isFinite(n)||Math.abs(n)>1e12) throw new Error("Число вне допустимого диапазона."); return n;
}
function parseDate(raw:string, format:string) {
  let iso=raw;
  if(/^\d{4}-\d{2}-\d{2}$/.test(raw)) iso=raw;
  else if (/^\d+(?:\.\d+)?$/.test(raw)) { const n=Number(raw); if(n<1||n>100000)throw new Error("Некорректная дата Excel."); iso=new Date(Date.UTC(1899,11,30)+Math.floor(n)*86400000).toISOString().slice(0,10); }
  else {const a=raw.split(/[./-]/); if(a.length!==3||format==="ISO")throw new Error("Некорректный формат даты."); iso=`${a[2]}-${(format==="DMY"?a[1]:a[0]).padStart(2,"0")}-${(format==="DMY"?a[0]:a[1]).padStart(2,"0")}`;}
  const d=new Date(iso+"T00:00:00Z"); if(!/^\d{4}-\d{2}-\d{2}$/.test(iso)||Number.isNaN(d.valueOf())||d.toISOString().slice(0,10)!==iso) throw new Error("Некорректная дата."); return iso;
}
export type BusinessRow = {rowNumber:number;pageId:string|null;rawUrl:string|null;normalizedUrl:string|null;matchStatus:string;attributesJson:Record<string,string>} & Partial<Record<Exclude<Field,"rawUrl">,string|number|boolean|null>>;
export function validateRows(sheet: Sheet, mapping: Mapping, dateFormat:string, numericFormat:string, base:string, pages:MatchPage[]) {
  if (!Object.keys(mapping).length || Object.entries(mapping).some(([f,i])=>!fields.includes(f as Field)||!Number.isInteger(i)||i!<0||i!>=sheet.headers.length) || new Set(Object.values(mapping)).size!==Object.values(mapping).length) throw new Error("Выберите корректные и разные колонки для полей.");
  if (!Object.hasOwn(mapping,"rawUrl")&&!Object.hasOwn(mapping,"sku")) throw new Error("Сопоставьте хотя бы URL или SKU.");
  if(!["ISO","DMY","MDY"].includes(dateFormat)||!["RU","EN"].includes(numericFormat))throw new Error("Некорректные форматы даты или числа.");
  const records:BusinessRow[]=[], errors:{row:number;message:string}[]=[], hashes=new Set<string>(); let skipped=0;
  for(const [i,row] of sheet.rows.entries()) {
    if(row.every(v=>!v.trim())){skipped++;continue;}
    try {
      if(row.some(v=>v===FORMULA||v==="[INVALID_CELL]"))throw new Error("Формулы и сложные ячейки не импортируются; сохраните значения.");
      const hash=createHash("sha256").update(JSON.stringify(row)).digest("hex"); if(hashes.has(hash)){skipped++;continue;}
      const data:Record<string,string|number|boolean|null>={};
      for(const f of fields) {const col=mapping[f], raw=col===undefined?"":(row[col]??"").trim(); if(!raw){data[f]=null;continue;}
        if(["price","stock","priority","orders","quantity","quantityKg","revenue","kgPerUnit"].includes(f)) {const n=numeric(raw,numericFormat); if(n<0||f==="priority"&&n>100)throw new Error("Числа должны быть неотрицательными; приоритет — от 0 до 100."); if(f==="kgPerUnit"&&(n<=0||n<0.000001||n>=1e12))throw new Error("Кг в единице SKU: положительное число от 0,000001 до 999999999999."); data[f]=n;}
        else if(f==="date")data[f]=parseDate(raw,dateFormat);
        else if(f==="available"){const v=raw.toLowerCase(); if(["true","1","да","есть","в наличии"].includes(v))data[f]=true;else if(["false","0","нет","нет в наличии"].includes(v))data[f]=false;else throw new Error("Наличие: Да/Нет, true/false или 1/0.");}
        else data[f]=raw;
      }
      if(!data.rawUrl&&!data.sku)throw new Error("В строке нет URL и SKU.");
      const rawUrl=data.rawUrl as string|null; if(rawUrl)normalizeUrl(rawUrl,base);
      const match=rawUrl?matchUrl(rawUrl,base,pages):{pageId:null,normalizedUrl:null,matchStatus:"UNMATCHED"};
      const attributesJson=Object.fromEntries(sheet.headers.flatMap((h,c)=>Object.values(mapping).includes(c)?[]:[[`${h||"Колонка"} [${c+1}]`,row[c]??""]]));
      records.push({...data,pageId:match.pageId,normalizedUrl:match.normalizedUrl,matchStatus:match.matchStatus,rawUrl,rowNumber:i+2,attributesJson} as BusinessRow); hashes.add(hash);
    } catch(error) {errors.push({row:i+2,message:error instanceof Error?error.message:"Ошибка строки."});}
  }
  return {records,errors,skipped,total:sheet.rows.length,matched:records.filter(r=>r.pageId).length,unmatched:records.filter(r=>!r.pageId).length};
}
