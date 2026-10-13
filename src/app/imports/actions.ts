"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { uploadBusiness, validateBusiness, commitBusiness } from "../../lib/business/service";
import { fields, type Mapping } from "../../lib/business/import";
import { humanError } from "../../lib/i18n/ru";
export async function uploadImport(form:FormData) {
  let id="",error="";
  try{const file=form.get("file");if(!(file instanceof File)||file.size>5_000_000)throw new Error("Выберите XLSX или CSV размером до 5 МБ.");id=(await uploadBusiness(Buffer.from(await file.arrayBuffer()),file.name)).id;}catch(e){error=humanError(e);}
  redirect(error?`/imports?error=${encodeURIComponent(error)}`:`/imports?draft=${id}`);
}
export async function validateImport(form:FormData) {
  const id=String(form.get("id")),mapping:Mapping={};let error="";
  try {for(const f of fields){const v=form.get(`map_${f}`);if(v!=null&&v!=="")mapping[f]=Number(v);}
    await validateBusiness(id,{sheetName:String(form.get("sheetName")),mapping,dateFormat:String(form.get("dateFormat")),numericFormat:String(form.get("numericFormat")),profileId:String(form.get("profileId")||"")||undefined,profileName:String(form.get("profileName")||"")||undefined});}catch(e){error=humanError(e);}
  redirect(`/imports?draft=${encodeURIComponent(id)}${error?`&sheet=${encodeURIComponent(String(form.get("sheetName")))}&profile=${encodeURIComponent(String(form.get("profileId")||""))}&error=${encodeURIComponent(error)}`:""}`);
}
export async function commitImport(form:FormData) {const id=String(form.get("id"));let error="";try{await commitBusiness(id);revalidatePath("/");revalidatePath("/imports");}catch(e){error=humanError(e);}redirect(`/imports?draft=${encodeURIComponent(id)}${error?`&error=${encodeURIComponent(error)}`:""}`);}
