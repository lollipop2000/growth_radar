import {timed} from '../lib/timing';
import {commerceDashboardSummary} from '../lib/business/dashboard-summary';

import {priorityOrder} from '../lib/seo-actions/config';
import Link from 'next/link';
import {db} from '../lib/db';
import {selectedDays} from '../lib/opportunities/dataset';
import {day} from '../lib/yandex/dates';
import {t,number,money,date} from '../lib/i18n/ru';
import {OpportunityCards,type Evidence} from '../components/opportunities';
import {publicData} from '../lib/public-data';
import {freshness} from '../lib/yandex/views';
import {mainTop} from '../lib/opportunities/top';

import {defaultSearchSelection,rangeForSite} from '../lib/search/range';
export const dynamic='force-dynamic';
export default async function Dashboard({searchParams}:{searchParams:Promise<{period?:string}>}){
  const n=selectedDays((await searchParams).period);
  let d:Awaited<ReturnType<typeof commerceDashboardSummary>>;try{d=await timed('commerce',()=>commerceDashboardSummary(n));}catch{return <><h1>{t('Dashboard')}</h1><p>Сначала настройте магазин и подключите источники данных.</p><Link href='/settings'>{t('Settings')}</Link></>;}
  const [all,fresh]=await Promise.all([db.opportunity.findMany({where:{siteId:d.siteId,isCurrent:true,status:'ACTIVE',periodFrom:day(d.period.from),periodTo:day(d.period.to)},orderBy:[{score:'desc'},{id:'asc'}]}),freshness()]);
  const top=mainTop(all),b=d.totals.sales,m=d.totals.traffic;
  const seoPeriod=await rangeForSite(d.siteId,await defaultSearchSelection(d.siteId,undefined,n));
  const seo=(await db.seoAction.findMany({where:{siteId:d.siteId,isCurrent:true,status:'ACTIVE',periodFrom:day(seoPeriod.from),periodTo:day(seoPeriod.to)}})).filter(a=>(a.evidenceJson as {eligibility?:string})?.eligibility!=='NOT_ELIGIBLE').sort((a,b)=>priorityOrder.indexOf(a.priority)-priorityOrder.indexOf(b.priority)).slice(0,5);
  const quality=d.quality;
  const visits=m?.visits,ratio=(v:number|null|undefined)=>v!=null&&visits!=null&&visits>0?v/visits:null;
  return <><h1>Коммерческий радар роста · {t('Dashboard')}</h1><form method="get"><label>Период<select name="period" defaultValue={n}>{[7,28,30,90].map(v=><option key={v} value={v}>{v} дней</option>)}</select></label><button>Показать</button></form><p>{n} полных дней: {date(d.period.from)} — {date(d.period.to)}</p>
    <p>Подтверждённое покрытие транзакционных продаж: по {d.confirmedThrough?date(d.confirmedThrough):"не подтверждено"}. {d.confirmedThrough&&d.period.to>d.confirmedThrough&&"Период после этой даты неизвестен; KPI отражают только наблюдённую часть, а отсутствие текущих сигналов не означает отсутствия рисков."}</p><p>Сохранённые Commerce-рекомендации: {date(d.period.from)} — {date(d.period.to)}. Исторические результаты другого периода здесь не подставляются.</p><section className="panel" data-commerce-kpi><h2>Коммерческие показатели</h2><dl className="metric-grid">{[['Выручка',money(b?.revenue)],['Продажи, кг',number(b?.quantityKg)],['Заказы',number(b?.orders)],['Визиты',number(visits)],['₽ / визит',money(ratio(b?.revenue))],['кг / визит',number(ratio(b?.quantityKg),4)],['Страницы без продаж',number(d.commerce.zeroSalesPages)],['Сохранённые сигналы риска дефицита',number(new Set(all.filter(o=>['RULE_12','RULE_13','RULE_22'].includes(o.ruleId)).map(o=>o.pageId)).size)],['Сохранённые сигналы избыточного запаса',number(new Set(all.filter(o=>o.ruleId==='RULE_14').map(o=>o.pageId)).size)]].map(([k,v])=><div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl><p className="muted">Суммы относятся к сопоставленным SKU и страницам. Визиты включают весь импортированный трафик; это показатель сайта, а не атрибуция продаж. Заказы суммируются по SKU и могут пересекаться между товарами.</p></section>
    <section><h2>SEO: что улучшить</h2><p>Поисковый период: {date(seoPeriod.from)} — {date(seoPeriod.to)}</p><ul>{seo.map(a=>{const e=publicData(a.evidenceJson) as Record<string,unknown>;return <li key={a.id}><Link href={`/pages/${a.pageId}`}>{d.pages.find(p=>p.id===a.pageId)?.url}</Link> · {a.priority==='VERY_HIGH'?'Очень высокий':a.priority==='HIGH'?'Высокий':a.priority==='MEDIUM'?'Средний':'Низкий'} · {a.title} · {number(e.impressions as number|null)} показов, CTR {number(e.ctr as number|null)}%</li>;})}</ul>{!seo.length&&<p>Нет подтверждённых рекомендаций по текущим поисковым данным.</p>}<Link href="/seo-actions">Все SEO-рекомендации</Link></section><h2>{t('TOP-5 возможностей роста')}</h2><OpportunityCards items={top}/><Link href={`/opportunities?period=${n}`}>{t('Все возможности роста')}</Link>
    {[
      ['Риск дефицита',['RULE_12','RULE_13','RULE_22']],['Трафик без зафиксированной онлайн-продажи',['RULE_11']],['Избыточный запас',['RULE_14']],['Сильные товары с низким трафиком',['RULE_18']]
    ].map(([label,ids])=><section className="panel" key={String(label)}><h2>{String(label)}</h2><ul>{all.filter(o=>(ids as string[]).includes(o.ruleId)).slice(0,5).map(o=>{const p=publicData((o.evidenceJson as unknown as Evidence).page);return <li key={o.id}><Link href={`/opportunities/${o.id}`}>{p.commerce?.groups.map(g=>g.name).join(', ')||p.url}</Link> · {o.title} · {number(o.score)} · Выручка: {money(p.commerce?.sales?.revenue)} · Запас: {number(p.commerce?.daysOfStock)} дней</li>;})}</ul>{!all.some(o=>(ids as string[]).includes(o.ruleId))&&<p>Нет подтверждённых сигналов.</p>}</section>)}
    <section className="panel" data-quality-summary><h2>Качество данных</h2><p>Маппинг SKU: {number(quality.mapping.mappedSku)} / {number(quality.mapping.totalSku)}. Подтверждённый период продаж подписан выше; наличие строк продаж само по себе не доказывает полноту.</p><dl className="metric-grid">{[
      ['Страницы с устаревшими продажами',d.commerce.staleSalesPages],
      ['SKU без коэффициента кг/ед.',quality.mapping.withoutCoefficient],['Неизвестные SKU',quality.unmatched.importedUnknownSku.length],
      ['Страницы с неполным покрытием остатка в кг',d.commerce.incompleteStockKgPages],['Устаревшие цены',quality.prices.outdated],['Устаревшие остатки',quality.stock.outdated]
    ].map(([k,v])=><div key={k}><dt>{k}</dt><dd>{number(Number(v))}</dd></div>)}</dl><Link href="/business-data">Подробнее</Link> · <Link href={`/opportunities?period=${n}&domain=DATA_QUALITY`}>Сигналы качества данных</Link></section>
    <section className="panel"><h2>Поиск и качество трафика</h2><dl className="metric-grid">{[['impressions',d.totals.search?.impressions],['clicks',d.totals.search?.clicks],['businessConversion',m?.goalGroups?.BUSINESS_CONVERSION.rate]].map(([key,v])=><div key={String(key)}><dt>{t(String(key))}</dt><dd>{key==='businessConversion'&&!Object.values(d.goalConfig.goalTypes).includes('BUSINESS_CONVERSION')?t('goalNotConfigured'):number(v as number|null)}</dd></div>)}</dl><p>Поиск: {d.coverage.webmasterDays}/{n} дней · Метрика: {d.coverage.metrikaDays}/{n} дней · Покрытие трафика: {number(d.coverage.totalVisits?100*d.coverage.matchedVisits/d.coverage.totalVisits:null)}%</p>{!Object.values(d.goalConfig.goalTypes).includes('BUSINESS_CONVERSION')&&<p>{t('businessGoalsMissing')}</p>}</section>
    <section className="panel"><h2>Свежесть данных</h2>{fresh.map(r=><p key={r.source}>{t(r.source)}: {t(r.status)} · {date(r.lastSuccess)}</p>)}<Link href="/business-data">Качество коммерческих данных</Link></section>
  </>;
}







