# Sprint 3.5 — SEO Action Engine

## Status

Реализован только Sprint 3.5. Независимый rule-based анализ в `src/lib/seo-actions/`; никаких LLM, готовых SEO-текстов, автопубликации, нового crawler или внешних интеграций. Production Scanner/API jobs не запускаются. Приёмка PASS: 118 unit tests, build/typecheck, DB/UI регрессии, миграции/schema drift/clean DB, локализация и secrets check. Фактические production-количества приведены ниже.

Две недеструктивные миграции: `20261006210000_seo_actions` добавляет SeoAction, PageChange, nullable поля snapshot и источник/нормализованный запрос/importId в WebmasterQueryDaily; jobRunId становится nullable для локального файла. `20261006210500_query_normalization` заполняет только производное поле существующих запросов, сохраняя raw query и identity. Старые миграции, очереди и исходные аналитические показатели не переписываются.

## Search Import

`/webmaster` → «Импорт поисковых данных» → `/webmaster/import`: загрузить XLSX/CSV → выбрать лист → сопоставить колонки → проверить → подтвердить корректные строки. Для изменения уже проверенного mapping нажать «Изменить сопоставление» и повторить проверку. Commit повторно проверяет строки и использует transaction/advisory lock; повторное подтверждение файла идемпотентно. Импорт не создаёт Scanner, JobRun, export POST или Metrika sync.

Обязательные колонки: Date, URL, Query, Impressions, Clicks, CTR, Average Position. Region необязателен. Русские/английские headers распознаются автоматически; произвольные названия сопоставляются вручную. CTR — проценты 0–100, согласованные с clicks/impressions (допуск 0,1 п.п.); итоговый CTR вычисляется из показателей. Пустые CTR/позиция разрешены, позиция неизвестна; показы и клики обязательны, целые и неотрицательные, clicks ≤ impressions. Даты YYYY-MM-DD/ДД.ММ.ГГГГ либо native Excel date. URL — абсолютный, того же origin, без credentials/секретных query keys. Значимые query и trailing slash остаются в raw URL.

Переиспользован существующий bounded XLSX/CSV reader: 5 МБ, 20 листов, 100 колонок, 10 000 строк/лист, archive safety. Формулы не исполняются и отклоняются. Preview до 20 строк; до 100 сообщений ошибок, полные счётчики в Import. История последних 20 загрузок отображается, старые файлы/данные сохраняются. Ошибки не становятся SEO Opportunities. IMPORT.kind = WEBMASTER_SEARCH; не BusinessRecord.

Статический `public/templates/webmaster_search_template.xlsx`: листы «Данные» и «Описание». Пример заменить реальной выгрузкой. Создан Artifact Tool, визуально проверен и повторно прочитан существующим ExcelJS reader.

## Search Dataset

API и файл записывают одну таблицу WebmasterQueryDaily. Источник: WEBMASTER_API / WEBMASTER_IMPORT. API по-прежнему связан с JobRun и выбранным host; локальный файл связан с Import и не требует подключения API. Все Search consumers — Rules dataset, Page 360, отчёт Вебмастера, Priority Scope, unmatched и SEO — читают общий `searchDataset`.

Прозрачная дедупликация: site/date/**raw URL/raw query**/region; null и пустой регион трактуются одинаково. Хранятся оба источника, аналитика выбирает API, затем последний Import. Регион, другой raw URL и другой raw query не сливаются. Нормализованный query используется для intent/cannibalization, а не для удаления исходных строк. Повторный import upsert обновляет ту же identity FILE_IMPORT, история исходных файлов сохраняется в Import.dataJson. Более старый API остаётся приоритетнее более нового файла.

API ограничен выбранным host текущего Site; Import доступен независимо от API. Matching переиспользует прежние успешные Page snapshots и redirect aliases. Unknown URL сохраняется с pageId=null; Import не создаёт Page. Canonical не применяется для произвольного объединения URL.

UI показывает эффективные API/import rows после дедупликации, уникальные запросы/URL, число дат. Покрытие дней означает наличие строк, а не доказанную полноту всей выгрузки/сайта. Пропуски не заменяются нулями. Рекомендации требуют по странице минимум 75% дней и значимые нормализованные запросы ≥100 показов. Отсутствие Search не означает нулевую органику.

## Query Normalization

Raw query сохраняется, normalizedQuery — trim/lowercase/ё→е/повторные пробелы→один. Бренды, цифры, пунктуация и спецификации остаются; stemming и ML отсутствуют. Старые запросы получили это производное поле через миграцию.

## Query Intent

Запрос имеет несколько тегов: TRANSACTIONAL, B2B, PRODUCT, PACKAGING, APPLICATION, SPECIFICATION, ANALOG, BRAND, INFORMATIONAL, OTHER. Словари и пороги на `/seo-actions` → «Настройки и словари SEO». Нормализация не меняет текст поиска для отображения; агрегированные normalized queries имеют взвешенные показы/клики/позицию/CTR.

Фасовки 1/4/5/20/50/205 л, компактные 20л/20l и «бочка»/«канистра». Application/specification dictionaries + явные ISO/SAE/API-like числовые patterns. Аналог — явный аналог/замена/вместо/equivalent; два бренда дают только пометку возможного сравнения, без сильной рекомендации.

Сводка страницы: unique normalized queries, SUM impressions/clicks, доли показов и кликов по каждому тегу, top packaging/application/specification. Доли пересекаются и не обязаны давать 100%. Query Explorer показывает до 100 запросов с фильтрами для бизнеса/коммерческих/фасовки/применения/спецификаций/аналогов; сводка учитывает все строки.

## B2B Intent

Сильные признаки: оптом, предприятие, производство, промышленный, автопарк, поставщик, закупка, 20/205 л. Неоднозначные бочка/канистра/оборудование/СТО требуют минимум двух разных weak признаков. Word boundaries защищают от «СТО» внутри «стоимость». Evidence содержит найденные признаки; это словарный сигнал намерения, не установленный тип покупателя.

## Page Fit

Используется последний успешный snapshot существующего Scanner. Новая extraction сохраняет `contentSignalsJson` (meaningful text/top text/boolean+evidence) и `internalLinksJson`. Title, Description, H1/H2, structured types и contentHash — прежние поля. Предпочитается main/role=main, исключены навигация/header/footer/aside, scripts/styles и явно hidden nodes. CSS/layout не анализируются. Текст ограничен 100 000 символов, top — 4 000, до 5 000 адресов ссылок.

Старые snapshots не backfill-ятся внешними запросами. Unknown текст/graph не выдаются за отсутствующие блоки: по ним нет application/specification/schema/linking рекомендаций. Header gaps могут использовать достоверные старые метаданные при достаточном спросе. Сопоставление товарной группы с Title/H1 требует query evidence; одна связь mapping не доказывает спрос на полное название.

## Commercial Structure

Boolean + evidence: название (H1), цена, наличие, фасовка, CTA, характеристики, применение, спецификации, документация, аналоги, связанные товары, FAQ, Product/Offer schema. JSON-LD и schema.org microdata itemtype; неизвестные форматы/RDFa могут быть пропущены. Признаки — текстовые эвристики, не экспертиза технической совместимости.

Top content — H1 + начало meaningful текста, без pixel rendering. Отсутствующие цена/наличие/CTA при значимом transactional demand дают confidence MEDIUM. Рекомендация предлагает вручную проверить первый экран, не утверждает точное положение элементов.

## Cannibalization

Normalized query → distinct raw URLs. Defaults: ≥200 показов на запрос, доля URL ≥20%, минимум два общих дня между конкурирующими URL. Одного случая либо непересекающихся дат недостаточно. Evidence: запрос, URL, показы, клики, взвешенная позиция, наблюдаемые дни. Рекомендация — проверить распределение intent и выбрать основную landing; автоматического canonical совета нет.

## Content Gaps

Только homepage/category/other/informational, значимый кластер ≥25% показов и ≥100 показов, известное содержимое и отсутствующая тема. Сигнал предлагает проверить необходимость специализированной посадочной. Не создаёт страницу и не обещает, что её нет во всём неотсканированном inventory.

## Internal Linking

Граф из сохранённых ссылок: уникальные source/target Page, inbound/outbound, depth от homepage при наличии пути, orphan-like в наблюдаемой части, входящие с посещаемых страниц. Отдельно число наблюдавшихся и всех Pages; отсутствие пути в неполном графе не доказывает настоящую orphan page.

Порог мало inbound <2; нужны перспективная страница с достаточным Search и тематические источники с наблюдавшимися ссылками. Связи: общая категория/группа/бренд, application либо normalized query. Уже имеющиеся ссылки исключены. До 5 источников, visits и причины; при неполном графе confidence LOW. Ни embeddings, ни новый crawler.

## SEO Actions

SeoAction отдельно от Opportunity. Выход: actionId/pageId/priority/category/title/description/evidence/expectedMetric/confidence; дополнительно b2b. A01 Title; A02 Description; A03 H1; A04 Packaging; A05 First Screen; A06 Application; A07 Specification; A08 Analogs; A09 Cannibalization; A10 Content Gap; A11 Structured Data; A12 Internal Linking. Категории в enum-like string labels: SNIPPET/TITLE/DESCRIPTION/H1/FIRST_SCREEN/CONTENT/APPLICATION/SPECIFICATION/PACKAGING/INTERNAL_LINKING/CANNIBALIZATION/CONTENT_GAP/STRUCTURED_DATA/TECHNICAL. Не каждое название категории обязано создавать отдельную рекомендацию.

Identity site/page/actionId/periodFrom/periodTo, cannibalization actionId включает SHA-256 normalized query (сам query хранится в evidence). Upsert без дублей; неподтверждённые того же периода получают isCurrent=false. Primary opportunityId — самая сильная текущая Search Opportunity страницы; другие Opportunity Detail показывают действия общей page/period связи. Действие может быть без Opportunity.

Статусы ACTIVE/DISMISSED/IMPLEMENTED — Активно/Скрыто/Выполнено. При повторном расчёте состояние сохраняется. Новая версия периода наследует статус/comment/implementedAt/baseline предыдущей версии той же page/action. Старые строки не удаляются. Это минимальный статусный контракт, не workflow Sprint 5.

`/seo-actions`: фильтры приоритета/категории/page type/B2B/action type/status, по 100 карточек/страница. Настройки сохраняются явно, затем ручной пересчёт. Page 360 и Opportunity Detail — максимум 5 active actions с priority/category/evidence/метрикой.

## Priority

VERY_HIGH/HIGH/MEDIUM/LOW; без дополнительного сложного score. VERY_HIGH — сильный Commerce + B2B + подтверждённый низкий CTR. HIGH — сильный Commerce, высокий спрос, значимый B2B либо достаточный спрос при позиции ≤20. При слабом текущем положении >30 — LOW, иначе MEDIUM. Confidence отдельно отражает неопределённость данных.

Commercial strength требует свежих полных продаж, meaningful revenue/kg, полного достаточного трафика и эффективности не ниже **положительной** медианы peers. Неполный denominator visits не создаёт ложную высокую эффективность. RULE_23: сильный товар и слабые подтверждённые impressions/position; RULE_24: strong commerce + impressions + good position + CTR ниже прежнего benchmark. Оба требуют достаточных Search дней; missing source не считается нулём. Domain SEARCH / primaryType GROWTH. Прежние RULE 01–22 не заменяются.

## Page Changes

Новый успешный saveScanPage сравнивается с предыдущим успешным snapshot другого scan. PageChange — один meaningful diff на scanPageId: title/description/H1/H2/wordCount/structured flags и contentHash change. Повторная запись того же scan не множит историю. WAF/error не являются изменениями содержимого. История отображает дату и изменённые поля, без raw HTML diff.

## Before/After Baseline

Первый переход в IMPLEMENTED сохраняет implementedAt, optional comment и baseline impressions/clicks/CTR/position/visits/revenue/kg и период. Unknown остаётся null. Повторное сохранение IMPLEMENTED не переписывает baseline, комментарий можно обновить. Это подготовка данных, без causal analysis, автоматической after-оценки и прогноза прироста.

## Dashboard

Компактный «SEO: что улучшить» — TOP-5 active actions выбранного периода, Page/priority/краткое действие/показы+CTR и ссылка на полный список. Коммерческие KPI, TOP Opportunities и отдельное качество данных сохранены.

## Production Validation

Период: 2026-09-08–2026-10-05. Search: 507 сохранённых строк; 432 эффективных (432 API / 0 импорт); 304 запросов, 1/1479 страниц (0.0676%). Даты: 2026-09-08–2026-10-04, 27/28 (96.43%). Это покрытие наблюдаемых дат, не полнота Search сайта.

B2B: 18.01% показов; transactional: 9.00%. Фасовка: 1 л: 1 показ, 0.19%. Применение: кластеров нет.

SEO Actions: 0. По всем 4 приоритетам и 14 категориям — 0. Cannibalization: 0; Content Gaps: 0; Internal Linking: 0; RULE_23/RULE_24: 0/0.

TOP-20 пуст: максимум показов одного запроса 39, минимум 100; запросов выше порога 0. Search доступен только для главной страницы. Пороги ради демонстрации не понижались; отсутствующий Search и старое неизвестное содержание не стали нулями или доказательством проблем.

Повторный пересчёт без дублей — PASS. Производственные очереди (11 Scans / 9 JobRuns), бизнес-данные и настройки не изменены пересчётом. После всех UI fixtures текущий Site восстановлен, полные hashes очередей повторно совпали. Полный JSON: test-results/sprint3-5-production.json. Новые Search-файлы проверены только на локальном fixture Site.

## Tests

Остановить workers перед DB/UI fixtures; app перед generate/build на Windows. Не запускать acceptance параллельно с пользовательскими изменениями Settings. Все HTTP/API/Chromium fixtures localhost; production probes и remote jobs запрещены.

```powershell
npm run db:migrate
npm run check:sprint3-5
npm run build
npm start
# app запущен, workers остановлены:
node --env-file=.env scripts/verify-sprint3-5-ui.mjs
node --env-file=.env --conditions=react-server --import=tsx scripts/sprint3-5-production.ts
```

Production audit использует baseline `test-results/sprint3-5-before.json`, пересчитывает только накопленные данные, проверяет полные hashes очередей и неизменность бизнес-records/настроек. Для нового отдельного audit сначала `scripts/sprint3-5-baseline.ts`. Не перезаписывать baseline посреди acceptance.

Unit tests: Search source priority/raw identity, normalization, dictionaries/weak B2B, packaging/spec/application/analog, weighted overlapping shares, header/content/schema gaps, unknown content guards, incomplete dates, cannibalization period/share, content gap, confirmed thematic internal links, baseline, meaningful diff, bounded settings, microdata/meaningful extraction и Commerce/Search Growth guards. DB acceptance: CSV/XLSX/mapping, API vs import, повторный commit/recalc, status/baseline, template contract, PageChanges. Browser acceptance: download/upload/validation/commit, Query Explorer, Page/Opportunity/Dashboard, status/baseline, desktop/mobile.

| Проверка | Результат |
|---|---|
| typecheck | PASS |
| tests | PASS |
| scanner regression | PASS |
| worker regression | PASS |
| coverage regression | PASS |
| waf regression | PASS |
| yandex regression | PASS |
| sprint3 regression | PASS |
| sprint3-1 regression | PASS |
| commerce regression | PASS |
| sprint3-4 regression | PASS |
| seo-actions regression | PASS |
| migration status | PASS |
| schema drift | PASS |
| clean database | PASS |
| seo-actions UI | PASS |
| sprint3-4 UI | PASS |
| commerce UI | PASS |
| business-data UI | PASS |
| sprint3 UI | PASS |
| sprint3-1 UI | PASS |
| localization | PASS |
| secrets | PASS |
| build | PASS |
| final unit tests: 118/118 | PASS |
| final typecheck + Search/business separation | PASS |
| production audit + final queue guard | PASS |

Search-файлы исключены из истории бизнес-импорта; прямые вызовы businessDraft/validateBusiness/commitBusiness отклоняют их без изменения draft. Дополнительная DB-проверка — PASS. Browser acceptance ожидает DOMContentLoaded; готовность данных подтверждается конкретными элементами интерфейса и проверками БД.

## Known Limitations

- Search Import не проверяет полноту внешнего файла или реальную доступность URL. Редкая query статистика может не пройти conservative thresholds; пороги настраиваются явно.
- API приоритетен независимо от возраста; обе версии сохранены для прозрачности, автоматического выбора по качеству/дате нет. History хранит оригинальные значения файлов; аналитическая импортированная identity содержит последний файл.
- Словари ограниченные и настраиваемые; словоформы/синонимы вне словарей могут быть пропущены. Нет linguistic stemming, ML или LLM.
- Top/visible text приблизительны: hidden CSS, поздний JS/SPA и реальный layout могут отличаться. Новый сбор возможен только отдельным пользовательским безопасным Scanner запуском; здесь production не сканировался.
- Граф покрывает только новые snapshots с сохранёнными адресами; counts не утверждают полноту сайта. Предложенные ссылки/аналоги/допуски требуют проверки специалистом.
- Состояния/версии actions хранятся по расчётным периодам с наследованием статуса. Полного workflow/анализа эффекта нет.
- Старые ограничения WAF, неопределённого Webmaster POST, API quota, отсутствия RBAC/полного Docker image acceptance сохранены. Workers оставлены остановленными в рамках запрета автоматических внешних заданий; запуск — отдельно пользователем. Sprint 4/5 не начаты.

