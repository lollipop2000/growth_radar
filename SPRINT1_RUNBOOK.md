# Sprint 1 — Site Scanner, WAF и Excel Crawl Import

## Реальная проверка Browser Scan

05.10.2026, 14:04 МСК: первым действием проверен один URL `https://shop.gazpromneft-sm.ru/` стандартным Playwright Chromium, headless, без пользовательских cookies, подмены User-Agent или взаимодействия со страницей.

Результат: `ERROR`, HTTP status `null`, HTML не получен; проверка завершилась по таймауту примерно за 27 секунд, включая запуск Chromium. HTTP 403/challenge этой проверкой **не подтверждён**, успешный доступ к магазину тоже не подтверждён. После этой проверки deadline адаптера уточнён: 20 секунд включают запуск браузера и чтение страницы. Повторные попытки чтения production-магазина не выполнялись.

Исходный отчёт сохранён локально в `test-results/browser-probe.json`. WAF не обходился. Альтернативный источник **Excel Crawl Import** реализован и проверен на локальных fixtures. Для реального acceptance нужен доступный магазин или настоящая XLSX/CSV crawl-выгрузка.

## Архитектура

- HTTP через Node fetch/undici — первый способ. Честный User-Agent `G-market-Growth-Radar/0.2 (read-only scanner)`.
- HTTP 403 и распознанный challenge: `BLOCKED_BY_WAF`. 401: `AUTH_REQUIRED`; обычные 404/5xx сохраняют обычный HTTP error.
- Точечный Browser fallback для 403/challenge, транспортной недоступности HTTP или HTML-shell без читаемого содержимого. Его можно отключить checkbox. Авторизацию/обычные 404 браузером не обходить.
- Явный Browser Scan использует Chromium только для этого задания. Browser concurrency 1, delay 1500 ms по умолчанию (1000–2000), deadline 20 sec. WAF/authentication останавливают scan; транспортная ошибка браузера тоже останавливает задание вместо массовых повторов.
- **HTTP / BROWSER / IMPORT → общий PageResult → saveScanPage → Page / ScanPage.** Последующие спринты читают общие поля. Source нужен для аудита, а не для отдельных аналитических pipelines.
- Scan хранит очередь/настройки, counters, errors, duration и heartbeat. Один worker выполняет один scan; PostgreSQL advisory lock защищает claim/create. Схема без отдельного Redis/Job scheduler.
- Snapshots исторические. Page хранит pointer на последний snapshot, классификацию и aliases для redirects. Повторное получение не создаёт новую Page для того же site/normalized URL.

## Запуск

```powershell
docker compose up -d db
npm ci
npx playwright install chromium
npm run db:migrate
npm run build
npm start
```

В отдельном терминале: `npm run worker`. На Windows перед build/generate остановить app и worker: они удерживают Prisma DLL. После build снова запустить оба процесса.

App: http://127.0.0.1:3000/scanner. Docker: `docker compose --profile app up -d --build`; предварительно применить миграции командой из README. Dockerfile устанавливает Chromium и Linux dependencies. Полная сборка Docker app/worker image в этой сессии не проверялась.

## Использование Scanner

1. В Settings указать base URL магазина.
2. Выбрать HTTP с fallback либо Browser Scan. Max Pages обязателен: 1–50. HTTP concurrency 1–2, default 2, delay default 500 ms (можно увеличить). Browser concurrency всегда 1; min delay 1000 ms.
3. Seed URL — по одному на строку. Discovery: robots.txt → sitemap/index → внутренние ссылки → seeds. Robots allow/disallow учитываются; sitemap вложенность ограничена десятью документами. Sitemap читается через HTTP; блокировка discovery видна в scan detail.
4. Start full scan либо Scan one URL (берётся первый разрешённый seed, Max Pages=1).
5. Обновлять статус вручную. PENDING означает, что worker ещё не взял задание. История показывает site, mode, status, discovered/scanned/failed, duration и Stop.
6. Stop отменяет PENDING сразу; RUNNING → STOPPING, worker считывает изменение примерно раз в секунду и abort-ит HTTP/browser. При запуске самого Chromium завершение Stop может ждать его launch deadline. Уже сохранённые snapshots остаются.
7. Если worker пропал, через 60 секунд устаревшего heartbeat задание переводится в INTERRUPTED. Возобновление — новым scan, без автоматического повторного обхода production.

## Безопасность сети

Только HTTP(S), тот же origin (scheme, hostname, port), без credentials. Блокируются tracking-free опасные query keys `token/password/session/access_token/auth/action`, внешние ссылки, mailto/tel/javascript/anchors. Обязательные исключения `/admin`, `/login`, `/logout`, `/cart`, `/checkout`, `/api`, `/basket`, `/account`, `/auth`; можно добавить prefixes. Снятие обязательных исключений UI не допускает.

HTTP: timeout 15 sec, redirects ≤5, body ≤2 MB, без retries. Delay соблюдается после получения headers перед следующим запросом; чтение тел допускается параллельно до HTTP concurrency.

Browser: стандартный UA Chromium, без stealth и личного профиля. Только GET/HEAD; POST/PUT/DELETE/beacon и WebSocket соединения блокируются, Service Workers выключены для обязательной маршрутизации. Нет clicks, заполнения форм, cart/checkout, login, challenge solving или обхода TLS. Downloads отключены. Images/media/fonts и внешние resources не загружаются; максимум 100 requests и 6 navigations на страницу. Внутренние navigation budget includes redirects/iframes. Это может ограничить сложные страницы; ошибка видна пользователю.

TLS verification включена. Корпоративный CA — через NODE_EXTRA_CA_CERTS. Ни один внешний API/LLM не вызывается.

## Excel Crawl Import

На `/scanner`: файл **.xlsx** (первый worksheet) или **UTF-8 .csv** (comma/semicolon delimiter). До 5 MB, 50 строк данных, 50 Excel columns. XLSX archive ограничен 20 MB распакованных данных/1000 entries; encrypted/ZIP64 не поддерживаются. Никакие формулы не вычисляются — экспортировать значения.

Обязательные уникальные headers (case/spaces/underscores нечувствительны):

```text
URL,Status Code,Title,Meta Description,H1,H2,Canonical,Robots,Word Count
```

URL — абсолютный или относительный внутри настроенного сайта; служебные URL отклоняются. Status Code — 100–599. Title/Description/H1/H2/Canonical/Robots/Word Count могут быть пустыми. H2 — строки или значения через `;`. Canonical разрешается относительно URL и нормализуется. Некорректные строки показываются с номером; дубли normalized URL внутри файла skipped. Результат показывает imported/skipped/errors. Импорт 403 классифицируется как BLOCKED_BY_WAF.

Импорт пишет в те же сущности, mode/source IMPORT, сохраняет filename/counters/ошибки в Scan. Повторный импорт добавляет историю Scan/ScanPage, но не дублирует Page. HTTP-specific поля, неизвестные импорту (response time, headers, links, structured data, content hash), остаются null/empty. Бизнес Excel Import Wizard из Sprint 3 не реализован.

## Pages

Единый inventory для текущего Site: URL, status/outcome/source, Title/H1, words, canonical и last scan. Поиск URL/title/H1; фильтры HTTP/outcome, type, missing title/description/H1, duplicate title/description, indexable. Pagination 25 строк. Unknown indexability отдельно не приравнивается к non-indexable.

Типы: homepage/category/product/article/search/informational/other. Default rules по URL patterns находятся в `src/lib/scanner/url.ts`. Ручной тип сохраняется при дальнейших scans/imports. Page detail показывает общий набор metadata и последние 20 snapshots. Это техническая карточка Sprint 1, без метрик и Page 360 Sprint 2.

Нормализация убирает fragment, UTM/известные tracking params, сортирует query keys и убирает trailing slash кроме root. Реальные query параметры сохраняются. Redirect final URL формирует identity только внутри origin, original URL сохраняется в aliases/requestedUrl. Canonical хранится как нормализованное evidence; разные canonical pages автоматически не объединяются. При сайте, где trailing slash обозначает разные страницы, policy следует адаптировать перед crawl.

## Проверки и acceptance

```powershell
npm run build
npm run typecheck
npm test
npm run acceptance:scanner
npm run acceptance:worker
npm run check:clean-db
npm run db:status
npm run check:secrets
```

`acceptance:scanner` использует отдельный локальный Site fixture, проверяет HTTP/BROWSER/IMPORT, dedup, историю и сохранение ручного type. `acceptance:worker` проверяет очередь, остановку активного scan и recovery. Эти scripts временно меняют Target Site config и восстанавливают его в finally; запускать последовательно, при остановленном обычном worker и без одновременного пользовательского scan. При аварийном принудительном завершении script проверить URL в Settings.

`check:clean-db` создаёт отдельную БД, применяет обе Prisma migrations и проверяет drift; БД сохраняется без удаления. Fixture sites/scans тоже оставлены в БД; их URL имеют localhost origin и не относятся к production-магазину.

Unit/HTTP/browser tests: normalizer, extraction, robots/sitemap index, bounded traversal, pacing, cancellation, HTTP403→browser200 на fixture, browser challenge stop, запрет mutations/cart, CSV/XLSX import, validation и dedup. Tests не сканируют production-магазин.

Результаты 05.10.2026: production build и отдельный typecheck — PASS; 17/17 tests — PASS; scanner/worker acceptance — PASS; обе миграции применены к рабочей и новой БД, drift отсутствует. Интерфейс Browser Scan проверен: concurrency 1, delay 1500 ms, Max Pages 50. Отчёт общего pipeline: `test-results/scanner-acceptance.json`; скриншот: `test-results/sprint1-scanner.png`.

Реальный acceptance: максимум 50 страниц. Сначала `npm run probe:browser` на одном URL. При 403/challenge остановиться: взять настоящую crawl-выгрузку и импортировать её. Не расширять лимиты, менять UA или устанавливать stealth для обхода WAF. Полный production acceptance пока не подтверждён.

## Ограничения

- Доступ к реальному магазину не подтверждён. Блокировка WAF не установлена фактически: первый browser probe вернул transport ERROR без HTTP status.
- PostgreSQL в Docker проверен. Полная сборка и запуск Docker-образа приложения с Chromium пока не проверены; acceptance выполнен на локальном Node.js runtime.
- Эвристики challenge и JS-shell консервативные и могут требовать адаптации. Chromium читает DOM на DOMContentLoaded; нет общего механизма ожидания произвольного SPA/позднего async content.
- Browser блокирует внешние assets/API и может не отобразить зависимые страницы. Sitemap/browser XML fallback не реализован; доступны внутренние ссылки/seeds и import.
- Первое acceptance ограничено 50 pages/rows, 10 sitemap documents. Inventory/history — 25/30 строк соответственно; scan snapshot detail ограничен Max Pages.
- Нет auth/RBAC приложения, automatic schedules, API sync, scoring, бизнес Excel, AI или Sprint 2+ функций.

## Файлы

Изменены `prisma/schema.prisma` и добавлена `prisma/migrations/202610050002_scanner/migration.sql` (только ADD COLUMN/INDEX/FOREIGN KEY). Старые миграции не менялись.

Созданы `src/lib/scanner/{browser,url,model,http,discovery,options,engine,store,service,import,import-service}.ts`, `src/app/scanner/{page,actions}.tsx/ts`, scan detail, `src/app/pages/` и page detail, `src/components/scanner-forms.tsx`, `scripts/{worker,probe-browser,acceptance-scanner,acceptance-worker,verify-clean-db}`, `tests/{scanner,browser}.test.ts`. Обновлены route placeholders, layout/CSS, next config, package/lock, Dockerfile/compose, README и две спецификации с WAF-уточнением.
