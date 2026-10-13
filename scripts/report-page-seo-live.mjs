import {readFileSync,writeFileSync} from 'node:fs';
const read=p=>JSON.parse(readFileSync(p,'utf8'));
const ledger=read('test-results/sprint5-live-2026-10-09.json'),quality=read('test-results/sprint5-live-review-2026-10-09.json');
const before=read('test-results/sprint4-page360-sprint5-live-before.json'),after=read('test-results/sprint4-page360-sprint5-live-after.json');
const round=v=>v==null?'N/A':Number(v).toFixed(1);
const notes={
 'rec-description-rewrite':[
 'PASS с оговорками. Практическое изменение: заменить именно HTML meta description, убрать список артикулов и символ #. Готовая строка содержит подтверждённые синтетический тип, SAE и фасовку; это можно передать SEO-специалисту после проверки актуального метатега и уникальности текста.',
 'Опора: E002 — полный сохранённый Description; E008 — наблюдалось «Синтетическое» и 5W-40. Реальные запросы E021/E031/E038: соответственно 8/4/3 показов, по 0 кликов, за 01.06–31.08.2026. Это небольшой объём наблюдений, не доказательство будущего роста CTR.',
 'Модельная фраза «не описывая продукт» чрезмерна: текущий Description уже называет продукт, моторное масло и всесезонное применение. Полезность состоит в конкретной очистке метатега, а не в этом диагнозе. SAE и фасовка уже есть: рекомендация переписывает поле, не доказывает их отсутствие.',
 'Назначение товарной страницы сохранено. Допуски/совместимость/причины отсутствия продаж не придуманы. Экспертный PASS означает полезность задания, а не подтверждённый эффект или разрешение публикации.'
 ],
 'rec-application-spec-check':[
 'PASS как первичная диагностическая задача, не как готовое изменение контента. Указаны конкретные блоки применения/спецификаций и сравнение с E007/E008/E014; ненаблюдение не объявлено отсутствием.',
 'Запросы E021/E031 реально содержат интерес к синтетическому маслу/характеристикам. Характеристики уже наблюдались, поэтому добавлять их повторно на основании этого CHECK нельзя.',
 'SEO-специалист может выполнить чтение HTML и зафиксировать состояние существующих блоков. Критерий полноты сформулирован слабее, чем метаданные: оценивать его нужно по утверждённым продуктовым фактам, без новых OEM/application claims. Диагностическая полезность есть, немедленная ценность для реализации ограничена.'
 ],
 'rec-schema-check':[
 'PASS как конкретная техническая проверка Product/Offer в HTML/JSON-LD и проверка валидности. E049 = [] имеет NOT_OBSERVED/PARTIAL, E053 подтверждает товарный mapping.',
 'Предложение не объявляет schema отсутствующей и не требует немедленно внедрить или продублировать её. Назначение карточки понято правильно. Можно передать SEO-специалисту как read-only проверку; если разметка уже валидна, диагностическую задачу следует закрыть без изменений.',
 'Наличие schema не гарантирует специальное представление в поиске; эффект этой проверки не измерялся.'
 ],
 'rec-internal-links-check':[
 'PASS как предварительная LOW-проверка входящих ссылок на один известный URL. E050 даёт наблюдаемый минимум inbound=0 при 665/1495 source Pages; это не orphan-факт.',
 'E054–E058 относятся к OUTBOUND. Они дают контекст, но не подтверждают отсутствие входящих ссылок. Exact URL/aliases и неполные исторические snapshots остаются ограничениями.',
 'Можно передать специалисту проверку уже существующих ссылок из категорий/связанных товаров и aliases. Предложенный общий crawl дороже targeted inspection и не является разрешённым действием этой приёмки: новый crawler/production scan не запускался. Готового задания на добавление ссылок здесь нет.'
 ],
 'rec-title-check':[
 'QUESTIONABLE; сценарий B — FAIL. Карточка безопасна и использует настоящие данные, но как единственный сохранившийся результат категории с существенным Search даёт слишком мало практической SEO-ценности.',
 'E001: полный Title «Каталог продукции». E002 Description и E003 H1 — UNKNOWN. Реальные запросы E029/E031/E023/E024 имеют 174/27, 150/4, 264/129, 258/1 показов/кликов за M3 соответственно. Запросы не выдуманы, категорийное назначение понято.',
 'Ничего уже наблюдаемого не предлагается добавить как отсутствующее. UNKNOWN H1/Description не объявлены пустыми. Но действие сводится к сбору метаданных и повторной оценке позднее: нет предложенного Title, конкретного несоответствия или критерия выбора формулировки. Неизвестность H1/Description сама по себе не исключает квалифицированной гипотезы по известному Title и Search.',
 'Можно передать как обычную проверку полноты данных, но не как реализационное SEO-ТЗ. Предположение о шаблонном Title всех категорий page-level evidence не доказывает. Вместе с отказом 4/5 items по нескольким grounding conditions этого недостаточно для полезного сценария B — серия остановлена.'
 ]};
const lines=[
 '# Sprint 5 — Page SEO Review · Live acceptance · 09.10.2026','',
 '## Статус и решение','',
 '**Live acceptance FAIL / READY WITH FIXES.** Выполнены D → A → B. D прошёл без API; A прошёл экспертную оценку с оговорками; на B серия остановлена по качеству. C и E не запускались. Использовано **2 из 4** платных вызовов DeepSeek, **0 retries**, **2 неиспользованных**. Ledger закрыт halt=true, stopReason=B_GROUNDING_AND_UTILITY_FAILURE; его нельзя сбрасывать или переигрывать.',
 '', 'Главный положительный результат: конкретная очистка META_DESCRIPTION товарной страницы с готовым текстом на известных фактах. Это не доказывает устойчивую полезность на других типах страниц. Из пяти принятых карточек одна CHANGE и четыре CHECK; все пять имеют NEEDS_REVIEW. Продуктовый PASS Sprint 5 не объявлен.',
 '', '## Серия и фактические counts','',
 '| Case | URL | Calls | Generated | Accepted | Rejected | Экспертная оценка |',
 '| --- | --- | ---: | ---: | ---: | ---: | --- |'];
for(const step of ['D','A','B','C','E']){const r=ledger.results.find(r=>r.step===step),q=quality.find(r=>r.step===step);lines.push(`| ${step} | ${ledger.pages[step].url} | ${r?.attemptedCalls??0} | ${r?.review?.validation.generated??'N/A'} | ${r?.review?.validation.accepted??'N/A'} | ${r?.review?.validation.rejected??'N/A'} | ${step==='D'?'PASS: empty / 0 API':q?.status??'NOT RUN: остановка после B'} |`);}
lines.push('', 'Всего: generated **10**, accepted **5**, rejected **5**; SUPPORTED **0**, NEEDS_REVIEW **5**. Эксперт: четыре квалифицированных PASS для A, один QUESTIONABLE для B. Экспертная оценка выполнена Codex по сохранённым данным; это не отдельная подпись независимого human reviewer. Никакой дополнительный judge API не использован.',
 '', '## Зафиксированная конфигурация и неизменность','',
 `Model: **${ledger.model}**. Prompt: **${ledger.prompt}**. Перед каждой попыткой проверены SHA-256 кода/provider/guards/builder/config/.env/старых ledgers и before/after DB hashes. Профиль каждой страницы также проверен по отдельному hash. E на preflight имеет ACTIVE findings=0; его provider не вызван после остановки. У A тоже ACTIVE findings=0: один useful result без finding prerequisite наблюдался, но E этим не подменяется.`,
 '', 'Финальная integrity: **PASS**, codeUnchanged=true, dataUnchanged=true. Source rows, snapshots, Pages/types/aliases, Imports/BusinessRecord, Metrika/Webmaster, Opportunities и SeoActions не изменены. Старые остановленные ledgers не сброшены/не использованы. Между вызовами не менялись prompt/provider/guards/data. Только новый acceptance harness, review artifacts и отчёт; application code не дорабатывался.',
 '', '## Latency и токены','',
 '| Case | Builder ms | DeepSeek transport ms | Validator ms | Total measured ms | Input tokens | Output tokens |',
 '| --- | ---: | ---: | ---: | ---: | ---: | ---: |');
for(const r of ledger.results)lines.push(`| ${r.step} | ${round(r.builderMs)} | ${round(r.transportMs)} | ${round(r.review?.metadata.validatorMs)} | ${round(r.totalMs)} | ${r.usage?.inputTokens??'0 (no API)'} | ${r.usage?.outputTokens??'0 (no API)'} |`);
lines.push('', 'Итого DeepSeek: **26 980 input + 7 164 output = 34 144 tokens**. Измеренный total начинается со сборки evidence и включает request/validation/safe diagnostics; предварительные file/data-hash проверки и запуск CLI не входят. Это два разных сценария по одной попытке, не latency distribution.',
 '', 'Стандартный publicData маскирует ключи usage, содержащие token, даже для числовой статистики. Acceptance harness отдельно сохранил числовой usage существующего transport response, без сохранения API response text. Provider/production serializer не исправлялись во время серии.',
 '', '## Все причины отклонения — без отклонённого текста','',
 '| Case | Item index (0-based) | Все проваленные conditions |',
 '| --- | ---: | --- |');
for(const r of ledger.results)for(const d of r.itemDiagnostics??[])if(d.failedConditions.length)lines.push(`| ${r.step} | ${d.index} | ${d.failedConditions.join(', ')} |`);
lines.push('',
 '- FACT_VALUE_MISMATCH: claim VALUE не совпал с JSON.stringify registry value. Сравнение чувствительно в том числе к порядку ключей; код сам по себе не доказывает фактическую галлюцинацию. Какая именно свободная формулировка была отклонена, не восстанавливается: текст не сохранён.',
 '- QUERY_NOT_CITED: target query не связан с соответствующим cited search evidence. Это не то же самое, что выдуманный запрос.',
 '- UNKNOWN_TARGET_URL: URL не находится в ограниченном allowed registry, а не доказанно не существует на сайте.',
 '- UNBOUND_ABSENCE_CLAIM: распознанное утверждение об отсутствии не связано с разрешённым ABSENT/MISSING_TERM claim.',
 '- UNSUPPORTED_MISSING_TERM: evidence не подтверждает отсутствие термина по требованиям full scalar/state/type/truncation.',
 '- UNSAFE_TEXT: сработал существующий lexical guard. Без закрытого текста нельзя утверждать злонамеренность либо назвать точное совпавшее слово.',
 '', 'B не объявлен «четырьмя доказанными галлюцинациями». Наблюдалась системная неспособность получить пригодный validated set, а единственное принятое действие недостаточно для практического SEO-результата. Это основание остановки; guards не ослаблялись и вызовы не повторялись.',
 '', '## Полные принятые рекомендации и экспертная оценка','',
 'Ниже **все пять** принятых карточек, включая NEEDS_REVIEW, без сокращений модельных полей, proposed content, verification steps, claims и cited evidence. Полные evidence values относятся только к принятым карточкам. Configured secrets/чувствительные поля отредактированы штатным publicData; отклонённых ответов, полного prompt и raw response нет. Экспертные замечания отделены от текста AI и не переписывают его задним числом.');
for(const r of ledger.results)for(const item of r.review?.result.recommendations??[]){lines.push('',`### ${r.step} · ${item.id} · ${item.status}`,'',`**${item.area} / ${item.priority} / ${item.recommendationType} / ${item.placement}**`,'', '**Экспертная оценка**','',...(notes[item.id]??['Экспертная оценка отсутствует.']).flatMap(s=>[s,'']), '**Полная принятая карточка: текст AI и все доказательства**','', '```json',JSON.stringify(item,null,2),'```');}
lines.push('', '## Page360 performance','',
 `Один и тот же route ${before.route}, warm-up плюс пять GET без нажатия AI-кнопки. До: mean **${round(before.mean)} ms**, median **${round(before.median)} ms**. После: mean **${round(after.mean)} ms**, median **${round(after.median)} ms**. Все ${before.samples.length+after.samples.length} измеренных ответов HTTP 200. В этой небольшой локальной выборке деградации не наблюдалось; ускорение не гарантируется. Initial GET не вызывал evidence builder/DeepSeek.`,
 '', '## Проверки, безопасность и ограничения','',
 'Acceptance harness typecheck PASS. Preflight profiles и финальные code/data hashes PASS. Ранее выполненные offline checks сохраняют результат 286/286 full tests, 30/30 SEO Review, 129/129 AI regression, build/secrets/migrations PASS; полный suite и build не повторялись для acceptance-only script. Новый секрет-поиск по artifacts проверяется отдельно. Никаких production crawl/sync/export, recalculation, изменения CMS, Site SEO Strategy, TDS ingestion, Competitive Benchmark, bulk AI или публикации.',
 '', 'Сохранены только принятые карточки и их evidence, экспертные замечания, metadata/counters/reason codes. Нет raw rejected text. Диагностика кодами не позволяет реконструировать отклонённые строки или отличить все semantic violations от lexical/serialization false positives; такую неопределённость нельзя скрывать.',
 '', '## Артефакты и следующий шаг','',
 '- `test-results/sprint5-live-2026-10-09.json`: отдельный stopped ledger, accepted cards, counts, usage, freeze hashes и final integrity.',
 '- `test-results/sprint5-live-review-2026-10-09.json`: поэлементная экспертная оценка A/B.',
 '- `test-results/sprint5-live-{init,D,A,B,integrity,typecheck}.log`: safe execution records.',
 '- `test-results/sprint4-page360-sprint5-live-{before,after}.json`: Page360 measurements.',
 '', 'Серия завершена остановкой после B; два неиспользованных вызова не расходуются автоматически. Следующий отдельный этап может исследовать grounding consistency и полезность конкретных category hypotheses, но в этой приёмке код не меняется. C/E остаются непроверенными, устойчивый продуктовый PASS не подтверждён.');
writeFileSync('SPRINT5_LIVE_ACCEPTANCE.md',lines.join('\n')+'\n');
console.log('Wrote full accepted recommendations/evidence/reviews; rejected text excluded');
