"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { uploadBusiness, businessDraft, validateBusiness, commitBusiness, updateSalesMetadata } from "../../lib/business/service";
import {db} from '../../lib/db';
import type {SalesMetadata} from '../../lib/business/sales-mode';
import { businessKind } from "../../lib/business/formats";
import type { Workbook } from "../../lib/business/import";
import { humanError } from "../../lib/i18n/ru";

const metadata=(form:FormData):SalesMetadata=>({salesImportMode:String(form.get('salesImportMode')??'UNKNOWN'),coverageFrom:String(form.get('coverageFrom')??''),coverageTo:String(form.get('coverageTo')??'')});
async function validate(id: string, sheetName?: string, form?:FormData) {
  const draft = await businessDraft(id), workbook = draft.dataJson as unknown as Workbook;
  const sheet = sheetName ? workbook.sheets.find(s => s.name === sheetName) : workbook.sheets.find(s => s.name !== "Описание");
  if (!sheet || sheet.name === "Описание") throw new Error("Выберите лист с данными, а не лист «Описание».");
  businessKind(draft.kind);
  let sales=form?metadata(form):{salesImportMode:draft.salesImportMode,coverageFrom:draft.coverageFrom?.toISOString().slice(0,10),coverageTo:draft.coverageTo?.toISOString().slice(0,10)};
  const profileId=String(form?.get('profileId')??'');
  if(profileId){const profile=await db.importProfile.findFirstOrThrow({where:{id:profileId,siteId:draft.siteId}});if(sales.salesImportMode==='UNKNOWN')sales={...sales,salesImportMode:profile.salesImportMode};}
  await validateBusiness(id, { sheetName: sheet.name, mapping: {}, dateFormat: "DMY", numericFormat: "RU",...(draft.kind==='SALES'?sales:{}),profileId:profileId||undefined,profileName:String(form?.get('profileName')??'')||undefined });
}
export async function uploadData(form: FormData) {
  let id = "", error = "";
  try {
    const kind = businessKind(form.get("kind")), file = form.get("file");
    if (!(file instanceof File) || !file.size || file.size > 5_000_000) throw new Error("Выберите XLSX или CSV размером до 5 МБ.");
    id = (await uploadBusiness(Buffer.from(await file.arrayBuffer()), file.name, kind)).id;
    await validate(id,undefined,form);
  } catch (e) { error = humanError(e); }
  revalidatePath("/business-data");
  redirect(`/business-data?${id ? `draft=${encodeURIComponent(id)}&` : ""}${error ? `error=${encodeURIComponent(error)}` : ""}`);
}
export async function validateData(form: FormData) {
  const id = String(form.get("id")); let error = "";
  try { await validate(id, String(form.get("sheetName")),form); } catch (e) { error = humanError(e); }
  redirect(`/business-data?draft=${encodeURIComponent(id)}${error ? `&error=${encodeURIComponent(error)}` : ""}`);
}
export async function saveSalesMetadata(form:FormData){
  const id=String(form.get('id'));let error='';
  try{await updateSalesMetadata(id,metadata(form));for(const path of ['/business-data','/','/pages','/opportunities'])revalidatePath(path);}catch(e){error=humanError(e);}
  redirect(`/business-data?draft=${encodeURIComponent(id)}${error?`&error=${encodeURIComponent(error)}`:'&message='+encodeURIComponent('Тип выгрузки сохранён. Пересчитайте возможности.')}#sales`);
}
export async function commitData(form: FormData) {
  const id = String(form.get("id")); let error = "";
  try {
    businessKind((await businessDraft(id)).kind);
    await commitBusiness(id);
    for (const path of ["/", "/business-data", "/imports", "/pages", "/opportunities"]) revalidatePath(path);
  } catch (e) { error = humanError(e); }
  redirect(`/business-data?draft=${encodeURIComponent(id)}${error ? `&error=${encodeURIComponent(error)}` : ""}`);
}
