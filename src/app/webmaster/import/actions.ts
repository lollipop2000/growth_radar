'use server';
import {humanError} from '@/lib/i18n/ru';
import {redirect} from 'next/navigation';
import {revalidatePath} from 'next/cache';
import {uploadSearch,previewSearch,commitSearch} from '@/lib/search/import-service';
import {searchFields,type SearchMapping} from '@/lib/search/import';
export async function upload(form:FormData){let id='',error='';try{const file=form.get('file');if(!(file instanceof File))throw new Error('Выберите файл.');id=(await uploadSearch(Buffer.from(await file.arrayBuffer()),file.name)).id;}catch(e){error=humanError(e);}redirect(`/webmaster/import?${id?'id='+id:'error='+encodeURIComponent(error)}`);}
export async function validate(form:FormData){const id=String(form.get('id'));let error='';try{const mapping:SearchMapping={};for(const f of searchFields){const v=form.get(f);if(v!=null&&v!=='')mapping[f]=Number(v);}await previewSearch(id,String(form.get('sheet')),mapping);}catch(e){error=humanError(e);}redirect(`/webmaster/import?id=${id}${error?'&error='+encodeURIComponent(error):''}`);}
export async function commit(form:FormData){const id=String(form.get('id'));let error='';try{await commitSearch(id);}catch(e){error=humanError(e);}revalidatePath('/webmaster');revalidatePath('/pages');redirect(`/webmaster/import?id=${id}${error?'&error='+encodeURIComponent(error):''}`);}

