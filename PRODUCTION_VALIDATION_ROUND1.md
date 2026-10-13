# Production Validation Round 1 — 08.10.2026

## Status

Validation выполнена на уже накопленных production данных. Существующие SEO M3 и Commerce current recalculation выполнены. Новые scans/export/sync не создавались. Код приложения, Scanner UX, правила, thresholds, sales mode/coverage не менялись; Sprint 4/AI не начаты. Отчёт не объявляется общим PASS: выявлены недостаточное Commerce coverage, ограничения SEO evidence и существенное замедление UI.
Снимок: 08.10.2026, 08:38:35 MSK. Перед фиксацией активных Scan jobs не было. Полные source records в семи моделях сохранились идентичными до/после recalculation: row counts + server-side checksum. Изменены только обычные производные Opportunity/SEO Action records и lastRun существующих engines.
Артефакты: [JSON состояния](test-results/production-validation-round1.json), [полный список новых ScanPage](test-results/production-validation-round1-scanpages.csv), [performance measurements](test-results/production-validation-performance.json). Аналитические scripts находятся в test-results и не подключены к приложению.

### TOP-10 новых находок

1. Matching: 621→998 raw URLs; 53,40→85,81%; уникальных Page 710.
2. 386 подтверждённых redirect aliases закрыли legacy Search URL; raw source URL сохраняется отдельно от final Page.
3. Modern content: 0→653/710 (91,97%); ещё 57 Page без modern evidence.
4. Единственная новая SEO Action — INTERNAL_LINKING для diesel-premium 20 л: 256 M3 impressions, position 8,05, CTR 0%; confidence LOW.
5. Только 4 Page имеют достаточное M3 query evidence; массовое появление modern content само по себе не расширило рекомендации до сотен Page.
6. 642 Search-matched Page со SKU mapping имеют тип category; среди modern Page product=0. Product-specific schema rule поэтому не получает типовую базу для этих карточек. Типы не исправлялись.
7. Product/Offer schema в текущих engine snapshots: 0/0; это отсутствие наблюдаемого evidence, а не доказательство отсутствия разметки на сайте.
8. 11 ранее matched URLs стали unmatched: у всех 0 успешных ScanPage; это требует различать потерю старой привязки и реальное удаление страницы.
9. Commerce 14/3→0/0: текущий период покрыт продажами лишь 27/28 дней. 1909 SKU без kgPerUnit, stockKg/Days of Stock по-прежнему unknown.
10. Все пять UI routes замедлились: dashboard 6,03→15,74 s; остальные warm ratios 2,05–2,66×. Требование отсутствия существенной деградации не подтверждено.

## Baseline

Использован последний зафиксированный Data Activation, без повторного расчёта baseline. Файл data-activation-results.json: Scans 11, ScanPages 355; временная граница — 07.10.2026 16:47:35 MSK (13:47:35 UTC). До границы действительно 11 scans / 355 snapshots; это проверка принадлежности новых записей, а не новый baseline.
| Metric | Before | After | Delta |
| --- | --- | --- | --- |
| Search URLs | 1163 | 1163 | 0 |
| Matched Search URLs | 621 | 998 | 377 |
| Matched Search Pages | 621 | 710 | 89 |
| Unmatched URLs | 542 | 165 | -377 |
| Matched URL rate | 53,40% | 85,81% | 32,42 п.п. |
| Modern contentSignals | 0 | 653 | 653 |
| SEO Actions | 5 | 6 | 1 |
| HIGH+VERY_HIGH | 5 | 6 | 1 |
| Commerce Growth | 14 | 0 | -14 |
| Commerce Risk | 3 | 0 | -3 |
| Pages with stockKg | 0 | 0 | 0 |
| Pages with Days of Stock | 0 | 0 | 0 |


## New scans since baseline

| Metric | Before | Now | New |
| --- | --- | --- | --- |
| Scans | 11 | 30 | 19 |
| ScanPages | 355 | 1071 | 716 |

| Count | Value |
| --- | --- |
| successful | 691 |
| failed | 23 |
| wafAuth | 2 |
| redirected | 386 |
| http404 | 19 |
| other | 0 |

Successful/failed/WAF-auth/other — взаимоисключающие outcomes. Redirected и HTTP 404 — дополнительные срезы и не складываются с outcomes. 19 terminal 404 snapshots включают исторические WAF-classified 404; dead признаётся только по обычному ERROR/404 без WAF/auth. Физический status 404 не автоматически означает current dead.
Для каждого из 716 новых ScanPage в [CSV](test-results/production-validation-round1-scanpages.csv) есть source URL, scan date (UTC ISO), outcome/source, initial HTTP и terminal status, final URL, pageId, observed redirect/status, modern signals/internalLinks и eligibility/reason. Числа относятся к snapshot, а не уникальным Page.
| Scan | Mode | Status | Started UTC | Finished UTC |
| --- | --- | --- | --- | --- |
| cmuyiwzmi002e20qkovrq6sp4 | HTTP | INTERRUPTED | 2026-10-07T19:51:42.749Z | 2026-10-07T20:01:03.317Z |
| cmuykxbu2002h20qkk2ynhgw6 | HTTP | COMPLETED_WITH_ERRORS | 2026-10-07T20:47:57.956Z | 2026-10-07T20:55:37.195Z |
| cmuyl958j002k20qkwpztqdbw | HTTP | FAILED | 2026-10-07T20:57:09.850Z | 2026-10-08T03:48:25.245Z |
| cmuyzz9yx002n20qknwpksmn6 | HTTP | COMPLETED_WITH_ERRORS | 2026-10-08T03:49:22.833Z | 2026-10-08T03:57:29.785Z |
| cmuy8v33b000220gkmv96xd2i | HTTP | COMPLETED | 2026-10-07T15:10:18.458Z | 2026-10-07T15:10:34.052Z |
| cmuy6hbxr000220ywtqfnw8vs | HTTP | STOPPED | 2026-10-07T14:07:10.521Z | 2026-10-07T14:10:51.075Z |
| cmuy8wv61000520gkgrs638kn | HTTP | COMPLETED_WITH_ERRORS | 2026-10-07T15:11:41.547Z | 2026-10-07T15:20:40.950Z |
| cmuy99pra000820gk8ew67rby | HTTP | FAILED | 2026-10-07T15:28:33.568Z | 2026-10-07T15:29:21.215Z |
| cmuya0vml000220joipxvn44k | HTTP | COMPLETED_WITH_ERRORS | 2026-10-07T15:42:47.995Z | 2026-10-07T15:51:42.605Z |
| cmuyar7rh000520jozke2hmas | HTTP | FAILED | 2026-10-07T16:03:17.057Z | 2026-10-07T16:08:00.787Z |
| cmuybsne0000220qk14rcrock | HTTP | COMPLETED_WITH_ERRORS | 2026-10-07T16:32:23.117Z | 2026-10-07T16:47:32.789Z |
| cmuycd4fy000520qk0lwl8ihf | HTTP | COMPLETED_WITH_ERRORS | 2026-10-07T16:48:18.553Z | 2026-10-07T16:57:32.790Z |
| cmuyb37bs000820jo83p87x3o | HTTP | FAILED | 2026-10-07T16:12:36.461Z | 2026-10-07T16:13:42.579Z |
| cmuyd472i000820qktd6a0ou6 | HTTP | COMPLETED_WITH_ERRORS | 2026-10-07T17:09:21.941Z | 2026-10-07T17:19:32.067Z |
| cmuyf920w000b20qk6pwbm32b | HTTP | COMPLETED_WITH_ERRORS | 2026-10-07T18:09:07.494Z | 2026-10-07T18:18:43.156Z |
| cmuyfnd99000e20qkkwxje7kf | HTTP | COMPLETED_WITH_ERRORS | 2026-10-07T18:20:15.701Z | 2026-10-07T18:29:09.882Z |
| cmuyhgk02000h20qkohgwmxf7 | HTTP | COMPLETED_WITH_ERRORS | 2026-10-07T19:10:57.219Z | 2026-10-07T19:17:18.625Z |
| cmuyhvbi1000k20qkzs7t9mrw | HTTP | COMPLETED_WITH_ERRORS | 2026-10-07T19:22:25.444Z | 2026-10-07T19:29:52.365Z |
| cmuyijmny002b20qkl6e67fgi | HTTP | COMPLETED_WITH_ERRORS | 2026-10-07T19:41:19.850Z | 2026-10-07T19:48:59.056Z |


## Redirect outcomes

| Metric | Value |
| --- | --- |
| Observed unique source→final redirects | 386 |
| Verified working aliases | 386 |
| Search physical rows currently linked by observed alias | 35784 |
| Metrika rows currently linked by observed alias | 0 |
| Unique ordinary 404 observed since baseline | 17 |
| Current unmatched HISTORICAL_DEAD URLs | 16 |
| Legacy unmatched including dead | 64 |
| Legacy HISTORICAL_DEAD | 7 |
| Legacy still unresolved, excluding dead | 57 |

386 source URLs были unmatched в baseline и теперь matched по наблюдаемому redirect. Это новые работающие связи относительно baseline. Точный момент первого добавления строки alias и точное число физически обновлённых rows не восстановить без полного pre-scan alias/row snapshot; 35784 — текущие связанные physical rows, не выдуманный audit UPDATE count. Метрика 0 означает отсутствие соответствующих связанных наблюдений, не сбой rematch.
17 URL имеют обычный observed 404; 16 входят в current unmatched/dead register. Один URL всё ещё имеет historical matching link. Такой 404/историческая привязка не переписывается во время validation. 165 current unmatched = 16 dead + 149 остальных, включая документы.
| Source URL | Final URL | HTTP redirect / terminal | Alias | Search impressions ALL | Status |
| --- | --- | --- | --- | --- | --- |
| https://shop.gazpromneft-sm.ru/catalog/14134/ | https://shop.gazpromneft-sm.ru/catalog/gazpromneft-premium-n-5w-40-kanistra-4-l/ | 301 / 200 | yes | 4544 | RESOLVED_REDIRECT |
| https://shop.gazpromneft-sm.ru/catalog/5786/ | https://shop.gazpromneft-sm.ru/catalog/gazpromneft-diesel-premium-10w-40-kanistra-4-l/ | 301 / 200 | yes | 2476 | RESOLVED_REDIRECT |
| https://shop.gazpromneft-sm.ru/catalog/17282/ | https://shop.gazpromneft-sm.ru/catalog/gazpromneft-hydraulic-hvlp-32-bochka-205-l/ | 301 / 200 | yes | 1981 | RESOLVED_REDIRECT |
| https://shop.gazpromneft-sm.ru/catalog/14131/ | https://shop.gazpromneft-sm.ru/catalog/gazpromneft-premium-l-10w-40-kanistra-5-l/ | 301 / 200 | yes | 1656 | RESOLVED_REDIRECT |
| https://shop.gazpromneft-sm.ru/catalog/14245/ | https://shop.gazpromneft-sm.ru/catalog/gazpromneft-moto-4t-10w-40-kanistra-1-l/ | 301 / 200 | yes | 1372 | RESOLVED_REDIRECT |
| https://shop.gazpromneft-sm.ru/catalog/5699/ | https://shop.gazpromneft-sm.ru/catalog/gazpromneft-super-10w-40-kanistra-4-l/ | 301 / 200 | yes | 1170 | RESOLVED_REDIRECT |
| https://shop.gazpromneft-sm.ru/catalog/5889/ | https://shop.gazpromneft-sm.ru/catalog/g-energy-synthetic-active-5w-40-kanistra-4-l/ | 301 / 200 | yes | 1156 | RESOLVED_REDIRECT |
| https://shop.gazpromneft-sm.ru/catalog/16174/ | https://shop.gazpromneft-sm.ru/catalog/g-energy-f-synth-5w-40-kanistra-4-l/ | 301 / 200 | yes | 1124 | RESOLVED_REDIRECT |
| https://shop.gazpromneft-sm.ru/catalog/14136/ | https://shop.gazpromneft-sm.ru/catalog/gazpromneft-premium-n-5w-40-bochka-205-l/ | 301 / 200 | yes | 1098 | RESOLVED_REDIRECT |
| https://shop.gazpromneft-sm.ru/catalog/16876/ | https://shop.gazpromneft-sm.ru/catalog/g-special-utto-10w-30-kanistra-20-l/ | 301 / 200 | yes | 1006 | RESOLVED_REDIRECT |
| https://shop.gazpromneft-sm.ru/catalog/5747/ | https://shop.gazpromneft-sm.ru/catalog/gazpromneft-gl-4-75w-90-kanistra-4-l/ | 301 / 200 | yes | 981 | RESOLVED_REDIRECT |
| https://shop.gazpromneft-sm.ru/catalog/5940/ | https://shop.gazpromneft-sm.ru/catalog/g-energy-f-synth-5w-30-kanistra-4-l/ | 301 / 200 | yes | 957 | RESOLVED_REDIRECT |
| https://shop.gazpromneft-sm.ru/catalog/5675/ | https://shop.gazpromneft-sm.ru/catalog/g-profi-msi-plus-15w-40-bochka-205-l/ | 301 / 200 | yes | 953 | RESOLVED_REDIRECT |
| https://shop.gazpromneft-sm.ru/catalog/14111/ | https://shop.gazpromneft-sm.ru/catalog/g-energy-far-east-0w-20-kanistra-1-l/ | 301 / 200 | yes | 866 | RESOLVED_REDIRECT |
| https://shop.gazpromneft-sm.ru/catalog/7030/ | https://shop.gazpromneft-sm.ru/catalog/g-profi-msi-10w-40-kanistra-20-l/ | 301 / 200 | yes | 849 | RESOLVED_REDIRECT |
| https://shop.gazpromneft-sm.ru/catalog/7006/ | https://shop.gazpromneft-sm.ru/catalog/gazpromneft-diesel-premium-15w-40-kanistra-20-l/ | 301 / 200 | yes | 730 | RESOLVED_REDIRECT |
| https://shop.gazpromneft-sm.ru/catalog/14230/ | https://shop.gazpromneft-sm.ru/catalog/gazpromneft-moto-2t-kanistra-4-l/ | 301 / 200 | yes | 728 | RESOLVED_REDIRECT |
| https://shop.gazpromneft-sm.ru/catalog/5740/ | https://shop.gazpromneft-sm.ru/catalog/gazpromneft-atf-dx-iii-kanistra-1-l/ | 301 / 200 | yes | 723 | RESOLVED_REDIRECT |
| https://shop.gazpromneft-sm.ru/catalog/14213/ | https://shop.gazpromneft-sm.ru/catalog/gazpromneft-moto-4t-20w-50-kanistra-4-l/ | 301 / 200 | yes | 712 | RESOLVED_REDIRECT |
| https://shop.gazpromneft-sm.ru/catalog/5787/ | https://shop.gazpromneft-sm.ru/catalog/gazpromneft-gl-5-80w-90-kanistra-1-l/ | 301 / 200 | yes | 659 | RESOLVED_REDIRECT |


## Matching before/after

Matched: 621/1163→998/1163. Unmatched: 542→165. Rate: 53,40%→85,81%. Current matched URLs 998 != unique Page 710: aliases сходятся на одной конечной Page, denominator не подменён.
| Transition | URLs |
| --- | --- |
| Previously unmatched resolved by redirect alias | 386 |
| Previously unmatched resolved by newly scanned Page | 2 |
| Resolved without new target/redirect evidence (existing alias) | 0 |
| Previously matched now unmatched | 11 |
| Current dead within unmatched | 16 |
| Still unmatched other than dead | 149 |

Gross gain 388 minus 11 lost links = net +377 matched URLs. Lost links не объявляются dead только из-за отсутствия успешного snapshot.
| Previously matched URL | Latest terminal status | Successful snapshots | Current active |
| --- | --- | --- | --- |
| https://shop.gazpromneft-sm.ru/catalog/gazpromneft-cutfluid-al-kanistra-20-l/ | 502 | 0 | true |
| https://shop.gazpromneft-sm.ru/catalog/gazpromneft-turbine-oil-f-synth-ep-68-bochka-205-l/ | unknown | 0 | true |
| https://shop.gazpromneft-sm.ru/catalog/gazpromneft-romil-220-bochka-205-l/ | unknown | 0 | true |
| https://shop.gazpromneft-sm.ru/catalog/g-profi-cng-la-10w-40-kanistra-20-l/ | unknown | 0 | true |
| https://shop.gazpromneft-sm.ru/catalog/gazpromneft-atf-dx-iii-standard-bochka-205-l/ | unknown | 0 | true |
| https://shop.gazpromneft-sm.ru/catalog/g-energy-synthetic-active-5w-40-kanistra-20-l/ | 404 | 0 | true |
| https://shop.gazpromneft-sm.ru/catalog/g-box-expert-atf-dx-iii-bochka-205-l/ | unknown | 0 | true |
| https://shop.gazpromneft-sm.ru/catalog/g-energy-antifreeze-red-40-kanistra-5-kg/ | unknown | 0 | true |
| https://shop.gazpromneft-sm.ru/catalog/gazpromneft-atf-dx-iii-standard-kanistra-20-l/ | unknown | 0 | true |
| https://shop.gazpromneft-sm.ru/catalog/gazpromneft-refrigerator-pao-68-fg-kub-1-000-l/ | 404 | 0 | true |
| https://shop.gazpromneft-sm.ru/catalog/gazpromneft-romil-100-bochka-205-l/ | unknown | 0 | true |

Raw Search comparison with saved activation URL aggregates: {"baselineUrlCount":1163,"currentUrlCount":1163,"missingRawUrls":0,"changedImpressionsClicksPosition":64,"periodEqual":true,"changedImpressions":0,"changedClicks":0,"maxPositionFloatDelta":3.552713678800501e-15,"changedPositionBeyond1e9":0,"sample14134":{"rows":1962,"rawUrlAndMetricsPreserved":true}}. Сохранение исходных URL/impressions/clicks проверяется отдельно от matching. Разница weighted position на уровне floating-point суммирования не доказывает изменение source avgPosition. Полные source records до/после этого Round идентичны; sample /catalog/14134/ отдельно сравнивается с более ранним raw snapshot.

## Modern content coverage

Before 0/621; after 653/710 (91,97%). Требуют modern rescan 57, безопасных eligible/uncertain preview candidates 53; это список для пользователя, новых запусков не было.
| Type | Modern Search-matched Page |
| --- | --- |
| product | 0 |
| category | 647 |
| homepage | 1 |
| informational | 3 |
| filter/facet | 2 |
| other | 0 |

Типы — фактическая классификация в БД, не ручная интерпретация названий товаров. All matched types: {"category":660,"informational":3,"product":46,"homepage":1}. 642 category Pages имеют SKU mapping; назначение product-specific rules для них ограничено текущим типом.
| TOP missing modern Page | ALL impressions | Type | Eligibility | Reason |
| --- | --- | --- | --- | --- |
| https://shop.gazpromneft-sm.ru/catalog/16137/ | 652 | category | NOT_ELIGIBLE | HTTP 404 |
| https://shop.gazpromneft-sm.ru/catalog/gazpromneft-cutfluid-universal-bochka-205-l/ | 488 | category | NOT_ELIGIBLE | HTTP 502 |
| https://shop.gazpromneft-sm.ru/catalog/g-energy-synthetic-active-5w-30-bochka-205-l/ | 68 | category | NOT_ELIGIBLE | HTTP 502 |
| https://shop.gazpromneft-sm.ru/catalog/gazpromneft-hydraulic-standard-hvlp-46-bochka-205-l/ | 13 | category | ELIGIBLE | HTTP 200, indexable, нет другого canonical |
| https://shop.gazpromneft-sm.ru/catalog/gazpromneft-marka-a-kanistra-20-l/ | 13 | product | UNCERTAIN | Нет снимка страницы |
| https://shop.gazpromneft-sm.ru/catalog/gazpromneft-pm-150-bochka-205-l/ | 13 | product | UNCERTAIN | Нет снимка страницы |
| https://shop.gazpromneft-sm.ru/catalog/gazpromneft-cutoil-20-kanistra-20-l/ | 13 | product | UNCERTAIN | Нет снимка страницы |
| https://shop.gazpromneft-sm.ru/catalog/igp-38-bochka-205-l/ | 13 | product | UNCERTAIN | Нет снимка страницы |
| https://shop.gazpromneft-sm.ru/catalog/g-energy-synthetic-super-start-5w-40-bochka-205-l/ | 12 | product | UNCERTAIN | Нет снимка страницы |
| https://shop.gazpromneft-sm.ru/catalog/g-energy-antifreeze-red-40-bochka-220-kg/ | 12 | product | UNCERTAIN | Нет снимка страницы |
| https://shop.gazpromneft-sm.ru/catalog/gazpromneft-white-oil-10-t-kub-1-000-l/ | 12 | product | UNCERTAIN | Нет снимка страницы |
| https://shop.gazpromneft-sm.ru/catalog/g-box-gl-4-gl-5-75w-90-kanistra-4-l/ | 12 | product | UNCERTAIN | Нет снимка страницы |
| https://shop.gazpromneft-sm.ru/catalog/g-profi-msi-10w-40-bochka-50-l/ | 12 | category | ELIGIBLE | HTTP 200, indexable, нет другого canonical |
| https://shop.gazpromneft-sm.ru/catalog/g-energy-f-synth-0w-30-kanistra-1-l/ | 12 | product | UNCERTAIN | Нет снимка страницы |
| https://shop.gazpromneft-sm.ru/catalog/gazpromneft-super-10w-30-kanistra-5-l/ | 12 | product | UNCERTAIN | Нет снимка страницы |
| https://shop.gazpromneft-sm.ru/catalog/g-energy-antifreeze-40-pro-g11-bochka-50-kg/ | 12 | product | UNCERTAIN | Нет снимка страницы |
| https://shop.gazpromneft-sm.ru/catalog/g-profi-msi-10w-40-kanistra-5-l/ | 12 | product | UNCERTAIN | Нет снимка страницы |
| https://shop.gazpromneft-sm.ru/catalog/g-profi-msk-15w-40-bochka-205-l/ | 12 | product | UNCERTAIN | Нет снимка страницы |
| https://shop.gazpromneft-sm.ru/catalog/gazpromneft-mgd-20m-bochka-205-l/ | 12 | product | UNCERTAIN | Нет снимка страницы |
| https://shop.gazpromneft-sm.ru/catalog/g-energy-antifreeze-40-pro-g11-bochka-220-kg/ | 11 | product | UNCERTAIN | Нет снимка страницы |


## SEO before/after

Обычный существующий calculateSeoActions(M3), период 2026-06-01–2026-08-31 (тот же 01.06–31.08.2026). Stored и visible = 6/6, NOT_ELIGIBLE exclusions 0. Thresholds/dictionaries не менялись.
| Priority | Before | After |
| --- | --- | --- |
| VERY_HIGH | 0 | 0 |
| HIGH | 5 | 6 |
| MEDIUM | 0 | 0 |
| LOW | 0 | 0 |

| Category | Before | After |
| --- | --- | --- |
| TITLE | 1 | 1 |
| DESCRIPTION | 3 | 3 |
| H1 | 1 | 1 |
| FIRST_SCREEN | 0 | 0 |
| CONTENT | 0 | 0 |
| APPLICATION | 0 | 0 |
| SPECIFICATION | 0 | 0 |
| PACKAGING | 0 | 0 |
| INTERNAL_LINKING | 0 | 1 |
| STRUCTURED_DATA | 0 | 0 |
| CANNIBALIZATION | 0 | 0 |
| CONTENT_GAP | 0 | 0 |
| TECHNICAL | 0 | 0 |

Query coverage: baseline enough-query count не зафиксирован и не пересчитывался. Now enough M3 query evidence 4; Pages with M3 queries + modern 653; ELIGIBLE + enough evidence + modern/content for full engine 4. Baseline full-modern coverage 0. Достаточность использует существующие minQueryImpressions=100 и minDateCoverage=0.75, индивидуальные агрегированные запросы проходят min impressions; общий page traffic сам по себе недостаточен.

### TOP current SEO (до 20; фактически 6)

| Page | Priority | Category | Action | Impressions | CTR % | Position | Eligibility |
| --- | --- | --- | --- | --- | --- | --- | --- |
| https://shop.gazpromneft-sm.ru/catalog/ | HIGH | DESCRIPTION | Добавить метаописание страницы | 13058 | 14,91 | 6,86 | ELIGIBLE |
| https://shop.gazpromneft-sm.ru/catalog/filter/brand-is-0000000001/packing-is-2f0e6106-cad8-11e7-80e3-0050569eedf6/apply/ | HIGH | TITLE | Усилить заголовок продуктом, фасовкой и коммерческим предложением | 3917 | 27,62 | 4,29 | ELIGIBLE |
| https://shop.gazpromneft-sm.ru/catalog/filter/brand-is-0000000001/packing-is-2f0e6106-cad8-11e7-80e3-0050569eedf6/apply/ | HIGH | DESCRIPTION | Добавить метаописание страницы | 3917 | 27,62 | 4,29 | ELIGIBLE |
| https://shop.gazpromneft-sm.ru/catalog/filter/brand-is-0000000001/packing-is-2f0e6106-cad8-11e7-80e3-0050569eedf6/apply/ | HIGH | H1 | Уточнить основной заголовок | 3917 | 27,62 | 4,29 | ELIGIBLE |
| https://shop.gazpromneft-sm.ru/about/contacts/ | HIGH | DESCRIPTION | Добавить метаописание страницы | 1049 | 2,29 | 5,91 | ELIGIBLE |
| https://shop.gazpromneft-sm.ru/catalog/gazpromneft-diesel-premium-10w-40-kanistra-20-l/ | HIGH | INTERNAL_LINKING | Добавить тематические внутренние ссылки | 256 | 0 | 8,05 | ELIGIBLE |


## SEO new actions

| Page | Priority | Category | Action | Evidence | M3 impressions | Position | CTR % |
| --- | --- | --- | --- | --- | --- | --- | --- |
| https://shop.gazpromneft-sm.ru/catalog/gazpromneft-diesel-premium-10w-40-kanistra-20-l/ | HIGH | INTERNAL_LINKING | Добавить тематические внутренние ссылки | inbound 0; outbound 19; observed 665/1493; sourcePages 5; confidence LOW | 256 | 8,05 | 0 |

Новая рекомендация основана именно на internalLinks graph, ранее недоступном. CTA/application/specification/packaging/content/schema actions не появились. Это не доказательство идеального содержания всех 653 Page: engine имеет достаточное query evidence только для четырёх Page.

## SEO removed actions

Исчезнувших baseline Actions: 0. Все пять старых HIGH остались; улучшение вида «false positive removed» не доказано. Ни одна старая HIGH action не стала NOT_ELIGIBLE.

## Eligibility

| Status | Before matched Page | After matched Page |
| --- | --- | --- |
| ELIGIBLE | 171 | 659 |
| NOT_ELIGIBLE | 4 | 4 |
| UNCERTAIN | 446 | 47 |

До/после — разные размеры matched Page cohorts (621/710). ELIGIBLE отражает stored indexability/canonical/robots evidence, не гарантирует коммерческий intent или достаточность query evidence.
| Filter/facet | Current eligibility | Evidence |
| --- | --- | --- |
| https://shop.gazpromneft-sm.ru/catalog/filter/brand-is-0000000001/packing-is-2f0e6106-cad8-11e7-80e3-0050569eedf6/apply/ | ELIGIBLE | HTTP 200, indexable, нет другого canonical |
| https://shop.gazpromneft-sm.ru/catalog/filter/product_type-is-3543f9e51c263978dd8aab4b1773333c/apply/ | ELIGIBLE | HTTP 200, indexable, нет другого canonical |

Обе matched facets остаются ELIGIBLE. Три старых HIGH на brand/packing facet — TITLE/DESCRIPTION/H1 — сохраняются; автоматически исключать их validation не вправе. Четыре unmatched filter URLs остаются отдельно.

## Internal links

| Metric | Current |
| --- | --- |
| Pages with observed graph data | 665 |
| Graph Page universe | 1495 |
| Graph coverage | 44,48% |
| Orphan-like, observed graph only | 1347 |
| Low-inbound (< 2) | 1438 |
| Current internal-link actions | 1 |
| New action confidence | LOW |

Покрытие неполное. 1347 orphan-like и 1438 low-inbound — показатели частичного наблюдаемого графа, не доказанные сироты полного production сайта. Engine action graph имеет universe 1493 HTML Page (две document Page исключены), общий seoDataset graph 1495. Новых правил не добавлено.

## Structured data

| Metric | Current |
| --- | --- |
| product | 0 |
| offer | 0 |
| eligibleCommercial | 655 |
| observedCommercial | 649 |
| missingProductObserved | 649 |
| missingOfferObserved | 649 |
| unknownCommercial | 6 |
| actions | 0 |

Product/Offer здесь — types в structuredDataJson успешных selected snapshots. 649 missing observed commercial Pages — product/category universe текущей классификации с modern evidence; это не список доказанных дефектов сайта. 6 eligible commercial Pages без modern evidence остаются unknown. Среди modern Search-matched Page product=0; многие SKU-linked карточки сохранены как category, а существующее structured-data rule требует product. Поэтому 0 schema actions нельзя интерпретировать как отсутствие проблем.

## Commerce before/after

Обычный calculateOpportunities(28), current 2026-09-10–2026-10-07; baseline 09.09–06.10.2026. Режим TRANSACTIONAL, coverage 10.01.2025–06.10.2026 сохранены. Теперь current включает 07.10, который не покрыт подтверждённой выгрузкой: все 1360 business Pages имеют 27/28 transactional days, salesComplete=0. Sales freshness остаётся valid для 1360 Pages, но freshness не равна полноте периода.
| Type | Before | After |
| --- | --- | --- |
| Growth | 14 | 0 |
| Risk | 3 | 0 |

| Rule | Before | Current |
| --- | --- | --- |
| RULE_11 | 14 | 0 |
| RULE_12 | 0 | 0 |
| RULE_13 | 0 | 0 |
| RULE_14 | 0 | 0 |
| RULE_15 | 0 | 0 |
| RULE_16 | 3 | 0 |
| RULE_17 | 0 | 0 |
| RULE_18 | 0 | 0 |
| RULE_19 | 0 | 0 |
| RULE_20 | 0 | 0 |
| RULE_21 | 0 | 0 |
| RULE_22 | 0 | 0 |

Это подавление сигналов из-за coverage/current-date shift, не доказанное улучшение Commerce и не причинный эффект Scanner. Baseline пересчёт на старые даты не запускался.

### TOP-20 current Growth/Risk

| Page | Rule | Score | Visits | Revenue | Kg | StockKg | Days of Stock | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |

Current Growth/Risk = 0, поэтому строк TOP нет. DATA_QUALITY и старые period Actions в current TOP не подмешивались.

## Data quality

| Metric | Before | After |
| --- | --- | --- |
| SKU with kgPerUnit | 0 | 0 |
| SKU without kgPerUnit | 1909 | 1909 |
| Pages with stock units | 451 | 451 |
| Pages with stockKg | 0 | 0 |
| Pages with Days of Stock | 0 | 0 |

Coefficients не загружались/не назначались. stockKg/Days of Stock остаются null/unknown, не нулём. Неизвестный запас не означает отсутствие stock risk.
Реально улучшились matching, modern content и доступность internal-link evidence. Не доказаны removal of false positives, full graph/orphan coverage и наличие Product/Offer schema evidence. Не улучшились kg coefficients, stockKg/Days of Stock и 57 unresolved legacy URLs. Вне target HTML workflow остаются 72 documents; весь current unmatched = 165.
| Protected model | Rows | Before/after hash identical |
| --- | --- | --- |
| Scan | 30 | YES |
| ScanPage | 1071 | YES |
| JobRun | 9 | YES |
| MetrikaPageDaily | 15743 | YES |
| WebmasterQueryDaily | 95043 | YES |
| BusinessRecord | 6483 | YES |
| Import | 10 | YES |


## Performance

Три последовательных GET на localhost:3000 для каждого route, первый cold/initial, mean двух следующих warm. Все HTTP 200. Никаких POST/scan/export/sync. Сравнение с сохранёнными warm measurements; одинаковую внешнюю нагрузку машины между 7/8 октября гарантировать нельзя. Причина замедления не установлена, поэтому оно не приписывается исключительно content volume.
| Route | Stabilization warm s | Activation warm s | Now warm s | Delta vs Activation | Current passes ms |
| --- | --- | --- | --- | --- | --- |
| / | 5,03 | 6,03 | 15,74 | 161,03% | 17985 / 15835 / 15642 |
| /scanner | 0,32 | 0,28 | 0,72 | 159,84% | 740 / 639 / 797 |
| /seo-actions | 1,92 | 1,89 | 5,03 | 165,76% | 5063 / 5085 / 4979 |
| /pages/cmuvqpg8t000120ucrcsttj6h?searchPeriod=M3 | 0,52 | 0,52 | 1,06 | 105,22% | 2416 / 1095 / 1028 |
| /webmaster?period=M3 | 1,58 | 1,49 | 3,51 | 135,4% | 3727 / 3461 / 3564 |

PERFORMANCE REGRESSION OBSERVED: требование отсутствия существенной деградации не выполнено в этом замере. Во время Round performance fixes, UI/cache/schema changes не делались.

## AI readiness

**NOT READY FOR AI**
1. SEO evidence пока даёт только 4 full-engine Page и одну новую low-confidence internal-link action; Product/Offer evidence отсутствует, а 642 SKU-linked matched Page классифицированы category.
2. Commerce current неполон (27/28 days), Growth/Risk подавлены; все 1909 SKU без kgPerUnit, stockKg/Days of Stock unknown — стабильные полные Commerce signals не подтверждены.
3. Partial internal-link graph не подтверждает реальные orphan defects, а все пять UI routes показали существенное замедление; качество будущих AI recommendations и отзывчивость системы пока нельзя считать проверенными.
