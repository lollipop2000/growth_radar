# Redirect / alias lifecycle — 07.10.2026

## Current implementation

Переиспользованы существующие HTTP reader, BrowserReader, Scanner worker, Page.aliasesJson, ScanPage и rematchSite. Новый crawler, matching engine и таблицы не созданы. Схема не менялась; миграции не нужны. Sprint 4 не начат.

До доработки readers сохраняли адреса цепочки без HTTP-статусов каждого перехода; store добавлял requested URL в aliases даже для неуспешного чтения. Старый exact Page мог иметь приоритет над alias. Single URL не запускал targeted rematch; targeted outcome успешного redirect показывался READ_SUCCESS. Page 360 не давал отдельного списка исторических URL.

Теперь readers сохраняют реальные redirect hops; store принимает alias только по успешному same-site redirect evidence, архивирует прежний exact Page без удаления его истории и не переносит WAF/error на конечную Page. Search targeted и Single URL автоматически выполняют scoped rematch по выбранным URL. Остальные существующие workflows сохраняют свой rematch.

## Acceptance URL

SOURCE: `https://shop.gazpromneft-sm.ru/catalog/14134/`

EXPECTED FINAL: `https://shop.gazpromneft-sm.ru/catalog/gazpromneft-premium-n-5w-40-kanistra-4-l/`

TARGET PAGE: `cmuwrqlp100bi20e8ml03fpch`.

Production acceptance: **READY FOR MANUAL TEST ONE**. README.md, строка 5: «Production scan выполняется пользователем вручную». Пункт 15 текущего задания разрешает подготовить UI и остановиться перед запуском. Поэтому ни HTTP-статус, ни фактический final URL production пока не подтверждены этой проверкой.

Открыть [подготовленный Single URL](http://127.0.0.1:3000/scanner?preset=SINGLE&url=https%3A%2F%2Fshop.gazpromneft-sm.ru%2Fcatalog%2F14134%2F), убедиться в «Один URL», source с trailing slash, Max Pages = 1 и нажать **«Запустить сканирование»**. По умолчанию HTTP + Browser fallback, concurrency 1, пауза 3 секунды, HTTP timeout 15 секунд, Browser timeout 20 секунд. Обход ссылок/discovery для single не выполняется. Не выбирать batch.

## Baseline

Read-only production snapshot: `test-results/redirect-alias-baseline.json`; контроль сохранности: `test-results/redirect-alias-production-readonly.json`.

| Показатель source URL | До | После разработки, до ручного acceptance |
|---|---:|---:|
| Search physical / effective rows | 1962 / 1962 | 1962 / 1962 |
| Search impressions / clicks, все доступные периоды | 4544 / 78 | 4544 / 78 |
| Search matched rows | 0 | 0 |
| Metrika source rows | 0 | 0 |
| Source URL в unmatched | Да | Да |
| Alias у target Page | Нет | Нет |

В момент проверки site-wide distinct raw unmatched Search URLs: 992. Это все исходные строки без ограничения выбранным UI Search period; число не следует сравнивать с TOP-100 preview. Baseline не доказывает фактический production redirect. Никаких production exports, sync, batch scan или rematch во время разработки не запускалось.

Текущая target Page имеет 299 effective Search rows, 1031 показ и 9 кликов по всему доступному import dataset. Если ручной acceptance подтвердит redirect и источник целиком пересопоставится без изменения source priority, ожидаемая разница составит +4544 показа / +78 кликов; это расчёт baseline, а не наблюдавшийся результат acceptance.

## Redirect observation

HTTP reader фиксирует Location только при фактическом 301/302/303/307/308. BrowserReader слушает response главной navigation, сохраняет только source URL, target URL и status. requestedUrl, finalUrl, terminal statusCode, outcome, source и scannedAt уже принадлежат ScanPage. Терминальный statusCode обычно 200, отдельный hop status сохраняет 301/302.

Цепочка A→B→C проверяется на непрерывность и same-origin; alias A связывается с конечной C. B автоматически не становится alias. Canonical не участвует в observedRedirect. Успешное чтение без реального перехода не создаёт redirect alias. 404 остаётся HISTORICAL_DEAD; WAF/auth остаются UNRESOLVED, без alias/dead. Cross-site redirects отвергаются.

## Alias storage

Page.aliasesJson остаётся массивом уникальных нормализованных строк, scoped к siteId. Нормализация используется только для identity/matching, исходный trailing slash в запросе сохраняется. Snapshot.pageId — targetPageId. ScanPage.redirectsJson использует существующее JSON-поле: прежние строки цепочки сохранены, добавлены объекты `{sourceUrl,targetUrl,statusCode}`. Новая параллельная alias-модель не вводилась.

Alias type в read model: OBSERVED_REDIRECT при подтверждённом snapshot, LEGACY_ALIAS при отсутствии доступного evidence. Источник observed evidence — SCANNER; ScanPage.source сохраняет HTTP/BROWSER. Legacy snapshots без hop status показывают «Статус неизвестен». 302 является наблюдавшимся временным redirect, не permanent migration.

## Search rematch

Single URL записывает существующий searchTargeted audit с source TEST_ONE, selected из одного source URL. После завершения worker вызывает completeTargetedScan; rematchSite(siteId, selected) обновляет только matching/link поля выбранных URL. Successful redirect получает RESOLVED_REDIRECT с конечной Page и status evidence; source перестаёт входить в unmatched. Повторный rematch изменяет только действительно отличающиеся связи.

Локальный acceptance: две физические historical Search rows привязаны к конечной Page, включая старый import. Effective dataset по-прежнему выбирает актуальный import, старый дубликат не добавляется в totals.

## Metrika rematch

Тот же scoped rematch обновляет Page linkage Метрики; отдельная логика alias matching не создавалась. Fixture: одна historical Metrika row пересопоставлена, текущие visits 5 плюс historical visits 7 дают 12. Production source rows = 0, поэтому production Metrika rematch для данного URL пока не может быть доказан реальными строками.

## Historical data preservation

Поле исходного URL в текущей схеме называется `url` (не rawUrl). Оно, rawJson, date/month/grain, source/import provenance, query, impressions/clicks/position и все traffic/conversion metrics не переписываются. Меняются pageId, matchStatus, matchReason, normalizedUrl; updatedAt является техническим timestamp существующей модели.

Fixture сравнивает полные строки до/после, исключая только перечисленные matching/technical поля. Production read-only check сравнил полные source rows с baseline: без изменений. SHA-256 source dataset: `303401abea2dc1e7b057491005501cedf970f73b20341f1f48fae2aec98d1052`. Исходные строки и исторические Page snapshots не удаляются.

## Page aggregation

Общий Search dataset и effectiveSearch сохранены. Fixture до alias: 100 показов / 10 кликов текущего URL; после: 300 / 30, прирост ровно 200 / 20 historical URL. Physical старый import 190 / 19 не посчитан второй раз. Метрика: 5→12 visits, прирост 7. Raw URL provenance доступен в Page 360 detail. Production equivalence ещё не проверена: ждёт ручного Test One.

Historical URL block использует pageId-filtered Search candidates, затем только их raw URLs; snapshot и Metrika queries ограничены Page/aliases. При отсутствии aliases Search вообще не читается этим блоком. Site-wide Search dataset в новый Page 360 block не загружается.

## UI

Page 360: «Исторические URL» с исходным URL, статусом redirect, final URL, временем наблюдения, type/source и цепочкой. Search impressions/clicks соответствуют выбранному Search period; visits — отдельно подписанному периоду Метрики. Неизвестный legacy status не подменяется 301.

В подробном Page 360 есть таблица «Исходные URL поисковых наблюдений» — первые 100 строк выбранного dataset, query/date/grain и metrics. Scanner detail показывает RESOLVED_REDIRECT и ссылку на target Page. `/unmatched?source=WEBMASTER` показывает последние пять завершённых scans с resolved redirects; successful source исключается из unmatched TOP. Single URL link заранее устанавливает source и Max Pages = 1, но не запускает сеть сам.

## Idempotency

Fixture повторяет тот же реальный local redirect через Scanner и scoped rematch. Alias array не изменяется, Search totals остаются 300 / 30, Metrika visits 12, raw rows сохраняются. Новые ScanPage snapshots ожидаемы и сохраняют историю проверок; новые alias или source analytics rows не создаются.

## Tests

- `npm test`: 141 PASS, 0 failures.
- `npm run typecheck`: PASS.
- `npm run build`: PASS.
- `scripts/acceptance-redirect-alias.ts`: PASS, isolated fixture DB + локальный HTTP server, включая Browser-only 302. Evidence: `test-results/redirect-alias-fixtures.json`.
- Existing Scanner regression: PASS, `test-results/redirect-alias-scanner-regression.log`.
- Existing WAF regression: PASS, `test-results/redirect-alias-waf-regression.log`.
- Existing Data Activation regression: PASS, `test-results/redirect-alias-data-activation-regression.log`.
- UI fixture acceptance: PASS — Page 360 historical data, Scanner/unmatched diagnostic, single URL preset и bounded launch; `test-results/redirect-alias-ui.json`. Screenshot: `test-results/redirect-alias-page360.png`.
- Production `prisma migrate status` / `migrate diff --exit-code`: 11 migrations applied, no difference; `test-results/redirect-alias-migrations.log`.
- Client assets/rendered secrets check: PASS, `test-results/redirect-alias-secrets.log`.

Fixture commands требуют DATABASE_URL из `test-results/stabilization1-test-db.json`, prefix `radar_stabilization1_`; guard отвергает production database. UI server — port 3002; worker для fixture UI не запускается. UI created single job остановлен без исполнения. Реальные crawler requests в автоматических тестах только localhost.

## Remaining limitations

Production HTTP/redirect/final URL, alias creation, rematch, unmatched before/after и idempotency остаются NOT RUN до ручного Test One. При WAF/auth результат честно UNRESOLVED; challenge не обходится, автоматического retry нет. Raw production baseline сохранён для следующего сравнения.

Исторический alias block смотрит последние 100 successful Page snapshots: более старое evidence может отображаться как неизвестное. Existing unique `(scanId,pageId)` сохраняет один snapshot на конечную Page в одном scan; если несколько source URLs одного batch сходятся к одной Page, последующий snapshot может заменить предыдущую цепочку. Для acceptance используется один URL; отдельные single scans сохраняют evidence каждого source. Уже существовавшие legacy aliases ретроспективно не удалялись и HTTP-статус им не придумывается. Автоматическое истечение/revalidation временных 302 aliases не введено.
