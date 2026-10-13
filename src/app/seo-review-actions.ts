'use server';
import {aiAvailable} from '@/lib/ai/config';
import {AiError} from '@/lib/ai/provider';
import {buildPageSeoReviewInput} from '@/lib/seo-review/evidence';
import {DeepSeekSeoReviewProvider,reviewPage} from '@/lib/seo-review/v3/service';
import type {ActionState as ReviewActionState} from '@/lib/seo-review/v3/contract';
const active=new Set<string>();
export async function pageSeoReview(pageId:string,selection='M3'):Promise<ReviewActionState>{
 if(!aiAvailable())return {ok:false,code:'UNAVAILABLE',message:'AI SEO Review недоступен.'};
 if(typeof pageId!=='string'||!/^[a-zA-Z0-9_-]{1,100}$/.test(pageId))return {ok:false,code:'INVALID_PAGE',message:'Страница недоступна.'};
 if(active.has(pageId)||active.size>=2)return {ok:false,code:'BUSY',message:'SEO Review уже выполняется. Дождитесь завершения.'};
 active.add(pageId);const start=performance.now();
 try{
  const input=await buildPageSeoReviewInput(pageId,selection),builderMs=performance.now()-start,review=await reviewPage(input,new DeepSeekSeoReviewProvider());
  review.metadata.builderMs=builderMs;review.metadata.totalMs=performance.now()-start;
  // Counts, codes and timings only. Neither accepted nor rejected model text is logged.
  console.info('PAGE_SEO_REVIEW',{pageId,...review.metadata,validation:review.validation});
  return {ok:true,review};
 }catch(e){const code=e instanceof AiError?e.code:'INTERNAL';console.info('PAGE_SEO_REVIEW',{pageId,success:false,code,totalMs:performance.now()-start});
  return {ok:false,code,message:code==='INPUT_TOO_LARGE'?'Профиль превышает безопасный размер. Текст не был незаметно усечён.':'SEO Review не выполнен. Автоматических повторов нет.'};
 }finally{active.delete(pageId);}
}
