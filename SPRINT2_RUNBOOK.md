# Sprint 2 — Яндекс Метрика + Яндекс Вебмастер

> Исторический отчёт Sprint 2. Текущие правила acceptance и показатели заменены Sprint 2.1: см. [SPRINT2_1_RUNBOOK.md](SPRINT2_1_RUNBOOK.md). Полная выгрузка 690 URL теперь optional и не блокирует MVP. Новые exports требуют Priority Scope с preview; неопределённый POST остаётся заблокирован. Приведённые ниже оценки полной очереди и прежние проценты daily-row matching описывают состояние до Sprint 2.1.

## Статус

Реализована только функциональность Sprint 2. Sprint 0/1 переиспользованы. LLM, бизнес Excel, Opportunities, scoring и workflow следующих спринтов не подключались. Существующий Excel Crawl Import Sprint 1 сохранён.

Полный real acceptance пока **не PASS** из-за незавершённого initial sync всех URL Вебмастера. Реальные Test Connection обеих интеграций — PASS (`test-results/yandex-production-check.json`, 05.10.2026 21:59 МСК). Доступ до Yandex из Node.js нестабилен; добавлен совместимый TLS 1.2 transport с сохранённой проверкой сертификата/hostname. Для этой машины `YANDEX_TLS_COMPAT=1`, обычный adaptive transport — значение 0. VPN и TLS verification не отключались. Готовый официальный CSV при сетевом сбое HTTP автоматически скачивается стандартным Chromium: реальная проверка дала 96 rows. HTTP 403 не запускает этот download fallback; authentication/challenge не обходятся.

Метрика: **95306822 / Shop.Gazpromneft**, 39 goals; выбраны Primary Goals **338245570, 335196534, 333911817, 335535238**. Initial 90 дней с этими целями и повторный live Reports API sync COMPLETED: **15 536 rows до и после**, дублей нет (`test-results/metrika-production-repeat.json`). Все 15 536 rows содержат четыре выбранные цели. После новых scanner snapshots matching: **993 (6,39%)**, unmatched **14 543**. Вебмастер: user **561750544**, host **https:shop.gazpromneft-sm.ru:443**. В БД **507 реальных rows** главной страницы за 05.09–04.10.2026: 613 impressions, 37 clicks, matched 507 (100%). Это настоящие API exports, не fixtures. Общий watermark Вебмастера не продвинут.

Пользователь выбрал **только URL, найденные Вебмастером**. `webmasterUrlSource=WEBMASTER` сохраняется в Integration и JobRun. Discovery завершён: **690 URL**. Текущий период — 7 дней; минимальная оценка всей выгрузки при бесплатной квоте 100 URL-дней/сутки — **49 суток** (30 дней потребовали бы 207 суток). Платный тариф не включается. Для первого ограниченного acceptance доступен Max URLs; поле пустое означает все URL. Ограниченная job заканчивается COMPLETED с LIMITED_SCOPE и Integration WARNING, общий watermark не продвигает.

Scanner queue ранее блокировал fixture STOPPING с `heartbeatAt=null`; worker теперь восстанавливает такие старые записи по startedAt. В истории сохраняются и сетевые ошибки, и настоящие успешные BROWSER snapshots 200/OK (последний 05.10.2026 19:15:27 МСК), title/description/H1, 591 слово. Page 360 показывает последний успешный snapshot; если последняя попытка ошибочна, она отмечается отдельно. UI проверен с реальными Scanner + Search + Metrika и четырьмя целями (`test-results/sprint2-page360-goals.png`).

Текущая полная очередь `cmuvgb1ll000q20s8ik0ptoks` — PARTIAL: root export за 28.09–04.10 импортировал 96 rows, а создание следующего export `/?ybaip=1` не подтверждено (checkpoint SUBMITTING без task ID). Пользователь пока не может проверить задачу в интерфейсе Вебмастера. Этот POST не повторяется; новые manual/daily exports этого Site блокируются до разрешения неопределённости. Сохранённый root task `f8040270-c0d7-11f1-83a3-db32b2b0e403` можно проверять GET и загружать повторно без расхода квоты. У API нет метода списка export tasks; остаток квоты сам по себе не доказывает отсутствие задачи.

Ограниченный real acceptance root / 7 days — **PASS**: две новые audit jobs повторно получили статус существующей SUCCESS задачи через настоящий API, скачали и сохранили 96 rows каждая. В таблице осталось 507 rows, общий watermark не изменён, новых export POST — 0. Отчёт `test-results/webmaster-production-repeat.json` явно указывает scope 1/690 URL и wholeHostAcceptance INCOMPLETE. Это проверка настоящей готовой задачи, не создание новой выгрузки и не полный повтор 690 URL.

## Запуск

```powershell
docker compose up -d db
npm ci
npm run db:migrate
npm run build
npm start
```

В отдельных терминалах:

```powershell
npm run worker
npm run worker:yandex
```

Перед build / Prisma generate на Windows остановить app и оба worker: они удерживают Prisma DLL. После build запустить снова. Приложение: http://127.0.0.1:3000/settings. Docker Compose содержит отдельные scanner и yandex-worker; полный Docker application image пока не проверен.

## Конфигурация и подключение

Только серверные ENV:

```text
YANDEX_METRIKA_TOKEN=
YANDEX_METRIKA_COUNTER_ID=
YANDEX_WEBMASTER_TOKEN=
YANDEX_TLS_COMPAT=0
```

Webmaster user/host ENV не требуются и игнорируются новой интеграцией. Старые значения `.env`, если есть, не удаляются. OAuth tokens не сохраняются в БД, не передаются в React props, не выводятся в логах. Клиент получает только IDs, названия, статусы, выбранные настройки и нормализованные ошибки.

Settings → **Test Metrika Connection**: GET counter, GET goals и небольшой Reports API запрос подтверждают доступ к счётчику и статистике. Показываются counter ID/name/status/last checked; цели — ID/name/type и checkbox. До 15 Primary Goals одновременно (5 базовых метрик + до 15 метрик целей в одном отчёте). Выбор сохраняется в Integration.configJson. Новые цели не создаются. После изменения целей Initial sync обновляет прошлые 90 дней; incremental получает только новые дни.

Settings → **Test Webmaster Connection**: автоматически получает user ID и список hosts. Выбрать подтверждённый host магазина и сохранить. Origin host должен совпадать с origin Target Site; автоматической подмены host/scheme нет. User ID и host ID сохраняются в Integration.configJson, без токена.

Подключения привязаны к Site и counter/host. При смене магазина необходимо снова Test Connection и выбор host/goals. Данные старого Site сохраняются. При смене counter/host сбрасываются watermark и freshness текущей привязки; записи старого источника остаются и не смешиваются с текущим отчётом.

Проверка System Status не перезаписывает результаты Yandex API обычным «Configured». Dashboard и System Status показывают freshness: HEALTHY / WARNING / ERROR / NOT_CONFIGURED / SYNCING, последний успешный scan/sync и next run. Yandex data старше 48 часов дают WARNING.

## API endpoints

Метрика, `https://api-metrika.yandex.net`:

- `GET /management/v1/counter/{counterId}` — [информация о счётчике](https://yandex.ru/dev/metrika/ru/management/openapi/counter/counter).
- `GET /management/v1/counter/{counterId}/goals` — [цели](https://yandex.ru/dev/metrika/ru/management/openapi/goal/goals).
- `GET /stat/v1/data` — [Reports API](https://yandex.ru/dev/metrika/ru/stat/), dimensions `ym:s:date,ym:s:startURL`, accuracy full, limit 1000, offset с pagination, sort по URL.
- Метрики: `ym:s:visits`, `ym:s:users`, `ym:s:pageviews`, `ym:s:bounceRate`, `ym:s:avgVisitDurationSeconds`, `ym:s:goal{ID}reaches`. [Базовые метрики](https://yandex.ru/dev/metrika/ru/stat/metrics/visits/basic), [цели](https://yandex.ru/dev/metrika/en/stat/metrics/visits/conversions).

Вебмастер, `https://api.webmaster.yandex.net`:

- `GET /v4/user`, `GET /v4/user/{userId}/hosts` — user и доступные hosts.
- `POST /v4/user/{userId}/hosts/{hostId}/query-analytics/list` — [URL discovery](https://yandex.ru/dev/webmaster/doc/ru/reference/host-query-analytics), pagination limit 500 / offset. Popular complementary query не выдаётся за полный набор запросов и в аналитику не импортируется.
- `GET /v4/user/{userId}/hosts/{hostId}/pro/serp/dates` — [доступные даты](https://yandex.ru/dev/webmaster/doc/ru/reference/available-dates).
- `POST /v4/user/{userId}/hosts/{hostId}/pro/serp/queries/download/` — [создание export](https://yandex.ru/dev/webmaster/doc/ru/reference/initialization-export), dates/paths, region_ids=[], **use_pro_tariff="false"**.
- `GET /v4/user/{userId}/hosts/{hostId}/pro/serp/queries/download/{taskId}` — [статус export](https://yandex.ru/dev/webmaster/doc/ru/reference/status-retrieval).
- Готовый CSV скачивается без OAuth header только с HTTPS `storage.mds.yandex.net/get-webmaster-download/...`; redirects не разрешаются. [Описание выгрузки](https://yandex.ru/dev/webmaster/doc/ru/reference/enhanced-export).

Все Yandex запросы имеют deadline 20 sec, TLS verification и JSON response validation. Redirects запрещены. 429/5xx для безопасного чтения повторяются до 4 попыток с exponential backoff 1/2/4 sec, Retry-After до 30 sec. Создание export POST не повторяется автоматически: повтор может расходовать квоту и создавать лишнее задание. Эти POST адресованы официальному API аналитики; scanner магазина остаётся read-only.

## Данные и matching

Additive Prisma migration `202610050003_yandex`: только CREATE TABLE/INDEX/FOREIGN KEY. Таблицы:

- MetrikaPageDaily: обязательные поля из задания, counterId, rowKey, matchStatus/reason, granularity, reportMetaJson, rawJson, jobRunId, timestamps.
- WebmasterQueryDaily: обязательные поля, hostId, rowKey, matchStatus/reason, rawJson, jobRunId, timestamps.
- JobRun: source/mode/status, site/integration, date range, start/finish/heartbeat/next attempt, fetched/saved/errors/duration, config/checkpoint и timestamps.

Raw URL сохраняется до normalization. Unique identity: site + counter/host + date + SHA-256 rowKey. Metrika rowKey включает raw URL; Webmaster — raw URL + query + region (включая null). Поэтому NULL региона не обходит uniqueness PostgreSQL, а длинные URL/query не нарушают лимит B-tree index. Upsert обновляет строку, original createdAt сохраняется. Разные raw URL, нормализованные в одну Page, сохраняются отдельными воспроизводимыми API rows, а сводка суммирует их.

Matching использует существующий `src/lib/scanner/url.ts::normalizeUrl`: fragment/tracking/trailing slash/query sorting. Сначала exact normalized URL в том же Site, затем единственный подтверждённый scanner redirect alias. Canonical не является основанием для автоматического объединения. Значимые query params не отбрасываются. Нет match — pageId=null, UNMATCHED; записи сохраняются.

`/unmatched`: отдельные Webmaster/Metrika, raw/normalized URL, date, query/region/metrics и предполагаемая причина. Причины: page not scanned, different host, query parameters, redirect (неоднозначный alias), normalization mismatch (возможное отличие регистра пути), unknown. Причины эвристические; автоматической подгонки нет. Matching выполняется при sync и после его завершения; кнопка rematch повторяет те же прозрачные правила после нового crawl, без сетевых запросов.

### Гранулярность Метрики

Reports API: **страница входа × день**, все источники traffic. Visits/visitors/bounce/duration/goals относятся к визитам, начавшимся на данном URL. Pageviews — число просмотров во всём таком визите, не просмотры только одного URL. Это отображается в UI; Logs API не используется.

Visitors в суммарной карточке — **сумма дневных уникальных** и raw URL groups; точных period uniques из дневных rows восстановить нельзя. Bounce/duration взвешены по visits; position — по impressions. CTR пересчитывается как clicks/impressions×100. Неизвестные метрики и отсутствующие goals/days отображаются «—». Sampling/disclosure metadata и исходные dimension/metric arrays сохраняются, sampling виден в отчёте. Raw API body counter (включая возможные measurement tokens) никогда целиком не сохраняется.

## Jobs и scheduler

`/metrika`: Initial 90 дней; Manual incremental. `/webmaster`: Initial 7/30/90 дней; Manual incremental. Только полные дни: для Метрики по timezone счётчика, для Вебмастера МСК. Incremental начинается после последнего полностью успешного dateTo; промежуток больше 90 дней обрабатывается порциями. Если новых дней нет, JobRun завершается без повторной загрузки.

Daily schedule включается после успешного Test Connection; у Вебмастера job не ставится без выбранного host. В Settings можно отключить. Следующий run — 00:05 МСК, scheduler проверяет раз в минуту. Worker должен постоянно работать; пропущенный срок выполняется после запуска. Scheduler, claim и изменение настроек защищены PostgreSQL advisory lock; одна активная job на интеграцию и один исполняемый API job. Настройки нельзя менять при активном sync.

Метрика обрабатывает по одному дню с pagination. Сохранение дня и checkpoint — одна транзакция. Ошибка следующего дня не удаляет предыдущие; JobRun PARTIAL, watermark не обновляется. FAILED/PARTIAL можно продолжить с сохранённого дня при неизменном counter/goals. GET повторяется при transient network error до трёх попыток; export POST не повторяется. Stale RUNNING heartbeat >60 sec восстанавливается в PENDING. При временных ошибках PostgreSQL — до трёх повторов через 30 sec. Финальный rematch выбирает только поля matching и обновляет изменившиеся связи; проверка на 15 536 rows заняла около 2 sec.

Webmaster paths получаются из Scanner, известных Metrika URL и paginated API discovery. URL list имеет явную границу 50 000; превышение завершает job с ошибкой. Даты сверяются с available dates. Export делится на один path и до 90 дат (не более 100 элементов и в пределах базовой квоты). Базовая квота — 100 URL × день за сутки; платный доступ не включается. При исчерпании WAITING_QUOTA до обновления квоты в МСК, все checkpoints сохраняются.

Task ID сохраняется до ожидания; WAITING_EXPORT polls каждые 5 минут. В обычном API выгрузка готовится 20 минут–2 часа, иногда сутки. Максимальное ожидание в приложении 48 часов. Готовый файл доступен у API 24 часа; при истечении нужен новый sync. Checkpoint сохраняет завершённые export tasks, их path/range/rows. Неопределённый результат POST/перезапуск на SUBMITTING требует проверки задачи и квоты; автоматической повторной отправки нет.

CSV UTF-8 с BOM либо без, comma/semicolon/tab, известные English/Russian headers. Строгая проверка колонок/date/path/numeric values. Неизвестная схема отклоняется как MALFORMED_RESPONSE. JSON ответ ограничен 10 MB; CSV — 50 MB, 200 000 rows. Ошибка одного export сохраняет предыдущие chunks, job PARTIAL; повторный sync idempotent. Если часть дат API недоступна, импортируются доступные, статус PARTIAL и watermark не продвигается.

UI показывает историю последних 30 JobRun, statuses/counters/errors/duration/next attempt/export progress. Отменить можно ожидающее задание; уже сформированный Яндекс export не удаляется. Работающий короткий chunk не прерывается UI-кнопкой. Ошибки invalid token/forbidden/counter/host/rate limit/network/timeout/malformed/partial нормализованы. Логи содержат source и безопасный код/сообщение, без raw response, URLs запросов с токенами или stack traces.

## Page 360

`/pages/[id]?period=7|30|90`: Site Scan metadata/source/status/last scan, Search totals и daily dynamics, TOP-20 queries по impressions, Metrika и Primary Goals с daily dynamics. SVG plots содержат данные дней и tooltips; таблицы дают точные значения. Все блоки читают общие Page relations, независимо от HTTP/BROWSER/IMPORT scanner source. Отсутствующие источники явно обозначены.

## Проверки

Production build, typecheck и 25 tests — PASS, включая GET retry, запрет повторного POST/HTTP 403 browser fallback и gzip. Все 3 migrations применены; исходные миграции не менялись; schema drift отсутствует; повторный clean DB migration acceptance — PASS. Scanner worker regression — PASS, включая stale heartbeat и STOPPING с отсутствующим heartbeat; пользовательские Integration settings этот тест не меняет. Повторный Sprint 2 DB acceptance — PASS, включая limited scope watermark и блокировку неопределённого POST (`test-results/yandex-acceptance.json`). Это fixture acceptance, отдельно от production-данных.

Client secrets check — PASS для assets, восьми основных routes и реального Page 360. Его можно повторить с `PAGE360_CHECK_ID=cmuv6w2wt000120goxunx7su2`. Текущее состояние: `test-results/yandex-production-state.json`. UI proof: `test-results/sprint2-page360-goals.png`. Главная за 30 дней: Search 613 impressions / 37 clicks / CTR 6,04% / position 9,43; Metrika 1 734 visits / 1 645 сумма дневных visitors / 5 653 pageviews в визитах / bounce 2,88% / duration 124,92 sec. Цели: 338245570 — 2 покупки; 335196534 — 18 кликов регистрации; 333911817 — 8 успешных регистраций; 335535238 — 139 кликов поиска.

Реальный Webmaster файл `.csv.gz` определяем по magic bytes; распакованный output ограничен 50 MB. Поддерживается реальная схема `date,host,path,query,regionId,regionName,clicks,impressions,position`. Для её backslash-escaped quotes используется строгий CSV parser без relax_quotes. Test проверяет обычный CSV, gzip и escaped query; повреждённый gzip отклоняется.

Если export уже создан, network timeout при polling/download сохраняет task ID и повторяется через 5 минут, до 48 часов от submission. Discovery повторяется по checkpoint до 12 раз с интервалом 5 минут; export POST при неопределённом результате не повторяется. В UI FAILED/PARTIAL с сохранённым task можно продолжить кнопкой «Продолжить сохранённый export».

Для разового восстановления файла, скачанного **из официальной готовой задачи** через обычный браузер, остановить Yandex worker и выполнить:

```powershell
node --env-file=.env --conditions=react-server --import=tsx scripts/recover-webmaster-export.ts JOB_ID TASK_ID ABSOLUTE_DOWNLOADED_FILE
```

Script проверяет привязку job/host/user/task, даты/path CSV и ограничения размера. Использует ту же функцию обработки export chunk и тот же store/upsert, что worker. В rawJson сохраняются task ID и `download_transport=BROWSER`. Никакой новый export POST не выполняется. После recovery job PAUSED для выбора дальнейшего scope; данные не удаляются. Это восстановление штатного Yandex export, не бизнес Excel import следующих спринтов.

Воспроизведение ограниченного real replay (остановить worker; файл задачи доступен у Яндекса ограниченное время):

```powershell
node --env-file=.env --conditions=react-server --import=tsx scripts/verify-webmaster-real.ts cmuvgb1ll000q20s8ik0ptoks f8040270-c0d7-11f1-83a3-db32b2b0e403
node --env-file=.env --conditions=react-server --import=tsx scripts/report-yandex-state.ts
```

Первый script проверяет завершённый task в checkpoint исходной job, создаёт две явно помеченные audit jobs с Max URLs=1, вызывает только реальные GET/status/download и общий store, сверяет count до/после и неизменный watermark. POST запрещён самим script. Он не возобновляет неопределённую полную очередь. Для Метрики подтверждённый повтор — job `cmuvm5ug00002204c52uhxctu`; отчёт `metrika-production-repeat.json`. Следующий полный повтор создаётся обычной кнопкой Initial sync; продолжить прерванный повтор можно `scripts/verify-metrika-repeat.ts JOB_ID` при остановленном worker и неизменных goals/counter.

```powershell
npm run build
npm run typecheck
npm test
npm run acceptance:yandex
npm run acceptance:scanner
npm run acceptance:worker
npm run check:clean-db
npm run db:status
npm run check:secrets
```

`acceptance:yandex` использует локальный HTTP fixture и mock официальных API contracts; никакого production sync. Создаёт отдельный Site, реально получает scanner HTML, импортирует Metrika/Webmaster, проверяет connection/goals/host, повторный sync, incremental no-op, matched/unmatched, экспорт/продолжение/recovery, partial failure, scheduler dedup. Временно меняет только process ENV и Integration config; восстанавливает в finally. Перед запуском остановить оба worker и не создавать jobs через UI. Файлы `.env` не меняются; тестовые БД/fixtures сохраняются. При принудительном kill проверить Settings; старые данные не удалять.

Первый локальный DB acceptance: Metrika 360 rows (180 matched/180 unmatched, 50%); Webmaster 35 rows (21 matched/14 unmatched, 60%); две выбранные fixture goals; scanner HTML + оба источника относятся к одной локальной Page. Это **не production-данные**. Отчёт: `test-results/yandex-acceptance.json`.

### Реальный acceptance после восстановления сети

1. `npm run check:yandex` либо обе Test Connection в Settings. Отчёт содержит только публичные IDs/names и безопасные ошибки.
2. Выбрать и сохранить Primary Goals и verified host магазина в Settings.
3. Запустить Yandex worker. Metrika Initial 90; Webmaster сначала 7 days. Дождаться COMPLETED, учитывая offline export/квоту.
4. Повторить initial для тех же периодов: total table rows не должны увеличиться без новых API identities. Проверить JobRun counters.
5. Открыть Unmatched отдельно, посмотреть matched statistics в отчётах. Для реального URL с API metrics получить scanner snapshot через существующий Scanner (один URL, Max Pages 1; WAF не обходить).
6. Page 360 должен одновременно показывать реальный snapshot + Webmaster + Metrika для выбранного периода. Если сеть/права/WAF/экспорт не позволяют — acceptance остаётся неполным, данные не подменять fixtures.
7. Проверить incremental и daily next run, build/typecheck/tests/migrations/secrets. Дополнительные fixture данные не считать production acceptance.

## Known limitations

- Подключения и реальные данные подтверждены, но доступ Node.js до отдельных API/storage нестабилен. Повторяемая network ошибка не означает invalid token. Полный Webmaster sync ещё не завершён.
- Page 360 проверен с настоящими данными трёх источников и четырьмя выбранными Primary Goals. Initial и полный повтор Метрики PASS. Весь initial sync Вебмастера остаётся незавершённым; ограниченный replay готового root export не доказывает полноту host или создание новой задачи.
- Webmaster export покрывает найденные paths, а не утверждает полноту всех неизвестных URL сайта. Query monitoring возвращает популярный complementary query; его не используем как полный query dataset.
- Base quota может растянуть 90-дневную выгрузку большого сайта на длительный срок. Платный тариф не применяется.
- Incremental берёт только новые дни, не пересчитывает запоздавшие изменения старых дат. Для этого предусмотрен повторный Initial sync.
- Gzip и наблюдаемая реальная CSV schema поддерживаются. ZIP и неизвестные headers остаются неподдерживаемыми; поля не угадываются.
- Daily records могут содержать sampling; visitors period unique недоступен из суммы дневных rows. Гранулярность landing page не равна анализу каждого просмотренного URL.
- Daily summaries пока агрегируются в Node.js, предназначены для MVP объёма. UI history 30, top URLs 50, queries 20, unmatched pagination 50.
- Авторизация/RBAC и полный Docker image acceptance остаются за рамками текущей реализации.

## Изменённые файлы

`prisma/schema.prisma`, новая additive migration; `src/lib/yandex/{api,dates,matching,metrika,webmaster,settings,store,jobs,views}.ts`; `scripts/{yandex-worker,check-yandex,probe-yandex,acceptance-yandex}.ts`; `tests/yandex.test.ts`; Settings/actions/forms; `/metrika`, `/webmaster`, `/unmatched`; Page 360, analytics/freshness components; dashboard/system/layout/CSS; health status сохранение; package/lock, compose, `.env.example`, README и этот runbook. Исходные миграции не изменялись.
