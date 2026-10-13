import Link from "next/link";
import { db } from "../../lib/db";
import { currentSite } from "../../lib/yandex/settings";
import { formats, kinds, type BusinessKind } from "../../lib/business/formats";
import { businessData } from "../../lib/business/views";
import type { Workbook } from "../../lib/business/import";
import type { Selection } from "../../lib/business/service";
import { publicData } from "../../lib/public-data";
import { date, number, t } from "../../lib/i18n/ru";
import { uploadData, validateData, commitData, saveSalesMetadata } from "./actions";
import {businessQuality} from '../../lib/business/quality';
import {SalesImportFields} from '../../components/sales-import-fields';
import {salesModeLabels} from '../../lib/business/sales-mode';
export const dynamic = "force-dynamic";
export default async function BusinessData({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const q = await searchParams, site = await currentSite(), data = await businessData(site);
  const profiles=await db.importProfile.findMany({where:{siteId:site.id,salesImportMode:{in:['PARTIAL','TRANSACTIONAL']}},select:{id:true,name:true,salesImportMode:true}});
  const quality=await businessQuality(site);
  const draft = q.draft ? await db.import.findFirst({ where: { id: q.draft, siteId: site.id, kind: { in: [...kinds] } } }) : null;
  return <><h1>Бизнес-данные</h1><p>Загрузите файлы из 1С. Каждый тип проверяется отдельно; запись данных начинается только после подтверждения предпросмотра.</p>
    {q.message&&<p role="status">{publicData(q.message)}</p>}{q.error && <p role="alert" className="error">{publicData(q.error)}</p>}
    <section className="panel" data-business-quality><h2>Качество бизнес-данных</h2><dl className="metric-grid">{[
      ['Всего SKU',quality.mapping.totalSku],['SKU со страницей',quality.mapping.mappedSku],['Групповых кодов',quality.mapping.productGroups],['Групп со страницей',quality.mapping.groupsWithPage],['Групп без страницы',quality.mapping.unmatchedGroups],
      ['Текущих записей остатков',quality.stock.currentRecords],['Устаревших остатков',quality.stock.outdated],['Текущих записей цен',quality.prices.currentRecords],['Устаревших цен',quality.prices.outdated],['Ценовых аномалий',quality.prices.anomalies],['Строк продаж',quality.sales.totalRows],['SKU с продажами',quality.sales.skuCoverage],['Неизвестных SKU из файлов',quality.unmatched.importedUnknownSku.length]
    ].map(([k,v])=><div key={k}><dt>{k}</dt><dd>{number(Number(v))}</dd></div>)}</dl><p>Продажи: {date(quality.sales.first)} — {date(quality.sales.last)}. Покрытие SKU: {number(quality.sales.skuCoverage)}/{number(quality.sales.totalSku)}.</p>
      <details><summary>Несопоставленные SKU и группы</summary>{[['SKU без группового кода',quality.unmatched.skuWithoutGroup],['Групповые коды без страницы',quality.unmatched.groupsWithoutPage],['Импортированные SKU отсутствуют в маппинге',quality.unmatched.importedUnknownSku],['Страницы с группой без продаж',quality.unmatched.pagesWithoutSales]].map(([label,values])=><div key={String(label)}><h3>{String(label)}</h3><p>Всего: {(values as string[]).length}</p><ul>{(values as string[]).slice(0,100).map(v=><li key={v}>{publicData(v)}</li>)}</ul>{(values as string[]).length>100&&<p>Показаны первые 100.</p>}</div>)}</details>
    </section>
    <section className="panel"><h2>Порядок загрузки</h2><ol>{kinds.map(k => <li key={k}><a href={`#${k.toLowerCase()}`}>{formats[k].title}</a></li>)}</ol>
      <p>SKU и групповой код — текст: ведущие нули нужно сохранять в исходном файле. URL — полный адрес интернет-магазина. Дата — ДД.ММ.ГГГГ или YYYY-MM-DD. Цена и выручка — числа, например 54800, 54800,50 или 54800.50. Остаток и количество — неотрицательные числа.</p>
      <p className="muted">XLSX или CSV в UTF-8, до 5 МБ и 10 000 строк на листе. Формулы не выполняются. Примерную строку шаблона замените своими данными.</p>
      <Link href="/imports">Универсальный импорт и прежняя история</Link>
    </section>
    {kinds.map((kind, i) => {
      const format = formats[kind], history = data.history.filter(h => h.kind === kind).slice(0, 10), stats = kind === "MAPPING" ? null : data.stats[kind];
      return <section className="panel business-upload" key={kind} id={kind.toLowerCase()} data-business-kind={kind}>
        <h2>{i + 1}. {format.title}</h2><p>{format.purpose}</p>
        <h3>Состояние данных</h3><dl className="business-summary">{kind === "MAPPING" ? <>
          <div><dt>SKU с коэффициентом кг/ед.</dt><dd>{number(data.mapping.withCoefficient)}</dd></div><div><dt>SKU без коэффициента кг/ед.</dt><dd>{number(data.mapping.withoutCoefficient)}</dd></div><div><dt>Загружено SKU</dt><dd>{number(data.mapping.skus)}</dd></div><div><dt>Групповых кодов</dt><dd>{number(data.mapping.groups)}</dd></div><div><dt>Групповых кодов с URL</dt><dd>{number(data.mapping.withUrl)}</dd></div><div><dt>URL сопоставлено со страницами</dt><dd>{number(data.mapping.matched)}</dd></div><div><dt>Несопоставленных URL</dt><dd>{number(data.mapping.unmatched)}</dd></div>
        </> : <>
          {kind === "SALES" ? <><div><dt>Период данных</dt><dd>{stats!.first ? `${date(stats!.first)} — ${date(stats!.last!)}` : "Нет данных"}</dd></div><div><dt>Количество строк</dt><dd>{number(stats!.rows)}</dd></div></> : <div><dt>Последняя дата</dt><dd>{stats!.last ? date(stats!.last) : "Нет данных"}</dd></div>}
          <div><dt>{kind === "STOCK" ? "SKU с остатками" : kind === "PRICES" ? "SKU с ценами" : "Количество SKU"}</dt><dd>{number(stats!.skus)}</dd></div><div><dt>SKU без маппинга</dt><dd>{number(stats!.unknown)}</dd></div>
        </>}</dl>
        {kind==='MAPPING'&&<details open={q.mappingPage!==undefined}><summary>Текущий маппинг SKU ({data.registry.length})</summary><div className="table-scroll"><table><thead><tr>{['SKU','Групповой код','URL','Кг в единице SKU','Статус mapping'].map(h=><th key={h}>{h==='Статус mapping'?'Статус сопоставления':h}</th>)}</tr></thead><tbody>{data.registry.slice((Math.max(1,Number(q.mappingPage)||1)-1)*50,Math.max(1,Number(q.mappingPage)||1)*50).map(p=><tr key={p.sku}><td>{p.sku}</td><td>{p.productGroup}</td><td>{publicData(p.rawUrl)}</td><td>{number(p.kgPerUnit)}</td><td>{p.active?t(p.matchStatus):'Неактивно'}</td></tr>)}</tbody></table></div><p>По 50 SKU. <Link href={'/business-data?mappingPage='+Math.max(1,(Number(q.mappingPage)||1)-1)+'#mapping'}>Назад</Link> · <Link href={'/business-data?mappingPage='+Math.min(Math.ceil(data.registry.length/50),(Number(q.mappingPage)||1)+1)+'#mapping'}>Далее</Link></p></details>}
        <h3>Обязательные колонки</h3><p>{format.columns.filter(c => c.required).map(c => c.name).join(", ")}. {kind === "SALES" && "Также нужна хотя бы одна колонка: Заказы, Количество, Количество кг или Выручка. В каждой строке должен быть заполнен хотя бы один показатель."}</p>
        <h3>{kind === "SALES" ? "Рекомендуемые показатели" : "Необязательные колонки"}</h3><p>{format.columns.filter(c => !c.required).map(c => c.name).join(", ")}.</p>
        <details><summary>Описание колонок и пример строки</summary><div className="table-scroll"><table><thead><tr>{["Колонка", "Обязательность", "Формат", "Пример", "Описание"].map(h => <th key={h}>{h}</th>)}</tr></thead><tbody>{format.columns.map(c => <tr key={c.name}><th>{c.name}</th><td>{c.required ? "Обязательно" : kind === "SALES" ? "Хотя бы один показатель" : "Необязательно"}</td><td>{c.format}</td><td>{String(c.example)}</td><td>{c.description}</td></tr>)}</tbody></table></div></details>
        <p><a className="button-link" href={`/templates/${format.filename}`} download={format.filename}>{format.download}</a></p>
        {kind !== "MAPPING" && !data.mapping.skus && <p className="warning" role="note">Рекомендуется сначала загрузить маппинг товаров. Без него SKU не будут связаны со страницами магазина.</p>}
        <form action={uploadData}><input type="hidden" name="kind" value={kind}/><label>Файл: {format.title}<input type="file" name="file" accept=".xlsx,.csv" required/></label>{kind==="SALES"&&<SalesImportFields profiles={profiles}/>}<button>Загрузить файл {format.title.toLowerCase()} для предпросмотра</button></form>
        {draft?.kind === kind && <Preview draft={draft}/>}
        <h3>Последние импорты</h3>{history.length ? <div className="table-scroll"><table><thead><tr>{["Файл", "Дата загрузки", "Строк", "Успешно", "С ошибками", "Неизвестные SKU", ...(kind==="SALES"?["Тип выгрузки","Период покрытия","SKU"]:[]), "Статус"].map(h => <th key={h}>{h}</th>)}</tr></thead><tbody>{history.map(h => <tr key={h.id}><td><Link href={`/business-data?draft=${h.id}#${kind.toLowerCase()}`}>{publicData(h.filename)}</Link></td><td>{date(h.createdAt)}</td><td>{number(h.rowsTotal)}</td><td>{number(h.rowsImported)}</td><td>{number(h.rowsErrors)}</td><td>{number(h.unknownSkuCount)}</td><>{kind==="SALES"&&<><td>{salesModeLabels[h.salesImportMode]}</td><td>{date(h.coverageFrom)} — {date(h.coverageTo)}</td><td>{number(h.skuCount)}</td></>}</><td>{t(h.status)}</td></tr>)}</tbody></table></div> : <p className="muted">Импортов этого типа пока нет.</p>}
      </section>;
    })}</>;
}
function Preview({ draft }: { draft: Awaited<ReturnType<typeof db.import.findFirstOrThrow>> }) {
  const workbook = draft.dataJson as unknown as Workbook, selection = draft.mappingJson as unknown as Selection;
  const sheet = workbook.sheets.find(s => s.name === draft.sheetName) ?? workbook.sheets.find(s => s.name !== "Описание") ?? workbook.sheets[0];
  const done = ["COMPLETED", "COMPLETED_WITH_ERRORS"].includes(draft.status), ready = draft.matched + draft.unmatched;
  const canCommit = draft.status === "VALIDATED" && (ready > 0 || (draft.kind==="SALES"&&draft.salesImportMode==="TRANSACTIONAL"&&!draft.rowsErrors)) && !(draft.kind === "MAPPING" && draft.rowsErrors > 0);
  return <div className="business-preview" data-import-id={draft.id}><h3>{done ? "Результат импорта" : "Предпросмотр и проверка"}</h3><p>{publicData(draft.filename)} · {t(draft.status)}</p>
    {!done && <form action={validateData}><input type="hidden" name="id" value={draft.id}/><label>Лист с данными<select name="sheetName" defaultValue={selection?.sheetName ?? sheet.name}>{workbook.sheets.filter(s => s.name !== "Описание").map(s => <option key={s.name}>{publicData(s.name)}</option>)}</select></label>{draft.kind==="SALES"&&<SalesImportFields mode={draft.salesImportMode} from={draft.coverageFrom?.toISOString().slice(0,10)} to={draft.coverageTo?.toISOString().slice(0,10)}/>}<button>Проверить выбранный лист повторно</button></form>}
    <p>Лист: {publicData(sheet.name)}. Показаны первые 20 строк из {number(sheet.rows.length)}.</p>
    <div className="table-scroll"><table><thead><tr><th>Строка</th>{sheet.headers.map((h, i) => <th key={i}>{publicData(h)}</th>)}</tr></thead><tbody>{sheet.rows.slice(0, 20).map((r, i) => <tr key={i}><td>{i + 2}</td>{sheet.headers.map((h, j) => <td key={j}>{publicData(r[j] ?? "")}</td>)}</tr>)}</tbody></table></div>
    <p>Всего строк: {number(sheet.rows.length)} · Готовы к импорту: {number(ready)} · С ошибками: {number(draft.rowsErrors)} · Неизвестные SKU: {number(draft.unknownSkuCount)} · Пропущено: {number(draft.rowsSkipped)}</p>
    {(draft.errorsJson as { row: number; message: string }[]).length > 0 && <div role="alert"><ul>{(draft.errorsJson as { row: number; message: string }[]).map((e, i) => <li key={i}>Строка {e.row}: {publicData(e.message)}</li>)}</ul><p>Показаны первые 100 ошибок. Ошибочные строки не импортируются.</p></div>}
    {draft.kind === "MAPPING" && draft.rowsErrors > 0 && <p className="error">Исправьте все ошибки маппинга товаров перед импортом.</p>}
    {canCommit && <form action={commitData}><input type="hidden" name="id" value={draft.id}/><button>Подтвердить импорт проверенных строк</button></form>}
    {done&&draft.kind==='SALES'&&<details><summary>Настроить тип выгрузки</summary><form action={saveSalesMetadata}><input type="hidden" name="id" value={draft.id}/><SalesImportFields saveProfile={false} mode={draft.salesImportMode} from={draft.coverageFrom?.toISOString().slice(0,10)} to={draft.coverageTo?.toISOString().slice(0,10)}/><button>Сохранить тип выгрузки</button></form><p>Изменяются только метаданные. Исходные строки сохраняются; новая семантика применяется после пересчёта возможностей.</p></details>}
    {done && <p role="status">Импортировано строк: {number(draft.rowsImported)}. История сохранена.</p>}
  </div>;
}

