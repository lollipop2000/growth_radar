# G-market Growth Radar

Sprint 4.2: [Structured AI Actions, проверка качества и ограничения](SPRINT4_2_STRUCTURED_AI_ACTIONS.md).

Sprint 4.2.1: [Specificity Gate Hotfix — локальные проверки и диагностика](SPRINT4_2_1_SPECIFICITY_GATE.md).

Sprint 4.1 AI Grounding: [V2, независимая валидация и результаты приёмки](SPRINT4_1_AI_GROUNDING.md). Факты/гипотезы и CHANGE/CHECK разделены; отклонённые карточки скрываются независимо. Локальные проверки PASS, итог READY WITH FIXES: единственная разрешённая серия из8 real calls не прошла live acceptance; после неё уточнены guards без новых вызовов.

Sprint 4 AI Analyst MVP: [архитектура, ENV, проверки и приёмка](SPRINT4_AI_ANALYST.md). Ручной AI-анализ одной Page на Page360 через server-side DeepSeek, без изменения сайта/скоринга и без persistence. ENV описан в `.env.example`; без ключа основной экран работает, AI недоступен.

Final Pre-AI Hardening: [приёмка, замеры и решение о готовности](FINAL_PRE_AI_HARDENING.md). AI не реализован; ограничения данных и предлагаемый контракт приведены в отчёте.

SEO Tuning Round 1: [аудит и performance measurements](SEO_TUNING_ROUND1.md). По сохранённым mapping/content evidence исправлены 470 автоматических типов карточек; query gate сохранён после отклонённой cluster simulation. SEO list использует существующий компактный Search transport; intent matcher пропускает Unicode regex для отсутствующих literal tokens с проверенной эквивалентностью. Commerce coverage/rules и WAF ограничения сохранены; новые production scans не запускались.

Scanner queue: `npm start` запускает приложение и управляемый Scanner worker с автоматическим перезапуском. Отдельный `npm run worker` при этом не нужен. Rematch обновляет строки пачками по 500; `/scanner` показывает причину ожидания и явную ошибку для старого PENDING при недоступном worker. Проверки и ограничения: [SCANNER_QUEUE_RUNBOOK.md](SCANNER_QUEUE_RUNBOOK.md).

Sprint 3.5: [SEO Action Engine](SPRINT3_5_RUNBOOK.md), файловый Search Import на `/webmaster/import`, рекомендации на `/seo-actions`, Query Explorer и изменения страницы в Page 360. API и CSV/XLSX читаются через общий Search dataset с приоритетом API; без LLM и внешних заданий из расчёта. Локальная проверка: `npm run check:sprint3-5`, затем при запущенном app и остановленных workers — `node --env-file=.env scripts/verify-sprint3-5-ui.mjs`. Production scan/sync автоматически не запускать. Sprint 4/5 не начаты.

Sprint 2.2.1: три режима транспорта, ограниченная диагностика и автоматическая пауза после трёх неразрешённых WAF-блокировок подряд — [SPRINT2_2_1_RUNBOOK.md](SPRINT2_2_1_RUNBOOK.md). Production scan выполняется пользователем вручную; Sprint 3 реализован; описание — [SPRINT3_RUNBOOK.md](SPRINT3_RUNBOOK.md).

Scanner сохраняет исходный trailing slash в адресе запроса. Нормализованный URL используется только для matching/deduplication. Coverage и targeted scan восстанавливают адреса из исходных URL Метрики; существующие результаты не повторяются автоматически.

По умолчанию пауза между страницами — 3 секунды, concurrency — 1. HTTP и Browser fallback используют общий Pacer. Coverage выдерживает ту же паузу между пачками; Start/Resume позволяют выбрать 3/10/20/30/60 sec. Ожидание паузы не расходует сетевой timeout. WAF-предохранитель и ручное возобновление сохраняются.

Реализованы Sprint 0/1, Sprint 2, Sprint 2.1 и Sprint 2.2: Яндекс Метрика, Вебмастер, matching, Page 360, daily sync, Priority Scope, targeted scan и Metrika Coverage Scan. Next.js App Router, React, TypeScript, Tailwind, PostgreSQL и Prisma. Sprint 3 добавляет бизнес-импорт Excel, десять правил, объяснимую оценку, возможности роста и русский интерфейс. Инструкции: [SPRINT2_2_RUNBOOK.md](SPRINT2_2_RUNBOOK.md), [SPRINT2_1_RUNBOOK.md](SPRINT2_1_RUNBOOK.md).

На `/scanner` режим Metrika Coverage Scan формирует очередь landing URLs за 7/30/90 дней, default 30 days / Unmatched only / batch 50. Это пачки существующего Scanner с concurrency 1 и общей паузой 3 sec для HTTP/Browser. Progress, Pause/Stop/Resume, checkpoint и batch history сохраняются в БД; после каждой пачки выполняется прежний rematch и пересчитывается traffic coverage на фиксированном dataset. Одна URL-ошибка не останавливает этот режим; повторные WAF-блокировки вызывают автоматическую паузу. Production Coverage Scan запускает пользователь вручную после отключения VPN и успешного Browser Scan одного URL; во время реализации production crawl не запускался.

Вебмастер запускается через `/webmaster/priority`: TOP 20 по умолчанию, TOP 50/100 или ручной выбор, обязательный preview перед export. Полная выгрузка 690 URL не требуется для MVP. Сохранённый выбор используется daily scheduler; неопределённый POST по-прежнему блокирует новые exports. `/unmatched` показывает агрегаты URL и покрытие по visits; Scan top unmatched URLs переиспользует Scanner для TOP 10/20/50, затем выполняет rematch и сохраняет Before/After на одном наборе данных.

Поддерживаются реальные CSV/gzip exports и восстановление сохранённого task без нового POST. Priority Scope использует visits Метрики и подтверждённый Webmaster discovery; исключает небезопасные и заведомо невалидные URL. Page 360 сохраняет видимость последнего успешного Scanner snapshot и отдельно показывает ошибку последней попытки. Базовая квота Вебмастера ограничивает скорость initial sync; текущие результаты и ограничения — в `SPRINT2_1_RUNBOOK.md`.

Priority Scope имеет отдельный watermark выбранного набора URL и не продвигает общий watermark сайта. При сетевом сбое загрузки официального CSV worker использует стандартный Chromium только для этого файла, без OAuth в браузере и без обхода HTTP 403. На этой машине включён `YANDEX_TLS_COMPAT=1` для совместимого TLS 1.2 с проверкой сертификатов. Неопределённый export POST блокирует новые задачи до проверки в Вебмастере; Метрику после ошибки можно продолжить с сохранённого дня.

## Локальный запуск

Нужны Node.js 24 LTS, npm и запущенный Docker Engine.

1. `Copy-Item .env.example .env` (PowerShell) или `cp .env.example .env`.
2. В `.env` задайте собственный `POSTGRES_PASSWORD`, используйте этот же пароль в `DATABASE_URL`; задайте `SITE_BASE_URL=https://shop.gazpromneft-sm.ru/`. Пароль в URL должен быть percent-encoded, если содержит специальные символы.
3. `npm ci`
4. `docker compose up -d db`
5. `npm run db:migrate`
6. `npm run db:generate`
7. `npm run dev`
   В отдельных терминалах: `npm run worker` и `npm run worker:yandex`.
8. Откройте http://127.0.0.1:3000/settings, нажмите **Test site connection**; затем `/system` → **Проверить систему**.

Для production остановите app и оба worker перед `npm run build`, затем `npm start`, `npm run worker` и `npm run worker:yandex` в отдельных терминалах. На Windows работающие процессы удерживают Prisma DLL. Сборка не требует доступной БД; runtime требует применённых миграций.

Для Browser Scan: `npx playwright install chromium` (на Linux: `npx playwright install --with-deps chromium`). `/scanner` поддерживает HTTP с точечным browser fallback, явный Browser Scan, Stop и Excel Crawl Import. Max Pages обязателен и ограничен 50 для первого acceptance. `/pages` показывает единый inventory с фильтрами, последними snapshots и ручной классификацией. Детали эксплуатации: [SPRINT1_RUNBOOK.md](SPRINT1_RUNBOOK.md).

## Docker

`docker compose --profile app up -d --build` — PostgreSQL, приложение, scanner worker и Yandex worker. Перед стартом worker выполните `docker compose run --rm app npm run db:migrate`; app также применяет миграции при запуске. Workers ждут доступную схему. Данные БД находятся в постоянном томе `radar_pgdata`. `docker compose down` сохраняет данные; не используйте `down -v` для рабочей БД.

## Проверки

`npm run build`, `npm run typecheck`, `npm test`, `npm run db:status`.

`npm run check:system` проверяет систему и сохраняет статусы. `npm run check:secrets` проверяет отсутствие заданных ENV-секретов в клиентской сборке и HTML работающего приложения.

Дополнительно: `npm run acceptance:scanner`, `npm run acceptance:worker`, `npm run acceptance:coverage`, `npm run check:clean-db`. Они проверяют локальные fixtures и БД; production-магазин не сканируют. DB acceptance выполнять последовательно при остановленных worker. `npm run probe:browser` проверяет ровно один URL магазина и сохраняет отчёт в `test-results/browser-probe.json`.

Дополнительно для Sprint 2: `npm run check:yandex`, `npm run acceptance:yandex`. Последняя команда использует только локальный Site и API fixtures, временно меняет Integration config и восстанавливает его в finally. Выполнять при остановленных worker. Подробная приёмка, ограничения и операции: [SPRINT0_RUNBOOK.md](SPRINT0_RUNBOOK.md), [SPRINT1_RUNBOOK.md](SPRINT1_RUNBOOK.md), [SPRINT2_RUNBOOK.md](SPRINT2_RUNBOOK.md).

Настройки сохраняются в PostgreSQL. URL из Settings имеет приоритет над ENV. Токены и ключи не сохраняются в configJson. Метрика: `YANDEX_METRIKA_TOKEN`, `YANDEX_METRIKA_COUNTER_ID`. Вебмастер: только `YANDEX_WEBMASTER_TOKEN`; user/hosts загружаются API, host выбирается в Settings. Настройте Primary Goals, затем `/metrika` → Initial sync, `/webmaster/priority` → preview → выбранный период → export. В Settings доступен daily scheduler; его выполняет Yandex worker. `/unmatched` показывает URL и traffic coverage, переключатель сохраняет просмотр daily rows; `/pages/[id]` объединяет Scanner/Search/Metrika. LLM не подключён.

Приложение предназначено для localhost/доверенной корпоративной сети. Авторизация в Sprint 0 не реализована. При размещении на внутреннем сервере нужен защищённый reverse proxy; не публикуйте его без контроля доступа. Корпоративный TLS CA передавайте через `NODE_EXTRA_CA_CERTS` до запуска Node; TLS verification не отключать.

## Sprint 3

`/imports`: загрузка XLSX/CSV, предпросмотр, выбор листа, сопоставление колонок, проверка строк, профили и история. Формулы не выполняются, строки с формулами отклоняются отдельно. Бизнес-приоритет — 0–100.

`/opportunities`: пересчёт по накопленным данным за 28 дней и предыдущему периоду; десять правил без LLM и внешних вызовов. Карточки, фильтры, сохранённые факты и формула оценки; скрытие и возврат возможности. Главная показывает компактные KPI и свежесть четырёх источников. Page 360 включает бизнес-данные и активные возможности.

Новая миграция: `202610060001_opportunities`; прежние миграции не изменены. Настройки правил хранятся отдельно от интеграций Яндекса. Полная инструкция и реальная приёмка: [SPRINT3_RUNBOOK.md](SPRINT3_RUNBOOK.md). Sprint 4–5 не начаты.

## Sprint 3.1

В Settings каждой цели Метрики вручную назначается тип: бизнес-конверсия, микроконверсия, навигационное действие либо не использовать. По умолчанию IGNORE, независимо от прежней выбранности Primary Goals. RULE 03, его медиана и компонент оценки используют только бизнес-цели. Dashboard, Page 360 и детали возможностей показывают группы отдельно. После назначения типов нужно нажать «Пересчитать возможности»; сохранение типов не запускает jobs. Старые возможности и снимки сохраняются. Инструкция: [SPRINT3_1_RUNBOOK.md](SPRINT3_1_RUNBOOK.md).

## Загрузка бизнес-данных

Sprint 3.4 добавляет явный тип продаж (транзакционная/неполная), подтверждённый период покрытия и настройку метаданных старых SALES imports. Существующие файлы остаются UNKNOWN. В mapping доступна рекомендуемая колонка «Кг в единице SKU»: только явный коэффициент переводит штуки в кг. Page 360 показывает покрытие, формулу запаса и источники; DATA_QUALITY вынесен из основного TOP. Перед запуском примените additive миграцию `20261006190000_transactional_sales`. Действия пользователя, семантика и приёмка: [SPRINT3_4_RUNBOOK.md](SPRINT3_4_RUNBOOK.md). Sprint 4–5 не начаты.

`/business-data`: четыре независимых формата — маппинг товаров, остатки, цены и продажи. Готовые XLSX-шаблоны с примерами и листом «Описание» находятся в `public/templates`. Загрузка всегда создаёт предпросмотр; запись проверенных строк требует подтверждения. Неизвестные SKU видны и исключаются из импорта. История и универсальный `/imports` сохранены. Перед запуском примените additive миграцию `20261006130000_business_data_types`. Инструкция и проверки: [BUSINESS_DATA_RUNBOOK.md](BUSINESS_DATA_RUNBOOK.md).

Sprint 3.5.1: `/webmaster/import` принимает исходный месячный XLSX Яндекс Вебмастера без ручного mapping. MONTH observations, Demand и grain-aware merge доступны в существующих Search/Rules/SEO/Page 360. Периоды поиска 1/3/6/12/18 месяцев и вся история; дневные режимы сохранены. Проверки: `npm run check:sprint3-5-1`. См. `SPRINT3_5_1_RUNBOOK.md`.

## Sprint 5 — Page SEO Review

Текущее дополнение заменяет прежний AI Analyst в обычном интерфейсе Page360 отдельным ручным блоком **AI SEO Review**. Кнопка «Проанализировать SEO страницы» собирает ограниченный профиль сохранённых данных и делает не более одного DeepSeek request без retries. Начальное открытие страницы AI не вызывает. ACTIVE findings не обязательны; рекомендации остаются гипотезами с evidence и ручной проверкой. Старые V1/V2/V3 сохранены для regression/rollback.

Используются существующие server-only `AI_ENABLED`, `DEEPSEEK_API_KEY`, `DEEPSEEK_BASE_URL`, `DEEPSEEK_MODEL`, `AI_TIMEOUT_MS`, `AI_MAX_OUTPUT_TOKENS`. Новая схема БД не нужна. Локальная проверка без сетевых запросов: `node --env-file=.env --conditions=react-server --import=tsx scripts/check-seo-review-offline.ts`; тесты: `npm test`. Offline-статус и отдельный план live-приёмки: [SPRINT5_PAGE_SEO_REVIEW.md](SPRINT5_PAGE_SEO_REVIEW.md). Платная приёмка Sprint 5 ещё не выполнялась. Более ранние отметки «Sprint 4–5 не начаты» выше относятся к историческим этапам README.

Sprint 5.1 SEO evidence/quality: см. `SPRINT5_1_SEO_EVIDENCE_QUALITY.md`. PAGE_SEO_REVIEW_V2, точное структурное сравнение, bounded Search intents, saved URL/alias lookup и server-derived READY_CHANGE / GROWTH_HYPOTHESIS / DATA_CHECK. Только manual human-reviewed анализ; live revalidation требует отдельного согласования. Offline acceptance: `node --env-file=.env --conditions=react-server --import=tsx scripts/acceptance-seo-quality.ts` (глобальный fetch запрещён; DeepSeek не вызывается).

Sprint5.2: отдельная локальная AI-диагностика, без изменения production policy. Offline: `npm run ai:diagnostics -- replay --enable-local-diagnostics` (0API calls). Protected storage вне проекта, current-user ACL, TTL24h; cleanup при запуске CLI и `npm run ai:diagnostics -- cleanup --enable-local-diagnostics` (или `--all`). Фонового удаления нет. Не копируйте model output в public/Git/logs/exports. Review и отдельный one-call live capture описаны в [SPRINT5_2_AI_SEO_DIAGNOSTICS.md](SPRINT5_2_AI_SEO_DIAGNOSTICS.md); live требует нового разрешения, старые бюджеты не переиспользуются.
