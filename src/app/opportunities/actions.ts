"use server";
import {selectedSearch} from '@/lib/search/periods';
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { calculateOpportunities, saveRulesConfig, setOpportunityStatus } from "../../lib/opportunities/service";
import { selectedDays } from "../../lib/opportunities/dataset";
import { defaults, type RulesConfig } from "../../lib/opportunities/model";
import { humanError } from "../../lib/i18n/ru";
import {calculateSeoActions} from '../../lib/seo-actions/service';
export async function recalculate(form:FormData) {const n=selectedSearch(String(form.get("period")));let message="";try{const r=await calculateOpportunities(n);await calculateSeoActions(n);message=`Расчёт завершён. Найдено возможностей: ${r.signals}.`;}catch(e){message=humanError(e);}revalidatePath("/");revalidatePath("/opportunities");redirect(`/opportunities?period=${n}&message=${encodeURIComponent(message)}`);}
export async function saveThresholds(form:FormData) {let message="";try{const c={...defaults};for(const k of Object.keys(defaults) as (keyof RulesConfig)[])if(k==="ctrMode")c.ctrMode=String(form.get(k)) as RulesConfig["ctrMode"];else(c as unknown as Record<string,unknown>)[k]=Number(form.get(k));await saveRulesConfig(c);message="Пороги сохранены. Пересчитайте возможности.";}catch(e){message=humanError(e);}redirect(`/opportunities?message=${encodeURIComponent(message)}`);}
export async function changeStatus(form:FormData) {const id=String(form.get("id")),status=String(form.get("status"));if(status==="ACTIVE"||status==="DISMISSED")await setOpportunityStatus(id,status);revalidatePath("/");revalidatePath("/opportunities");revalidatePath(`/opportunities/${id}`);revalidatePath("/pages");}

