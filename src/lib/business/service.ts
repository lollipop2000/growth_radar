import "server-only";
import { db } from "../db";
import { currentSite, json } from "../yandex/settings";
import { readWorkbook, validateRows, type Workbook, type Mapping } from "./import";
import type { Prisma } from "@prisma/client";
import { businessKind, type BusinessKind } from "./formats";
import { mappingRegistry, validateTypedRows } from "./typed-import";
import { createHash } from "node:crypto";
import {salesMetadata,type SalesMetadata} from './sales-mode';
const validationHash = (result: unknown) => createHash("sha256").update(JSON.stringify(result)).digest("hex");
type Reader = Pick<Prisma.TransactionClient, "businessRecord" | "page">;
export async function productRegistry(reader: Reader, siteId: string) {
  return mappingRegistry(await reader.businessRecord.findMany({where:{siteId,import:{kind:"MAPPING",status:{in:["COMPLETED","COMPLETED_WITH_ERRORS"]}}},orderBy:[{createdAt:"desc"},{id:"desc"}]}));
}
async function check(reader: Reader, draft: {siteId:string;kind:string}, sheet: Workbook["sheets"][number], selection: Selection, base: string) {
  const pages=await reader.page.findMany({where:{siteId:draft.siteId,active:true},select:{id:true,normalizedUrl:true,aliasesJson:true}});
  return draft.kind==="LEGACY" ? {...validateRows(sheet,selection.mapping,selection.dateFormat,selection.numericFormat,base,pages),unknownSkuCount:0} : validateTypedRows(sheet,businessKind(draft.kind),base,pages,await productRegistry(reader,draft.siteId));
}
export type Selection = SalesMetadata & {sheetName:string;mapping:Mapping;dateFormat:string;numericFormat:string;profileId?:string;profileName?:string;validationHash?:string};
export async function uploadBusiness(buffer:Buffer,filename:string,kind?:BusinessKind) {
  const workbook=await readWorkbook(buffer,filename), site=await currentSite();
  if(kind)businessKind(kind);
  return db.import.create({data:{siteId:site.id,kind:kind??"LEGACY",rowsTotal:kind?(workbook.sheets.find(s=>s.name!=="Описание")?.rows.length??0):0,filename:filename.replace(/^.*[\\/]/,""),sizeBytes:buffer.length,dataJson:json(workbook)}});
}
export async function businessDraft(id:string) {
  const site=await currentSite(); const draft=await db.import.findFirstOrThrow({where:{id,siteId:site.id}}); assertBusinessKind(draft.kind); return draft;
}
function assertBusinessKind(kind:string){if(kind!=="LEGACY")businessKind(kind);}
export async function validateBusiness(id:string,selection:Selection) {
  const draft=await businessDraft(id); if(!["DRAFT","VALIDATED"].includes(draft.status))throw new Error("Импорт уже завершён.");
  const sheet=(draft.dataJson as unknown as Workbook).sheets.find(s=>s.name===selection.sheetName); if(!sheet)throw new Error("Выберите существующий лист.");
  if(selection.profileId&&!await db.importProfile.findFirst({where:{id:selection.profileId,siteId:draft.siteId}}))throw new Error("Профиль другого сайта недоступен.");
  if(selection.profileName && selection.profileName.length>120)throw new Error("Название профиля слишком длинное.");
  const metadata=draft.kind==='SALES'?salesMetadata(selection):{};
  let result: Awaited<ReturnType<typeof check>>;
  try { result=await check(db,draft,sheet,selection,(await currentSite()).baseUrl);if(draft.kind==='SALES')assertSalesCoverage(result,selection); }
  catch(e) {
    if(draft.kind!=="LEGACY")await db.import.updateMany({where:{id,status:{in:["DRAFT","VALIDATED"]}},data:{...metadata,status:"DRAFT",sheetName:sheet.name,mappingJson:json(selection),rowsTotal:sheet.rows.length,rowsErrors:sheet.rows.filter(row=>row.some(v=>v.trim())).length,rowsSkipped:0,matched:0,unmatched:0,unknownSkuCount:0,errorsJson:json([{row:1,message:e instanceof Error?e.message:"Ошибка колонок."}])}});
    throw e;
  }
  await db.import.updateMany({where:{id,status:{in:["DRAFT","VALIDATED"]}},data:{...metadata,status:"VALIDATED",sheetName:sheet.name,mappingJson:json({...selection,validationHash:validationHash(result)}),rowsTotal:result.total,rowsErrors:new Set(result.errors.map(e=>e.row)).size,rowsSkipped:result.skipped,unknownSkuCount:result.unknownSkuCount,matched:result.matched,unmatched:result.unmatched,errorsJson:json(result.errors.slice(0,100))}});
  return result;
}
export async function commitBusiness(id:string) {
  const site=await currentSite();
  return db.$transaction(async tx=>{
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(7462301)`;
    const draft=await tx.import.findFirstOrThrow({where:{id,siteId:site.id}});
    assertBusinessKind(draft.kind);
    if(draft.status==="COMPLETED"||draft.status==="COMPLETED_WITH_ERRORS")return draft;
    if(draft.status!=="VALIDATED")throw new Error("Сначала проверьте сопоставление и строки.");
    const selection=draft.mappingJson as unknown as Selection, workbook=draft.dataJson as unknown as Workbook;
    const sheet=workbook.sheets.find(s=>s.name===selection.sheetName); if(!sheet)throw new Error("Лист не найден.");
    const result=await check(tx,draft,sheet,selection,site.baseUrl);
    if(draft.kind!=="LEGACY"&&selection.validationHash!==validationHash(result))throw new Error("Маппинг или страницы изменились после предпросмотра. Проверьте выбранный лист повторно перед подтверждением.");
    if(draft.kind==='SALES')assertSalesCoverage(result,selection);
    if(draft.kind==="MAPPING"&&result.errors.length)throw new Error("Исправьте все ошибки маппинга товаров перед импортом.");
    if(draft.kind!=="LEGACY"&&!result.records.length&&!(draft.kind==="SALES"&&selection.salesImportMode==="TRANSACTIONAL"&&!result.errors.length))throw new Error("Нет проверенных строк для импорта. Исправьте ошибки и загрузите файл снова.");
    let profileId=selection.profileId??null;
    if(profileId&&!await tx.importProfile.findFirst({where:{id:profileId,siteId:site.id}}))throw new Error("Профиль не найден.");
    if(selection.profileName?.trim()) {
      const data={sheetName:selection.sheetName,mappingJson:json({columns:selection.mapping,headers:sheet.headers}),dateFormat:selection.dateFormat,numericFormat:selection.numericFormat,salesImportMode:draft.kind==="SALES"?selection.salesImportMode??"UNKNOWN":"UNKNOWN"};
      const profile=await tx.importProfile.upsert({where:{siteId_name:{siteId:site.id,name:selection.profileName.trim()}},create:{siteId:site.id,name:selection.profileName.trim(),...data},update:data}); profileId=profile.id;
    }
    const rows=result.records.map(r=>({...r,siteId:site.id,importId:id,date:r.date?new Date(String(r.date)+"T00:00:00Z"):null,attributesJson:json(r.attributesJson)})) as Prisma.BusinessRecordCreateManyInput[];
    for(let i=0;i<rows.length;i+=250)await tx.businessRecord.createMany({data:rows.slice(i,i+250),skipDuplicates:true});
    return tx.import.update({where:{id},data:{profileId,status:result.errors.length?"COMPLETED_WITH_ERRORS":"COMPLETED",startedAt:new Date(),finishedAt:new Date(),rowsTotal:result.total,rowsImported:result.records.length,rowsErrors:new Set(result.errors.map(e=>e.row)).size,unknownSkuCount:result.unknownSkuCount,rowsSkipped:result.skipped,matched:result.matched,unmatched:result.unmatched,errorsJson:json(result.errors.slice(0,100))}});
  },{timeout:60000});
}
function assertSalesCoverage(result:{records:{date?:unknown}[];errors:{message:string}[]},selection:SalesMetadata){
  const m=salesMetadata(selection);
  if(m.salesImportMode!=='TRANSACTIONAL')return;
  // Rejected known-SKU sales must never be silently replaced by synthetic zeros.
  if(result.errors.some(e=>e.message!=='SKU не найден в маппинге товаров.'))throw new Error('Транзакционная выгрузка содержит ошибки. Исправьте строки или выберите неполную выгрузку.');
  const from=m.coverageFrom!.toISOString().slice(0,10),to=m.coverageTo!.toISOString().slice(0,10);
  if(result.records.some(r=>!r.date||String(r.date)<from||String(r.date)>to))throw new Error('Продажи вне заявленного периода покрытия. Уточните период.');
}
export async function updateSalesMetadata(id:string,input:SalesMetadata){
  const site=await currentSite(),metadata=salesMetadata(input);
  return db.$transaction(async tx=>{
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(7462301)`;
    const imp=await tx.import.findFirstOrThrow({where:{id,siteId:site.id,kind:'SALES',status:{in:['COMPLETED','COMPLETED_WITH_ERRORS']}}});
    if(metadata.salesImportMode==='UNKNOWN')throw new Error('Выберите транзакционную или неполную выгрузку.');
    if(metadata.salesImportMode==='TRANSACTIONAL'){
      const workbook=imp.dataJson as unknown as Workbook,selection=imp.mappingJson as unknown as Selection;
      const sheet=workbook?.sheets?.find(s=>s.name===(selection?.sheetName??imp.sheetName));
      if(!sheet)throw new Error('Исходный лист не найден. Загрузите файл повторно.');
      // Revalidate original file using the current registry; unknown SKUs are
      // excluded, but any other rejected row prevents a completeness claim.
      const result=await check(tx,imp,sheet,{...selection,...input},site.baseUrl);
      assertSalesCoverage(result,input);
      const stored=await tx.businessRecord.findMany({where:{importId:id},select:{rowNumber:true}});
      const accepted=new Set(result.records.map(r=>r.rowNumber));
      if(stored.some(r=>!accepted.has(r.rowNumber))||result.records.some(r=>!stored.some(s=>s.rowNumber===r.rowNumber)))throw new Error('Состав проверенных SKU изменился. Для полной выгрузки переимпортируйте файл.');
    }
    return tx.import.update({where:{id},data:{...metadata,metadataUpdatedAt:new Date()}});
  },{timeout:60000});
}
