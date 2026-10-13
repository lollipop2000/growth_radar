import React from 'react';
import type {AiAnalysisResponse} from '@/lib/ai/contract';
export function AiAnalysisOutput({analysis}:{analysis:AiAnalysisResponse}){return <>
 <p>DeepSeek · {analysis.metadata.model} · {analysis.metadata.promptVersion}</p>
 <h3>Краткий вывод</h3><p>{analysis.result.executiveSummary}</p>
 <h3>Рекомендации AI</h3>
 {analysis.validation.rejectedCount>0&&<p role='status'>{analysis.validation.rejectedCount} предложения не прошли проверку доказательств и не показаны.</p>}
 {analysis.validation.outcome==='ALL_REJECTED'?<p role='alert'>AI-анализ завершён, но предложения не прошли проверку достоверности.</p>:!analysis.result.actions.length&&<p>{analysis.metadata.emptyReason==='NO_FINDINGS'?'Нет сохранённых сигналов для AI-действий. DeepSeek не вызывался.':analysis.metadata.emptyReason==='NO_ALLOWED_CONTEXT'?'Нет допустимых контекстов действий. DeepSeek не вызывался.':'На имеющихся данных нет достаточных оснований для дополнительных рекомендаций.'}</p>}
 {analysis.result.actions.map((r,i)=><article key={i} className='panel'>
  <h4>{i+1}. {r.finding.title}</h4><p><strong>{r.action.type==='CHANGE'?'Предлагаемое изменение':'Рекомендуется проверить'}</strong> · {r.action.area}</p>
  <p>Сохранённый сигнал: {r.finding.ruleId} · Приоритет: {r.finding.priority} · Score: {r.finding.score??'UNKNOWN'} · Уверенность сигнала: {r.finding.confidence}</p>
  <p>Период сигнала: {r.finding.period.from} — {r.finding.period.to}</p>
  <h5>Что известно — данные сервера</h5><ul>{r.observedFacts.map((f,n)=><li key={n}>{f.label}: {f.value} <small>({f.evidenceId})</small></li>)}</ul>
  <p><strong>Почему предлагается проверка или изменение:</strong> {r.action.rationale}</p><p><strong>Что предлагаем:</strong> {r.action.description}</p>
  {r.action.type==='CHANGE'&&r.action.example&&<p><strong>Предлагаемый текст:</strong> {r.action.example}</p>}
  {r.action.type==='CHECK'&&!!r.action.questionsToVerify?.length&&<><h5>Вопросы для проверки</h5><ul>{r.action.questionsToVerify.map((q,n)=><li key={n}>{q}</li>)}</ul></>}
  <h5>Ограничения</h5><ul>{r.limitations.map((l,n)=><li key={n}>{l}</li>)}</ul>
  <h5>Основания</h5>{r.evidenceIds.map(id=>{const e=analysis.evidence.find(e=>e.id===id);return <details key={id}><summary>{id} · {e?.state} · {e?.coverage??'UNKNOWN'}{e?.truncated?' · данные усечены':''}</summary><p>Источник: {e?.source} · наблюдалось: {e?.observedAt??'дата не задана'} · подтверждение отсутствия: {e?.supportsAbsenceClaim?'да':'нет'}</p><pre style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{JSON.stringify(e?.value,null,2)}</pre></details>;})}
 </article>)}
 <details><summary>Периоды и качество evidence</summary>{analysis.evidence.filter(e=>e.id.startsWith('COMMERCE_')||e.id.startsWith('QUALITY_')||e.id==='SEARCH_01').map(e=><p key={e.id}>{e.id} · {e.state}: {JSON.stringify(e.value)}</p>)}</details>
 </>;}
