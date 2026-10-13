'use client';
import {useState} from 'react';
import {AiAnalysisOutput} from './ai-analysis-output';
import {pageAiAnalysis} from '@/app/ai-actions';
import type {AiActionState} from '@/lib/ai/contract';
export function AiAnalysis({pageId,enabled}:{pageId:string;enabled:boolean}) {
  const [busy,setBusy]=useState(false),[state,setState]=useState<AiActionState|null>(null);
  async function run(){if(busy)return;setBusy(true);setState(null);
    try{setState(await pageAiAnalysis(pageId));}catch{setState({ok:false,code:'NETWORK',message:'Не удалось выполнить AI-анализ. Попробуйте повторить.'});}finally{setBusy(false);}
  }
  return <section className='panel' data-ai-analysis data-ai-status={!enabled?'UNAVAILABLE':busy?'RUNNING':state?.ok?'SUCCESS':state?'ERROR':'READY'}>
    <h2>AI-анализ</h2><p>AI использует сохранённые данные Page 360 и не изменяет сайт. Рекомендации AI отделены от вычисленных системой сигналов.</p>
    <p>Search: последние 3 доступных месяца (M3). Commerce: последние 28 дней. Точные периоды и ограничения будут показаны в основаниях.</p>
    {!enabled?<p role='status'>AI-анализ недоступен</p>:<button type='button' disabled={busy} onClick={run}>{busy?'Анализируем данные страницы...':'Проанализировать страницу'}</button>}
    <div aria-live='polite' aria-busy={busy}>
      {state&&!state.ok&&<p role='alert'>{state.message}</p>}
      {state?.ok&&<AiAnalysisOutput analysis={state.analysis}/>}
    </div>
  </section>;
}
