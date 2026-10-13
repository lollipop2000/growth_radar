import Link from "next/link";
import {selectedSearch,searchPeriods} from '@/lib/search/periods';
import {rangeForSite} from '@/lib/search/range';
import {SearchPeriodLinks} from '@/components/search-period';
import { db } from "../../lib/db";
import { currentSite } from "../../lib/yandex/settings";
import { period, day } from "../../lib/yandex/dates";
import { selectedDays, loadRulesConfig } from "../../lib/opportunities/dataset";
import { pageTypes } from "../../lib/scanner/url";
import { ruleIds } from "../../lib/opportunities/rules";
import { t, number } from "../../lib/i18n/ru";
import { publicData } from "../../lib/public-data";
import { OpportunityCards, type Evidence } from "../../components/opportunities";
import { recalculate, saveThresholds } from "./actions";
import type { Prisma } from "@prisma/client";
import { readIntegration, config } from "../../lib/yandex/settings";
import { goalConfig } from "../../lib/yandex/goal-types";
import {mainTop} from "../../lib/opportunities/top";
export const dynamic="force-dynamic";
export default async function Opportunities({searchParams}:{searchParams:Promise<Record<string,string|undefined>>}) {
  const q=await searchParams,n=selectedSearch(q.period),site=await currentSite(),dates=await rangeForSite(site.id,n),thresholds=await loadRulesConfig(site.id);
  const m=config((await readIntegration("METRIKA"))?.configJson),goals=goalConfig(m.siteId===site.id&&m.counterId===process.env.YANDEX_METRIKA_COUNTER_ID?m:{}),businessConfigured=Object.values(goals.goalTypes).includes("BUSINESS_CONVERSION");
  const filters:Prisma.OpportunityWhereInput[]=[];for(const [param,path] of [["category","category"]])if(q[param])filters.push({evidenceJson:{path:["page","business",path],equals:q[param]}});
  if(q.domain!=="DATA_QUALITY"&&q.rule!=="RULE_21")filters.push({domain:{not:"DATA_QUALITY"}});
  if(q.group)filters.push({OR:[{evidenceJson:{path:['page','commerce','groups'],array_contains:[{code:q.group}]}},{evidenceJson:{path:['page','business','productGroup'],equals:q.group}}]});
  if(['SEARCH','COMMERCE','DATA_QUALITY'].includes(q.domain??''))filters.push({domain:q.domain});
  if(['RISK','GROWTH'].includes(q.domain??''))filters.push({primaryType:q.domain});
  if(q.stock==='ZERO')filters.push({evidenceJson:{path:['page','commerce','stock'],equals:0}});
  if(q.stock==='LOW')filters.push({AND:[{evidenceJson:{path:['page','commerce','daysOfStock'],lt:thresholds.lowStockDays}},{evidenceJson:{path:['page','commerce','daysOfStock'],gte:0}}]});
  if(q.stock==='HIGH')filters.push({evidenceJson:{path:['page','commerce','daysOfStock'],gt:thresholds.overstockDays}});
  if(q.trend==='DOWN')filters.push({evidenceJson:{path:['page','commerce','changes','revenue'],lt:0}});
  if(q.trend==='UP')filters.push({evidenceJson:{path:['page','commerce','changes','revenue'],gt:0}});
  if(['true','false'].includes(q.availability??''))filters.push({evidenceJson:{path:['page','commerce','available'],equals:q.availability==='true'}});
  if(q.priority&&!isNaN(Number(q.priority)))filters.push({evidenceJson:{path:["page","business","priority"],gte:Number(q.priority)}});
  const items=await db.opportunity.findMany({where:{siteId:site.id,isCurrent:true,periodFrom:day(dates.from),periodTo:day(dates.to),status:q.status==="DISMISSED"?"DISMISSED":"ACTIVE",score:{gte:Math.max(0,Math.min(100,Number(q.score)||0))},...(ruleIds.includes(q.rule??"")?{ruleId:q.rule}:{}),...(pageTypes.includes(q.type as typeof pageTypes[number])?{page:{pageType:q.type}}:{}),AND:filters},orderBy:[{score:"desc"},{id:"asc"}],take:500});
  const top=mainTop(items);
  return <><h1>{t("Opportunities")}</h1><SearchPeriodLinks base="/opportunities" selection={n}/><p>Период: {dates.from} — {dates.to}.</p><p>{t("Возможности рассчитаны по сохранённым данным. Пересчёт не запускает сканирование и не создаёт выгрузки Яндекса.")}</p>{!businessConfigured&&<p className="notice">{t("businessGoalsMissing")} <Link href="/settings">{t("Settings")}</Link></p>}<p className="muted">{t("recalculateAfterGoalTypes")}</p>{q.message&&<p role="status" className="notice">{publicData(q.message)}</p>}
    <section className="panel"><form action={recalculate}><label>{t("Период")}<select name="period" defaultValue={String(n)}>{searchPeriods.map(([v,label])=><option key={v} value={v}>{label}</option>)}{[7,28,30,90].map(v=><option value={v} key={v}>{v} {t("дней")}</option>)}</select></label><button>{t("Пересчитать возможности")}</button></form></section>
    <p><Link href={`/opportunities?period=${n}&domain=DATA_QUALITY`}>Качество данных отдельно</Link> · <Link href="/business-data">Бизнес-данные</Link></p><h2>{t("TOP-5 возможностей роста")}</h2><OpportunityCards items={top}/>
    <section className="panel"><h2>{t("Все возможности роста")}</h2><form method="get" className="filters"><label>{t("Период")}<select name="period" defaultValue={String(n)}>{searchPeriods.map(([v,label])=><option key={v} value={v}>{label}</option>)}{[7,28,30,90].map(v=><option value={v} key={v}>{v} {t("дней")}</option>)}</select></label><label>{t("Оценка от")}<input type="number" name="score" min="0" max="100" defaultValue={q.score??0}/></label><label>{t("Правило")}<select name="rule" defaultValue={q.rule??""}><option value="">{t("Все")}</option>{ruleIds.map((r,i)=><option key={r} value={r}>{t(`rule${String(i+1).padStart(2,"0")}`)}</option>)}</select></label><label>{t("Тип страницы")}<select name="type" defaultValue={q.type??""}><option value="">{t("Все")}</option>{pageTypes.map(v=><option key={v} value={v}>{t(v)}</option>)}</select></label><label>Направление<select name="domain" defaultValue={q.domain??''}><option value="">Все</option>{['SEARCH','COMMERCE','RISK','GROWTH','DATA_QUALITY'].map(v=><option key={v} value={v}>{t(v)}</option>)}</select></label><label>Зона запаса<select name="stock" defaultValue={q.stock??''}><option value="">Все</option><option value="ZERO">Нет товара</option><option value="LOW">Низкий запас</option><option value="HIGH">Избыточный запас</option></select></label><label>Динамика продаж (выручка)<select name="trend" defaultValue={q.trend??''}><option value="">Все</option><option value="DOWN">Снижение</option><option value="UP">Рост</option></select></label><label>Наличие<select name="availability" defaultValue={q.availability??''}><option value="">Все</option><option value="true">Есть</option><option value="false">Нет</option></select></label><label>{t("category")}<input name="category" defaultValue={q.category??""}/></label><label>{t("productGroup")}<input name="group" defaultValue={q.group??""}/></label><label>{t("priority")}<input type="number" name="priority" min="0" max="100" defaultValue={q.priority??""} placeholder={t("От 0 до 100")}/></label><label>{t("Статус")}<select name="status" defaultValue={q.status??"ACTIVE"}><option value="ACTIVE">{t("ACTIVE")}</option><option value="DISMISSED">{t("DISMISSED")}</option></select></label><button>{t("Применить фильтры")}</button></form>
      <p>{t("Найдено")}: {number(items.length)}{items.length===500?` · ${t("Показаны первые 500")}`:""}</p><div className="table-scroll"><table><thead><tr>{["Общая оценка","Страница","Возможность","Выручка","Продажи, кг","Остаток, кг","visits","Запас в днях"].map(h=><th key={h}>{t(h)}</th>)}</tr></thead><tbody>{items.map(o=>{const e=publicData(o.evidenceJson as unknown as Evidence),p=e.page;return <tr key={o.id}><td>{number(o.score)}</td><td><Link href={`/pages/${o.pageId}`}>{p.url}</Link></td><td><Link href={`/opportunities/${o.id}`}>{o.title}</Link></td><td>{number(p.commerce?.sales?.revenue)}</td><td>{number(p.commerce?.sales?.quantityKg)}</td><td>{number(p.commerce?.stockKg)}</td><td>{number(p.traffic?.visits)}</td><td>{number(p.commerce?.daysOfStock)}</td></tr>;})}</tbody></table></div></section>
    <details className="panel"><summary>{t("Настройки правил и формулы")}</summary><p>{t("Сравнение CTR по собственным данным: диапазоны позиций 1–3, 4–5, 6–10, 11–20, 21+. Нужно минимум две страницы с достаточными показами. CTR = сумма кликов / сумма показов. Конверсия сравнивается с медианой: от пяти аналогичных страниц либо от трёх страниц всего.")}</p><form action={saveThresholds} className="mapping-grid">{Object.entries(thresholds).map(([key,value])=><label key={key}>{t(`config_${key}`)}{key==="ctrMode"?<select name={key} defaultValue={String(value)}><option value="RELATIVE">{t("По собственным данным")}</option><option value="SIMPLE">{t("Заданный пользователем CTR")}</option></select>:<input type="number" name={key} step="any" min="0" required defaultValue={value}/>}</label>)}<button>{t("Сохранить пороги")}</button></form></details>
  </>;
}
