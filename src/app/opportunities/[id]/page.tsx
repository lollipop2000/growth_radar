import {priorityOrder} from '@/lib/seo-actions/config';
import {SeoCards} from '@/components/seo-actions';
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "../../../lib/db";
import { currentSite } from "../../../lib/yandex/settings";
import { EvidenceDetail, type Evidence } from "../../../components/opportunities";
import type { scorePage } from "../../../lib/opportunities/score";
import { t, number } from "../../../lib/i18n/ru";
import { publicData } from "../../../lib/public-data";
import { changeStatus } from "../actions";
export const dynamic="force-dynamic";
export default async function Detail({params}:{params:Promise<{id:string}>}) {const {id}=await params,site=await currentSite(),o=await db.opportunity.findFirst({where:{id,siteId:site.id},include:{page:true}});if(!o)notFound();const actions=await db.seoAction.findMany({where:{siteId:o.siteId,pageId:o.pageId,periodFrom:o.periodFrom,periodTo:o.periodTo,isCurrent:true,status:'ACTIVE'}});return <><Link href="/opportunities">{t("Все возможности роста")}</Link><h1>{o.title}</h1><p><Link href={`/pages/${o.pageId}`}>{publicData(o.page.url)}</Link></p><p>Поисковая оценка: {number(o.searchScore)} · Коммерческая оценка: {number(o.commerceScore)} · Общая оценка: {number(o.overallScore??o.score)}</p><p><strong>{t("Оценка")}: {number(o.score)}</strong> · {t(o.status)} · {t(o.severity)}</p>{!o.isCurrent&&<p className="notice">{t("Возможность не подтверждена последним расчётом этого периода. Показан сохранённый снимок.")}</p>}<section className="panel"><h2>{t("Что обнаружено")}</h2><p>{o.description}</p><form action={changeStatus}><input type="hidden" name="id" value={id}/><input type="hidden" name="status" value={o.status==="DISMISSED"?"ACTIVE":"DISMISSED"}/><button>{t(o.status==="DISMISSED"?"Вернуть":"Скрыть возможность")}</button></form></section><section><h2>Что можно изменить на странице</h2><SeoCards items={actions.sort((a,b)=>priorityOrder.indexOf(a.priority)-priorityOrder.indexOf(b.priority)).slice(0,5)}/></section><EvidenceDetail evidence={o.evidenceJson as unknown as Evidence} breakdown={o.scoreBreakdownJson as unknown as ReturnType<typeof scorePage>}/></>;}


