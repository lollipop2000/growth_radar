# Current State Audit — Growth Radar

Дата: 07.10.2026. Только аудит текущего кода и локального приложения с production Site `cmuv42bst000020wcam8pixal` (`https://shop.gazpromneft-sm.ru/`).

## Executive summary

**Scanner:** 3 пользовательских route families с запуском/Resume (2 создают новые сетевые задания); 4 сетевых server-action entrypoints (3 create +1 Resume); 3 transport modes. Crawl Import — ещё одна несетевая action импорта.

**Performance:** самый быстрый повторный GET — `/pages` (0.11s); самый медленный — `/pages/[id]?searchPeriod=M18` (22.07s). Медиана warm GET 12 основных навигационных routes — **2.39s**;20 основных route/period вариантов — **4.03s**. Все 23 измеренные варианты вернули 200.

**Architecture:** главный источник задержки — построение site-wide аналитики при чтении отдельных экранов, включая Commerce, Search transfer/merge и intent classification. Главное UX дублирование — обычный/targeted/coverage запуск с раздельным выбором scope. Обнаружена передача переведённого scope из Coverage UI, которая не соответствует backend validator. Ничего не исправлено.

Рекомендуемые следующие шаги, исключительно предложение:

1. Разделить чтение сохранённых SEO Actions и построение полного аналитического dataset; для Page 360 загружать коммерческие данные выбранной страницы.
2. Уменьшить объём Search-проекций и повторных чтений; отдельно устранить чтение всех месячных строк ради списка месяцев.
3. Свести launch UX к `/scanner`, оставив старые места ссылками с preset; проверить передачу технического scope без перевода.

## 1. Методика и границы достоверности

- Прочитаны актуальные routes, components, server actions, services, Scanner adapters, workers, Prisma schema/migrations, master specification и релевантные runbook Sprint 0–3.5.1. Исторические настройки из runbook не приняты за текущие: например, актуальный default delay — 3000 ms.
- Использован уже работающий standalone Next.js на `http://127.0.0.1:3000`. Build, restart, очистка cache, fixture tests и изменения настроек не выполнялись.
- SQL census и EXPLAIN выполнялись внутри `SET TRANSACTION READ ONLY`. EXPLAIN без ANALYZE; его estimates не выданы за реальные timings.
- HTTP: два последовательных GET каждого варианта без JS. «Первый» — первый из пары в этом аудите, **не истинный cold**: процесс и PostgreSQL уже работали и были прогреты. Второй — повторный запрос. Cold process/DB measurement недоступен при запрете restart/cache clearing.
- Отдельно выполнены две browser-навигации каждого варианта: реальные Chromium, localhost GET, свежий context, waitUntil=load и 500 ms наблюдения после него. POST и внешние запросы запрещены в браузерном профиле. Next.js prefetch включён естественным образом; его нагрузка отдельно обозначена.
- Для standalone profiling loader пропускает только marker `server-only`, чтобы импортировать исходные components вне Next bundler. Локальное профилирование исполняет исходные server components и их async children, снимает Prisma/SQL calls и CPU samples. Оно **не является замером React SSR/hydration**. Client components не вызываются; пустой `Site.upsert(update:{})` заменён read-only lookup только внутри profiling process. Все остальные write operations заблокированы. Приложение и исходный код этим не менялись.
- Отдельный `Server render` в работающем приложении измерить нельзя: нет Server-Timing/инструментации границ DB/CPU/React. Приведены TTFB, завершение GET, standalone server-data profile и отдельные query timings, без выдуманного разделения.
- Две выборки не дают p95, статистически устойчивой медианы каждого route или гарантированного ускорения. Влияние фоновой активности машины и GC возможно.
- Page 360 проверен на одной реальной category/filter Page `cmuvqpg8t000120ucrcsttj6h`. Её HTML/число запросов не обобщается на все Page.

**Read-only guard PASS:** hashes всех 14 таблиц до/после одинаковы, в том числе configs/jobs/imports/рекомендации; SHA256 файлов src/prisma/scripts/docs одинаковы. Нет write SQL в standalone profiles, нет profile errors. Production workers не запускались; новых jobs/scans/импортов не создано. Изменены только этот отчёт и разрешённые audit artifacts в test-results/.

## 2. Полная карта Scanner launch points

Определения для подсчёта: route family — пользовательское место; transport — способ чтения страницы; scope/preset — способ выбора URL. Несколько кнопок одной формы не считаются новыми crawler adapters. Import — источник сохранённых crawl-данных, а не сетевое сканирование.

| № | UI / route | Кнопка | Тип scan | Что сканирует | Как выбираются URL | Создаёт какой Job/Scan | Worker | Пересечение / назначение |
|---|---|---|---|---|---|---|---|---|
| 1 | `/scanner`, ScanForm, HTTP | Start full scan | HTTP + точечный Browser fallback; checkbox позволяет HTTP only | Внутренний сайт, до 50 страниц | Robots/sitemap, seeds, затем links; общий maxPages | `startScanAction → createScan`, `Scan.mode=HTTP`, PENDING | `scripts/worker.ts → crawl` | Базовый запуск; может выбирать те же URL, что targeted/coverage |
| 2 | `/scanner`, та же ScanForm, BROWSER | Start full scan | Browser only для страниц | До 50 страниц, HTTP discovery остаётся | Тот же discovery/seeds/links, Browser concurrency=1 | Та же action/factory, `Scan.mode=BROWSER` | Тот же worker/crawl/BrowserReader | Alias общей формы по transport, отдельного crawler нет |
| 3 | `/scanner`, та же ScanForm | Scan one URL | HTTP или Browser single | Одна страница | `single=true`, maxPages=1; discovery пропускается | Та же action/factory; новый Scan | Тот же worker | Диагностический preset; это также ручной повторный scan существующего URL |
| 4 | `/scanner`, CoverageForm | Start Metrika Coverage Scan | Frozen queue; HTTP_BROWSER / BROWSER_ONLY / HTTP_ONLY | Все разрешённые URL выбранного Metrika scope; общий queue может быть больше 50 | Period 7/30/90; UNMATCHED/ALL; visits; skip recent-success 7 дней, если rescanSuccessful OFF; batches ≤50 | `startCoverageAction → createCoverageScan`, `mode=METRIKA_COVERAGE`, config checkpoint, PENDING | `worker → runCoverageScan → crawl` | Специализированный queue coordinator общей crawl-функции; overlap с 1/7. **Обнаружена проблема формы scope, ниже** |
| 5 | `/scanner`, та же CoverageForm | Start diagnostic scan | Те же три транспорта | Первые N URL queue | `intent=DIAGNOSTIC`; обязательный diagnosticLimit 1–50; default 10 | Та же action/factory; новый Coverage Scan | Тот же worker | Limit preset пункта 4; проблема scope та же |
| 6 | `/scanner`, та же CoverageForm | Test one URL | Те же три транспорта | Один разрешённый URL | `intent=TEST_ONE`; limit1; явный testUrl или первый URL queue; robots читается | Та же action/factory; новый Coverage Scan | Тот же worker | Preset4; не полностью идентичен обычному single из-за robots/coverage; проблема scope та же |
| 7 | `/unmatched`, AggregateUnmatched, включая `source=WEBMASTER` | Scan top unmatched URLs | Targeted HTTP first + Browser fallback | TOP10/20/50 **несопоставленных URL Метрики за 30 дней** | `scanTopUnmatched → rematch → landingDataset → candidates`; seedOnly; без sitemap/links | `targetScanAction → scanTopUnmatched → createScan`; `mode=HTTP`, `config.targeted`, PENDING | Обычный worker + `completeTargetedScan` | Специализированный preset1; кнопка при Webmaster-фильтре тоже выбирает **Метрику**, не Webmaster/Search |
| 8 | `/scanner`, последний CoverageReport | Resume | Продолжение Coverage queue | Только ещё не обработанные URL | Сохранённый checkpoint, прежний transport, вручную выбранный delay | `coverageControlAction → coverageControl(RESUME)`; тот же Scan → PENDING; нового Job/Scan нет | Тот же worker/runCoverageScan | UI alias пункта 9; не retry завершённых blocked URL |
| 9 | `/scanner/[id]`, CoverageReport | Resume | То же продолжение | Те же оставшиеся URL | Тот же checkpoint | Та же action/service; тот же Scan | Тот же worker | Чистый alias8 на странице задания |
| 10 | `/scanner`, CrawlImportForm | Import crawl data | Excel Crawl Import, без сети | Строки XLSX/CSV, до 50/5MB | Пользовательский файл; URL boundaries/validation | `importCrawlAction → importCrawl`; `Scan.mode=IMPORT`, IMPORTING → COMPLETED/ERROR; Page/ScanPage.source=IMPORT | Нет: синхронная server action | Альтернативный ingestion pipeline, общий `saveScanPage`; не launch crawler |

Во всех сетевых вариантах допускается overlap **по URL между последовательными заданиями**, но глобальный advisory lock + проверка active statuses не позволяют одновременно создать/возобновить второй активный scan/import. PAUSED/STOPPED исключены из active; Resume проверяет другую активную очередь. Пользовательский повторный full/single создаёт новое задание. Автоматического retry ordinary Scan и автоматического Resume Coverage в UI/worker нет. Recovery переводит незавершённое задание в безопасное состояние; он не начинает обход заново.

### Подсчёт и backend entrypoints

- **3 route families** с сетевым запуском/продолжением: `/scanner`, `/unmatched`, `/scanner/[id]`. Для создания **нового** сетевого scan — 2 места: `/scanner`, `/unmatched`.
- 3 формы нового сетевого запуска: ScanForm, CoverageForm, TargetScanForm. Resume представлен ещё в 2 UI-размещениях одной формы. CrawlImportForm — дополнительная форма ingestion.
- **3 server actions создают новые crawler Scans**: `startScanAction`, `startCoverageAction`, `targetScanAction`. **1 action продолжает**: `coverageControlAction` с RESUME. Итого **4 сетевых backend entrypoints** на пользовательской границе. `importCrawlAction` — пятый, если включать ingestion в общий Scanner workflow.
- На service-уровне 2 непосредственные фабрики сетевых Scan: `createScan`, `createCoverageScan`; targeted wrapper `scanTopUnmatched` использует первую. `coverageControl` продолжает запись. `importCrawl` создаёт IMPORT Scan отдельно.
- **3 фактических transport modes**: HTTP only, HTTP + Browser fallback, Browser only. В `Scan.mode` хранятся 4 значения: HTTP/BROWSER/METRIKA_COVERAGE/IMPORT. METRIKA_COVERAGE — coordinator/scope, IMPORT — источник; это не ещё два сетевых adapter.
- Семантика обхода: discovery crawl; single без discovery; fixed list seedOnly. Fixed list реализован targeted wrapper и durable Coverage coordinator. Diagnostic/full/rescanSuccessful — presets/настройки scope, не новые crawler.
- API `route.ts` в `src/app` отсутствуют. Пользовательские операции — Next server actions POST. Нет отдельного публичного HTTP Scanner API, Scanner cron producer или второго production crawler.
- Acceptance/probe scripts используют crawl/createScan/createCoverageScan против локальных fixtures, не отдельные UI endpoints. В аудите они не запускались. Worker потребляет Scan; Yandex worker создаёт/обрабатывает JobRun API sync, не Scanner.

### Что выглядит как сканирование, но им не является

- `/webmaster/priority`: TOP20/50/100/manual → `priorityAction → savePriority → enqueueSync(WEBMASTER)`, **JobRun**, `yandex-worker → processJob`; это Webmaster export, не Priority Scope Scan.
- `/webmaster` и `/metrika`: sync/resume export — JobRun интеграции, без вызова Scanner.
- `/pages/[id]`: scanner history и metadata, **нет** rescan/start кнопки/action.
- `/webmaster/import`: после commit показывает число страниц без modern contentSignals и текст «запустите целевое сканирование отдельно». **Нет** кнопки запуска Search-matched Pages scan или готового producer такого scope.
- `/pages`: классификация типа Page, фильтры и просмотр; не scan.
- `/unmatched`: rematch меняет сопоставление сохранённых данных, но не выполняет сетевой обход.
- `/opportunities`, `/seo-actions`: recalc читает сохранённые данные и пишет рекомендации, без production scan/export.

### Обнаруженная функциональная проблема, без исправления

`src/components/coverage-form.tsx` передаёт hidden field `scope` как `t(p.scope)`. Для UNMATCHED это «Не сопоставлено», для ALL — «Все URL». `startCoverageAction` передаёт строку напрямую; `coveragePreview.validate` принимает только технические `UNMATCHED | ALL`. Поэтому UI full/diagnostic/test-one Coverage сейчас должен отклоняться до создания Scan. Проверка чтением кода и фактического GET DOM, **без отправки POST**. Это не новый backend mode; launch points существуют, но их корректность ограничена. Изолированные service fixture tests с техническим scope не покрывают этот wiring. PriorityForm передаёт `preview.mode` без перевода — здесь такой проблемы нет.

### Повторение UX

Full/single — нормальные presets одной функции. Coverage — необходимая durable orchestration поверх того же crawler. Targeted unmatched — исторически отдельный specialized preset, частично повторяющий Coverage UNMATCHED (различаются limits, 30d фиксированное окно, предварительный rematch, WAF continuation). Resume в двух местах — literal alias. Import — альтернативный источник. UX разрастается главным образом из-за разных scope/preview/settings forms, а не количества browser implementations.

## 3. Inventory пользовательских routes

| Route | Назначение | Основные server/data calls | Большие datasets | Тяжёлые агрегации |
|---|---|---|---|---|
| `/` | Dashboard | prepareDataset; Opportunity.findMany; freshness; SeoAction.findMany; businessQuality | Все active Pages, confirmed BusinessRecords, sales workbook; traffic/search current+previous; registry повторно | Commerce по всем Page, benchmarks, quality/matching |
| `/scanner` | Запуск/история/coverage | targetUrl; Scan.findMany(take30, **все Sites**); coveragePreview→landingDataset; последний Coverage | Все landing rows периода, Pages/snapshots, queue/cohort/excluded JSON | Ranking/matching/cohortAfter, вся diagnostics table в HTML |
| `/scanner/[id]` | Задание/Resume/history | Scan.findUnique include site/pages/page | Полный checkpoint и все ScanPages задания | Queue counts; всё без pagination |
| `/pages` | Inventory | currentSite; Page.findMany(take25)+count; duplicate filter SELECT по snapshots | Ограниченная выдача; duplicate-filter читает site snapshots | Обычный GET лёгкий; optional duplicate subquery |
| `/pages/[id]` | Page360 | Page/history; prepareDataset **всего Site**; Opportunities; PageAnalytics/dataForSite; SeoPagePanel/seoPageView; actions; changes | Site commerce; page daily analytics; Site Search выбранного Search period; graph Pages | Commerce/benchmarks, Search merge/intent/explorer/month trend/graph |
| `/webmaster` | Monthly default / DAY API отчёт | defaultSearchSelection; MonthlySearchReport или IntegrationReport | M3 default при MONTH; DAY report также загружает Metrika | Merge, query/demand/coverage/month trend; DAY url/daily filtering |
| `/webmaster/priority` | Export scope preview | previewPriority→landingDataset; integrations | Landing rows, Pages/snapshots, recent Webmaster jobs | Matching/ranking; вывод TOP20 |
| `/webmaster/import` | Search upload/history/preview | Import.findMany(take20 **все поля**), optional same Import.findFirst, rescan count | Сохранённые workbook dataJson всех Search imports + выбранный ещё раз | Format detection header; готовый summary; preview20rows |
| `/metrika` | Трафик/цели/JobRuns | IntegrationReport→dataForSite; integrations; JobRun.take30 | Все Metrika **и Search** выбранного DAY окна | URL×row и date×row фильтры, goals/trends |
| `/unmatched` | Matching/coverage/targeted | currentSite; AggregateUnmatched→landingDataset; targeted Scan.take5 | Все landing rows+site Pages; selected Search | Matching всех candidates, агрегация URLs, Node pagination |
| `/unmatched?view=ROWS` | Daily unmatched | Metrika.count/findMany(take50); Search effective dataset и Node filter | Metrika SQL pagination; Webmaster всё выбранное окно | Search merge/sort до slice50 |
| `/imports` | Универсальный legacy импорт | Profiles; Import.findMany(take50, include profile), optional draft | Полные business/legacy workbook JSON истории | Отрисовка history/preview; нет полного Commerce |
| `/business-data` | Четыре typed uploads/quality | businessData; Profiles; businessQuality; optional draft | Повторное чтение registry/business/pages; STOCK/PRICES/SALES JSON | Matching registry, latest snapshot по SKU, unknown SKU, price anomalies |
| `/opportunities` | Сохранённые Opportunities | currentSite; rangeForSite; config/goals; Opportunity.findMany(take500) | Saved evidence только выбранных результатов; MONTH metadata при месячном выборе | Node mainTop; **нет prepareDataset/runRules на GET** |
| `/opportunities/[id]` | Детальный saved signal | currentSite; Opportunity.findFirst(include page); SeoAction.findMany | Один evidence snapshot + связанные saved SEO | Незначительная sort/publicData; без полного dataset |
| `/seo-actions` | Saved SEO list + Search summary | currentSite; defaultSearchSelection; **seoDataset→prepareDataset**; Search ещё раз; snapshots; saved actions | Полный Site Commerce; Search current+previous и current повторно; all saved actions до Node pagination | Merge/intents/graph/benchmarks; **runSeoEngine на GET нет** |
| `/settings` | Конфигурация | targetUrl; readIntegration M/W | Небольшие configs/goals/hosts | Нет; Test Connection — только action, при GET не выполняется |
| `/system` | Saved health/freshness | readSystem; Freshness→freshness | Небольшие Integration/Scan/JobRun | Последовательные freshness lookups; GET не checkSystem |

Всего 17 route families (строка `/unmatched?view=ROWS` — вариант существующего route). Navigation содержит 12 ссылок. Template downloads — статические public files, не server launch endpoints. Root error/not-found/layout — служебные компоненты, не отдельные пользовательские routes.

## 4. Фактические времена основных GET

| Route | First GET, s (не cold) | Warm GET, s | TTFB warm, s | Server data profile, s¹ | Prisma calls / SQL events¹ | Prisma returned records¹ |
| --- | --- | --- | --- | --- | --- | --- |
| `/` | 11.00 | 10.72 | 10.70 | 38.88 | 27 / 35 | 27678 |
| `/scanner` | 5.38 | 5.12 | 4.94 | 20.86 | 13 / 20 | 12079 |
| `/opportunities` | 0.17 | 0.15 | 0.14 | 1.49 | 5 / 5 | 4 |
| `/seo-actions` | 23.18 | 20.00 | 19.99 | 72.21 | 20 / 29 | 65377 |
| `/webmaster` | 5.07 | 6.14 | 6.12 | 22.70 | 10 / 12 | 15782 |
| `/webmaster?period=M3` | 4.93 | 4.97 | 4.96 | 22.47 | 10 / 13 | 15782 |
| `/webmaster?period=M18` | 17.84 | 19.67 | 19.66 | 68.69 | 10 / 13 | 94562 |
| `/business-data` | 6.37 | 5.39 | 5.31 | 23.78 | 12 / 18 | 17847 |
| `/pages/[id]` | 10.66 | 11.55 | 11.53 | 36.49 | 33 / 44 | 35353 |
| `/pages/[id]?searchPeriod=M3` | 11.59 | 10.06 | 10.04 | 31.67 | 33 / 45 | 35353 |
| `/pages/[id]?searchPeriod=M18` | 23.08 | 22.07 | 22.04 | 78.20 | 33 / 45 | 114130 |
| `/settings` | 0.08 | 0.11 | 0.10 | 2.72 | 3 / 2 | 3 |
| `/unmatched` | 2.19 | 1.67 | 1.66 | 10.31 | 13 / 16 | 6880 |
| `/metrika` | 3.13 | 3.10 | 3.08 | 10.12 | 8 / 9 | 5398 |
| `/pages` | 0.16 | 0.11 | 0.10 | 1.04 | 4 / 5 | 28 |
| `/imports` | 0.27 | 0.32 | 0.31 | 1.52 | 4 / 4 | 10 |
| `/webmaster/priority` | 2.06 | 1.68 | 1.67 | 8.03 | 10 / 13 | 6877 |
| `/webmaster/import` | 1.19 | 1.17 | 1.16 | 4.51 | 3 / 3 | 4 |
| `/webmaster/import?id=latest-native-import` | 2.28 | 1.78 | 1.77 | 5.55 | 5 / 5 | 6 |
| `/system` | 0.59 | 0.35 | 0.34 | 1.43 | 10 / 10 | 86 |
| `/scanner/[id]` | 2.77 | 2.26 | 1.99 | 1.17 | 1 / 4 | 1 |
| `/opportunities/[id]` | 0.78 | 0.64 | 0.60 | 0.85 | 4 / 5 | 3 |
| `/webmaster?period=30` | 5.13 | 5.02 | 5.00 | 6.32 | 11 / 13 | 5400 |

¹ Профиль исходников с Prisma interception и V8 CPU sampling **сильно замедляет исполнение**; includes profiler start/stop, другой runtime path, не running production SSR. Его seconds нельзя подставлять вместо HTTP server render. Rows — сумма верхнеуровневых Prisma результатов (в том числе повторных), не уникальные entities/SQL cardinality. Async blocks иногда перекрываются. Cold/server render как отдельные показатели недоступны. Окончательный ranking — по изолированным HTTP GET, не этому профилю.

Server render/DB надёжно раздельно не измерены. В таблице профиль — отдельное исполнение server-data path, **не часть тех же HTTP samples**. SQL events включают время Prisma query engine, но не весь JS decoding/aggregation/React/transport; суммы параллельных queries не равны critical-path wall time. Rows — верхнеуровневые результаты Prisma, включая повторное чтение; вложенные rows дополнительно указаны в JSON. COUNT возвращает один scalar row, не количество counted entities.

## 5. TOP-10 slow routes и Prisma/SQL audit

| Rank | Route / variant | First GET,s | Warm GET,s | Что определяет задержку |
| --- | --- | --- | --- | --- |
| 1 | `/pages/[id]?searchPeriod=M18` | 23.08 | 22.07 | Site Commerce + Site Search + Page blocks |
| 2 | `/seo-actions` | 23.18 | 20.00 | Full seoDataset, Commerce+2Search reads+intent |
| 3 | `/webmaster?period=M18` | 17.84 | 19.67 | Search observations+intent+month metadata |
| 4 | `/pages/[id]` | 10.66 | 11.55 | Site Commerce + Site Search + Page blocks |
| 5 | `/` | 11.00 | 10.72 | Commerce+quality повторно |
| 6 | `/pages/[id]?searchPeriod=M3` | 11.59 | 10.06 | Site Commerce + Site Search + Page blocks |
| 7 | `/webmaster` | 5.07 | 6.14 | Search observations+intent+month metadata |
| 8 | `/business-data` | 6.37 | 5.39 | quality/registry/records repeated |
| 9 | `/scanner` | 5.38 | 5.12 | coveragePreview+queue HTML |
| 10 | `/webmaster?period=30` | 5.13 | 5.02 | Дневной IntegrationReport: Search и Metrika; циклы по датам и URL |

Это 10 **route/period вариантов**, а не 10 разных route families; default Webmaster и M3 используют одинаковую логику, Page360 default Search тоже M3. Такой список сохраняет запрошенные пользователем периодные сравнения.

| Route | Prisma function × calls : rows каждого вызова | Prisma / SQL calls | ΣSQL event,s¹ | Read/aggregation characteristics |
| --- | --- | --- | --- | --- |
| `/pages/[id]?searchPeriod=M18` | Page.findUnique×1: 1<br>Site.findUniqueOrThrow×1: 1<br>Opportunity.findMany×1: 2<br>Integration.findUnique×9: 1+1+1+1+1+1+1+1+1<br>Import.findMany×2: 6+1<br>WebmasterQueryDaily.findMany×3: 507+0+94536<br>Page.findMany×2: 1479+1479<br>MetrikaPageDaily.findMany×2: 9316+37<br>BusinessRecord.findMany×1: 6483<br>Page.findUniqueOrThrow×4: 1+1+1+1<br>Site.upsert×1: 1<br>WebmasterQueryDaily.findFirst×1: 1<br>WebmasterQueryDaily.findMany [periodMonth]×2: 18+18<br>MetrikaPageDaily.groupBy×1: 231<br>SeoAction.findMany×1: 0<br>PageChange.findMany×1: 0 | 33 / 45 | 8.61 | Полные records без rawJson projection limit; month DISTINCT в Prisma |
| `/seo-actions` | Integration.findUnique×7: 1+1+1+1+1+1+1<br>Site.upsert×2: 1+1<br>WebmasterQueryDaily.findFirst×1: 1<br>WebmasterQueryDaily.findMany [periodMonth]×1: 18<br>Import.findMany×2: 6+1<br>Page.findMany×1: 1479<br>MetrikaPageDaily.findMany×1: 9865<br>BusinessRecord.findMany×1: 6483<br>WebmasterQueryDaily.findMany×2: 31512+15756<br>ScanPage.findMany×1: 242<br>SeoAction.findMany×1: 5 | 20 / 29 | 5.85 | Полные records без rawJson projection limit; month DISTINCT в Prisma |
| `/webmaster?period=M18` | Integration.findUnique×4: 1+1+1+1<br>Site.upsert×2: 1+1<br>WebmasterQueryDaily.findFirst×1: 1<br>WebmasterQueryDaily.findMany [periodMonth]×1: 18<br>Page.count×1: 1<br>WebmasterQueryDaily.findMany×1: 94536 | 10 / 13 | 6.13 | Полные records без rawJson projection limit; month DISTINCT в Prisma |
| `/pages/[id]` | Page.findUnique×1: 1<br>Site.findUniqueOrThrow×1: 1<br>Opportunity.findMany×1: 2<br>Integration.findUnique×9: 1+1+1+1+1+1+1+1+1<br>Import.findMany×2: 6+1<br>WebmasterQueryDaily.findMany×3: 507+0+15756<br>Page.findMany×2: 1479+1479<br>MetrikaPageDaily.findMany×2: 9316+37<br>BusinessRecord.findMany×1: 6483<br>Page.findUniqueOrThrow×4: 1+1+1+1<br>WebmasterQueryDaily.findFirst×1: 1<br>Site.upsert×1: 1<br>WebmasterQueryDaily.findMany [periodMonth]×2: 18+18<br>MetrikaPageDaily.groupBy×1: 231<br>SeoAction.findMany×1: 3<br>PageChange.findMany×1: 0 | 33 / 44 | 4.48 | Полные records без rawJson projection limit; month DISTINCT в Prisma |
| `/` | Integration.findUnique×8: 1+1+1+1+1+1+1+1<br>Site.upsert×2: 1+1<br>Import.findMany×3: 6+1+3<br>WebmasterQueryDaily.findMany×1: 507<br>Page.findMany×2: 1479+1479<br>MetrikaPageDaily.findMany×1: 9316<br>BusinessRecord.findMany×3: 6483+1909+6483<br>Opportunity.findMany×1: 0<br>Scan.findFirst×3: 1+0+1<br>JobRun.findFirst×2: 0+0<br>SeoAction.findMany×1: 0 | 27 / 35 | 3.00 | Bulk reads; циклы/matching в Node |
| `/pages/[id]?searchPeriod=M3` | Page.findUnique×1: 1<br>Site.findUniqueOrThrow×1: 1<br>Integration.findUnique×9: 1+1+1+1+1+1+1+1+1<br>Opportunity.findMany×1: 2<br>Import.findMany×2: 6+1<br>WebmasterQueryDaily.findMany×3: 507+0+15756<br>Page.findMany×2: 1479+1479<br>MetrikaPageDaily.findMany×2: 9316+37<br>BusinessRecord.findMany×1: 6483<br>Page.findUniqueOrThrow×4: 1+1+1+1<br>Site.upsert×1: 1<br>WebmasterQueryDaily.findFirst×1: 1<br>WebmasterQueryDaily.findMany [periodMonth]×2: 18+18<br>MetrikaPageDaily.groupBy×1: 231<br>SeoAction.findMany×1: 3<br>PageChange.findMany×1: 0 | 33 / 45 | 3.83 | Полные records без rawJson projection limit; month DISTINCT в Prisma |
| `/webmaster` | Integration.findUnique×4: 1+1+1+1<br>Site.upsert×2: 1+1<br>WebmasterQueryDaily.findFirst×1: 1<br>WebmasterQueryDaily.findMany [periodMonth]×1: 18<br>Page.count×1: 1<br>WebmasterQueryDaily.findMany×1: 15756 | 10 / 12 | 1.93 | Полные records без rawJson projection limit; month DISTINCT в Prisma |
| `/business-data` | Integration.findUnique×2: 1+1<br>Site.upsert×1: 1<br>Import.findMany×2: 8+3<br>Page.findMany×2: 1479+1479<br>BusinessRecord.findMany×4: 1909+4574+1909+6483<br>ImportProfile.findMany×1: 0 | 12 / 18 | 1.63 | Bulk reads; циклы/matching в Node |
| `/scanner` | Integration.findUnique×4: 1+1+1+1<br>Scan.findMany×1: 30<br>Site.upsert×1: 1<br>MetrikaPageDaily.findMany×2: 4930+4930<br>Page.findMany×2: 1479+242<br>JobRun.findMany×1: 4<br>WebmasterQueryDaily.findMany×1: 458<br>Scan.findFirst×1: 1 | 13 / 20 | 0.85 | Bulk reads; циклы/matching в Node |
| `/webmaster?period=30` | Integration.findUnique×5: 1+1+1+1+1<br>Site.upsert×2: 1+1<br>WebmasterQueryDaily.findFirst×1: 1<br>WebmasterQueryDaily.findMany×1: 458<br>MetrikaPageDaily.findMany×1: 4930<br>JobRun.findMany×1: 4 | 11 / 13 | 0.84 | Полные records без rawJson projection limit; month DISTINCT в Prisma |

В отдельном SQL month availability подтверждено **отсутствие DISTINCT**: `SELECT id, periodMonth … WHERE siteId=$1 AND grain=$2 OFFSET $3`. DB возвращает 94 536narrow rows, Prisma наружу 18. Полные Search findMany выбирают все поля, включая rawJson. N+1SQL не найден; repeated bulk queries и Node loops — подтверждены. JSON decoding: all Search/rawJson, business/scan evidence, selected/history workbook JSON. Sorting/aggregation: query clusters/intent/month/demand, Commerce/benchmarks, URL ranking, graph. Saved recommendations читаются отдельно; scoring/SEO generation на GET не запускались.

Для каждого slow route зафиксированы конкретные calls/elapsed/rows/fields/nestedRows/SQL в `test-results/current-audit-profile.json`. Рассмотренные routes не показывают классического SQL N+1 на 1479 Page: Prisma relations получаются batch SELECT. Основная проблема — bulk reads и многократные циклы/поиск в Node; вложенный `take:1` relation не означает отдельный SQL request на каждую Page. Признаки N+1 нельзя выводить только из include.

Общие наблюдения: `prepareDataset` выполняет bulk reads параллельно, но sales workbook читает следующим шагом. `seoDataset`: prepareDataset → Webmaster config → SEO config → второй Search → snapshots → summary/graph, преимущественно последовательно. SeoPagePanel: Page → default selection → seoPageView → summary → actionsForPage → changes. Dashboard: prepareDataset → parallel Opportunities/freshness → SeoAction → businessQuality. Это несколько последовательных волн, а не один общий request-level context.

## 6. Где и когда выполняются расчёты

| Calculation | Триггер | Данные | Сохраняется / заново |
|---|---|---|---|
| effective DAY/MONTH merge | Любой searchDataset GET; recalc/import consumers | Выбранное date window; полные observations | Заново, Map identities/precedence, нет persisted effective rows |
| Search totals/query/month trend/demand/coverage | Webmaster, SEO list, Page360, Dashboard | Search rows выбранного окна, иногда current+previous | Заново; source observations сохранены |
| Intent analysis | MonthlySearchReport, seoDataset, SeoPagePanel; recalc | Нормализованные query clusters; dictionaries | Заново, regex/dictionary classification |
| Commerce profile/current+previous sales/price/stock | prepareDataset на Dashboard/Page360/SEO GET, recalc, status baseline | Все active Pages, registry, confirmed business history, sales coverage/day loops | Заново; BusinessRecord и import metadata сохраняются |
| CTR/conversion/commerce benchmarks | В конце каждого prepareDataset; runRules дополнительно | Все eligible Pages | Заново; в saved Opportunity evidence только snapshot расчёта |
| Business quality/latest records/unknown SKU | Dashboard и Business Data GET | Registry + records + STOCK/PRICES/SALES workbook JSON + Pages | Заново |
| Internal link graph | seoDataset/seoPageView GET; runSeoEngine/recalc | Active Pages и successful snapshot links; traffic | Заново; links сохраняются в ScanPage JSON, отдельного graph cache/table нет |
| Candidate ranking/matching/coverage preview | scanner/unmatched/priority GET и preview actions | Landing rows, Pages, discovery config/JobRun | Заново; scope/checkpoint сохраняется только при action |
| Rules/scoring/new Opportunities | Только recalculate/recalculateSeo actions → calculateOpportunities | prepareDataset + rule engine | Writes Opportunity/evidence/settings; **не на GET** |
| New SEO Actions/cannibal/content gaps/recommendations | Те же recalc actions → calculateSeoActions/runSeoEngine | seoDataset, signals/graph/queries | Writes SeoAction/settings; **не на GET** |
| Baseline SEO implemented | setSeoStatus action | prepareDataset, selected Page | Saves baselineJson/comment/date; не GET |
| Search MONTH wide conversion/validation/matching | Upload/validate/commit Search import | Workbook5252×92, месячные блоки | Saves Import workbook/summary + observations; не повторяется на report GET |
| Business validation/registry lookup | Business upload/validate/commit/metadata action | File rows + existing registry/Page | Saves Import/BusinessRecord metadata; no automatic Opportunities recalc |
| HTML extraction/contentSignals/PageChange | Scanner worker/saveScanPage или crawl import action | Только прочитанные страницы | Page/ScanPage/PageChange persist |
| Metrika/Webmaster API ingestion/rematch | Yandex worker; rematch explicit action; targeted completion/coverage batch | API chunks или сохранённые rows | Persist daily rows/matching/checkpoints; в этом аудите не запускалось |

Оба recalc actions вызывают calculateOpportunities **и** calculateSeoActions: prepareDataset собирается повторно; в runRules benchmarkPages повторяется после уже сделанного benchmarkPages. Это action-cost, не причина каждого GET. Scanner/Yandex worker не пересчитывают Opportunities/SEO автоматически.

## 7. MONTH: влияние 94 536 observations

Источник: 5252 normalized queries, 1163 normalized URL, 18 месяцев 2025-03…2026-08. MONTH хранится в WebmasterQueryDaily, без превращения в daily observations. M3 — 2026-06-01…2026-08-31; предыдущий период — March–May.

| Consumer | Какие observations читает | Page filter до БД? | Preaggregated? |
|---|---|---|---|
| Webmaster default/M3 | 15 756 MONTH выбранных 3 месяцев | Нет, Site report | Нет |
| Webmaster M18 | Все 94 536 MONTH | Нет | Нет |
| SEO list default M3 | prepareDataset:31 512 MONTH за 6 месяцев; отдельно 15 756 текущих ещё раз | Нет | Нет; лишь final actions saved |
| Page360 SeoPagePanel M3 | 15 756 Site MONTH, затем rows.filter(pageId) | **Нет**, deliberate site-level effective merge | Нет |
| Page360 SeoPagePanel M18 | Все 94 536 Site MONTH, затем filter page | **Нет** | Нет |
| Page360 PageAnalytics | Page-level Search в независимом DAY окне | **Да** | Нет |
| Dashboard default 28 | Текущее+предыдущее 56 дневное окно, часть MONTH candidate rows может попасть в SQL и быть исключена как неполный месяц | Нет | Нет |
| MONTH rangeForSite | Все 94 536 **узких** periodMonth rows для Prisma distinct | Нет | Нет; наружу distinct18, но SQL должен быть проверен отдельно |
| Opportunities default 28 | Не читает Search observations | — | Читает saved Opportunity; M3 добавляет month metadata lookup |
| Search import history/preview | Workbook dataJson, а не Search dataset | — | Summary сохранён; workbook всё равно выбирается |

1. **Исходный XLSX с диска на GET не открывается.** Reports не запускают ExcelJS parser. Но `/webmaster/import` выбирает сохранённые в БД dataJson всех history records, при выбранном id тот же workbook повторно. Business quality читает сохранённые STOCK/PRICES/SALES sheets; prepareDataset читает SALES sheets. Это JSON transfer/decoding, а не физическое повторное чтение исходного файла.
2. **Не все 94k full observations при каждом SEO GET.** Default M3 читает 31 512+15 756 полных MONTH rows, и весь narrow month list. При явном M18 full search windows включают 94 536 + повторно 94 536. Точный query profile ниже/JSON.
3. **Intents считаются на GET** Webmaster/SEO/Page360, не Opportunities list.
4. **effectiveSearch merge считается при каждом вызове**; текущий период SEO читается/мерджится дважды через разные функции.
5. **Graph строится на GET** SEO list и Page360, но не monthly Webmaster после Sprint3.5.1.
6. **SEO Actions не генерируются на GET**: saved rows читаются из SeoAction. Их дорогая аналитическая обвязка всё ещё строится на GET.
7. Application dataset memoization, unstable_cache/use cache/react cache не найден. Prisma client/pool singleton и обычные DB/OS buffers — инфраструктурное повторное использование, не cache аналитики. Next route force-dynamic; browser Router prefetch — отдельная механика.
8. Materialized views/aggregate metric tables в модели нет. Opportunity/SeoAction — сохранённые конечные outputs, Import.searchSummaryJson — summary импорта; это не Search monthly query/page rollups.
9. Основные затраты — полнота DB projection/Prisma transfer + повторные site computations. CPU/SQL доказательства приведены в профиле, а не предполагаются по одному числу 94k.

| Route | Instrumented Prisma Search calls/elapsed | CPU hot functions/files (не wall decomposition) |
| --- | --- | --- |
| `/webmaster?period=M3` | findFirst:1records / 0.01s; findMany:18records / 1.33s narrow DISTINCT; findMany:15756records / 7.05s | classifyQuery@src/lib/seo-actions/intent.ts; parseEngineResponse@node_modules/@prisma/client/runtime/library.js; effectiveSearch@src/lib/search/model.ts; number@src/lib/i18n/ru.ts; MonthlySearchReport@src/components/monthly-report.tsx; demandMetric@src/lib/search/metrics.ts; (anonymous)@src/lib/seo-actions/intent.ts; demandMetric@src/lib/search/metrics.ts; (anonymous)@src/lib/seo-actions/engine.ts; querySummary@src/lib/seo-actions/intent.ts |
| `/webmaster?period=M18` | findFirst:1records / 0.01s; findMany:18records / 1.33s narrow DISTINCT; findMany:94536records / 41.44s | (anonymous)@src/lib/seo-actions/intent.ts; parseEngineResponse@node_modules/@prisma/client/runtime/library.js; normalizeQuery@src/lib/search/model.ts; aggregateQueries@src/lib/seo-actions/engine.ts; normalizeQuery@src/lib/search/model.ts; classifyQuery@src/lib/seo-actions/intent.ts; searchIdentity@src/lib/search/model.ts; effectiveSearch@src/lib/search/model.ts; (anonymous)@src/lib/search/model.ts; deduplicateSearch@src/lib/search/model.ts; (anonymous)@src/lib/search/model.ts; (anonymous)@src/lib/search/metrics.ts |
| `/seo-actions` | findFirst:1records / 0.01s; findMany:18records / 1.37s narrow DISTINCT; findMany:31512records / 14.78s; findMany:15756records / 6.90s | (anonymous)@src/lib/seo-actions/intent.ts; day@src/lib/yandex/dates.ts; iso@src/lib/yandex/dates.ts; day@src/lib/yandex/dates.ts; parseEngineResponse@node_modules/@prisma/client/runtime/library.js; day@src/lib/yandex/dates.ts; (anonymous)@src/lib/opportunities/dataset.ts; normalizeQuery@src/lib/search/model.ts; iso@src/lib/yandex/dates.ts; (anonymous)@src/lib/opportunities/commerce.ts; iso@src/lib/yandex/dates.ts; (anonymous)@src/lib/opportunities/dataset.ts; day@src/lib/yandex/dates.ts; classifyQuery@src/lib/seo-actions/intent.ts |
| `/pages/[id]?searchPeriod=M18` | findMany:507records / 0.42s; findFirst:1records / 0.02s; findMany:0records / 0.07s; findMany:18records / 1.27s narrow DISTINCT; findMany:94536records / 44.82s; findMany:18records / 1.34s narrow DISTINCT | parseEngineResponse@node_modules/@prisma/client/runtime/library.js; (anonymous)@src/lib/opportunities/dataset.ts; day@src/lib/yandex/dates.ts; (anonymous)@src/lib/seo-actions/intent.ts; day@src/lib/yandex/dates.ts; iso@src/lib/yandex/dates.ts; day@src/lib/yandex/dates.ts; iso@src/lib/yandex/dates.ts; searchIdentity@src/lib/search/model.ts; effectiveSearch@src/lib/search/model.ts; (anonymous)@src/lib/search/model.ts; (anonymous)@src/lib/search/model.ts; deduplicateSearch@src/lib/search/model.ts |

CPU samples показывают intent/classifyQuery/normalizeQuery и Date helpers в SEO, а также parseEngineResponse/merge. В defaultM3SEO metadata query returns18 после внутреннего distinct, два full reads31512+15756. Полные M18observations нужны для chosen period, но data projection/повторная агрегация остаются дорогими. Internal graph при текущем production отсутствии modernlinks не доказан главным CPU bottleneck.

## 8. Page 360: последовательность и initial render

```text
GET /pages/[id]?period=28&searchPeriod=M18
→ Page + latestScanPage + последние 20 scanPages
→ Promise.all(prepareDataset(28, весь Site), saved Opportunities выбранной Page)
→ поиск prepared Page; при failed latest дополнительный successful snapshot lookup
→ JSX server components:
   ├ PageAnalytics → dataForSite(28,pageId) → Page-level Search/Metrika/goals/trends
   └ SeoPagePanel → Page lookup → defaultSearchSelection → seoPageView(M18)
       → Page/Site + range + M/W configs
       → Promise.all(Site Search94536, SEOconfig, all active Pages/links, Metrika groupBy)
       → site graph → selected Page queries → aggregate/intent/query explorer
       → seoActionsForPage → Page + range lookup повторно + saved actions take5
       → PageChange take20
→ CommercePanel + BusinessFacts из site-wide prepareDataset
→ Scanner history + Opportunities + server render/response
```

Sibling async server components потенциально выполняются параллельно React; общий site dataset родитель await-ит до появления этих children. Нет границ Suspense/loading/lazy endpoints для дорогих блоков. Первый байт в текущих samples поступает после большой части server работы; точную React scheduler последовательность инструментированием running app не снимали.

| Async server block | Instrumented standalone,s | Calls during block (возможен overlap) |
| --- | --- | --- |
| PageAnalytics | 0.46 | 10 |
| SeoPagePanel | 57.90 | 21 |

Времена блоков сняты только в instrumented source execution. Для родительского Commerce/search mapping и для React-render нет надёжного отдельного wall timing. Async block time включает свои data reads+Node агрегации; времена sibling блоков нельзя суммировать. Выбранная Page Analytics использует page filter, тогда как SeoPagePanel — Site dataset.

| Блок | Нужен по текущей реализации на initial GET? | Нужен пользователю сразу? | Предложение lazy load, без реализации |
|---|---|---|---|
| URL/type/latest scanner status | Да | Да | Оставить shell initial |
| Scanner history20 | Да, родительский query | Обычно нет | После раскрытия истории, pagination |
| Commerce + business mapping | Да, parent prepareDataset всего Site | KPI выбранной Page да; весь Site нет | Page projection initial, history/benchmarks отдельно |
| Saved Opportunities | Да, Page-filter | Да/короткий список | Ограничить projection/число при необходимости |
| Metrika/daily Search/goals | Да, PageAnalytics | Summary да; все daily plots нет | Summary first, charts/detail отдельным блоком |
| MONTH Search/query explorer/intents | Да, SeoPagePanel; читает Site rows | Итог выбранной Page да; raw table100/вся история нет | Page-level effective projection + lazy explorer |
| Saved SEO Actions | Да, внутри SeoPagePanel **после** Search view | Да | Независимый быстрый initial read сохранённых 5 |
| Internal links site graph | Да | Обычно нет | Persist graph revision / load on section request |
| Page changes | Да, после actions | Обычно нет | Отдельный read при раскрытии |
| Content commercial signals | Да из successful snapshots | Короткий summary можно сразу | Detailed evidence по требованию |

Search period и Commerce period независимы: `searchPeriod=M18` не означает Commerce за 18 месяцев. Родительский prepareDataset остаётся 28 дней по умолчанию. Это предотвращает исторический 18-month Commerce blow-up, но не устраняет сбор всех 1479Pages ради одной.

## 9. Dashboard подробно

`prepareDataset(28)` строит все Pages, mapping, current/previous traffic/Search, Commerce и benchmarks. Одни prepared results используются KPI, sales risk counts, freshness/quality details, Search/traffic summary. Этот dataset собирается **1 раз**, не по разу на каждую карточку.

Opportunity.findMany выполняется **1 раз**, затем all используются mainTop и четырьмя rule sections. SeoAction.findMany отдельно **1 раз**, затем Node sort и slice5. Нельзя утверждать, что Dashboard многократно перечитывает Opportunities — повторяется **Business** слой: businessQuality после prepareDataset заново получает registry/records/Pages, правила и STOCK/PRICES/SALES imports. freshness снова читает target/site/config/несколько Scan/JobRuns. Output recommendations сохранены, KPI/quality/benchmarks пересчитываются на запрос.

Потенциальные precompute: site/period KPI + freshness + businessQuality с revision импорта, shared prepared context и готовые domain counts. Saved Opportunity/SeoAction можно читать независимо от Commerce. Дневная бизнес-конверсия и sales coverage должны сохранять существующую семантику неизвестных значений/transactional zeros.

Профиль: 27Prisma calls;2 полных BusinessRecord reads по 6483 + registry1909;2Page reads по 1479. Search507, Metrika9316. Opportunities0/SeoActions0 в default 28 дневном периоде. **Быстрая Opportunities list default также 0results**: это сохранённый другой период, не отсутствие 684production Opportunities. M3 current Opportunities: 387 (включая все domains/status; не обязательно число visible default cards). CPU hot files: business/quality.ts и opportunities/dataset.ts. Instrumented SQL sum3.00s при profile total38.88s; это свидетельство существенной работы вне SQL, но не вычитание server render из GET.

## 10. Актуальные размеры datasets

| Entity / definition | Global local DB | Production Site |
| --- | --- | --- |
| Site | 124 | 1 |
| Page | 2544 | 1479 |
| Scan | 298 | 11 |
| ScanPage | 1571 | 355 |
| Integration | 80 | общие configs80, не per-Site entity |
| MetrikaPageDaily | 26971 | 15743 |
| WebmasterQueryDaily | 97689 | 95043 |
| JobRun | 221 | 9 |
| ImportProfile | 22 | 0 |
| Import | 184 | 10 |
| BusinessRecord | 12511 | 6483 |
| Opportunity | 1019 | 684 |
| SeoAction | 308 | 5 |
| PageChange | 13 | 0 |
| Webmaster DAY | 3105 | 507 |
| Webmaster MONTH | 94584 | 94536 |
| Search imports | 37 | 2 |
| Queries normalized (distinct value) | 5577 | 5569 |
| Search URLs normalized (distinct value) | 1291 | 1163 |
| SKU MAPPING (global site-scoped physical distinct; production current registry) | 2006 | 1909 |
| ProductGroups (аналогичное определение) | 1447 | 1396 |
| ScanPage с internalLinksJson | 239 | 0 |
| Stored internal links (entries, без global dedup) | 171 | 0 |
| BusinessRecord LEGACY | 1566 | 0 |
| BusinessRecord MAPPING | 2011 | 1909 |
| BusinessRecord PRICES | 2058 | 1909 |
| BusinessRecord SALES | 5195 | 1143 |
| BusinessRecord STOCK | 1681 | 1522 |

Нет отдельной InternalLink таблицы. Entries содержатся в ScanPage.internalLinksJson; graph пересобирается. Совокупный distinct query value может совпадать между Sites, а rows/identity всегда site-scoped. Production active Pages: 1479.

BusinessRecord production: MAPPING1909 (1909 distinct SKU,1396groups), PRICES1909, STOCK1522 (805SKU), SALES1143 (366SKU). Это физические historical records, не «текущие цены/остатки». Current registry/quality приведены отдельным read-only расчётом ниже.

```json
{
  "mapping": {
    "totalSku": 1909,
    "withCoefficient": 0,
    "withoutCoefficient": 1909,
    "mappedSku": 1909,
    "productGroups": 1396,
    "groupsWithPage": 1396,
    "unmatchedGroups": 0
  },
  "sales": {
    "first": "2025-01-10",
    "last": "2026-10-06",
    "totalRows": 1143,
    "skuCoverage": 366,
    "totalSku": 1909,
    "unknownSku": 9
  },
  "stock": {
    "currentRecords": 1522,
    "outdated": 0,
    "unknownSku": 176
  },
  "prices": {
    "currentRecords": 1909,
    "outdated": 0,
    "unknownSku": 65,
    "anomalies": 0
  },
  "metrika": {
    "totalUrls": 1693,
    "matchedUrls": 231,
    "unmatchedUrls": 1462,
    "totalVisits": 12336,
    "matchedVisits": 9131,
    "unmatchedVisits": 3205,
    "coverage": 74.01913099870299,
    "rawUrls": 1840,
    "dates": {
      "from": "2026-09-07",
      "to": "2026-10-06"
    },
    "missingDays": 1
  }
}
```

Production JobRun statuses: [{"_count": {"id": 1}, "status": "CANCELLED"}, {"_count": {"id": 7}, "status": "COMPLETED"}, {"_count": {"id": 1}, "status": "PARTIAL"}]. Scan statuses: [{"_count": {"id": 1}, "status": "BLOCKED_BY_WAF"}, {"_count": {"id": 1}, "status": "COMPLETED"}, {"_count": {"id": 1}, "status": "COMPLETED_WITH_ERRORS"}, {"_count": {"id": 5}, "status": "FAILED"}, {"_count": {"id": 3}, "status": "STOPPED"}].

Внешний файл не менялся и не переимпортировался. 124Site и заметная часть глобальных rows — накопленные fixture Sites прежних acceptance; production counts выделены отдельно. Удалять их в аудите запрещено. `/scanner` история take30 выбирается без siteId и показывает такие Site вперемешку; latestCoverage выбирается отдельно для current Site.

| Table | Total MiB | Table inclTOAST MiB | Indexes MiB |
| --- | --- | --- | --- |
| WebmasterQueryDaily | 158.54 | 121.52 | 37.02 |
| MetrikaPageDaily | 45.18 | 34.53 | 10.65 |
| Opportunity | 9.73 | 9.24 | 0.48 |
| BusinessRecord | 7.58 | 5.63 | 1.95 |
| Import | 4.75 | 4.70 | 0.05 |
| Scan | 3.35 | 3.32 | 0.03 |
| Page | 1.57 | 0.91 | 0.66 |
| ScanPage | 1.37 | 1.13 | 0.23 |
| SeoAction | 0.59 | 0.49 | 0.10 |
| JobRun | 0.59 | 0.43 | 0.16 |
| Integration | 0.29 | 0.26 | 0.03 |
| Site | 0.09 | 0.05 | 0.03 |
| ImportProfile | 0.08 | 0.05 | 0.03 |
| PageChange | 0.06 | 0.02 | 0.05 |
| _prisma_migrations | 0.03 | 0.02 | 0.02 |

Размеры PostgreSQL относятся ко **всей таблице, вместе с fixture/history**, не одному Site; включают TOAST и индексы. n_live_tup — estimate, фактические counts получены COUNT.

## 11. Индексы: есть / кандидаты / избыточность

Проверены реальные `pg_indexes`, не только schema.prisma. Все модели имеют PK(id).

| Условие | Есть | Потенциальный кандидат; не создавать без EXPLAIN/профиля |
|---|---|---|
| Site/baseUrl, Integration/type | UNIQUE baseUrl/type | Нет явной потребности |
| Page siteId/normalizedUrl | UNIQUE(siteId,normalizedUrl); UNIQUE latestScanPageId | `(siteId,active)` при росте inventory; сейчас 1479pages |
| Scan siteId/status/start/finish | Только PK | `(siteId,startedAt)` и выборочный status индекс; сейчас 298global, priority низкий |
| ScanPage scanId | UNIQUE(scanId,pageId), левый prefix работает | Для page history/latest-success **нет** `(pageId,scannedAt)`; partial success index candidate |
| Metrika siteId/counter/date | UNIQUE(siteId,counterId,date,rowKey); (siteId,date,pageId); (siteId,matchStatus,date) | `(siteId,counterId,pageId,date)` для Page360; текущий date-before-page менее точный для page slice |
| Webmaster siteId/date/page | UNIQUE(siteId,hostId,date,rowKey); (siteId,date,pageId); (siteId,matchStatus,date) | Page-before-date + source/host projection после проверки effective merge semantics |
| Webmaster grain/periodMonth | (siteId,grain,periodMonth) | Сначала SQL DISTINCT/metadata projection; новый индекс не исправит Prisma distinct transfer |
| normalizedQuery/normalizedUrl Search | Нет отдельного index | `(siteId,normalizedQuery,...)`, `(siteId,normalizedUrl,...)` только после переноса реальных filters/aggregates в SQL |
| Webmaster importId | FK без отдельного index | `(importId,pageId)` для rescan count/import provenance query; FK сам index не создаёт |
| Import site/date | (siteId,createdAt) | `(siteId,kind,status,createdAt)` если history растёт; главное убрать dataJson из history projection |
| BusinessRecord importId | UNIQUE(importId,rowNumber); (siteId,pageId,date) | `(siteId,sku,date)` для точечного Commerce; сейчас код всё равно делает full bulk read |
| Opportunity isCurrent/status/score | (siteId,isCurrent,status,score); unique(siteId,pageId,ruleId,periodFrom,periodTo) | Period/domain/rule filters не покрыты отдельным list index; `(siteId,isCurrent,status,periodFrom,periodTo,score)` candidate |
| SeoAction isCurrent/status | (siteId,isCurrent,status); unique(siteId,pageId,actionId,periodFrom,periodTo) | Period/category/priority list compound при большом количестве; текущие 5production rows не bottleneck |
| JobRun | (status,nextAttemptAt); (integrationId,createdAt) | Site/source/date — candidate при росте; сейчас 221global |
| PageChange page/date | (pageId,createdAt); unique(scanPageId) | Уже соответствует history query |
| Opportunity domain/rule | ruleId в unique после pageId; domain неиндексирован | Индексы под конкретные список/период, не универсальный GIN для всего evidence |

**Вероятно избыточных доказанных индексов не обнаружено.** Пересекающиеся prefix по siteId сами по себе не доказывают избыточность: разные порядок/filter/unique constraints. PK/unique нужны для relations/idempotence. Перед удалением потребовались бы index usage за репрезентативное окно и workload, что в аудите не менялось.

Read-only EXPLAIN: narrow month metadata использует Index Only Scan, estimates≈92krows; это всё равно большой result перед Prisma distinct. Репрезентативный full M3 Search SELECT выбирает parallel Seq Scan+Sort/Gather Merge, несмотря на существующий site/date index: широкий result и высокая доля Site делают это возможным. Это план **приближённого SELECT без конкретного host filter**, не утверждение точного Prisma plan. Successful snapshot SELECT — Seq Scan/Hash Join/Sort на небольших таблицах. Планы сохранены в before JSON. Не объявляю SQL scan главным bottleneck без measured Prisma timings.

## 12. Browser/network

| Route | BrowserTTFB,s | DCL,s | Load,s | Requests | Document decoded bytes | JS decoded bytes | DOM nodes | Prefetch requested / completed |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `/` | 11.42 | 11.61 | 11.71 | 33 | 20420 | 546545 | 148 | 23 / 16 |
| `/seo-actions` | 21.02 | 21.59 | 21.59 | 35 | 52866 | 546545 | 295 | 25 / 25 |
| `/pages/[id]?searchPeriod=M18` | 25.15 | 25.64 | 25.80 | 31 | 249543 | 546545 | 2582 | 21 / 9 |
| `/scanner` | 6.58 | 7.00 | 7.34 | 28 | 3510561 | 560169 | 16664 | 17 / 4 |
| `/business-data` | 5.90 | 6.49 | 6.49 | 33 | 1219890 | 546545 | 12249 | 23 / 16 |

В завершённых prefetch responses наблюдаются преимущественно 265–1100decodedbytes и десятки ms; это small routing payloads, **не доказательство фонового full analytics recalc**. Поэтому prefetch не объявлен главным bottleneck. Для сравнения со server GET используйте таблицу 4: browser runs сняты отдельно и подвержены другой сетевой/CPU нагрузке.

Реальные client fetch после response — Next `_rsc` prefetch по nav links/period/source links; отдельного client API, заново скачивающего 94kraw JSON, не обнаружено. Prefetch URL/число/duration сохранены в browser JSON. Этот результат доказывает фоновые **requests**, но не доказывает, что каждый prefetch вызывает весь heavy dataset: Next может отдавать route metadata/partial response. Изолированные GET использованы отдельно для оценки route cost.

Hydration duration нельзя надёжно выделить без React instrumentation/user timing marks. `DOMContentLoaded`, load и resource timings — измерены; gap между ними не назван hydration. HTML bytes raw GET и browser DOM bytes имеют разные определения; не смешиваются. JS bytes в таблице — resource decodedBodySize, requests наблюдались в ограниченном окне 500ms после load; это не полный eventual page lifecycle. Browser routing отключает HTTP cache; свежий context также не даёт persistent browser cache, но сервер/БД прогреты. `/scanner` auto-refresh срабатывает каждые 5sec только для active coverage; current production stopped, принудительно не включался.

## 13. TOP-10 bottlenecks, severity и ожидаемый эффект

| Rank | Priority | Bottleneck | Routes | Evidence | Expected impact (qualitative) |
| --- | --- | --- | --- | --- | --- |
| 1 | P1 | Site-wide prepareDataset в чтении saved SEO/одной Page | SEO; Page360; Dashboard | SEOwarm20.00s; PageM18 22.07s;1479Pages+6483records; source await | Убрать лишний Commerce/benchmarks из list и Page projection |
| 2 | P1 | Широкие Search bulk reads и Prisma transfer/decode | WebmasterM18; SEO; Page360M18 | 94536full rows; ALL fields/rawJson; parseEngineResponse CPU, query elapsed≫SQL event | Сократить bytes/objects; page/aggregate read models |
| 3 | P1 | Intent classification заново, regex/dictionaries perquery | MonthlyWebmaster; SEO; Page360 | 5252clusters; classifyQuery/intent hot в CPU; нет cache | Revision/dictionary-keyed classification; компилировать dictionary одинраз |
| 4 | P1 | Business quality повторно и registry×records/Pages loops | Dashboard; Business Data | Dashboard2×6483+1909registry,2×1479Pages; quality.ts CPU hot | Shared reads и keyed indexes, quality summary reuse |
| 5 | P1 | Current Search читается/мерджится повторно | SEO Actions | 31512current+previous +15756current повторно;20Prisma calls | Один coherent effective dataset, reuse current subset |
| 6 | P1 | Page360 все blocks зависят от дорогого initial path | Page360 | Site Commerceparentawait; SiteSearchM18 до selectedPage; repeated Page/range; async blocks | Ранний shell/KPI/savedactions; lazy detail и Page-level projection |
| 7 | P2 | Coverage preview повторяет landing reads/matching, NewURL loops | Scanner; Unmatched; Priority | Scanner2×4930Metrika,1479+242Pages; matching/parse CPU hot | Shared scope data и URL/alias lookup maps |
| 8 | P2 | Закрытые details всёравно отдают огромный HTML | Scanner; BusinessData | 3510561B/16664nodes и 1219890B/12249nodes; queue.map/registry.map без pagination | Меньше initial transfer/DOM; pagination/lazy diagnostics |
| 9 | P2 | Prisma distinct months переносит весь narrow dataset | Все MONTH; Page360 repeated | SQL SELECT id,periodMonth без DISTINCT;94536→18; повтор range helper | SQL DISTINCT/metadata cache; не fullobservations |
| 10 | P2 | History Import выбирает workbook JSON; selected повторно | WebmasterImport; Imports | 2native history files; selectedsameimport ещёраз; defaultGET1.17s/detail1.78s | Metadata select, только selectedworkbook1 раз |

Отдельная **P1 функциональная** проблема: Coverage hidden scope переведён; все 3launch intents некорректно передают validator input. P2 UX: TargetScan на Webmaster unmatched выбирает Метрику. P3: возможныеиндексы, неиспользуемаяпока graph optimization, smallprefetch roundtrips. Ни одна из этих находок не исправлена.

P0 по снятым GET **не подтверждён**: все проверенные страницы ответили 200, нет доказанного зависания/бесконечного запроса. P1 — многосекундные основные экраны и функциональная блокировка launch; P2 — заметные repeats/transfer; P3 — индексные/архитектурные кандидаты. Это классификация текущих наблюдений, не SLA. WAF и неопределённый Webmaster POST — прежние ingestion limitations, не причина server CPU на report GET; production network в аудите не проверялся.

## 14. План оптимизации — только предложение

| Этап | Что менять | Routes | Ожидаемый эффект | Риск | Schema |
|---|---|---|---|---|---|
| Quick wins1–4h | Saved SEO list без seoDataset, отдельный минимальный summary query | SEO Actions | Убрать site Commerce/graph/intents из загрузки списка 5saved rows | Низкий/средний: сохранить coverage/default period/filters | Нет |
| Quick wins1–4h | `select` для Import history; выбранный workbook читать 1 раз | Webmaster Import/Imports | Снизить JSON transfer/parse, особенно повторные native files | Низкий: preview всё ещё требует выбранный dataJson | Нет |
| Quick wins1–4h | SQL DISTINCT periodMonth / отдельная month availability helper | Все MONTH views | Возвращать 18 значений вместо 94k narrow rows, убрать repeats | Низкий: grain/date semantics | Нет |
| Quick wins1–4h | Дедуплицировать configs/Page/range lookups; независимые reads параллельно | Dashboard/Page360/SEO/System | Снять sequential latency; выигрыш надо измерить | Низкий: bound source validation сохранить | Нет |
| Quick wins1–4h | Scope hidden technical value; targeted Webmaster-view label/preview | Coverage/Unmatched | Исправить launch wiring/источник выбора после отдельного разрешения | Низкий; нужны local UI tests без productionscan | Нет |
| Medium0.5–2d | Page-specific Commerce projection; optional benchmarks separate | Page360 | Не считать 1479Pages ради одной; уменьшить mapping/dayloops | Средний: cross-page group conflicts/benchmarks/unknown values | Не обязательно |
| Medium0.5–2d | Shared request dataset для Dashboard quality/Commerce; keyed registry maps | Dashboard/Business Data/Scanner previews | Убрать repeatedreads и O(SKU×Pages)/New URL loops | Средний: aliases/conflicts/mapping policy | Нет |
| Medium0.5–2d | Narrow Search fields; reuse current/previous merged dataset; page effective projection с сохранением identities | MONTH views/SEO/Page360 | Меньше payload/Prisma decode, один current merge | Средний/высокий: APIprecedence/MONTH suppress DAY/region | Не обязательно |
| Medium0.5–2d | Pagination diagnostics/queue/checkpoint view; current Site history | Scanner/detail | Вместо 3.5MBHTML короткий page; снять noisefixture | Средний: durable checkpoint не обрезать, только UIprojection | Нет |
| Medium0.5–2d | Evaluate prefetch heavy links; page shell/Suspense/read-only lazy blocks | Dashboard/SEO/Page360 | Меньше backgroundtraffic и быстрее first useful content | Средний: navigation UX/streaming/errors | Нет |
| Architectural | Revision-keyed Search query/page/month rollups и intent cache | Webmaster/SEO/Page360 | Считать выбранный период изагрегатов вместо десятковтысяч rawrows | Высокий: dedup/region/demand/grain semantics, invalidation | Вероятно да |
| Architectural | Persist business quality/site-period Commerce summaries и graph revision | Dashboard/Page360/SEO | GET читает готовые read models; пересчёт при изменении источников | Высокий: freshness/revision/transactionalzeros | Вероятно да |
| Architectural | Единый Scanner launch screen с scope/transport preview | Scanner/Unmatched | Одна mental model и меньше неверного выбора; backend adapters оставить | Средний: presets/backwardslinks/resume diagnostics | Не обязательно |
| После изменения query shape | EXPLAIN exact SQL и выборочно индексы из раздела 11 | Heavyreads | Эффект только там, где фильтр/сортировка используют индекс | Средний: disk/writecost; без измерения проценты не обещаны | Миграции, если одобрено |

Сроки — rough scope для последовательных небольших работ, не обязательство выполнить весь список за 4 часа/2 дня. Проценты ускорения не назначены: изменения в этом аудите не выполнялись и A/B comparison нет. Сначала request-path decoupling/projections, затем schema/rollups по evidence. Redis/новая очередь/LLM для этого не требуются.

## 15. Предложение единого Scanner UX

Одна точка запуска — `/scanner`. Остальные разделы дают **ссылку с preset и preview**, а не вызывают другой launch action напрямую. Для продолжения существующего задания централизованный Scanner показывает queue/Resume; detail остаётся read-only ссылкой на управление.

```text
Scanner
Что сканировать?
 [Весь сайт] [Список URL] [URL из источника]
Источник (для source scope):
 [Метрика] [Webmaster discovery] [Несопоставленные Метрики]
 [Search-matched Pages] [Нет modern contentSignals]
Период и scope: выбранный source, visits/search evidence, limits
Как читать?
 [HTTP + Browser fallback] [Browser only] [HTTP only]
Параметры: общий maxURLs, batch≤50, concurrency1 default,
 delay3000ms default, HTTP15s/Browser20s,
 skip successful7days / explicit rescan, excludes
Preview: N URLs, URL/source/reason/match/status/latestSnapshot/visits
 [Тест 1URL] [Диагностика N≤50] [Запустить выбранную очередь]
Задания: progress, WAF pause explanation, Stop/Pause/manualResume
Альтернативный источник: Excel Crawl Import (без сети)
```

Search-matched/no-modern scopes выше — **предложение**, сейчас producers для них нет. Приоритетный Webmaster export остаётся интеграцией в `/webmaster/priority`, не маскируется как Scanner. Браузерный WAF guard/read-only GET/HEAD/robots/auth restrictions и checkpoint/idempotence должны сохраниться; новая UX-точка не обещает обход WAF. Старые full/single/coverage/targeted формы в будущем либо ведут с preset, либо удаляются после согласования. Ничего из этого не реализовано.

## 16. Артефакты и воспроизводимость

- [HTTP без JS](test-results/current-audit-isolated.json), [дополнительные GET](test-results/current-audit-extra.json).
- [Browser navigation/network](test-results/current-audit-http.json).
- [Prisma queries/CPU/stages](test-results/current-audit-profile.json).
- [Production quality/traffic read-only](test-results/current-audit-quality.json).
- [До: counts/hashes/индексы/EXPLAIN](test-results/current-audit-before.json), [после](test-results/current-audit-after.json), [проверка неизменности](test-results/current-audit-safety.json).
- Локальные profiling scripts: `test-results/current-audit-db.ts`, `current-audit-http.mjs`, `current-audit-isolated.mjs`, `current-audit-profile.ts`. Только аудит: не заменяют production jobs/tests.

Ключевые исходники: `src/app/scanner/{page,actions,coverage-actions}.tsx/ts`, `src/components/{scanner-forms,coverage-form,coverage-report,aggregate-unmatched}.tsx`, `src/lib/scanner/{service,coverage,engine,browser,http,options,import-service}.ts`, `src/lib/yandex/{targeted,dataset,priority,settings,views}.ts`, `src/lib/opportunities/{dataset,commerce,transactional,service}.ts`, `src/lib/seo-actions/{service,engine,intent}.ts`, `src/lib/search/{dataset,model,range,metrics}.ts`, `src/lib/business/{views,quality,service}.ts`.

Ни одна рекомендация аудита не применена. Для исправлений потребуется отдельное поручение пользователя.
