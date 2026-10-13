import {readFileSync,writeFileSync} from 'node:fs';
const replacements={
 'src/components/analytics.tsx':[
 ['import { t , ui }','import { t, ui, date }'],['<dt>{t(label)}</dt>','<dt>{ui(label)}</dt>'],['aria-label={`${title}: динамика по дням`}','aria-label={`${ui(title)}: ${t("динамика по дням")}`}'],['{p.date}: {format(p.value, 2)}','{date(p.date)}: {format(p.value, 2)}'],['{points[0]?.date}','{date(points[0]?.date)}'],['{points.at(-1)?.date}','{date(points.at(-1)?.date)}']],
 'src/components/freshness.tsx':[['{t("Last successful")}{ui(r.source === "Site Scan" ? "scan" : "sync")}:','{t("Last successful")}:']],
 'src/components/integration-report.tsx':[['{integrationType(source)}','{t(integrationType(source))}'],['{row?.status ?? "NOT_CONFIGURED"}','{t(row?.status ?? "NOT_CONFIGURED")}'],['`Host: ${c.hostId ?? "не выбран"}`','`${t("Сайт")}: ${c.hostUrl ?? t("Не выбран")}`'],['`Counter: ${c.counterId ?? "не проверен"}`','`${t("Счётчик")}: ${c.counterId ?? t("Не проверен")}`'],['<p key={i}>{String(e)}</p>','<p key={i}>{ui(String(e))}</p>']],
 'src/app/pages/page.tsx':[['<option key={type}>{type}</option>','<option key={type} value={type}>{t(type)}</option>']],
 'src/app/pages/[id]/page.tsx':[['<dd>{value ?? "—"}</dd>','<dd>{["Type", "Source", "Outcome", "Language", "Indexable", "Error"].includes(label) ? ui(String(value ?? "—")) : value ?? "—"}</dd>']],
 'src/components/yandex-forms.tsx':[['? "Test Metrika Connection"','? t("Test Metrika Connection")'],[': "Test Webmaster Connection"',': t("Test Webmaster Connection")'],['{g.type ?? "—"}','{t(g.type ?? "—")}'],['{h.url} · {h.id} · {ui(h.verified ? "verified" : "not verified")}','{h.url} · {t(h.verified ? "verified" : "not verified")}']],
 'src/components/scanner-forms.tsx':[['ui(pending ? "Импортируем…" : "Import crawl data")','ui(pending ? "Импортируем…" : t("Import crawl data"))']],
 'src/components/coverage-form.tsx':[['{transportLabels[mode]}','{t(transportLabels[mode])}'],['{p.scope}','{t(p.scope)}'],['p.before.coverage?.toFixed(2)','p.before.coverage?.toLocaleString("ru-RU", {maximumFractionDigits:2})']],
 'src/components/coverage-report.tsx':[['v.toFixed(2)','v.toLocaleString("ru-RU", {maximumFractionDigits:2})'],['{transportLabels[c.transport ?? "HTTP_BROWSER"]}','{t(transportLabels[c.transport ?? "HTTP_BROWSER"])}'],['{r.result}','{t(r.result)}']],
 'src/app/settings/page.tsx':[['{metrika?.status ?? "NOT_CONFIGURED"}','{t(metrika?.status ?? "NOT_CONFIGURED")}'],['{webmaster?.status ?? "NOT_CONFIGURED"}','{t(webmaster?.status ?? "NOT_CONFIGURED")}']],
 'src/app/layout.tsx':[['title: "G-market Growth Radar"','title: "Радар роста — возможности магазина"']],
 'src/components/page-analytics.tsx':[['title={`Goal ${id} reaches`}','title={`${t("Достижения цели")} ${id}`}']],
};
for(const [file,list]of Object.entries(replacements)){let source=readFileSync(file,'utf8');for(const [old,updated]of list){if(source.includes(old))source=source.replaceAll(old,updated);else console.log('Already changed or review: '+file+' '+old);}writeFileSync(file,source);}
