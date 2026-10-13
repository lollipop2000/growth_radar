import type {ReviewResponse} from '@/lib/seo-review/contract';
import type {Response as V3Response} from '@/lib/seo-review/v3/contract';
const labels:Record<string,string>={HTML_TITLE:'HTML <title>',META_DESCRIPTION:'HTML <meta name="description">',H1:'HTML <h1>',BODY_CONTENT:'Основной текст страницы',APPLICATION_BLOCK:'Блок применения',SPECIFICATION_BLOCK:'Характеристики',PACKAGING_BLOCK:'Фасовка',INTERNAL_LINK:'Внутренняя гиперссылка',CANONICAL:'HTML canonical',ROBOTS:'HTML robots',STRUCTURED_DATA:'Структурированные данные',HTTP_STATUS:'HTTP-ответ',CTA:'Призыв к действию',SEARCH_INTENT_REVIEW:'Соответствие поисковому намерению',LANDING_HYPOTHESIS:'Гипотеза посадочной страницы'};
export function PageSeoReviewOutput({review}:{review:ReviewResponse|V3Response}){const {result,validation}=review;const counts={READY_CHANGE:0,GROWTH_HYPOTHESIS:0,DATA_CHECK:0};for(const r of result.recommendations)counts[r.outcome]++;
 return <div data-seo-review-output>
  <h3>Общая оценка</h3><p>{result.summary.overallAssessment}</p>
  <h4>Подтверждённые наблюдения snapshot</h4>{result.summary.strengths.map((s,n)=><p key={n}>{s}</p>)}
  <p>Принято: {validation.accepted}. Отклонено: {validation.rejected}. AI priority — приоритет гипотезы, не оценка системы.</p>
  <p>Готовые изменения: {counts.READY_CHANGE}. Ростовые гипотезы: {counts.GROWTH_HYPOTHESIS}. Проверки данных: {counts.DATA_CHECK}. Проверки данных сами по себе не подтверждают SEO-эффективность.</p>
  {result.recommendations.map(r=><article className="panel" key={r.id} data-seo-recommendation data-status={r.status}>
   <h3>{r.area} · {r.priority} · {r.recommendationType}</h3>
   <p><strong>{r.outcome}</strong> · Готовность к рассмотрению человеком, без публикации.</p>
   {r.quality&&<div>
    <p>B2B-интент: {r.quality.b2bIntent} · Сложность: {r.quality.implementationComplexity} · Полнота evidence: {r.quality.evidenceConfidence}</p>
    <p>Предполагаемая SEO-ценность (гипотеза): {r.quality.seoValue}</p>
    <p>Подтверждённые поисковые наблюдения этой страницы, не прогноз спроса:</p>
    {r.quality.confirmedSearch.length?r.quality.confirmedSearch.map(q=><p key={q.evidenceId}>{q.evidenceId} · {String(q.query)} · Показы: {String(q.impressions)} · Клики: {String(q.clicks)} · {q.period?.from}–{q.period?.to}</p>):<p>UNKNOWN — цитируемых Search queries нет.</p>}
   </div>}
   <p><strong>{r.status==='SUPPORTED'?'Есть проверяемая опора на данные':'Требует ручной SEO-проверки'}</strong></p>
   <p>{r.finding}</p><p>{r.rationale}</p><p><strong>Действие:</strong> {r.proposedAction}</p>
   {'statements' in r&&<details><summary>Наблюдения, интерпретации и гипотезы</summary>{r.statements.map((s,n)=><p key={n}>{s.kind}: {s.text}</p>)}</details>}
   <p><strong>Цель изменения:</strong> {labels[r.placement]??r.placement} · {r.operation}</p>
   {r.proposedContent?.currentText&&<p>Текущее: {r.proposedContent.currentText}</p>}
   {r.proposedContent?.suggestedText&&<p>Предлагаемый текст: {r.proposedContent.suggestedText}</p>}
   {r.targetUrl&&<p>Известная страница: {r.targetUrl}</p>}
   {!!r.targetQueries?.length&&<p>Запросы: {r.targetQueries.join(' · ')}</p>}
   {r.uncertainty&&<p>Неопределённость: {r.uncertainty}</p>}
   {!!r.verificationSteps?.length&&<><h4>Как проверить</h4><ol>{r.verificationSteps.map((v,n)=><li key={n}>{v}</li>)}</ol></>}
   {'verifiedFacts' in r&&<details><summary>Связанные значения и полнота данных</summary>{r.verifiedFacts.map((f,n)=><p key={n}>{f.reference.evidenceId} · {f.reference.fieldPath} · {f.reference.purpose} · {f.state} / {f.coverage}: {typeof f.value==='string'?f.value:JSON.stringify(f.value)}</p>)}</details>}
   <details><summary>Основания ({r.evidence.length})</summary>{r.evidence.map(e=><div key={e.id}>
    <p>{e.id} · {e.kind} · {e.source} · {e.state} · {e.coverage}{e.truncated?' · TRUNCATED':''}</p>
    <p>Дата snapshot: {e.observedAt??'не указана'}{e.period?` · Период: ${e.period.from}–${e.period.to}`:''}</p>
    <pre style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{typeof e.value==='string'?e.value:JSON.stringify(e.value,null,2)}</pre>
   </div>)}</details><p>Проверки: {r.reasonCodes.join(', ')}</p>
  </article>)}
  <h3>Ограничения</h3><ul>{result.limitations.map((v,n)=><li key={n}>{v}</li>)}</ul>
  {validation.rejected>0&&<details><summary>Коды отклонений</summary>{validation.decisions.filter(d=>d.status==='REJECTED').map(d=><p key={d.index}>#{d.index+1}: {d.reasonCodes.join(', ')}</p>)}</details>}
 </div>;
}
