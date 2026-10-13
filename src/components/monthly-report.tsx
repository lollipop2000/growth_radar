import {timed} from '@/lib/timing';
import Link from 'next/link';

import {analyticsSearchDataset} from '@/lib/search/dataset';
import {rangeForSite} from '@/lib/search/range';
import {currentSite,readIntegration,config} from '@/lib/yandex/settings';
import {db} from '@/lib/db';
import {day} from '@/lib/yandex/dates';
import {aggregateQueries} from '@/lib/seo-actions/engine';

import {searchCoverage,demandMetric} from '@/lib/search/metrics';
import {SearchPeriodLinks} from './search-period';
import {MonthlySearchTrend} from './monthly-search';
import {number} from '@/lib/i18n/ru';
export async function MonthlySearchReport({selection,site:providedSite}:{selection:number|string;site?:Awaited<ReturnType<typeof currentSite>>}){const site=providedSite??await currentSite(),range=await rangeForSite(site.id,selection),w=config((await readIntegration('WEBMASTER'))?.configJson);
const [rows,totalPages]=await Promise.all([analyticsSearchDataset({siteId:site.id,date:{gte:day(range.from),lte:day(range.to)}},w.siteId===site.id?w.hostId:undefined),db.page.count({where:{siteId:site.id,active:true}})]),summary=await timed('render-prep',async()=>{const clusters=aggregateQueries(rows);return {clusters,queries:clusters.length,impressions:clusters.reduce((s,r)=>s+r.impressions,0),clicks:clusters.reduce((s,r)=>s+r.clicks,0)};}),urls=new Set(rows.map(r=>r.url)),matched=new Set(rows.filter(r=>r.pageId).map(r=>r.url)),pages=new Set(rows.flatMap(r=>r.pageId?[r.pageId]:[])),coverage=searchCoverage(rows,range);return <><h1>Яндекс Вебмастер</h1><SearchPeriodLinks base='/webmaster' selection={selection}/><p>Период поиска: {range.from} — {range.to}. Используются месячные наблюдения; совпадающие дневные значения исключены.</p><section className='panel'><h2>Полнота поисковых данных</h2><p>Наблюдений: {rows.length}; запросов: {summary.queries}; URL: {urls.size}; страниц с Search: {pages.size}/{totalPages}; сопоставлено URL: {matched.size}/{urls.size} ({number(urls.size?matched.size/urls.size*100:null)}%); покрытие месяцев: {number(coverage.observed)}/{coverage.expected}.</p><p>Показы: {number(summary.impressions)}; клики: {number(summary.clicks)}; спрос по данным выгрузки: {number(demandMetric(rows))}. Наличие месяцев не доказывает полноту всех запросов сайта.</p></section><MonthlySearchTrend rows={rows} from={range.from} to={range.to}/><section className='panel'><h2>Поисковые запросы</h2><div className='table-scroll'><table><thead><tr>{['Запрос','Показы','Клики','CTR, %','Средняя позиция','Спрос'].map(h=><th key={h}>{h}</th>)}</tr></thead><tbody>{summary.clusters.sort((a,b)=>b.impressions-a.impressions).slice(0,100).map(r=><tr key={r.query}><td>{r.query}</td><td>{number(r.impressions)}</td><td>{number(r.clicks)}</td><td>{number(r.ctr)}</td><td>{number(r.avgPosition)}</td><td>{number(r.demand)}</td></tr>)}</tbody></table></div><p>Первые 100 запросов по показам; сводка учитывает весь выбранный период.</p></section><Link href='/seo-actions?period=M3'>SEO-рекомендации</Link> · <Link href='/webmaster?period=30'>Дневная статистика и задания API</Link></>;}


