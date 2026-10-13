'use client';
import {useState} from 'react';
import {pageSeoReview} from '@/app/seo-review-actions';
import type {ActionState as ReviewActionState} from '@/lib/seo-review/v3/contract';
import {PageSeoReviewOutput} from './page-seo-review-output';
export function PageSeoReview({pageId,enabled,selection='M3'}:{pageId:string;enabled:boolean;selection?:string}){
 const [busy,setBusy]=useState(false),[state,setState]=useState<ReviewActionState|null>(null);
 async function run(){if(busy)return;setBusy(true);setState(null);try{setState(await pageSeoReview(pageId,selection));}catch{setState({ok:false,code:'NETWORK',message:'SEO Review не выполнен. Автоматических повторов нет.'});}finally{setBusy(false);}}
 return <section className="panel" data-page-seo-review data-status={busy?'RUNNING':state?.ok?'SUCCESS':state?'ERROR':'READY'}>
  <h2>AI SEO Review</h2><p>Ручной анализ одной страницы по сохранённым данным. Предложения требуют проверки человеком. Изменения сайта не выполняются.</p>
  <p>Search: {selection}. Commerce: 28 дней. Snapshot, периоды и неполное покрытие будут указаны в основаниях.</p>
  {enabled?<button type="button" disabled={busy} onClick={run}>{busy?'Анализируем SEO страницы…':'Проанализировать SEO страницы'}</button>:<p role="status">AI SEO Review недоступен</p>}
  <div aria-live="polite" aria-busy={busy}>{state&&!state.ok&&<p role="alert">{state.message} ({state.code})</p>}{state?.ok&&<PageSeoReviewOutput review={state.review}/>}</div>
 </section>;
}
