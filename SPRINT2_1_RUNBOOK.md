# Sprint 2.1 — Priority Scope и качество dataset

## Статус и границы

Реализован только Sprint 2.1. Sprint 3, Opportunities, бизнес Excel, LLM и Opportunity Score не подключены. Полная очередь 690 URL больше не является условием MVP acceptance. Новых export POST для неё нет. Историческая неопределённая job cmuvgb1ll000q20s8ik0ptoks остаётся PARTIAL / SUBMITTING; повторного POST нет. Guard проверен с настоящими данными и в UI.

Технические проверки: production build, typecheck, 28 tests, Sprint 2 DB acceptance, scanner worker regression, migrations/schema и secrets — PASS. Подробные доказательства: test-results/yandex-acceptance.json, test-results/sprint2-1-production.json, test-results/sprint2-1-verification.json. UI screenshots: test-results/sprint2-1-priority-blocked.png, sprint2-1-priority-full.png, sprint2-1-diagnostic.png, sprint2-1-coverage.png.

Реальный Webmaster MVP acceptance пока INCOMPLETE: Test Connection ранее PASS, настоящие exports подтверждены, повторные импорты без дублей и Page 360 проверены; но выбранный TOP 20 имеет Search data только для 1/20 страниц. Новые exports блокирует неопределённый предыдущий POST. Это ограничение выбранного Priority Scope, а не требование полной выгрузки 690 URL.

## Реальные результаты

Отчёт 06.10.2026, 08:01:12 МСК, период 2026-09-06 — 2026-10-05. Данные Метрики за все 30 полных дней импортированы, missing days: 0.

- Уникальных raw landing URLs: **1849**; normalized landing URLs: **1697**.
- Matched normalized URLs: **15**; unmatched: **1682**.
- Всего visits: **12596**; matched: **3997**; unmatched: **8599**.
- **Matched traffic coverage: 31.73%**. Это основной показатель matching, а доля daily rows — вторичный.

Настоящий targeted TOP 10 scan cmuvqoedt0004202cztdt0s07: **FAILED**, фактически обработан 1/10 URL. Первый URL не получен HTTP/Browser, scanner остановил очередь штатно. Автоматический rematch завершился. WAF/challenge не обходились, данные не заменены fixtures.

| Показатель | Before | After |
|---|---:|---:|
| Unique matched URLs | 15 | 15 |
| Unique unmatched URLs | 1633 | 1633 |
| Matched visits | 3879 | 3879 |
| Unmatched visits | 8258 | 8258 |
| Traffic coverage | 31.96% | 31.96% |

Before/After используют один фиксированный набор импортированных visits на момент начала scan (06.10.2026 00:05 МСК). Дневная Метрика за 05.10 была догружена позднее, поэтому текущие 1697 URLs / 31.73% отличаются от фиксированного cohort 1648 URLs / 31.96%. Это изменение состава данных; crawler не дал прироста покрытия. В локальном DB acceptance успешный targeted scan дал 50% → 75%, с неизменным total visits 1200; это fixture, не production.

## Priority Scope

/webmaster → /webmaster/priority. Default **TOP 20**, также TOP 50, TOP 100 и Manual selection (1–100 URL). Preview обязателен до сохранения/запуска. Таблица показывает URL, Page match status, page type, visits за 30 дней, наличие Webmaster data и причину включения. Manual принимает normalized URLs из текущего dataset, по одному на строку. Неизвестные/внешние/служебные URL отклоняются.

Сортировка лексикографическая по критериям: visits ↓; при равенстве Webmaster discovery; затем product/category, если классификация известна; окончательный tie — URL. Это порядок, а не Opportunity Score. Используются существующие Метрические records, подтверждённый discovery из старых checkpoints/кэша и Scanner Pages. Исторический ALL checkpoint со смешанными кандидатами не считается Webmaster discovery. Visits и факт discovery — evidence существования, но не гарантия текущего HTTP 200. Из кандидатов исключаются известные 404/410, inactive Pages, external host, корзина, checkout, API, auth/profile/personal URLs и URL с секретными параметрами. Исключённые URLs остаются в unmatched/denominator, traffic coverage не завышается.

Fingerprint preview проверяется сервером; при изменении dataset требуется обновить preview. Кнопка «Сохранить выбор без export» пишет только локальный config. Initial/Incremental и scheduler используют только сохранённые URLs; автоматического rerank/расширения до 690 URL нет. Неопределённый POST блокирует новые exports даже для Priority Scope. Настройки активной job менять нельзя. Существующие готовые tasks можно скачивать повторно; старые массовые jobs без priorityUrls перед следующим POST переходят в PAUSED.

Scope содержит mode/URLs/key/selectedAt и отдельный syncedThrough. Изменение набора URLs сбрасывает scoped watermark. Успешная полная выбранная scope job обновляет только scoped watermark, не глобальный watermark host; partial dates/subset не продвигают cursor. Тариф остаётся бесплатным.

### Сохранённый TOP 20

| # | URL | Visits · 30d | Page match | Type | Search data · 30d |
|---:|---|---:|---|---|---|
| 1 | https://shop.gazpromneft-sm.ru/catalog | 2029 | MATCHED | category | Нет |
| 2 | https://shop.gazpromneft-sm.ru/ | 1695 | MATCHED | homepage | Есть |
| 3 | https://shop.gazpromneft-sm.ru/catalog/filter/brand-is-0000000001/packing-is-2f0e6106-cad8-11e7-80e3-0050569eedf6/apply | 589 | UNMATCHED | unknown | Нет |
| 4 | https://shop.gazpromneft-sm.ru/catalog/gazpromneft-vmgz-kanistra-5-l | 281 | UNMATCHED | unknown | Нет |
| 5 | https://shop.gazpromneft-sm.ru/catalog/g-energy-synthetic-super-start-5w-30-kanistra-4-l | 249 | UNMATCHED | unknown | Нет |
| 6 | https://shop.gazpromneft-sm.ru/catalog/g-profi-msi-10w-40-kanistra-20-l | 148 | UNMATCHED | unknown | Нет |
| 7 | https://shop.gazpromneft-sm.ru/catalog/gazpromneft-hydraulic-hlp-46-kanistra-20-l | 117 | UNMATCHED | unknown | Нет |
| 8 | https://shop.gazpromneft-sm.ru/catalog?FILTER_ITEM_IN_STOCK=Y | 116 | MATCHED | category | Нет |
| 9 | https://shop.gazpromneft-sm.ru/catalog/g-profi-msi-10w-40-bochka-205-l | 109 | UNMATCHED | unknown | Нет |
| 10 | https://shop.gazpromneft-sm.ru/catalog/g-profi-gt-10w-40-kanistra-20-l | 97 | UNMATCHED | unknown | Нет |
| 11 | https://shop.gazpromneft-sm.ru/catalog/gazpromneft-hydraulic-hvlp-32-kanistra-20-l | 95 | UNMATCHED | unknown | Нет |
| 12 | https://shop.gazpromneft-sm.ru/catalog/gazpromneft-diesel-premium-10w-40-bochka-205-l | 89 | UNMATCHED | unknown | Нет |
| 13 | https://shop.gazpromneft-sm.ru/catalog/gazpromneft-diesel-ultra-plus-10w-40-bochka-205-l | 87 | UNMATCHED | unknown | Нет |
| 14 | https://shop.gazpromneft-sm.ru/catalog/g-energy-synthetic-active-5w-30-kanistra-4-l | 80 | UNMATCHED | unknown | Нет |
| 15 | https://shop.gazpromneft-sm.ru/catalog/gazpromneft-premium-l-10w-40-kanistra-20-l | 76 | UNMATCHED | unknown | Нет |
| 16 | https://shop.gazpromneft-sm.ru/catalog/gazpromneft-diesel-premium-5w-40-kanistra-50-l | 72 | UNMATCHED | unknown | Нет |
| 17 | https://shop.gazpromneft-sm.ru/catalog/gazpromneft-premium-c3-5w-30-bochka-50-l | 68 | UNMATCHED | unknown | Нет |
| 18 | https://shop.gazpromneft-sm.ru/catalog/g-energy-synthetic-super-start-5w-40-kanistra-4-l | 66 | UNMATCHED | unknown | Нет |
| 19 | https://shop.gazpromneft-sm.ru/catalog/gazpromneft-standard-10w-40-bochka-205-l | 65 | UNMATCHED | unknown | Нет |
| 20 | https://shop.gazpromneft-sm.ru/catalog/gazpromneft-hydraulic-hlp-46-bochka-205-l | 63 | UNMATCHED | unknown | Нет |

Search data есть у **1/20**. «Есть» означает наличие реальных импортированных строк в 30-дневном периоде; это не доказательство полноты всех дат семидневного scope. Оценка полного повторного Initial за 7 дней: **140 URL-дней**, минимум **2 суток** при доступной квоте 100 URL-дней/сутки. Остаток аккаунта/ожидание подготовки файлов может увеличить срок. Платный тариф не включается. Новых production export POST в этой приёмке — **0**.

## Unmatched и targeted scan

/unmatched по умолчанию показывает URL aggregates, сортировку по visits, raw variants и долю общего traffic. Source Metrika/Webmaster, период 7/30/90, pagination 50. Daily rows сохранены: view=ROWS. Coverage относится к Метрике текущего Site/counter за выбранный период, а не к числу Search query rows. Неизвестные дни явно показаны; неизвестные метрики не выдумываются.

Scan top unmatched URLs: TOP 10 / 20 / 50, по visits за последние 30 полных дней. Используется существующий createScan/crawl/store/worker Sprint 1: HTTP first, точечный стандартный Playwright fallback, concurrency 1, delay 1500 ms, HTTP timeout 15 sec, Browser timeout 20 sec, обязательный Max Pages ≤50. seedOnly читает robots.txt, не загружает sitemap и не добавляет links. Robots/excludes/Stop/WAF restrictions сохранены. Нет POST/PUT/DELETE, login, CAPTCHA, stealth, поискового User-Agent, корзины/checkout/forms.

Before фиксируется при создании Scan. После любого terminal status, включая FAILED/STOPPED, выполняются rematch и расчёт After по тому же cohort. Crash recovery завершает незаписанные diagnostics. Отчёт виден в /unmatched и /scanner/[id]. Scan с одной сетевой ошибкой/WAF не становится evidence успешного Page match: требуется хотя бы один 2xx/3xx OK snapshot того же Site (HTTP/BROWSER/IMPORT). Предыдущий успешный snapshot остаётся валиден после позднего сетевого сбоя. Подтверждённые redirect aliases используются; canonical и значимые query params не объединяются произвольно.

## Данные и миграции

Новых таблиц и schema изменений нет. Существующие три additive migrations не изменены. Priority Scope/discovery cache — Integration.configJson; snapshot URL scope — JobRun.configJson; Before/After/cohort — Scan.configJson. Метрики, Page/ScanPage и raw API records остаются в общих сущностях. OAuth tokens только server ENV, в этих JSON и frontend их нет. Redis/новый crawler не добавлялись.

## Запуск и повторение проверок

Остановить app и оба worker перед Prisma generate/build на Windows. Не запускать DB acceptance одновременно с worker или другими DB acceptance: используются общие locks и временно меняются Integration settings, с восстановлением в finally.

```powershell
npm run build
npm run typecheck
npm test
npm run db:status
node node_modules/prisma/build/index.js migrate diff --from-schema-datasource prisma/schema.prisma --to-schema-datamodel prisma/schema.prisma --exit-code
npm run acceptance:yandex
npm run acceptance:worker
npm start
```

Проверить secrets после запуска app:

```powershell
$env:PAGE360_CHECK_ID='cmuv6w2wt000120goxunx7su2'
$env:TARGET_SCAN_CHECK_ID='cmuvqoedt0004202cztdt0s07'
npm run check:secrets
```

В отдельных терминалах: npm run worker и npm run worker:yandex. Для текущего настоящего состояния, при остановленном Yandex worker: node --env-file=.env --conditions=react-server --import=tsx scripts/acceptance-sprint2-1-real.ts. Script сохраняет preview TOP 20, подтверждает блокировку старой неопределённой job и отсутствие новой JobRun, пишет test-results/sprint2-1-production.json. Он не делает новый remote export POST и не повторяет production scan. scripts/write-sprint2-1-runbook.mjs обновляет этот документ из отчёта текущей приёмки.

UI acceptance: открыть /webmaster/priority, проверить TOP 20/50/100 и Manual preview; открыть /unmatched, сравнить visits/coverage и daily rows; Scan top unmatched URLs создаёт ограниченную job, после завершения открыть diagnostics. Для настоящего повторного scan используйте кнопку намеренно; network/WAF не обходить.

## MVP acceptance и ограничения

Webmaster MVP требует: Test Connection PASS; подтверждённые реальные exports; повтор без дублей; TOP-20 обработан либо реальные готовые exports дают данные выбранному scope; Page 360 на реальных данных; неопределённый POST не повторяется. Все 690 URL не нужны для PASS.

Остаются две внешние границы текущего dataset: 19 выбранных страниц ещё без Search data, а запуск новых exports заблокирован до проверки неопределённой задачи; реальный targeted scan не прочитал первый URL из-за сети. Ошибки/неполнота показаны честно. Автоматического повтора uncertain POST, покупки тарифа или обхода WAF нет. Ни положительный fixture Before/After, ни 1/20 Search pages не считаются полноценной production TOP-20 приёмкой. Manual selection доступна, но не подменяет требование TOP-20 для этой приёмки.

Visitors period uniques и подробная granular pageview аналитика не добавлены; сохраняется landing-page session grain Sprint 2. Product/category rule-based/manual classification используется только если известна. Сопоставление только на уровне подтверждённого Page inventory; новые сигналы/Opportunity Score относятся к Sprint 3 и здесь отсутствуют.

## Изменённые файлы

src/lib/yandex/{dataset,priority,targeted,jobs,settings,store}.ts; src/lib/scanner/{options,discovery,engine,service}.ts; scripts/worker.ts; dataset actions/forms; /webmaster/priority; /unmatched aggregates; Scanner detail diagnostics; integration reports; scripts/acceptance-yandex.ts, acceptance-sprint2-1-real.ts, check-client-secrets.mjs; tests/dataset.test.ts; README и runbooks. Dependencies/ENV secrets и Prisma schema не менялись.
