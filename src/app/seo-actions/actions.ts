'use server';
import {humanError} from '@/lib/i18n/ru';
import {redirect} from 'next/navigation';
import {revalidatePath} from 'next/cache';
import {calculateSeoActions,setSeoStatus,saveSeoConfig,loadSeoConfig} from '@/lib/seo-actions/service';
import {selectedSearch} from '@/lib/search/periods';
import {calculateOpportunities} from '@/lib/opportunities/service';
import {currentSite} from '@/lib/yandex/settings';
export async function recalculateSeo(form:FormData){const n=selectedSearch(String(form.get('period')));let message='';try{await calculateOpportunities(n);const r=await calculateSeoActions(n);message=`Расчёт завершён: ${r.actions.length} рекомендаций.`;}catch(e){message=humanError(e);}revalidatePath('/');revalidatePath('/pages');redirect(`/seo-actions?period=${n}&message=${encodeURIComponent(message)}`);}
export async function statusSeo(form:FormData){let message='';try{await setSeoStatus(String(form.get('id')),String(form.get('status')),String(form.get('comment')??''));message='Статус сохранён.';}catch(e){message=humanError(e);}revalidatePath('/');revalidatePath('/pages');redirect(`/seo-actions?period=${selectedSearch(String(form.get('period')))}&message=${encodeURIComponent(message)}`);}
export async function configSeo(form:FormData){let message='';try{const site=await currentSite(),c=await loadSeoConfig(site.id);for(const key of Object.keys(c).filter(k=>k!=='dictionaries'))(c as unknown as Record<string,unknown>)[key]=Number(form.get(key));for(const key of Object.keys(c.dictionaries) as (keyof typeof c.dictionaries)[])c.dictionaries[key]=String(form.get('dict_'+key)??'').split('\n').map(w=>w.trim()).filter(Boolean);await saveSeoConfig(c);message='Настройки сохранены. Пересчитайте рекомендации.';}catch(e){message=humanError(e);}redirect(`/seo-actions?period=${selectedSearch(String(form.get('period')))}&message=${encodeURIComponent(message)}`);}

