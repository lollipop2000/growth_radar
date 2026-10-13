# Final pre-AI hardening — 08.10.2026

## Status

Приёмка завершена: **READY FOR AI**. SEO technical equivalence исправлена; query gate: **KEEP CURRENT**. Dashboard mean warm GET 1.811 s, Webmaster M3 1.202 s. Новые production scans/export/sync не запускались. Sprint 4, AI, новые integrations/rules/cache/schema не реализованы.

## Baseline

Основной reference: `SEO_TUNING_ROUND1.md`; также Stabilization 1, Data Activation, Production Validation Round 1 и Redirect Alias lifecycle.

ALL Search: 1163 URLs, 998 matched (85.81255374%), 710 unique Pages, 653 modern snapshots. В matched cohort: product 516, category 190, homepage 1, informational 3. M3 имеет 695 matched Pages; 15 других Pages имеют Search только вне M3. Все 470 evidence-based corrections сохраняются.

Текущая M3 eligibility: 4 Pages, 6 Actions, все priority HIGH; confidence внутренней ссылки LOW. Commerce validation: 09.09–06.10.2026, 14 Growth / 3 Risk. TRANSACTIONAL coverage 10.01.2025–06.10.2026. kgPerUnit 0/1909. Последний Round 1 warm mean: 15.854 / 0.683 / 1.711 / 1.131 / 3.203 s для Dashboard / Scanner / SEO / Page360 / Webmaster.

## Technical token normalization

`src/lib/seo-actions/technical-token.ts` определяет exact comparison технических spans; `intent.contains()` использует его. Query identity, Search raw URL/query, импортированные тексты и отображаемые исходные tokens не переписываются. Общие слова не получают fuzzy matching.

- SAE: `5w40`, `5W40`, `5w-40`, `5w 40`, `5 W - 40` совпадают с `5W-40`. Аналогично остальные числовые SAE пары; optional SAE prefix поддержан.
- Объём: standalone numeric `л`, `литра/литров`, Latin `l` — литры, как в существующем packaging classifier. `20lx` и части более длинного числа не совпадают. Масса `kg/кг` канонизируется отдельно и никогда не равна литрам.
- Decimal formatting: trailing zero и comma/dot эквивалентны для явно заданной единицы; `ISO VG 46.0 / 46,0` равны `ISO VG 46`. Bare `46` и `46.0` не получают общей numeric equivalence. Ненулевая дробь не округляется.
- Case-insensitive exact comparison допускается. `5W-30 != 5W-40`, `HLP 32 != HVLP 32`, `GL-4 != GL-5`, `ATF III != ATF VI`. Нет approximate similarity.

Regression fixtures проверяют grades, units, decimal boundaries, punctuation, numeric substrings, compound product names и сохранение distinct values. Три реальных сохранённых snapshots UTTO, Premium N и Synthetic Active подтверждают присутствие нормализованной характеристики. Production HTML не читался.

## Intent cluster simulation

Read-only, тот же M3 01.06–31.08.2026, threshold 100 и coverage 75%; текущие исправленные Page types.

| Model | Eligible Pages | Actions |
| --- | ---: | ---: |
| A: individual query ≥100 | 4 | 6 |
| B: individual OR Page+intent ≥100 | 12 | 14 |
| C: Page total ≥100, diagnostic only | 20 | 20 |

B использует прежние PRODUCT/PACKAGING/APPLICATION/SPECIFICATION/B2B/TRANSACTIONAL/BRAND tags. Одна multi-tag query может участвовать в разных intent totals, но включается в выбранную summary только один раз; impressions внутри неё не удваиваются. C не является production gate. Никакие simulated Actions не сохранялись.

Три spelling-induced SPECIFICATION false positives: **3 → 0**. Три прежних CONTENT_GAP artifacts на этих карточках также отсутствуют; здесь действует и уже выполненная product correction. Round 1 baseline-type B давал 20 Actions, нынешний B — 14; нельзя приписывать все шесть исчезновений только normalization.

## Query gate decision

**KEEP CURRENT**. B обнаруживает новую TITLE рекомендацию главной из-за `b2bMissing=true`, хотя Title уже содержит «для юридических лиц». Это dictionary/wording false positive, отличный от SAE formatting. Условие отсутствия FAIL для adoption не выполнено. Узкие рекомендации не получают разрешение лишь от суммы BRAND запросов. Ни threshold 100, ни minDateCoverage 75%, ни scoring не изменены.

Production full eligible Pages **4 → 4**. Обычный production recalculation не запускался: gate не принят; read-only engine comparison подтверждает сохранённые шесть Actions.

## SEO before/after

**6 → 6**, новых сохранённых 0, удалённых 0. Старые action identity/category/priority/confidence и evidence сохранены. Единственная техническая разница сравнения — floating-point порядок суммирования позиции порядка 10⁻¹⁵; проверка дробных metrics до 12 significant digits, integer counts строго точны.

| Category | Before | After |
| --- | ---: | ---: |
| TITLE | 1 | 1 |
| DESCRIPTION | 3 | 3 |
| H1 | 1 | 1 |
| CONTENT | 0 | 0 |
| APPLICATION | 0 | 0 |
| SPECIFICATION | 0 | 0 |
| PACKAGING | 0 | 0 |
| FIRST_SCREEN | 0 | 0 |
| INTERNAL_LINKING | 1 | 1 |
| STRUCTURED_DATA | 0 | 0 |
| CONTENT_GAP | 0 | 0 |
| CANNIBALIZATION | 0 | 0 |

## Action quality review

Все шесть текущих Actions explainable: три пустых description, Title/H1 facet без значимой «канистра» (1150 impressions), один internal-link candidate с LOW confidence и требованием проверки источников. Не утверждается реальная orphan Page.

Новых сохранённых Actions нет. Проверены все восемь B-only proposals:

| Page / proposal | Intent evidence / Search demand | Existing page evidence / missing element | Review |
| --- | --- | --- | --- |
| Главная · TITLE | B2B 203, Page 687 impressions | Title уже «для юридических лиц»; b2bMissing — lexical artifact | **FAIL**, не сохранена |
| UTTO 10W-30 20 л · INTERNAL_LINKING | SPECIFICATION 343, Page 372 | grade присутствует; observed inbound 0, 5 suggested sources | QUESTIONABLE, LOW, graph partial |
| Hydraulic HVLP-32 205 л · INTERNAL_LINKING | Page 166 | observed inbound 0, 5 broad category/brand sources | QUESTIONABLE, LOW |
| product_type filter · DESCRIPTION | Page 145, qualifying PRODUCT evidence | stored description null | PASS, не сохранена |
| product_type filter · H1 | Page 145, qualifying PRODUCT evidence | stored H1 empty | PASS, не сохранена |
| Premium L 10W-40 20 л · INTERNAL_LINKING | Page 139 | observed inbound 0, 5 sources | QUESTIONABLE, LOW |
| Premium N 5W-40 4 л · INTERNAL_LINKING | Page 197 | 5W-40 present; observed inbound 0, 5 sources | QUESTIONABLE, LOW |
| Synthetic Active 5W-40 4 л · INTERNAL_LINKING | Page 211 | 5W-40 present; observed inbound 0, 5 sources | QUESTIONABLE, LOW |

Для трёх прошлых false positives technical normalized evidence = KNOWN PRESENT в сохранённом visibleText; SPECIFICATION/CONTENT_GAP не создаются из различия `w` / `W-`. Все proposals остаются диагностикой, включая два PASS: production gate сохранён целиком.

## Page type regression

Matched ALL cohort product **516**, category **190**. Все 470 corrected IDs остаются product; Page fingerprints контролируют отсутствие отката/manualType/alias изменений. Local storage fixture: первый rich successful scan → product; повторный successful scan → product; legacy import → product; failed 404 → product. Existing classifier не угадывает тип по одному slug и не изменяет SKU/mapping.

## Structured data evidence

Observed Product/Offer **0/0**, A11 full eligibility **0**, Actions 0. State — **NOT_OBSERVED**, не MISSING_FROM_HTML. Raw HTML не сохранён, новые HTML requests не выполнялись. Невозможно заключить, что разметки физически нет или что поздняя/неподдерживаемая разметка отсутствует. Этот limitation обязателен в будущем AI input.

## Internal graph limitations

Universe 1495: observed source **665**, target-only **68**, unobserved **762**; source coverage **44.48%**. HTML engine исключает два documents, total1493. Нового full crawl нет. LOW для internal-link/orphan-like сохраняется; observed inbound 0 не доказывает отсутствие всех ссылок. Graph не строится при initial GET Dashboard/Scanner/SEO/Page360/Webmaster.

## Dashboard profile

Новый before: warm-up + 5 sequential GET, mean Dashboard **5.467 s**. Это быстрее предыдущего Round 1 15.854 s ещё до изменений. Host/runtime variability сохраняется; абсолютное before→after сравнение нельзя подменять старым более медленным sample.

Повторное разложение прежнего пути, direct tsx profiler:

| Stage | Wall ms | Process CPU ms | SQL event sum ms | Model calls / rows |
| --- | ---: | ---: | ---: | --- |
| BusinessContext | 3446 | 4672 | 1191 | 4 / 7987 |
| Commerce + Search preparation | 13297 | 15547 | 316 | 6 / 9598 |
| businessQuality | 2246 | 2093 | 18 | 1 / 1 |
| freshness | 168 | 47 | 102 | 9 / 6 |
| saved SEO cards | 33 | 0 | 22 | direct plain client, 6 results |

Direct profiling ≠ optimized warm GET. SQL sums могут перекрываться, CPU включает Prisma threads, wall и CPU не являются складываемыми exclusive стадиями. Saved Opportunity/SEO reads не запускают rule engines. Rendering/serialization включены в GET residual; exclusive render CPU не измеряется отдельно.

После первого summary refactor ещё оставалось Commerce summary 4812 ms; request-local calendar снизил его до **1079 ms**. Summary context3269 ms, quality800 ms, current traffic734 ms, current Search74 ms, saved Opportunities90 ms, saved SEO39 ms, freshness186 ms. Итоговый route profile и GET приведены ниже отдельно.

## Dashboard changes

`commerceDashboardSummary()` отделён от `prepareDataset()`: latter остаётся analytical path для recalc/rules/detail. Initial Dashboard:

| KPI / block | Need site-wide prepareDataset? | Final read |
| --- | --- | --- |
| Revenue / orders / kg | Нет | selected mapped SKU current sales, existing coveredSales semantics |
| Visits / business conversion | Нет | narrow current Metrika projection + existing trafficAggregate/goalConfig |
| Search impressions/clicks | Нет | existing analytics Search transport + effectiveSearch |
| Confirmed zero-sales Pages | Нет | current coverage/freshness + selected SKU sums |
| Growth/Risk / TOP | Нет | saved Opportunity, явно подписанный selected Commerce period |
| SEO TOP | Нет | saved SeoAction, отдельно подписанный Search M3 |
| Mapping / sales coverage | Нет | shared request-local mapping/import metadata + source dates |
| Price / stock freshness / kg coverage | Нет | latestRows/fresh; no detailed per-group anomaly diagnostics |

Нет 1495 full Page Commerce profiles, previous-period comparison, price-history daily loops, benchmarks, scan content/history или graph. Идентичности Pages всё ещё нужны для конфликтного group mapping; это не полные аналитические profiles.

Summary и quality используют один request-local context. Summary quality **не возвращает** невычисленные anomalies/pagesWithoutSales как нули; detailed businessQuality для `/business-data` сохранён. Calendar и import bounds/excluded-SKU Set переиспользуются только внутри запроса; per-SKU daily selection, unknown cells, replacement precedence и provenance остаются прежними. Нет global cache/Redis/summary tables/migration.

Dashboard сообщает «подтверждённое покрытие продаж по 06.10.2026», обозначает последующий период UNKNOWN и частичность KPI. Saved recommendation period и Search period подписаны отдельно. 14/3 historical validation не записан и не подставлен как current результат. Нулевое количество сохранённых inventory signals не объявляется доказательством отсутствия риска.

Привязка Metrika counter проверяется до чтения traffic/goals. Отсутствующий counter или несовпадение Site/config/ENV возвращают UNKNOWN, а не неограниченный запрос ко всем counters. Изолированный fixture проверяет обе ситуации и выбор только привязанного counter; его данные не попадают в production.

## Webmaster performance

M3 по-прежнему получает **15756 effective observations / 5252 queries**. Transport/effectiveSearch стадия1085 ms, instrumented JSON.parse subset161 ms, aggregate/render preparation391 ms. JSON parse включён в transport и не суммируется повторно.

Monthly report не отображал intents, но классифицировал все queries. Удалена только эта неиспользуемая обработка и её config read. Таблица/top100, counts, demand, CTR, weighted position и query labels эквивалентны для M3 и M18 (**94536 rows**). Intent engine/memoization/includes-before-boundary, SQL DISTINCT months, narrow transport и DAY/MONTH suppression сохранены. QuerySummary остаётся там, где intent evidence нужен.

Уже прочитанный Site передаётся в monthly report: повторные currentSite reads убраны. Model calls 7 → 5. Final warm mean **1.202 s**, secondary target <2.5 s выполнен.

## Commerce fixed-period regression

09.09–06.10.2026: **14 Growth / 3 Risk**, RULE_11=14, RULE_16=3, остальные RULE_12–15/17–22=0. Read-only; historical результат не сохраняется как current. Formula/scoring/TRANSACTIONAL semantics не меняются.

Сводные sales KPI и zero-sales/stale/stock-kg coverage counts совпали с прежним полным dataset на двух периодах:

| Period | Revenue | Orders | Sales kg | Known days | Confirmed fresh zero-sales Pages |
| --- | ---: | ---: | ---: | ---: | ---: |
| 09.09–06.10.2026 | 6124716.61 | 318 | 17494.827 | 28 | 1322 |
| 10.09–07.10.2026 | 5214312.67 | 224 | 15130.027 | 27/28 | 0 |

07.10+ UNKNOWN, не ZERO. Partial totals подписаны как наблюдённая часть. 9 rejected SALES SKU исключены; unknown SKU из всех файлов248. kgPerUnit **0/1909**, incomplete stockKg Pages1360; inventory conclusions unavailable. Mapping matched1909/1909 не означает наличие stockKg.

## Final performance

Production-local build, по одному исключённому warm-up и пять последовательных GET каждого route, без одновременно работающих tests/profilers. Все 25 измеренных ответов HTTP 200. Times ниже в секундах.

| Route | Before mean | Final min | Final median | Final mean | Final max | Target mean |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| Dashboard `/` | 5.467 | 1.493 | 1.803 | **1.811** | 2.156 | <6; desired <4 — PASS |
| `/scanner` | 0.383 | 0.362 | 0.421 | **0.454** | 0.602 | <1 — PASS |
| `/seo-actions` | 1.567 | 0.812 | 0.878 | **0.945** | 1.146 | <2.5 — PASS |
| Page360 M3 | 1.268 | 0.571 | 0.708 | **0.703** | 0.879 | <1.5 — PASS |
| `/webmaster?period=M3` | 3.208 | 1.088 | 1.214 | **1.202** | 1.340 | <2.5 — PASS |

Dashboard mean снизился на 66.9% относительно нового before. Старый Round 1 15.854 s — исторический reference, не paired before. Host/runtime variability заметна: first summary-only build давал Dashboard 7.883 s, после calendar optimization промежуточно 4.795 s. Все промежуточные samples сохранены; final sample не повторялся для выбора более выгодного результата. Контролируемая локальная серия не гарантирует те же задержки при иной нагрузке.

Отдельный direct-source route profiler (не та же серия warm GET):

| Route | Wall ms | Process CPU ms | SQL event sum ms | Model calls | Model result rows |
| --- | ---: | ---: | ---: | ---: | ---: |
| Dashboard | 6880 | 9266 | 1285 | 23 | 12356 + 1140 nested |
| Scanner | 633 | 438 | 322 | 3 | 32 |
| SEO | 1621 | 1375 | 606 | 6 | 11 |
| Webmaster M3 | 2267 | 2110 | 555 | 5 | 5 |
| Page360 M3 | 1421 | 1312 | 587 | 26 | 456 |

SEO и Webmaster дополнительно используют raw SQL Search transport: 15756 observations каждый; model row count не включает эти строки. CPU включает Prisma threads, SQL event sums не являются exclusive wall time. Direct source execution не идентичен Next production runtime. Stage timings и source projection доступны в `test-results/hardening-stages-after.json` / `hardening-profile-after.json`; render/serialization отдельно от GET residual не изолированы.

## Final data quality

Matching **998/1163 = 85.81%**, unmatched165; unique matched Pages710, modern653/710. Corrected types470/470. Final before/after fingerprints совпали для восьми protected tables, Page и SeoAction: raw sources, Opportunities, identities/types/aliases и saved Actions не изменены. All1144 stored alias strings сохранены; это больше, чем386 verified production redirect source→final pairs. Полные Page/ScanPage/Search fingerprints защищают все386 исторических связей и original source URLs.

| Check | Final result | Evidence under `test-results/` |
| --- | --- | --- |
| Production build | PASS | hardening-build.log |
| Typecheck | PASS | hardening-typecheck.log |
| Unit tests | **157/157 PASS**, 0 skipped | hardening-tests.log |
| Scanner/coverage/WAF/request URL/pacing/native Search/Commerce/SEO/redirect alias/Stabilization data/Yandex/product-type fixtures | **12/12 PASS**, local fixtures only | hardening-fixtures.json, hardening-fixtures/*.log |
| Counter binding fixture | PASS, isolated fixture DB | hardening-counter-binding.log |
| Schema/migrations | 11 applied, up to date; no drift | hardening-migrations.log, hardening-drift.log |
| Client/rendered secrets | PASS | hardening-secrets.log |
| Dataset/quality/SEO/Search equivalence | PASS, read-only real saved data | hardening-validation.json |
| Final configured summary + covered Commerce 14/3 | PASS | hardening-final-check.json |
| Dashboard and Webmaster M3/M18 rendered checks | PASS | hardening-ui-readonly.json |
| Protected-source fingerprints | PASS | hardening-protected-after.json/.log |

Reproduction: `npm run build`, `npm run typecheck`, `npm test`, `npm start`; после Ready: `npm run check:secrets`, `node test-results/seo-tuning-performance.mjs hardening-after`. Read-only fixed-period regression: `node --env-file=.env --conditions=react-server --import=tsx test-results/hardening-final-check.ts`. Acceptance fixture logs относятся к isolated DB/local API/HTML, а не production network. Build/tests/data checks завершены до final performance sample.

Изменённые paths: `src/lib/seo-actions/technical-token.ts`, `intent.ts`; `src/lib/business/context.ts`, `quality.ts`, `dashboard-summary.ts`; `src/lib/opportunities/transactional.ts`; `src/app/page.tsx`, `src/app/webmaster/page.tsx`, `src/components/monthly-report.tsx`; три соответствующих unit-test файла, README и этот отчёт. Schema/migrations/package/Scanner adapters не менялись.

Оставшиеся ограничения: 165 unmatched URLs; partial graph; schema NOT_OBSERVED; kgPerUnit0/1909; sales07.10+UNKNOWN; B gate отклонён из-за B2B TITLE false positive. Они не скрыты и не компенсируются догадками.

## AI readiness

**READY FOR AI** — для ограниченного human-reviewed scope на текущем консервативном gate.

1. Technical spelling false positives устранены; шесть текущих Actions explainable, matching/content/types/aliases стабильны. Расширенный gate отклонён, его FAIL не попал в production.
2. Commerce воспроизводимо даёт 14 Growth / 3 Risk на подтверждённом периоде; непокрытые дни и inventory evidence без kgPerUnit остаются UNKNOWN.
3. Dashboard/SEO/Page360 пригодны по final warm GET; evidence contract различает PRESENT/ABSENT/NOT_OBSERVED/UNKNOWN и явно передаёт partial graph/schema ограничения.

Это решение о готовности к отдельному AI заданию. Sprint 4 и AI implementation не начаты.

## Proposed AI contract

Черновой scoped contract, **без реализации**:

```text
Page: siteId, pageId, raw/canonical identity, observed aliases, pageType,
      snapshotId/source HTTP|BROWSER|IMPORT, observedAt.
Search: explicit period/grain/source, relevant queries/intents,
        impressions/clicks/CTR/position, coverage, selected gate/evidence.
Content: original title/description/H1/H2/top/visible excerpts,
         exact technical token/value + normalized comparison,
         applications/packaging/CTA/availability/price observations.
Technical: stored status/canonical/robots/eligibility,
           structuredDataObserved=NOT_OBSERVED (not physical absence).
Commerce: explicit independent period, TRANSACTIONAL coverage,
          covered/unknown days, visits/revenue/orders/salesKg,
          provenance/excluded SKU, no substitution of UNKNOWN with zero.
Stock: observed units/freshness when available;
       stockKg/daysOfStock inventory evidence UNKNOWN without kgPerUnit.
Findings: reviewed saved Opportunity/SeoAction + rule/actionId,
          priority/confidence, missing element, supporting source IDs.
Quality: per-field KNOWN_PRESENT | KNOWN_ABSENT | NOT_OBSERVED | UNKNOWN,
         graph PARTIAL 665/1495, snapshot/period freshness and limitations.
```

KNOWN_ABSENT допустим только в границах достоверного конкретного наблюдения (например, сохранённый пустой meta description); null без observation — UNKNOWN. Schema not extracted — NOT_OBSERVED; orphan-like при partial graph — hypothesis LOW. Не передавать cookies/tokens/sensitive headers или все100 тысяч raw rows.

Предлагаемый будущий scope: объяснить reviewed deterministic signal, подготовить page-specific текст/структуру изменения, предложить человеку порядок работы с несколькими signals одной Page, сохраняя deterministic score/priority, учитывать B2B и явно цитировать evidence/uncertainty. AI не рассчитывает Search/Commerce metrics, не придумывает kg coefficients, не утверждает физическое отсутствие schema/реальную orphan, не публикует изменения и не запускает scans. Сначала ограниченный human-reviewed pilot; запуск Sprint 4 требует отдельного задания пользователя.
