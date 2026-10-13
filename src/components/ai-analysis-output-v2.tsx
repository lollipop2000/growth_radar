import React from 'react';
import type {AiAnalysisResponseV2 as AiAnalysisResponse} from '@/lib/ai/contract';
export function AiAnalysisOutput({analysis}:{analysis:AiAnalysisResponse}){return <>
        <p>DeepSeek · {analysis.metadata.model} · {analysis.metadata.promptVersion}</p>
        <h3>Краткий вывод</h3><p>{analysis.result.executiveSummary}</p><h3>Рекомендации AI</h3>
        {analysis.validation.rejectedCount>0&&<p role='status'>{analysis.validation.rejectedCount} предложения не прошли проверку доказательств и не показаны.</p>}
        {analysis.validation.outcome==='ALL_REJECTED'?<p role='alert'>AI-анализ завершён, но предложения не прошли проверку достоверности.</p>:
          !analysis.result.recommendations.length&&<p>На имеющихся данных нет достаточных оснований для дополнительных рекомендаций.</p>}
        {analysis.result.recommendations.map((r,i)=><article key={i} className='panel'>
          <h4>{i+1}. {r.title}</h4><p><strong>{r.proposedAction.type==='CHANGE'?'Предлагаемое изменение':'Рекомендуется проверить'}</strong></p>
          <h5>Что известно</h5><ul>{r.observedFacts.map((fact,n)=><li key={n}>{fact.statement} <small>({fact.evidenceIds.join(', ')})</small></li>)}</ul>
          {r.hypothesis&&<p><strong>Гипотеза, требует проверки:</strong> {r.hypothesis}</p>}<p><strong>Почему:</strong> {r.rationale}</p>
          <p><strong>Что предлагаем:</strong> {r.proposedAction.description}</p>{r.proposedAction.type==='CHANGE'&&r.proposedAction.example&&<p><strong>Предлагаемый текст:</strong> {r.proposedAction.example}</p>}
          <p><strong>Ожидаемый эффект:</strong> {r.expectedEffect}</p><p><strong>Уверенность:</strong> {r.confidence}</p>
          {r.uncertainty&&<p><strong>Ограничения:</strong> {r.uncertainty}</p>}
          <h5>Основания</h5>{r.evidenceIds.map(id=>{const e=analysis.evidence.find(e=>e.id===id);return <details key={id}><summary>{id} · {e?.state} · {e?.coverage??'UNKNOWN'}{e?.truncated?' · данные усечены':''}</summary><p>Источник: {e?.source} · наблюдалось: {e?.observedAt??'дата не задана'} · подтверждение отсутствия: {e?.supportsAbsenceClaim?'да':'нет'}</p><pre style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{JSON.stringify(e?.value,null,2)}</pre></details>;})}
        </article>)}
        <h3>Ограничения анализа</h3><ul>{analysis.result.limitations.map((v,i)=><li key={i}>{v}</li>)}</ul>
        <details><summary>Периоды и качество evidence</summary>{analysis.evidence.filter(e=>e.id.startsWith('COMMERCE_')||e.id.startsWith('QUALITY_')||e.id==='SEARCH_01').map(e=><p key={e.id}>{e.id} · {e.state}: {JSON.stringify(e.value)}</p>)}</details>

</>;}
