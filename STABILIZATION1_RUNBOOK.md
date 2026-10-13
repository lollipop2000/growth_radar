# Stabilization 1 — Runbook

Дата: 07.10.2026. Цель — GET performance и единый Scanner UX без изменения analytical semantics. Sprint 4 не начат. NO SCHEMA CHANGES.

## Пользовательский сценарий

Запуск только `/scanner`: выбрать весь сайт / один URL / источник. SOURCE использует реально существующий producer Метрики, ALL или UNMATCHED. FULL/DIAGNOSTIC/TEST_ONE/TARGETED — presets той же формы. Transport: HTTP + Browser fallback (default), HTTP only, Browser only. Default pause 3000 ms; safety caps/max pages/WAF сохранены. Preview источника выполняется по кнопке, не на initial GET.

`/unmatched` — аналитика и переход к явному Metrika targeted preset; `/scanner/[id]` — detail и переход к `/scanner?scanId=…`. Resume находится только на `/scanner`. Queue/excluded list по 20 строк, recent batches максимум 20; history только current Site. Crawl Import остаётся отдельной несетевой формой.

Page 360 initial показывает базовые KPI, top 10 queries, пять scan snapshots. Ссылка detail=1 включает тяжёлые блоки; full scan history по 20 записей и historyPage. Business mappings по 50 строк, import history metadata-only.

## Реализация

- Read helpers: business/context.ts, opportunities/page-commerce.ts и read-projections.ts, search/dataset.ts и range.ts.
- Request indexes: URL matching/SKU, common dates и intent classifications; dictionary regex/token normalization reuse. Matching/rules/intent outputs сохранены.
- Routes/components: Dashboard, SEO saved list, Page 360, Business/import history, monthly Search report, unified-scanner и coverage-report.
- Wiring: scanner/submission.ts и launch-action.ts вызывают существующие adapters. targeted.ts только получает выбранный transport/delay; engine/readers не изменены.
- timing.ts: NODE_ENV=development, site/db/commerce/search/seo/quality/render-prep, только fixed labels+ms.

## Приёмка

Build, typecheck и 135 automated tests PASS. Fresh fixture database migration deploy/status/drift PASS; production migration status PASS (11 migrations), schema/protected Scanner hashes unchanged. Production DB fingerprints всех 14 таблиц unchanged. Тесты записывают только в отдельную временную fixture DB и loopback fixtures; provider credentials в fixture server отключены. Production GET только read-only.

| Проверка | Результат |
|---|---|
| clean DB | PASS |
| migration status | PASS |
| schema drift | PASS |
| scanner regression | PASS |
| worker regression | PASS |
| coverage regression | PASS |
| waf regression | PASS |
| yandex regression | PASS |
| sprint3 regression | PASS |
| sprint3-1 regression | PASS |
| business-data regression | PASS |
| commerce regression | PASS |
| sprint3-4 regression | PASS |
| seo-actions regression | PASS |
| pacing regression | PASS |
| request-url regression | PASS |
| native-search regression | PASS |
| stabilization1-data regression | PASS |
| seo-actions UI | PASS |
| sprint3-4 UI | PASS |
| sprint3 UI | PASS |
| sprint3-1 UI | PASS |
| secrets | PASS |
| native-search UI | PASS |
| commerce UI | PASS |
| localization | PASS |
| stabilization1 UI | PASS |

Sprint 3.3 покрыт Commerce/business-data regression; 3.5 — SEO Actions; 3.5.1 — native Search. Дополнительные equivalence tests: все 1479 Pages, шесть reference Commerce Pages, M3/M18 all-field Search projection; actual form submission и history pagination PASS.

Performance: P0 PASS. Полные before/after и remaining bottlenecks — STABILIZATION1_PERFORMANCE.md. Функциональные изменения и regression приняты отдельно от недостигнутых performance targets.

## Повторение проверок

1. `npm run build`, затем `npm run typecheck`, `npm test` — последовательно. На Windows не выполнять Prisma generate, пока другой процесс держит Prisma engine DLL.
2. `node --env-file=.env scripts/verify-stabilization1.mjs` создаёт чистую временную fixture DB, применяет migrations и запускает data checks. `--resume` использует только проверенную radar_stabilization1_* DB; `--repeat stabilization1-data` повторяет extra equivalence fixtures.
3. Для fixture UI остановить только Growth Radar standalone server на 3000, запустить `node --env-file=.env scripts/start-stabilization1-fixture.mjs`, дождаться Ready. `node --env-file=.env scripts/verify-stabilization1-ui.mjs` сначала проверяет fixture-server guard; разрешены mutations только этой clone DB. После UI остановить fixture server и восстановить обычный `npm start`.
4. Для production-local read-only performance: дождаться Ready и завершения compiler/tests/profile; `node test-results/stabilization1-performance.mjs`, затем `node test-results/stabilization1-browser.mjs`. Никогда не запускать fixtures UI против обычного production-local server.
5. Read-only evidence helpers: stabilization1-snapshot.ts, stabilization1-compare.mjs, stabilization1-page-equivalence.ts, stabilization1-analytics-equivalence.ts; profiler запускается без react-server condition, marker server-only перехватывается в самом script. Production safety current-audit-db.ts с новым output name.
6. `npm run db:status`, `npm run check:secrets`. Drift fixture проверяется runner; production schema/index fingerprints сравниваются read-only. Не удалять существующие исторические fixture Sites из production DB.

Обычное приложение восстановлено на localhost:3000 с исходной DB. Workers не запускались. Приложение audience на 3100 не изменено. Нельзя считать этот спринт разрешением на production crawl, API sync или неопределённый Webmaster POST.
