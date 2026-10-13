# Stabilization 1 — Performance

Дата: 07.10.2026. Production-local PostgreSQL, read-only. Sprint 4 не начат.

## Методика

Baseline сохранён из CURRENT_STATE_AUDIT.md и current-audit-isolated.json до изменений. Одинаковые Site, reference Page и production-local DB. Production build, localhost:3000, последовательные два GET на каждый route; сравнивается второй полный GET (TTFB + чтение body). Это отдельные warm samples, не p95 и не cold-start. Проценты улучшения не заявляются.

Browser QA: Chromium 1440×1000, два новых context, load + 500 ms; разрешены только loopback GET/HEAD. DOM считается после загрузки. Browser load time отличается от Node GET и приведён отдельно. Source profiler выполняет read helpers с readonly model guard и SQL event logger; его время не используется как GET. Историческая Prisma DISTINCT возвращала 18 значений, но физически читала 94 536 строк.

Системная нагрузка заметно менялась между прогонами. Сохранены stage1/stage2/stage3, включая неудачные результаты. Финальная таблица использует последний полный прогон, а не лучший из выборки.

## Warm GET

| Route | Before, s | After, s | Improvement, s | Target, s | Status |
|---|---:|---:|---:|---:|---|
| `/` | 10.716 | 5.028 | +5.688 | <4 | P0 PASS; desired MISS |
| `/scanner` | 5.124 | 0.322 | +4.802 | <3 | PASS |
| `/business-data` | 5.392 | 2.685 | +2.707 | <3 | PASS |
| `/webmaster?period=M3` | 4.966 | 1.579 | +3.387 | <3 | PASS |
| `/webmaster?period=M18` | 19.671 | 6.864 | +12.807 | <6 | P0 PASS; desired MISS |
| `/seo-actions` | 20.003 | 1.916 | +18.087 | <2.5 | PASS |
| `/pages/cmuvqpg8t000120ucrcsttj6h` | 11.550 | 0.562 | +10.988 | <4 | PASS |
| `/pages/cmuvqpg8t000120ucrcsttj6h?searchPeriod=M3` | 10.060 | 0.521 | +9.539 | <4 | PASS |
| `/pages/cmuvqpg8t000120ucrcsttj6h?searchPeriod=M18` | 22.072 | 0.674 | +21.398 | <6 | PASS |

P0 выполнен для всех девяти measured routes.

## HTML, DOM и reads

| Route | HTML before → after, bytes | DOM before → after | Prisma model calls before → after | Model-result rows before → after | Browser warm load, s |
|---|---:|---:|---:|---:|---:|
| `/` | 20,420 → 20,420 | 148 → 148 | 27 → 24 | 27,678 → 17,807 | 5.054 |
| `/scanner` | 3,510,561 → 122,136 | 16664 → 848 | 13 → 3 | 12,079 → 13 | 0.744 |
| `/business-data` | 1,219,890 → 134,942 | 12249 → 1098 | 12 → 12 | 17,847 → 17,847 | 3.242 |
| `/webmaster?period=M3` | 68,740 → 68,705 | 810 → 810 | 10 → 8 | 15,782 → 8 | 2.031 |
| `/webmaster?period=M18` | 72,765 → 72,765 | 915 → 915 | 10 → 8 | 94,562 → 8 | 6.864 |
| `/seo-actions` | 52,866 → 52,866 | 295 → 295 | 20 → 7 | 65,377 → 15,766 | 2.176 |
| `/pages/cmuvqpg8t000120ucrcsttj6h` | 251,763 → 194,064 | 2516 → 1759 | 33 → 25 | 35,353 → 457 | 0.992 |
| `/pages/cmuvqpg8t000120ucrcsttj6h?searchPeriod=M3` | 251,829 → 194,171 | 2516 → 1759 | 33 → 25 | 35,353 → 457 | 1.022 |
| `/pages/cmuvqpg8t000120ucrcsttj6h?searchPeriod=M18` | 249,592 → 185,948 | 2582 → 1720 | 33 → 25 | 114,130 → 2,014 | 1.476 |

Model calls/rows исключают raw SQL. Monthly Webmaster дополнительно читает один SQL DISTINCT (18 months) и один JSON packet, содержащий 15 756/94 536 исходных observations M3/M18. Нельзя интерпретировать восемь model-result rows как восемь Search observations. SQL calls и queries без параметров доступны в stabilization1-profile.json. Count rows в профайлере — число result values, не число прочитанных строк таблицы.

Scanner: 3 510 561 → 122136 bytes; Business Data: 1 219 890 → 134942 bytes. Оба initial HTML <500 KB.

## Основные изменения

- `/`: Общий request BusinessContext для Commerce и quality; индексы SKU/matching и общие даты.
- `/scanner`: Одна форма, нет начального source preview, история current Site, queue pagination.
- `/business-data`: Metadata-only history, mapping 50 строк на страницу.
- `/webmaster?period=M3`: SQL DISTINCT месяцев, узкий Search JSON transport, request intent/regex reuse.
- `/webmaster?period=M18`: SQL DISTINCT месяцев, узкий Search JSON transport, request intent/regex reuse.
- `/seo-actions`: Saved SeoAction/evidence, минимальный Search summary, без full seoDataset/Commerce/graph.
- `/pages/cmuvqpg8t000120ucrcsttj6h`: Page-specific Commerce/Search/Metrika, history 5, тяжёлые detail по ссылке.
- `/pages/cmuvqpg8t000120ucrcsttj6h?searchPeriod=M3`: Page-specific Commerce/Search/Metrika, history 5, тяжёлые detail по ссылке.
- `/pages/cmuvqpg8t000120ucrcsttj6h?searchPeriod=M18`: Page-specific Commerce/Search/Metrika, history 5, тяжёлые detail по ссылке.

## Search reads и duplication

- Availability: физические 94 536 узких строк → 18 SQL DISTINCT values.
- Monthly Webmaster: M3 15 756 → 15 756, M18 94 536 → 94 536 observations. Сохранена полнота; 14 необходимых fields, без rawJson и matching/debug. Один parameterized SQL JSON packet, common siteId восстанавливается из where, timestamps передаются UTC epoch milliseconds. Dedup и MONTH suppression остаются effectiveSearch.
- Initial reference Page: M3 15 756 site-wide → 312 Page observations; M18 94 536 → 1 872. Page candidate raw URLs читаются с pageId/siteId/period, затем ограниченный набор дублей этих raw URLs сохраняет API precedence, даже если winner unmatched.
- SEO list: один current Search read вместо current+previous+повторного current и site-wide Commerce. SEO recalc переиспользует current subset из merged current/previous read.
- Dashboard: повторные confirmed BusinessRecord, Page registry и imports/files reads между prepareDataset и businessQuality удалены общим request context. Saved Opportunities/SeoActions читаются отдельно; rule engines не вызываются ради их карточек.
- Page initial: нет site-wide prepareDataset, Commerce, graph. Initial top 10 queries, 5 snapshots; detail=1 включает trend/graph/change/SKU details и history 20 на страницу. Cross-page benchmarks не пересчитываются initial, ссылка ведёт к сохранённым Opportunities.
- Import history: только metadata; выбранный native Search workbook один read. Quality всё ещё читает три confirmed STOCK/PRICES/SALES workbook для rejected-unknown-SKU semantics, это не history loading.

## Scanner

До: три route families управления launch/Resume (из них две создавали задания). После: одна `/scanner`, одна launch form, history list и Resume; отдельный Crawl Import. `/unmatched` открывает явный METRIKA targeted preset, `/scanner/[id]` — detail с ссылкой управления. Старые URLs/backend adapters сохранены.

Actual form fixture acceptance: Full, Single, Coverage ALL/UNMATCHED, Diagnostic, Test one, Targeted. Technical enums, three transports, default 3000 ms, current-Site filtering, one Resume/import, history 5/20/older page — PASS. Scanner readers, WAF, queue, robots, retries и checkpoints не изменены.

## Equivalence и безопасность

PASS: all 1479 Page Commerce/traffic/Search/benchmarks, totals, business quality, M3/M18 Search totals/intent shares, 684 saved Opportunities и 5 SeoAction evidence. Float tolerance 1e-9, порядок несемантических query/token массивов canonicalized. Отдельно шесть Pages (включая 11/11/8/8/7 SKU) сравнивают targeted Commerce с исходным full helper. Все effective narrow Search fields сравниваются с wide projection; fixtures проверяют unmatched API winner, host filtering, rejected SKU и zero fill.

Все 14 production table counts/fingerprints совпадают с baseline. Schema/migration и protected Scanner files hashes совпадают. Production workers/API/export/Scanner не запускались. Нет schema changes, rollup tables, global data cache или нового crawler.

## TOP-5 remaining bottlenecks

1. M18 всё ещё материализует 94 536 observations; SQL transport, JSON parsing, dedup, grouping и intent остаются пропорциональны их числу. Нет persisted cache/rollup по условиям спринта.
2. Dashboard сохраняет Commerce/quality calculation ради живых KPI; расчёты snapshots/price history/transactional coverage/benchmarks остаются site-wide. Shared reads удалены, formulas не упрощались.
3. Business quality требует raw confirmed workbook для rejected unknown SKU и читает mappings/records в разных read views; нельзя выбросить эти сведения без изменения результата.
4. Optional Page detail всё ещё строит site-wide graph и подробную аналитику; initial быстрый, стоимость detail не обещана как P0 acceptance.
5. Recalculate actions всё ещё строят Opportunities/SEO datasets; это action path, оптимизация спринта сосредоточена на GET. Два warm samples недостаточны для SLO; на этой Windows/Docker машине наблюдался значительный разброс.

## Артефакты

`test-results/stabilization1-{performance,browser,profile,equivalence,page-equivalence,analytics-equivalence,safety,checks,ui-checks,scanner-ui}.json`, before/after outputs, stage1/2/3 performance, local fixture logs и scanner screenshot. Профайлер не сохраняет параметры SQL, instrumentation логирует только фиксированное имя блока и duration.
