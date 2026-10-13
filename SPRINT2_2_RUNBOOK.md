# Sprint 2.2 — Metrika URL Coverage

Поведение Coverage дополнено Sprint 2.2.1: выбор HTTP + Browser fallback / Browser only / HTTP only, Test one URL, диагностический лимит 1–50 и автоматическая пауза после трёх неразрешённых WAF-блокировок подряд. Перед массовым production запуском выполните ограниченную диагностику по [SPRINT2_2_1_RUNBOOK.md](SPRINT2_2_1_RUNBOOK.md). Ниже сохранён отчёт исходной приёмки Sprint 2.2.

## Статус и границы

Реализован Sprint 2.2. Sprint 3 не начинался. Production Metrika Coverage Scan не запускался. Он должен быть запущен пользователем вручную после отключения VPN.

Изучены текущий Scanner, Sprint 0/1/2/2.1 runbooks и master specification. Переиспользованы crawl, BrowserReader, normalization, Page/Scan/ScanPage, saveScanPage, rematchSite и matching с подтверждёнными redirect aliases. Нового crawler, matching engine, browser системы, Redis и scheduler нет. Webmaster Priority Scope и guard неопределённого POST не изменены; новых Webmaster exports эта функциональность не создаёт.

## UI и Scope

Открыть `/scanner`, блок **Metrika Coverage Scan**. Period: 7/30/90 days, default 30; Scope: Unmatched only / All Metrika URLs, default Unmatched; Batch size: 1–50, default 50; Rescan successful URLs: default OFF. Preview scope обновляет только локальные данные; сетевого crawl нет. Start относится к явно показанным настройкам preview. После изменения controls Start заблокирован до обновления Preview scope. Выбранные параметры сохраняются после preview.

До Start показаны raw и normalized unique URLs, matched/unmatched, visits, основной KPI Traffic Coverage, queue size, total batches, исключения и missing Metrika days. Данные привязаны к текущему Site/counter. Queue строится исключительно по импортированным landing URLs выбранного периода, не по Webmaster discovery и не по найденным links.

Обязательное предупреждение перед Start: «Production Site Scanner должен запускаться только когда целевой интернет-магазин доступен из текущей сети. При включенном VPN сайт может быть недоступен и давать timeout». Приложение не определяет и не отключает VPN.

Страница задания `/scanner/[id]` содержит progress, counters, heartbeat, последний URL, Pause/Stop/Resume, Before/After, историю пачек, TOP-50 remaining unmatched и per-URL results/raw source context. `/scanner` также показывает последнее Coverage задание текущего сайта. Active progress обновляется каждые 5 секунд; есть ручное обновление. Исторические fixture задания явно отличаются названием и localhost origin.

## Queue architecture и изменения БД

Схема Prisma не изменена; новых таблиц/миграций нет. Три существующие additive migrations остаются неизменными. `Scan.mode=METRIKA_COVERAGE`; статус/heartbeat/counters хранятся в существующих Scan полях. `Scan.configJson.coverage` — versioned checkpoint: параметры, counter/date range, frozen landing cohort, normalized queue с raw URL variants и visits, exclusions, Before/After, batches, progress, startedAt/updatedAt/lastProcessedUrl и worker lease. HTTP/BROWSER snapshots пишутся прежним storage adapter в Page/ScanPage.

Queue deduplicated по normalizeUrl. Используются существующие Scanner boundaries/exclusions и safety правила dataset для private/auth URLs. Foreign origin, служебные paths, не-HTTP, credentials и опасные query keys не сканируются. При Unmatched only успешно сопоставленные Pages исключены. При ALL и Rescan OFF пропускаются успешные snapshots за последние **7 дней**, включая подтверждённые aliases. Старые successful Pages можно обновить через ALL; Rescan ON снимает только recent-success skip. Failed/timeout URLs допускаются к следующему запуску. Известные 404 не исключены из этого coverage режима: они могут получить собственный HTTP_ERROR.

Значимые query params, включая `/catalog?FILTER_ITEM_IN_STOCK=Y`, сохраняются. Canonical не объединяет страницы автоматически. Raw variants сохранены в checkpoint и исходных Metrika records; identity queue — normalized requested URL, Page identity/redirect aliases остаются по прежним правилам Scanner.

Создание/claim/контроль/checkpoint сериализованы существующим PostgreSQL advisory lock. Одно активное scan/import задание глобально; PAUSING также занимает слот. Pause освобождает слот после PAUSED; Resume отклоняется при другом активном scan/import. Snapshot и per-URL checkpoint коммитятся **одной транзакцией**. При crash уже committed URL не повторяется. Незавершённый HTTP/browser request без committed result может повториться после Resume. Worker lease блокирует записи устаревшего исполнителя.

## Batch architecture и error handling

Пачки логические по 50 URL по умолчанию, а не concurrency 50. Каждая пачка вызывает **существующий crawl** с seedOnly, Max Pages ≤50. Читается robots.txt; sitemap и найденные links не добавляются. Default HTTP concurrency 2, delay 500 ms, timeout 15 sec; Browser concurrency 1, delay 1500 ms, timeout 20 sec. Между пачками сохраняется пауза 1500 ms, чтобы создание следующего crawl не сбрасывало безопасный spacing. Mutating requests/cookies/login/stealth/CAPTCHA/WAF bypass не добавлены.

Coverage включает отдельный флаг continueOnError только с seedOnly. Обычный Scanner/targeted Sprint 2.1 сохраняет прежнее прекращение задания при browser WAF/transport failure. В Coverage после ошибки одного URL продолжается следующий URL; blocked/challenge не решаются и тот же URL автоматически не повторяется.

Каждый queue URL получает SUCCESS_HTTP, SUCCESS_BROWSER, BLOCKED_BY_WAF, TIMEOUT, HTTP_ERROR, NETWORK_ERROR, INVALID_URL или SKIPPED. AUTH_REQUIRED сохраняет прежний ScanPage outcome и считается HTTP_ERROR; автоматического login нет. Browser timeout отличается от network/configuration failure. Отсутствующий Chromium — critical configuration: задание PAUSED с checkpoint. Database/configuration failure тоже приостанавливает очередь; успешные commits сохраняются. Ошибки не подменяются HTTP 200/успешным matching.

Robots-denied и уже resolved redirect alias внутри пачки — SKIPPED, без запроса страницы. Невалидный URL при исполнении — INVALID_URL. Total attempted исключает SKIPPED/INVALID_URL. Successful = HTTP + Browser; failed = timeout + HTTP/network errors + invalid; blocked и skipped отдельные. Excluded до создания queue не входят в attempted, но остаются в denominator coverage.

После пачки: persisted results → existing rematch → coverage refresh → завершённая batch history/checkpoint → следующая пачка. История хранит номер, URL count, started/finished, wall-clock duration (включая pause/restart), counters, coverage Before/After и matched URLs Before/After. Crash после последнего результата, но до завершения history восстанавливает rematch/history без повторных запросов.

## Pause / Stop / Resume и recovery

Pause: PENDING → PAUSED либо RUNNING → PAUSING → PAUSED. Stop: PENDING/PAUSED → STOPPED либо RUNNING/PAUSING → STOPPING → STOPPED. Poll/abort обычно около секунды; Chromium launch может завершаться до своего timeout. Уже committed results не удаляются. Resume из PAUSED/STOPPED/INTERRUPTED/FAILED возвращает **то же** задание в PENDING; продолжение с незавершённого URL/пачки, без новой Page для прежнего normalized URL.

Graceful worker shutdown приостанавливает Coverage; после forced kill stale heartbeat >60 sec восстанавливается в PAUSED. Незавершённый Stop при stale worker сохраняется как STOPPED. Application restart не меняет checkpoint. После worker restart пользователь нажимает Resume; массовый production scan сам заново не запускается. PENDING, созданный пользователем, выполняется запущенным worker.

Как понять, что job работает: статус RUNNING, heartbeat обновляется, Processed растёт, Remaining падает, lastProcessedUrl меняется, появляются finished batches. Browser fallback/timeout может оставить Processed неизменным десятки секунд; смотрите heartbeat. Stale heartbeat >60 sec показан в UI; запустите worker и используйте Resume. Если timeout/blocked доминируют, нажмите Pause/Stop и проверьте доступность одного URL вручную; не увеличивайте нагрузку и не обходите WAF.

## Automatic rematch и coverage calculation

Используется прежний rematchSite: normalizeUrl → exact Page matching → однозначный observed redirect alias. Требуется существующий successful 2xx/3xx OK snapshot, независимо от HTTP/BROWSER/IMPORT. Error-only Page не повышает coverage; предыдущий successful snapshot сохраняет evidence после новой сетевой ошибки.

Before/After относятся к **одному frozen landing cohort** со своими visits, date range/counter и raw unique count. Total visits и total normalized URLs неизменны во время одного задания; daily sync новых данных не искажает эффект scan. Traffic Coverage = matched visits / total visits ×100, при нулевом denominator — «—». URL matching % вторичен. Foreign/excluded/robots URLs остаются в знаменателе, покрытие не завышается.

После каждой завершённой пачки и при Pause/Stop пересчитываются matching/After и TOP-50 unmatched по visits. TOP-50 содержит последний результат текущего/предыдущего Scanner и reason: error, exclusion, not attempted либо прежнюю matchReason. Пока batch в работе, After отражает последний сохранённый rematch; commits/processed видны сразу.

## Проверки

Локальная приёмка: `test-results/coverage-acceptance.json`. Тестовый Site только `127.0.0.1`, реальные Node HTTP + стандартный Chromium, без production request. 59 normalized landing URLs / 56 queued, две пачки **50 + 6**, raw variants dedup и meaningful query preserved. Результаты: HTTP success 50, Browser success 1, timeout 1, WAF 1, HTTP error 1, network error 1, skipped robots 1. Fixed-cohort coverage **1.62% → 88.20%**, matched URLs **1 → 52**, total visits **58 230** неизменны. Это fixture, не production metrics.

Проверены период 7/30/90, ALL/Unmatched, recent success skip/Rescan ON, pending и active controls, forced worker restart, committed timestamps без повторения, crash boundary finalization, existing rematch, duplicate Page prevention и только GET requests. Unit tests проверяют per-URL classification/continuation и прежние safety limits. Scanner/worker regression выполняется отдельно. Итоговые статусы build/typecheck/tests/migrations/schema/secrets и UI acceptance — в `test-results/sprint2-2-verification.json`.

Повторение при остановленных app и обоих worker (Windows Prisma DLL):

```powershell
npm test
npm run acceptance:coverage
npm run acceptance:scanner
npm run acceptance:worker
npm run build
npm run typecheck
npm run db:status
node node_modules/prisma/build/index.js migrate diff --from-schema-datasource prisma/schema.prisma --to-schema-datamodel prisma/schema.prisma --exit-code
npm start
```

DB acceptance выполнять последовательно без пользовательских scan jobs. Fixture sites/results остаются для аудита; production settings этот coverage script не меняет. Для secrets check после app Start:

```powershell
$env:PAGE360_CHECK_ID='cmuv6w2wt000120goxunx7su2'
# COVERAGE_SCAN_CHECK_ID взять из test-results/coverage-acceptance.json
$env:COVERAGE_SCAN_CHECK_ID=(Get-Content test-results/coverage-acceptance.json -Raw | ConvertFrom-Json).scanId
npm run check:secrets
```

В отдельных терминалах: `npm run worker`, `npm run worker:yandex`. Secrets остаются server ENV; новая queue не хранит OAuth tokens и не передаёт их в client.

## Production Acceptance by User

1. Убедиться, что VPN выключен и магазин доступен из сети **машины/контейнера worker**.
2. Проверить обычный Browser Scan **одного** реального URL: mode Browser, Max Pages 1, seed URL магазина. Дождаться OK / HTTP 200 и настоящих Title/H1. При timeout/403/challenge не запускать coverage, проверить сеть либо использовать Crawl Import; обход WAF не выполнять.
3. Открыть `/scanner`.
4. Найти блок **Metrika Coverage Scan**.
5. Period = **30 days**.
6. Scope = **Unmatched only**, Rescan successful URLs = **OFF**.
7. Batch size = **50**, нажать Preview scope, проверить totals/traffic coverage/queue size.
8. Нажать **Start Metrika Coverage Scan** и открыть progress.
9. Следить за heartbeat, Processed/Remaining, lastProcessedUrl и batch history. Каждая completed пачка должна показывать After; ошибки отдельных URL допустимы.
10. При необходимости нажать **Pause**, дождаться PAUSED; Stop тоже сохраняет очередь.
11. После restart запустить app + scanner worker, дождаться recovery stale heartbeat, нажать **Resume**. ID задания и committed Processed должны сохраниться.
12. После COMPLETED/COMPLETED_WITH_ERRORS записать Before/After coverage, counters и TOP-50 remaining unmatched. Проверить Page 360 нескольких полученных Pages на настоящих Scanner + Metrika данных.

## Known limitations

Production crawl и прирост реального coverage **не подтверждены** в Sprint 2.2: пользователь выполняет отдельную production acceptance после выключения VPN. Preview 06.10.2026: 1849 raw / 1697 normalized, matched 15 / unmatched 1682, traffic coverage 31.73%; eligible queue **1642 URL / 33 batches**, 55 исключено/уже matched. В БД production Coverage jobs **0**; отчёт `test-results/sprint2-2-production-preview.json`. UI читает актуальную БД и может отличаться после новых импортов.

WAF/auth/robots и excluded URLs могут оставить часть visits unmatched. Разрешение read-only scan не гарантирует доступ к каждой странице; network ошибки сами по себе не доказывают WAF. Browser сохраняет прежние resource/navigation/body budgets и DOMContentLoaded, поздний SPA контент может отсутствовать. Missing Metrika days и нулевой traffic явно показаны.

Resume продолжает оставшуюся очередь, а не повторяет уже сохранённые failures. Для повторения failed/timeout URLs создайте новый Unmatched Coverage Scan. Rescan ON вместе с Unmatched всё равно не включает уже matched URL; для повторного успешного scan используйте ALL + Rescan ON. Нет автоматического retry отдельного URL, отключения VPN, планового production coverage или автоматического expansion через links.

Checkpoint хранится в JSON существующей Scan, рассчитан на текущий MVP dataset (тысячи URL); отдельное масштабирование очереди/пагинация source context для миллионов URL не реализованы. Один глобальный активный scanner/import слот. Авторизация приложения и Docker-image acceptance остаются прежними ограничениями. Webmaster Search data 1/20 и uncertain POST не разрешены этой работой. Sprint 3 отсутствует.

## Изменённые файлы

Новые `src/lib/scanner/coverage.ts`, coverage actions/form/report/progress, `tests/coverage.test.ts`, `scripts/acceptance-coverage.ts`, localhost-only `scripts/create-coverage-ui-fixture.ts`, этот runbook. Изменены scanner options/engine/browser/store/service/import-service, worker, `/scanner` и detail, package scripts, secrets check и README. Schema, migrations, matching engine, Yandex API/export logic и ENV secrets не менялись.
