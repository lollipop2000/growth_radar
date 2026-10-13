# Data Activation — 07.10.2026

### Scanner Search scope fix — 07.10.2026

Fixed a real form bug after the initial activation acceptance: manually changing `/scanner` from SITE to a Search source and submitting PREVIEW caused the React form action to reset native selects to SITE / UNMATCHED / TOP50, while the rendered Search fields/preview stayed visible. The next START could create an ordinary site scan with empty seeds. Initial acceptance used preset links, which did not expose this manual-switch path.

The unified form now prevents automatic reset; Search selection, volume, transport and delay survive preview. Server submission validation rejects Search fields combined with SITE or a non-Search source instead of silently falling back. History displays saved Search source, scope, batch and selected URL count; HTTP/BROWSER remains the transport label. No crawler/reader/rate-limit changes.

Regression reproduces manual selection from the default `/scanner` for both SEO_RESCAN and SEARCH_UNMATCHED on the isolated fixture DB/application at port 3002, with external browser traffic blocked and no fixture worker. Preview creates no job; explicit START produces selected seeds, seedOnly=true and ≤50 pages; jobs are stopped in the fixture DB. Browser-only/HTTP-only and different delay selections remain intact. Build/typecheck and 139 unit tests PASS, browser fixture regression PASS. No production scan was created by this verification. Application and existing Scanner worker restored; Yandex worker not started. Refresh the browser (Ctrl+F5), select the Search source, preview and manually start the chosen batch.

## Status

Pipeline activation and local fixture acceptance: PASS. Production targeted scan: NOT RUN (explicit user UI launch required). **NOT READY FOR AI.** Sprint 4 / AI / new rule engines not started. No formula or scoring threshold changes. No schema/cache/rollup/new dashboard.

Production-local app restored on http://127.0.0.1:3000. Scanner and Yandex workers remain stopped. No production crawl/export/sync launched. Source data and queues unchanged; only confirmed SALES metadata and existing rule/SEO recalculation records changed.

Checks: optimized `npm run build` PASS; typecheck PASS; 138/138 unit tests PASS; isolated scanner/WAF/coverage/pacing/request-URL/Commerce/SEO/native Search fixtures PASS; Data Activation redirect/404/WAF/rematch/batching fixtures and actual browser form submissions PASS; schema drift/migrations PASS (both isolated fixture and production DB, 11 migrations current/no difference); client secrets PASS. Fixture DB isolated (`radar_stabilization1_1791369770442`), local URLs only. Existing unified Full/Single/Coverage/Diagnostic/Test One/Targeted UI regression PASS.

Evidence: `test-results/data-activation-sales.json`, `data-activation-results.json`, `data-activation-checks.json`, `data-activation-fixtures.json`, `data-activation-ui.json`, `data-activation-performance.json`, `data-activation-workbook.json`. Source BusinessRecord/Scan/ScanPage/JobRun/Metrika/Search SHA-256 hashes unchanged across both recalculations.

## Sales activation

User explicitly confirmed: «Подтверждаю TRANSACTIONAL за 10.01.2025–06.10.2026». File and composition verified before mutation. Existing `updateSalesMetadata` used; no BusinessRecord rewrite.

| Filename | Mode | Observed dates | Confirmed coverage | Source rows / SKU | Accepted rows / SKU | Rejected unknown SKU |
| --- | --- | --- | --- | --- | --- | --- |
| sales_template.xlsx | UNKNOWN → TRANSACTIONAL | 10.01.2025–06.10.2026 | 10.01.2025–06.10.2026 | 1153 / 375 | 1143 / 366 | 9 |

No other source validation errors; accepted composition unchanged. Observed min/max did not establish coverage: the user confirmation did. Absence of transactions is now a confirmed logical zero for covered known mapped SKU; unknown/rejected SKU remain excluded. 366 SKU have observed transactions; transactional zero semantics cover the known mapping rather than limiting the dataset to those 366 SKU. Current Commerce period 09.09–06.10.2026; 1 360 Commerce Pages have full 28 transactional days. Source transactions, site visits and grouped SKU totals are not order-level attribution.

## kgPerUnit coverage

| SKU total | With kgPerUnit | Without kgPerUnit | Coverage |
| --- | --- | --- | --- |
| 1909 | 0 | 1909 | 0% |

No guessed coefficients or values inferred from packaging names. Workbook `outputs/data-activation-20261007/SKU_without_kgPerUnit.xlsx`: all 1 909 SKU, groupCode/groupName/URL/stock units/unit/sales kg/visits/revenue and ordinal priority. Sorted visits DESC then SKU revenue DESC; visits belong to the matched Page and repeat across its SKU. Revenue belongs to the SKU. Unknown numeric values remain blank; confirmed zeros remain zero. All SKU/group identifiers and URL strings preserved; independent readback PASS, visual preview checked.

## StockKg / Days of Stock

| Pages with stock units | With stockKg | Full stockKg coverage | Days of Stock |
| --- | --- | --- | --- |
| 451 | 0 | 0 | 0 |

Existing partial conversion pipeline exercised by Commerce regression; production has no coefficients to activate. Existing minStockKgCoverage=1, stock freshness=2 days, sales freshness=3 days preserved. Current unknown stockKg/Days of Stock are null, not zero. Suppressed stock rules are not evidence of no inventory risk.

## Search rescan candidates

| Search URLs | Matched URLs / Pages | Unmatched | Modern contentSignals | Requiring rescan | Eligible preview candidates |
| --- | --- | --- | --- | --- | --- |
| 1163 | 621 / 621 | 542 | 0 / 621 | 621 | 617 |

Preset in the existing `/scanner`: source `Search-matched Pages без modern contentSignals`. Preview uses available Search period 01.03.2025–31.08.2026, not Commerce current 28 days. Sorting: impressions, then current HIGH/VERY_HIGH actions, then product/category. No LLM or new score. TOP50=50 URL/1 batch; default TOP100=100/2 batches; ALL=617/13 batches. Each batch ≤50, manually launched; no auto chaining. Preview includes URL/type/impressions/clicks/topQuery/current successful snapshot date/eligibility/reason.

HTTP + browser fallback default; Browser only and HTTP only preserved. One request at a time; default delay 3 000 ms; HTTP 15 sec, Browser 20 sec. Existing adapters/engine/discovery/robots/WAF/read-only behavior preserved. The ordinary seeded Scan stops when Browser reading is unavailable due to WAF/auth; HTTP-only retains the existing bounded HTTP behavior. Coverage retains its existing three-block pause. No challenge/auth workaround, robot UA, cart/form mutation. No production Scanner worker started.

Manual workflow: open `/scanner?preset=SEO_RESCAN` → preview TOP100 → explicitly start batch 1; operate the existing Scanner worker only after deciding to process the queued scan. After completion, preview/launch the next batch manually. Recheck scope if data changed. After each completed Search batch the existing worker completion hook rematches using observed successful Page/aliases. Then manually recalculate SEO for M3 in `/seo-actions`; no automatic scans or external exports.

First 20 of TOP100 rescan preview:

| URL | Page type | Impressions | Snapshot date | Reason |
| --- | --- | --- | --- | --- |
| https://shop.gazpromneft-sm.ru/catalog/ | category | 37876 | 2026-10-05T16:15:09.227Z | Нет modern contentSignals; HTTP 200, indexable, нет другого canonical |
| https://shop.gazpromneft-sm.ru/catalog/gazpromneft-premium-n-5w-40-kanistra-4-l/ | product | 7426 | unknown | Нет modern contentSignals; Нет снимка страницы |
| https://shop.gazpromneft-sm.ru/catalog/filter/brand-is-0000000001/packing-is-2f0e6106-cad8-11e7-80e3-0050569eedf6/apply/ | category | 5284 | 2026-10-06T08:26:25.660Z | Нет modern contentSignals; HTTP 200, indexable, нет другого canonical |
| https://shop.gazpromneft-sm.ru/ | homepage | 4458 | 2026-10-06T07:51:49.273Z | Нет modern contentSignals; HTTP 200, indexable, нет другого canonical |
| https://shop.gazpromneft-sm.ru/about/contacts/ | informational | 4207 | 2026-10-06T06:34:57.549Z | Нет modern contentSignals; HTTP 200, indexable, нет другого canonical |
| https://shop.gazpromneft-sm.ru/catalog/g-energy-synthetic-active-5w-40-kanistra-4-l/ | category | 2346 | 2026-10-06T09:42:21.145Z | Нет modern contentSignals; HTTP 200, indexable, нет другого canonical |
| https://shop.gazpromneft-sm.ru/catalog/g-profi-msi-10w-40-kanistra-20-l/ | category | 2295 | 2026-10-06T08:26:49.522Z | Нет modern contentSignals; HTTP 200, indexable, нет другого canonical |
| https://shop.gazpromneft-sm.ru/catalog/filter/product_type-is-3543f9e51c263978dd8aab4b1773333c/apply/ | category | 2231 | 2026-10-06T09:53:18.025Z | Нет modern contentSignals; HTTP 200, indexable, нет другого canonical |
| https://shop.gazpromneft-sm.ru/catalog/g-energy-racing-5w-40-kanistra-4-l/ | category | 1734 | 2026-10-06T09:06:18.969Z | Нет modern contentSignals; HTTP 200, indexable, нет другого canonical |
| https://shop.gazpromneft-sm.ru/catalog/gazpromneft-adblue-kanistra-20-l | category | 1643 | unknown | Нет modern contentSignals; Недостаточно indexability signals |
| https://shop.gazpromneft-sm.ru/catalog/g-special-utto-10w-30-kanistra-20-l/ | category | 1544 | 2026-10-06T09:46:11.470Z | Нет modern contentSignals; HTTP 200, indexable, нет другого canonical |
| https://shop.gazpromneft-sm.ru/catalog/gazpromneft-diesel-premium-10w-40-kanistra-20-l/ | category | 1495 | 2026-10-06T09:07:11.962Z | Нет modern contentSignals; HTTP 200, indexable, нет другого canonical |
| https://shop.gazpromneft-sm.ru/catalog/m-8v-kanistra-20-l/ | category | 1328 | 2026-10-06T10:10:46.670Z | Нет modern contentSignals; HTTP 200, indexable, нет другого canonical |
| https://shop.gazpromneft-sm.ru/catalog/gazpromneft-premium-l-10w-40-kanistra-20-l/ | category | 1279 | 2026-10-06T08:27:31.528Z | Нет modern contentSignals; HTTP 200, indexable, нет другого canonical |
| https://shop.gazpromneft-sm.ru/catalog/gazpromneft-diesel-premium-10w-40-bochka-205-l/ | category | 1266 | 2026-10-06T08:27:17.071Z | Нет modern contentSignals; HTTP 200, indexable, нет другого canonical |
| https://shop.gazpromneft-sm.ru/catalog/g-energy-f-synth-0w-30-kanistra-4-l/ | category | 1143 | 2026-10-06T08:38:07.774Z | Нет modern contentSignals; HTTP 200, indexable, нет другого canonical |
| https://shop.gazpromneft-sm.ru/catalog/gazpromneft-premium-n-5w-40-bochka-205-l/ | category | 1137 | 2026-10-06T09:44:48.633Z | Нет modern contentSignals; HTTP 200, indexable, нет другого canonical |
| https://shop.gazpromneft-sm.ru/catalog/g-profi-gt-10w-40-bochka-205-l | category | 1124 | unknown | Нет modern contentSignals; WAF/authentication не доказывает indexability страницы |
| https://shop.gazpromneft-sm.ru/catalog/g-profi-msk-5w-40-bochka-205-l/ | category | 1025 | 2026-10-06T09:44:26.232Z | Нет modern contentSignals; HTTP 200, indexable, нет другого canonical |
| https://shop.gazpromneft-sm.ru/catalog/gazpromneft-premium-p-5w-40-kanistra-4-l/ | product | 1015 | unknown | Нет modern contentSignals; Нет снимка страницы |

## Legacy URL analysis

| Unmatched group | Unique URLs |
| --- | --- |
| LEGACY_NUMERIC | 449 |
| DOCUMENT | 72 |
| OTHER_HTML | 17 |
| QUERY_FILTER | 4 |
| MALFORMED_OTHER | 0 |

TOP100 unmatched by impressions prepared; 94 safe HTML URLs/2 manual batches, 6 documents excluded from execution but kept visible in TOP100. Only exact current URL/observed redirect/final URL/alias evidence is used. No query/name similarity. An actual redirect saves an alias through existing store and rematches; distinct HTTP 200 goes through ordinary Page/ScanPage workflow. Actual 404 becomes HISTORICAL_DEAD in saved targeted outcomes and `/unmatched`; WAF stays unresolved, not dead. Classified dead URLs remain in historical Search traffic and are excluded from repeated target previews. Canonical is displayed as existing evidence for indexability; no fabricated redirect/canonical relationship.

| Outcome | Before | After |
| --- | --- | --- |
| Unmatched URLs | 542 | 542 |
| Matched URL rate | 53.40% | 53.40% |
| Resolved redirects | 0 | 0 |
| Created aliases | 0 | 0 |
| Confirmed historical dead | 0 | 0 |
| Production rescanned Pages | 0 | 0 |

No production resolution attempted; zeros above mean no new observed evidence, not that legacy URLs are reachable. Fixtures proved redirect alias/rematch, 404 dead, WAF unresolved and successful modern signals.

Search traffic to documents is a separate section on `/unmatched?source=WEBMASTER`: 72 documents, 3 191 impressions / 93 clicks over available 18 months. Documents excluded from HTML presets and SEO engine input; no PDF SEO rules added.

<details><summary>TOP100 unmatched Search URLs</summary>

| URL | Impressions | Clicks | Top query | Kind | Match status |
| --- | --- | --- | --- | --- | --- |
| https://shop.gazpromneft-sm.ru/catalog/14134/ | 4544 | 78 | газпром премиум н | LEGACY_NUMERIC | UNMATCHED |
| https://shop.gazpromneft-sm.ru/catalog/5786/ | 2476 | 38 | gazpromneft diesel premium 10w-40 | LEGACY_NUMERIC | UNMATCHED |
| https://shop.gazpromneft-sm.ru/catalog/17282/ | 1981 | 37 | газпром hvlp 32 | LEGACY_NUMERIC | UNMATCHED |
| https://shop.gazpromneft-sm.ru/catalog/14131/ | 1656 | 25 | масло газпром полусинтетика | LEGACY_NUMERIC | UNMATCHED |
| https://shop.gazpromneft-sm.ru/catalog/14245/ | 1372 | 43 | gazpromneft moto 4t 10w-40 | LEGACY_NUMERIC | UNMATCHED |
| https://shop.gazpromneft-sm.ru/catalog/5699/ | 1170 | 17 | масло газпромнефть 10w 40 полусинтетика цена | LEGACY_NUMERIC | UNMATCHED |
| https://shop.gazpromneft-sm.ru/catalog/5889/ | 1156 | 11 | масло джи энерджи 5w40 | LEGACY_NUMERIC | UNMATCHED |
| https://shop.gazpromneft-sm.ru/catalog/16174/ | 1124 | 29 | g energy 5w40 | LEGACY_NUMERIC | UNMATCHED |
| https://shop.gazpromneft-sm.ru/catalog/14136/ | 1098 | 9 | масло газпромнефть 5w40 | LEGACY_NUMERIC | UNMATCHED |
| https://shop.gazpromneft-sm.ru/catalog/16876/ | 1006 | 20 | utto 10w30 | LEGACY_NUMERIC | UNMATCHED |
| https://shop.gazpromneft-sm.ru/catalog/5747/ | 981 | 20 | gazpromneft gl-4 75w-90 | LEGACY_NUMERIC | UNMATCHED |
| https://shop.gazpromneft-sm.ru/catalog/5940/ | 957 | 24 | g energy 5w30 | LEGACY_NUMERIC | UNMATCHED |
| https://shop.gazpromneft-sm.ru/catalog/5675/ | 953 | 30 | g-profi msi plus 15w-40 | LEGACY_NUMERIC | UNMATCHED |
| https://shop.gazpromneft-sm.ru/catalog/14111/ | 866 | 21 | газпром 0w20 | LEGACY_NUMERIC | UNMATCHED |
| https://shop.gazpromneft-sm.ru/catalog/7030/ | 849 | 25 | g-profi msi 10w-40 | LEGACY_NUMERIC | UNMATCHED |
| https://shop.gazpromneft-sm.ru/catalog/7006/ | 730 | 16 | gazpromneft diesel premium 15w-40 | LEGACY_NUMERIC | UNMATCHED |
| https://shop.gazpromneft-sm.ru/catalog/14230/ | 728 | 25 | gazpromneft moto 2t | LEGACY_NUMERIC | UNMATCHED |
| https://shop.gazpromneft-sm.ru/catalog/5740/ | 723 | 11 | gazpromneft atf dx iii | LEGACY_NUMERIC | UNMATCHED |
| https://shop.gazpromneft-sm.ru/catalog/14213/ | 712 | 30 | газпром 20w50 | LEGACY_NUMERIC | UNMATCHED |
| https://shop.gazpromneft-sm.ru/catalog/5787/ | 659 | 23 | газпромнефть 80 90 | LEGACY_NUMERIC | UNMATCHED |
| https://shop.gazpromneft-sm.ru/catalog/17305/ | 644 | 17 | hvlp 46 | LEGACY_NUMERIC | UNMATCHED |
| https://shop.gazpromneft-sm.ru/catalog/5707/ | 544 | 6 | масло газпром 10w 40 | LEGACY_NUMERIC | UNMATCHED |
| https://shop.gazpromneft-sm.ru/catalog/15887/ | 518 | 7 | масло газпромнефть 5w30 | LEGACY_NUMERIC | UNMATCHED |
| https://shop.gazpromneft-sm.ru/catalog/15730/ | 512 | 9 | газпромнефть м10дм | LEGACY_NUMERIC | UNMATCHED |
| https://shop.gazpromneft-sm.ru/catalog/16909/ | 510 | 14 | g-truck z 75w-80 | LEGACY_NUMERIC | UNMATCHED |
| https://shop.gazpromneft-sm.ru/catalog/5881/ | 498 | 15 | g-energy synthetic super start 5w-30 | LEGACY_NUMERIC | UNMATCHED |
| https://shop.gazpromneft-sm.ru/catalog/5718/ | 498 | 11 | gazpromneft premium c3 5w-30 | LEGACY_NUMERIC | UNMATCHED |
| https://shop.gazpromneft-sm.ru/catalog/14089/ | 494 | 8 | g motion | LEGACY_NUMERIC | UNMATCHED |
| https://shop.gazpromneft-sm.ru/upload/doc/aeb/hc0zdvoio8p2jkatnfqi8713gs4iz1po/%20%D0%9F%D0%B0%D1%81%D0%BF%D0%BE%D1%80%D1%82%20%D0%B1%D0%B5%D0%B7%D0%BE%D0%BF%D0%B0%D1%81%D0%BD%D0%BE%D1%81%D1%82%D0%B8.pdf | 473 | 3 | паспорт янос | DOCUMENT | UNMATCHED |
| https://shop.gazpromneft-sm.ru/catalog/16006/ | 470 | 14 | g-profi | LEGACY_NUMERIC | UNMATCHED |
| https://shop.gazpromneft-sm.ru/catalog/5893/ | 459 | 3 | масло 5w30 far east | LEGACY_NUMERIC | UNMATCHED |
| https://shop.gazpromneft-sm.ru/catalog/14804/ | 447 | 18 | g-energy f synth c2/c3 5w-30 | LEGACY_NUMERIC | UNMATCHED |
| https://shop.gazpromneft-sm.ru/catalog/17448/ | 399 | 5 | газпромнефть вмгз | LEGACY_NUMERIC | UNMATCHED |
| https://shop.gazpromneft-sm.ru/upload/doc/533/0uv07r122oknxtuywnavgm0iqz3og083/%20%D0%9B%D0%B8%D1%81%D1%82%20%D1%82%D0%B5%D1%85%D0%BD%D0%B8%D1%87%D0%B5%D1%81%D0%BA%D0%BE%D0%B9%20%D0%B4%D0%BE%D0%BA%D1%83%D0%BC%D0%B5%D0%BD%D1%82%D0%B0%D1%86%D0%B8%D0%B8.pdf | 398 | 9 | газпромнефть премиум n 5w40 характеристики | DOCUMENT | UNMATCHED |
| https://shop.gazpromneft-sm.ru/catalog/5689/ | 383 | 4 | газпром дизель экстра 10w 40 | LEGACY_NUMERIC | UNMATCHED |
| https://shop.gazpromneft-sm.ru/catalog/16833/ | 377 | 3 | gazpromneft grease lx ep 2 | LEGACY_NUMERIC | UNMATCHED |
| https://shop.gazpromneft-sm.ru/catalog/16004/ | 369 | 4 | газпромнефть дизель ультра 5w30 | LEGACY_NUMERIC | UNMATCHED |
| https://shop.gazpromneft-sm.ru/catalog/15807/ | 364 | 6 | g profi gt 10w 40 | LEGACY_NUMERIC | UNMATCHED |
| https://shop.gazpromneft-sm.ru/catalog/14198/ | 349 | 10 | g-energy synthetic active 5w-30 | LEGACY_NUMERIC | UNMATCHED |
| https://shop.gazpromneft-sm.ru/catalog/16740/ | 348 | 6 | белые масла газпромнефть | LEGACY_NUMERIC | UNMATCHED |
| https://shop.gazpromneft-sm.ru/catalog/16352/ | 335 | 9 | gazpromneft diesel ultra plus 10w-40 | LEGACY_NUMERIC | UNMATCHED |
| https://shop.gazpromneft-sm.ru/catalog/7057/ | 321 | 8 | g-box atf far east | LEGACY_NUMERIC | UNMATCHED |
| https://shop.gazpromneft-sm.ru/catalog/5741/ | 317 | 16 | 253651855 | LEGACY_NUMERIC | UNMATCHED |
| https://shop.gazpromneft-sm.ru/catalog/16167/ | 317 | 3 | g energy f synth 0w 30 | LEGACY_NUMERIC | UNMATCHED |
| https://shop.gazpromneft-sm.ru/catalog/5802/ | 301 | 18 | 2389904078 | LEGACY_NUMERIC | UNMATCHED |
| https://shop.gazpromneft-sm.ru/upload/doc/b64/c2ss28wfzzc0inu38c5eivw2727qm9lt/%20%D0%9F%D0%B0%D1%81%D0%BF%D0%BE%D1%80%D1%82%20%D0%B1%D0%B5%D0%B7%D0%BE%D0%BF%D0%B0%D1%81%D0%BD%D0%BE%D1%81%D1%82%D0%B8.pdf | 299 | 12 | этиленгликоль паспорт безопасности | DOCUMENT | UNMATCHED |
| https://shop.gazpromneft-sm.ru/catalog/16542/ | 299 | 6 | gazpromneft grease synth lx ep 2 | LEGACY_NUMERIC | UNMATCHED |
| https://shop.gazpromneft-sm.ru/catalog/7023/ | 290 | 8 | gazpromneft gl-5 75w-90 | LEGACY_NUMERIC | UNMATCHED |
| https://shop.gazpromneft-sm.ru/catalog/5831/ | 286 | 10 | газпром антифриз 40 | LEGACY_NUMERIC | UNMATCHED |
| https://shop.gazpromneft-sm.ru/catalog/7034/ | 285 | 12 | g-profi gt la 10w-40 | LEGACY_NUMERIC | UNMATCHED |
| https://shop.gazpromneft-sm.ru/catalog/14236/ | 284 | 13 | gazpromneft premium c3 5w-40 | LEGACY_NUMERIC | UNMATCHED |
| https://shop.gazpromneft-sm.ru/catalog/17016/ | 284 | 4 | gazpromneft steelgrease cs2 | LEGACY_NUMERIC | UNMATCHED |
| https://shop.gazpromneft-sm.ru/upload/doc/6d0/bydgx2p5ndbpnjq5b9e4bmljxjcspjk2/%20%D0%9F%D0%B0%D1%81%D0%BF%D0%BE%D1%80%D1%82%20%D0%B1%D0%B5%D0%B7%D0%BE%D0%BF%D0%B0%D1%81%D0%BD%D0%BE%D1%81%D1%82%D0%B8.pdf | 283 | 15 | паспорт безопасности на масло моторное | DOCUMENT | UNMATCHED |
| https://shop.gazpromneft-sm.ru/catalog/14185/ | 271 | 2 | масло газпромнефть 10w30 | LEGACY_NUMERIC | UNMATCHED |
| https://shop.gazpromneft-sm.ru/catalog/5665/ | 264 | 24 | 253140108 | LEGACY_NUMERIC | UNMATCHED |
| https://shop.gazpromneft-sm.ru/catalog/14130/ | 264 | 12 | gazpromneft premium l 10w-40 | LEGACY_NUMERIC | UNMATCHED |
| https://shop.gazpromneft-sm.ru/catalog/17452/ | 261 | 12 | газпром дизель ультра 10w 40 | LEGACY_NUMERIC | UNMATCHED |
| https://shop.gazpromneft-sm.ru/catalog/15544/ | 257 | 6 | g-profi msk 5w-30 | LEGACY_NUMERIC | UNMATCHED |
| https://shop.gazpromneft-sm.ru/catalog/14133/ | 257 | 5 | масло газпромнефть 5w40 синтетика цена | LEGACY_NUMERIC | UNMATCHED |
| https://shop.gazpromneft-sm.ru/catalog/16002/ | 257 | 1 | g energy 10w 40 | LEGACY_NUMERIC | UNMATCHED |
| https://shop.gazpromneft-sm.ru/catalog/17170/ | 247 | 5 | масло газпромнефть 5w40 полусинтетика | LEGACY_NUMERIC | UNMATCHED |
| https://shop.gazpromneft-sm.ru/catalog/7058/ | 239 | 1 | g-box | LEGACY_NUMERIC | UNMATCHED |
| https://shop.gazpromneft-sm.ru/catalog/16377/ | 237 | 9 | g-energy synthetic eco life 0w-20 | LEGACY_NUMERIC | UNMATCHED |
| https://shop.gazpromneft-sm.ru/catalog/16202/ | 235 | 10 | g-energy f synth ec 5w-30 | LEGACY_NUMERIC | UNMATCHED |
| https://shop.gazpromneft-sm.ru/catalog/5785/ | 228 | 7 | gazpromneft diesel premium 5w-40 | LEGACY_NUMERIC | UNMATCHED |
| https://shop.gazpromneft-sm.ru/catalog/16868/ | 227 | 4 | gazpromneft offroad grease cs 2 | LEGACY_NUMERIC | UNMATCHED |
| https://shop.gazpromneft-sm.ru/catalog/5639/ | 226 | 2 | g-energy expert l 10w-40 | LEGACY_NUMERIC | UNMATCHED |
| https://shop.gazpromneft-sm.ru/catalog/5927/ | 218 | 13 | g-energy antifreeze hd 40 | LEGACY_NUMERIC | UNMATCHED |
| https://shop.gazpromneft-sm.ru/catalog/5794/ | 217 | 9 | 2389901368 | LEGACY_NUMERIC | UNMATCHED |
| https://shop.gazpromneft-sm.ru/catalog/16642/ | 213 | 7 | moly ер-2 | LEGACY_NUMERIC | UNMATCHED |
| https://shop.gazpromneft-sm.ru/upload/doc/0ff/zl70d67rwgo034q146ehqnfx7pq1pwss/%20%D0%9F%D0%B0%D1%81%D0%BF%D0%BE%D1%80%D1%82%20%D0%B1%D0%B5%D0%B7%D0%BE%D0%BF%D0%B0%D1%81%D0%BD%D0%BE%D1%81%D1%82%D0%B8.pdf | 209 | 0 | паспорт янос славнефть ру | DOCUMENT | UNMATCHED |
| https://shop.gazpromneft-sm.ru/catalog/16855/ | 207 | 2 | g-special to-4 10w | LEGACY_NUMERIC | UNMATCHED |
| https://shop.gazpromneft-sm.ru/catalog/16215/ | 203 | 6 | g-profi gts 5w-30 | LEGACY_NUMERIC | UNMATCHED |
| https://shop.gazpromneft-sm.ru/auth/ | 200 | 2 | газпромнефть личный кабинет | OTHER_HTML | UNMATCHED |
| https://shop.gazpromneft-sm.ru/catalog/16892/ | 194 | 15 | сож газпромнефть | LEGACY_NUMERIC | UNMATCHED |
| https://shop.gazpromneft-sm.ru/catalog/5763/ | 193 | 1 | игп 18 | LEGACY_NUMERIC | UNMATCHED |
| https://shop.gazpromneft-sm.ru/catalog/16373/ | 187 | 10 | g-energy f synth 0w-40 | LEGACY_NUMERIC | UNMATCHED |
| https://shop.gazpromneft-sm.ru/catalog/15541/ | 176 | 5 | gazpromneft premium a5b5 5w-30 | LEGACY_NUMERIC | UNMATCHED |
| https://shop.gazpromneft-sm.ru/catalog/5886/ | 173 | 3 | масло g energy 5w30 | LEGACY_NUMERIC | UNMATCHED |
| https://shop.gazpromneft-sm.ru/catalog/16904/ | 172 | 0 | gazpromneft gl 4 gl 5 75w 90 | LEGACY_NUMERIC | UNMATCHED |
| https://shop.gazpromneft-sm.ru/catalog/16915/ | 166 | 8 | 2389901231 | LEGACY_NUMERIC | UNMATCHED |
| https://shop.gazpromneft-sm.ru/catalog/16333/ | 166 | 3 | gazpromneft compressor s synth 46 | LEGACY_NUMERIC | UNMATCHED |
| https://shop.gazpromneft-sm.ru/catalog/17009/ | 166 | 2 | gazpromneft grease lts 2 | LEGACY_NUMERIC | UNMATCHED |
| https://shop.gazpromneft-sm.ru/catalog/7003/ | 162 | 4 | м10г2к газпром | LEGACY_NUMERIC | UNMATCHED |
| https://shop.gazpromneft-sm.ru/catalog/14229/ | 158 | 3 | gazpromneft moto 4t 30 | LEGACY_NUMERIC | UNMATCHED |
| https://shop.gazpromneft-sm.ru/catalog/14121/ | 157 | 7 | gazpromneft premium a3 5w-30 | LEGACY_NUMERIC | UNMATCHED |
| https://shop.gazpromneft-sm.ru/catalog/16364/ | 156 | 9 | g-energy synthetic super start 5w-40 | LEGACY_NUMERIC | UNMATCHED |
| https://shop.gazpromneft-sm.ru/catalog/13905/ | 155 | 4 | gazpromneft premium jk 5w-30 | LEGACY_NUMERIC | UNMATCHED |
| https://shop.gazpromneft-sm.ru/catalog/5995/ | 152 | 4 | масло для газовых двигателей газпромнефть | LEGACY_NUMERIC | UNMATCHED |
| https://shop.gazpromneft-sm.ru/catalog/5877/ | 147 | 2 | 253142394 | LEGACY_NUMERIC | UNMATCHED |
| https://shop.gazpromneft-sm.ru/catalog/5853/ | 142 | 7 | тосол газпромнефть | LEGACY_NUMERIC | UNMATCHED |
| https://shop.gazpromneft-sm.ru/catalog/17023/ | 141 | 2 | gazpromneft grease highspeed ер 3 | LEGACY_NUMERIC | UNMATCHED |
| https://shop.gazpromneft-sm.ru/catalog/5994/ | 140 | 6 | масло g-profi cng la 10w-40 | LEGACY_NUMERIC | UNMATCHED |
| https://shop.gazpromneft-sm.ru/catalog/16387/ | 139 | 5 | 2389900144 | LEGACY_NUMERIC | UNMATCHED |
| https://shop.gazpromneft-sm.ru/catalog/5863/ | 139 | 4 | nord 32 | LEGACY_NUMERIC | UNMATCHED |
| https://shop.gazpromneft-sm.ru/catalog/13987/ | 138 | 3 | gazpromneft hto 32 | LEGACY_NUMERIC | UNMATCHED |
| https://shop.gazpromneft-sm.ru/catalog/16454/ | 138 | 0 | gazpromneft chain oil | LEGACY_NUMERIC | UNMATCHED |
| https://shop.gazpromneft-sm.ru/catalog/7044/ | 135 | 4 | g-truck gl-5 80w-90 | LEGACY_NUMERIC | UNMATCHED |
| https://shop.gazpromneft-sm.ru/catalog/16709/ | 134 | 4 | g-special power hvlp-32 | LEGACY_NUMERIC | UNMATCHED |
| https://shop.gazpromneft-sm.ru/catalog/16812/ | 133 | 0 | м6з/10в | LEGACY_NUMERIC | UNMATCHED |

</details>

## SEO eligibility

Derived from existing latest saved status/canonical/robots/indexable/final URL/observed aliases only: non-200, noindex or canonical to other identity → NOT_ELIGIBLE; missing evidence/WAF/auth → UNCERTAIN; sufficiently observed HTTP200/indexable/self canonical → ELIGIBLE. No current live indexability assertion. NOT_ELIGIBLE excluded from main saved SEO TOP on SEO Actions, Dashboard and Page360; historical records preserved and available via ALL eligibility.

Filter/facet evidence and saved actions shown separately on `/unmatched`. Two matched facets have existing positive saved signals; four unmatched query/filter URLs remain UNCERTAIN. The facet with three current actions is ELIGIBLE on its saved snapshot; it was not automatically excluded solely because it has `/filter/` in the path. Modern contentSignals are still missing.

| Filter/query URL | Impressions | Clicks | Position | Page type | Eligibility | Evidence |
| --- | --- | --- | --- | --- | --- | --- |
| https://shop.gazpromneft-sm.ru/catalog/filter/brand-is-0000000001/packing-is-2f0e6106-cad8-11e7-80e3-0050569eedf6/apply/ | 5284 | 1336 | 4.64 | category | ELIGIBLE | HTTP 200, indexable, нет другого canonical |
| https://shop.gazpromneft-sm.ru/catalog/filter/product_type-is-3543f9e51c263978dd8aab4b1773333c/apply/ | 2231 | 84 | 8.44 | category | ELIGIBLE | HTTP 200, indexable, нет другого canonical |
| https://shop.gazpromneft-sm.ru/catalog/filter/packing-is-3b381d24-cad8-11e7-80e3-0050569eedf6/apply/ | 87 | 18 | 5.12 | unknown | UNCERTAIN | Нет снимка страницы |
| https://shop.gazpromneft-sm.ru/catalog/gazpromneft-super-10w-40-kanistra-20-l/?ybaip=1 | 75 | 1 | 2.98 | unknown | UNCERTAIN | Нет снимка страницы |
| https://shop.gazpromneft-sm.ru/catalog/gazpromneft-hydraulic-hvlp-32-kanistra-20-l/?ybaip=1 | 18 | 0 | 8.49 | unknown | UNCERTAIN | Нет снимка страницы |
| https://shop.gazpromneft-sm.ru/catalog/?CATALOG_FILTER_29_4088798008=Y&set_filter=Y&CATALOG_FILTER_30_4196041389=Y | 10 | 1 | 14.44 | unknown | UNCERTAIN | Нет снимка страницы |

Existing Page360 already exposes status/title/description/H1/H2/canonical/robots/structured-data snapshot and modern signals where collected. No extra extraction engine added.

## Commerce recalculation

Two real authorized existing-engine recalculations for 09.09–06.10.2026: idempotent PASS. Existing formulas/thresholds/status history unchanged. RULE11 title updated to «Трафик без зафиксированной онлайн-продажи». B2B sales outside the online shop are not inferred.

| Rule | Count |
| --- | --- |
| RULE_11 | 14 |
| RULE_12 | 0 |
| RULE_13 | 0 |
| RULE_14 | 0 |
| RULE_15 | 0 |
| RULE_16 | 3 |
| RULE_17 | 0 |
| RULE_18 | 0 |
| RULE_19 | 0 |
| RULE_20 | 0 |
| RULE_21 | 0 |
| RULE_22 | 0 |

RULE12/14/22 depend on kg stock/Days of Stock, currently unknown. Other zero rule counts are genuine existing threshold/coverage results; no target count or lowered scoring threshold used.

## SEO recalculation

Two real M3 recalculations on existing snapshots: 01.06–31.08.2026, 92 days/3 monthly observations, minQueryImpressions=100 and minDateCoverage=75% unchanged. This is a baseline recalculation, not a post-production-rescan result. 5 actions, all HIGH: DESCRIPTION=3, TITLE=1, H1=1; VERY_HIGH=0, MEDIUM=0, LOW=0. Modern coverage 0/621; rescanned production Pages=0. Missing modern text/link/schema signals do not become false negative findings. Dashboard now reads its SEO section from the available default Search M3 period and labels that period separately from Commerce current28.

## Final Growth/Risk

Commerce Growth=14; Commerce Risk=3; SEO Actions=5; DATA_QUALITY rule signals=0. Source/data blockers below remain despite zero DQ rule count. TOP20 has only 17 actual Commerce records (14 unique Pages); no filler, and DATA_QUALITY excluded.

| Page | Rule | Score | Visits | Revenue | Kg | StockKg | Days of Stock | Main evidence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| https://shop.gazpromneft-sm.ru/catalog/gazpromneft-diesel-ultra-plus-10w-40-bochka-205-l/ | RULE_16 | 58.33 | 78 | 0 | 0 | unknown | unknown | Revenue/kg decrease; visits stable vs previous28 |
| https://shop.gazpromneft-sm.ru/catalog/gazpromneft-hydraulic-hlp-46-kanistra-20-l/ | RULE_11 | 58.33 | 97 | 0 | 0 | unknown | unknown | Confirmed 28-day online zero, visits ≥50 |
| https://shop.gazpromneft-sm.ru/catalog/g-profi-gt-10w-40-kanistra-20-l/ | RULE_11 | 58.33 | 82 | 0 | 0 | unknown | unknown | Confirmed 28-day online zero, visits ≥50 |
| https://shop.gazpromneft-sm.ru/catalog/g-profi-gt-10w-40-kanistra-20-l/ | RULE_16 | 58.33 | 82 | 0 | 0 | unknown | unknown | Revenue/kg decrease; visits stable vs previous28 |
| https://shop.gazpromneft-sm.ru/catalog/gazpromneft-diesel-ultra-plus-10w-40-bochka-205-l/ | RULE_11 | 58.33 | 78 | 0 | 0 | unknown | unknown | Confirmed 28-day online zero, visits ≥50 |
| https://shop.gazpromneft-sm.ru/catalog/g-energy-synthetic-active-5w-30-kanistra-4-l/ | RULE_11 | 58.33 | 69 | 0 | 0 | unknown | unknown | Confirmed 28-day online zero, visits ≥50 |
| https://shop.gazpromneft-sm.ru/catalog/gazpromneft-standard-10w-40-bochka-205-l/ | RULE_11 | 54.65 | 55 | 0 | 0 | unknown | unknown | Confirmed 28-day online zero, visits ≥50 |
| https://shop.gazpromneft-sm.ru/catalog/gazpromneft-standard-10w-40-bochka-205-l/ | RULE_16 | 54.65 | 55 | 0 | 0 | unknown | unknown | Revenue/kg decrease; visits stable vs previous28 |
| https://shop.gazpromneft-sm.ru/catalog/g-energy-synthetic-active-5w-40-bochka-205-l/ | RULE_11 | 52.71 | 50 | 0 | 0 | unknown | unknown | Confirmed 28-day online zero, visits ≥50 |
| https://shop.gazpromneft-sm.ru/catalog/g-energy-synthetic-super-start-5w-40-kanistra-4-l/ | RULE_11 | 33.33 | 64 | 0 | 0 | unknown | unknown | Confirmed 28-day online zero, visits ≥50 |
| https://shop.gazpromneft-sm.ru/catalog/gazpromneft-vmgz-kanistra-5-l/ | RULE_11 | 33.33 | 236 | 0 | 0 | unknown | unknown | Confirmed 28-day online zero, visits ≥50 |
| https://shop.gazpromneft-sm.ru/catalog/gazpromneft-diesel-premium-5w-40-kanistra-50-l/ | RULE_11 | 33.33 | 65 | 0 | 0 | unknown | unknown | Confirmed 28-day online zero, visits ≥50 |
| https://shop.gazpromneft-sm.ru/catalog/g-energy-synthetic-super-start-5w-30-kanistra-4-l/ | RULE_11 | 33.33 | 220 | 0 | 0 | unknown | unknown | Confirmed 28-day online zero, visits ≥50 |
| https://shop.gazpromneft-sm.ru/catalog/g-profi-msi-10w-40-kanistra-20-l/ | RULE_11 | 33.33 | 131 | 0 | 0 | unknown | unknown | Confirmed 28-day online zero, visits ≥50 |
| https://shop.gazpromneft-sm.ru/catalog/gazpromneft-premium-c3-5w-30-bochka-50-l/ | RULE_11 | 31.59 | 60 | 0 | 0 | unknown | unknown | Confirmed 28-day online zero, visits ≥50 |
| https://shop.gazpromneft-sm.ru/catalog/g-energy-f-synth-0w-40-bochka-205-l/ | RULE_11 | 30.81 | 58 | 0 | 0 | unknown | unknown | Confirmed 28-day online zero, visits ≥50 |
| https://shop.gazpromneft-sm.ru/catalog/g-energy-f-synth-c2-c3-5w-30-kanistra-4-l/ | RULE_11 | 28.10 | 51 | 0 | 0 | unknown | unknown | Confirmed 28-day online zero, visits ≥50 |

TOP20 SEO contains the 5 actual current actions:

| Page | Priority | Action | Impressions | CTR % | Position | Intent | Eligibility |
| --- | --- | --- | --- | --- | --- | --- | --- |
| https://shop.gazpromneft-sm.ru/about/contacts/ | HIGH | Добавить метаописание страницы | 1049 | 2.29 | 5.91 | B2B share 0; transactional share 0 | ELIGIBLE |
| https://shop.gazpromneft-sm.ru/catalog/ | HIGH | Добавить метаописание страницы | 13058 | 14.91 | 6.86 | B2B share 0; transactional share 0 | ELIGIBLE |
| https://shop.gazpromneft-sm.ru/catalog/filter/brand-is-0000000001/packing-is-2f0e6106-cad8-11e7-80e3-0050569eedf6/apply/ | HIGH | Усилить заголовок продуктом, фасовкой и коммерческим предложением | 3917 | 27.62 | 4.29 | B2B share 0; transactional share 0 | ELIGIBLE |
| https://shop.gazpromneft-sm.ru/catalog/filter/brand-is-0000000001/packing-is-2f0e6106-cad8-11e7-80e3-0050569eedf6/apply/ | HIGH | Добавить метаописание страницы | 3917 | 27.62 | 4.29 | B2B share 0; transactional share 0 | ELIGIBLE |
| https://shop.gazpromneft-sm.ru/catalog/filter/brand-is-0000000001/packing-is-2f0e6106-cad8-11e7-80e3-0050569eedf6/apply/ | HIGH | Уточнить основной заголовок | 3917 | 27.62 | 4.29 | B2B share 0; transactional share 0 | ELIGIBLE |

## Data Quality

| Metric | Actual |
| --- | --- |
| Unknown SKU (unique across STOCK/PRICES/SALES) | 248 |
| Unknown SKU: STOCK / PRICES / SALES | 176 / 65 / 9 |
| Missing kgPerUnit | 1909 |
| Stale sales / prices / stock Pages | 0 / 0 / 0 |
| Stale price / stock source records | 0 / 0 |
| Unmatched Search URLs | 542 |
| Pages requiring modern rescan | 621 |

Freshness counts refer to current available source snapshots and confirmed transactional coverage on 07.10.2026. Zero stale count does not prove complete stock source coverage: only 451 Pages have fully aggregateable stock units; kg coverage remains zero. Source rejected unknown SKU remain excluded, not coerced to a Page or zero.

## Performance regression

Sequential warm second GETs, optimized standalone production-local server; no concurrent build/worker/fixture writes during measurement. Stabilization1 baseline vs activated final:

| Route | Stabilization1 sec | Activation sec | Change % | HTTP |
| --- | --- | --- | --- | --- |
| / | 5.03 | 6.03 | 19.91 | 200 |
| /scanner | 0.32 | 0.28 | -14.25 | 200 |
| /seo-actions | 1.92 | 1.89 | -1.19 | 200 |
| /pages/cmuvqpg8t000120ucrcsttj6h?searchPeriod=M3 | 0.52 | 0.52 | -0.78 | 200 |
| /webmaster?period=M3 | 1.58 | 1.49 | -5.48 | 200 |

All five warm routes below 10 sec. Scanner/SEO/Page360/Webmaster retained or improved prior timings. Dashboard 5.03→6.03 sec (+19.9%); activated transactional logical-zero processing and visible saved Growth/SEO results increase work/output. Desired <4 sec Dashboard target remains unmet; no new caches/rollups introduced. This is explicitly a remaining performance limitation, not an unconditional “no regression” claim.

## Remaining blockers

**NOT READY FOR AI**, three reasons:

1. kgPerUnit coverage 0%; stockKg/Days of Stock and inventory risk signals cannot be verified on production data. Need user-supplied coefficients from authoritative business data.
2. Modern contentSignals 0/621; SEO content/link/schema actions need explicit manual targeted Scanner batches, then a fresh M3 recalculation. Production crawl was deliberately not run without user UI action.
3. 542/1163 Search URLs remain unmatched (46.60%, mostly 449 legacy numeric and 72 documents). Redirect/dead outcomes require real permitted reading; match quality cannot be improved by guesses.

Next authorized human workflow: supply kgPerUnit mapping; launch Search TOP100 manually through unified Scanner and operate the existing worker; run unmatched HTML TOP100 manually; recalculate Commerce current28 and SEO M3; compare saved diagnostics. WAF/challenge remains a genuine possible blocker; stop and use existing import paths rather than bypass it. Full Webmaster queue still optional and its uncertain POST not retried. No Sprint4 started.
