# Sprint 3.5.1 — Нативный месячный XLSX Яндекс Вебмастера

## Status

Реализован только Sprint 3.5.1. Существующие Search Dataset, Rules Engine, SEO Action Engine и Scanner adapters сохранены. Нет Sprint 4, LLM, нового crawler, автоматического production scan или API/export jobs. Техническая и production file acceptance: PASS. Matching имеет объяснённое ограничение, приведённое ниже.

## Native Webmaster Format

Приложенный XLSX используется без изменения. Reader тот же, что для универсального импорта: XLSX/CSV, максимум 5 МБ, 10 000 строк, 100 колонок, 20 листов, ограничение распакованного архива и объёма строк. Фактический native файл — 1 718 920 байт, 5 252 строки данных, 92 колонки. Некорректный XLSX dimension A1 не ограничивает существующий ExcelJS reader; он прочитал все строки и колонки.

CTR native — проценты: значение 0,9 означает 0,9%, не 90%. Это подтверждено файлами (3/307 → 0,9; 8/298 → 2,6) и [официальной документацией](https://www.yandex.ru/support/webmaster/ru/service/queries-analytic). Исходный округлённый CTR сохраняется; агрегированный CTR всегда SUM(clicks)/SUM(shows)×100. Точное равенство округлённого native CTR не требуется.

В исходном файле 82 наблюдения clicks > shows; они сохраняются с предупреждением. Причину отличия источника не выдумываем. Нулевая native position является отсутствием позиции и хранится null, как пустая; не участвует во взвешенном среднем. Показы/клики — неотрицательные целые; demand/position/CTR допускают дробные числа. Формулы и сложные ячейки не выполняются.

## Format Detection

Query/Url и минимум один блок shows+position. Колонки определяются regex `^(\d{4}-\d{2})_(shows|position|demand|ctr|clicks)$`, без конкретных годов/индексов. Месяцы сортируются календарно. Некорректные месяцы, повторные колонки, отсутствующие обязательные counts и плохие значения показываются до подтверждения. Native UI не требует mapping 92 колонок; DAY mapping и существующий шаблон сохранены.

## Wide to Monthly Conversion

Одна Excel строка → максимум одно наблюдение на каждый валидный месяц. Полностью пустой блок пропускается; явные нули сохраняются. Пустые shows/clicks не заменяются нулями: такое наблюдение отклоняется, остальные месяцы/строки доступны к подтверждению. Отсутствующая position/CTR/demand остаётся неизвестной. До 500 диагностических ошибок в сохранённом preview, полные числовые счётчики отдельно; UI показывает первые 100 ошибок.

Preview повторно проверяется при commit. Исходный Workbook сохраняется в Import.dataJson, сводка — Import.searchSummaryJson. Atomic bulk upsert партиями по 1 000, общий advisory lock 7462350, транзакция 120 секунд. Только WEBMASTER_IMPORT / FILE_NATIVE_MONTH; API и бизнес-записи не обновляются. Повторный commit завершённого Import — no-op.

## MONTH Grain

WebmasterQueryDaily расширен grain DAY/MONTH, periodMonth и demand. Поле date у MONTH — технический первый день для прежнего индекса, не дневная статистика. DB constraints запрещают другие grains, месяц без periodMonth и несогласованные даты. Новые MONTH rows имеют host FILE_NATIVE_MONTH и hash identity с grain/month. Старый DAY unique index и rowKey не переписывались, API default DAY / periodMonth null / demand null.

## URL Resolution

Относительный URL разрешается относительно origin Target Site, независимо от path baseUrl. Абсолютный URL разрешён только на том же origin. Credentials, auth/token/session/password params, fragment и другие protocols/origins отклоняются. Trailing slash и tracking/query normalization используют прежний matchUrl/normalizeUrl; observed redirect aliases поддерживаются. Raw query и абсолютный source URL сохраняются отдельно от normalizedQuery/normalizedUrl.

Native matching проверяет активный inventory Page, включая ещё не сканированные известные страницы. Наличие Page не утверждает успешный crawl. Universal DAY matching policy не изменена. Импорт не создаёт Page, aliases или Scanner jobs. Похожие queries/названия не являются доказательством общего URL.

## Demand

«Спрос по данным выгрузки Вебмастера». Не объявляется общим рынком Яндекса. Хранится отдельно от impressions; не влияет на CTR benchmark, Opportunity Score, SEO priority или intent Search Share.

Для query — среднее известных значений последнего наблюдаемого месяца. Для страницы/сводки — среднее по normalized query/region того же месяца; одинаковые значения разных URL не умножаются. Если значения одного query/region различаются между URL, сначала берётся среднее различных исходных значений. Если в последнем месяце Demand неизвестен — null, без переноса предыдущего месяца. Месяцы не суммируются. Месячная таблица показывает отдельные исходные периоды.

## Search Dataset Merge

Единственная effectiveSearch функция используется прежним searchDataset во всех аналитических consumers. Сначала grain-aware dedup, затем фильтр периода и исключение пересечений. Полностью включённый MONTH побеждает DAY ровно той же site/raw URL/raw query/region и календарного месяца. Один API day не вытесняет MONTH. Различающиеся query/URL identities остаются отдельными — arbitrary normalization не склеивает источники.

MONTH, пересечённый частично, целиком исключается; только реальные DAY наблюдения доступны в таком интервале. Нет пропорционального разнесения месяца по дням, синтетических daily rows или суммирования MONTH+DAY одного интервала. При отсутствии MONTH действует прежний DAY API-first контракт.

## Deduplication

MONTH identity: site/grain/month/raw URL/raw query/region. Последний подтверждённый import обновляет единственное imported observation; прежний файл и его preview остаются в Import history. Весь bulk commit атомарен. Повторная загрузка файла не увеличивает число Search identities. SeoAction identity page/action/period сохраняет upsert и статус; demand не участвует в identity или scoring.

## Monthly Coverage

MONTH — observed months / expected months. Подтверждённая observation с нулевыми показами всё равно наблюдает месяц. DAY fallback в месячном режиме даёт долю по реальным уникальным дням месяца; один день не означает полный месяц. Coverage не доказывает полноту всех запросов/страниц. Прежний порог 75% применяется к соответствующей единице; 100 impressions — SUM по normalized query за выбранный период.

## Search Periods

1/3/6/12/18 месяцев и весь доступный период. Привязка — последний наблюдаемый импортированный месяц, а не текущий месяц: для приложенного файла последний — август 2026. Месяц включается целиком. Default Search/SEO при MONTH — 3 месяца; старые 7/28/30/90 дней остаются. Page 360 Search selector независим от selector Метрики/Commerce.

Явно выбранный месячный Rules/SEO расчёт использует соответствующее историческое окно и равное календарное предыдущее окно. Commerce при этом требует реальные исторические данные и свежесть относительно периода; современные продажи не выдаются за исторические. Дневные коммерческие режимы не меняют семантику. Ограничение календарных циклов 600 дней применяется только к историческому MONTH анализу; прежние дневные режимы сохраняют лимит 90 дней.

## Query Explorer

Page 360 показывает спрос и месячные impressions/clicks/CTR/weighted position/demand. 100 запросов после intent фильтра, summary по всем rows. Вебмастер имеет отдельный месячный report; дневная API sync UI доступна по period=30. Monthly SearchTrend хранит YYYY-MM labels, не показывает monthly counts на конкретном дне. Daily graphs в старых reports включают только DAY rows.

## SEO Actions

Используется существующий Engine A01–A12, RULE 23/24 и прежние thresholds. Evidence содержит periodFrom/periodTo/grain/monthsCovered/Demand. Значимый запрос — SUM normalized query за период; отдельной новой семантической кластеризации нет. Demand не повышает приоритет. Cannibalization требует перекрытие минимум двух наблюдаемых единиц — дней для DAY либо месяцев для MONTH; одиночный месяц не создаёт сильный сигнал.

IMPLEMENTED baseline привязан к сохранённому периоду action, включая 92/184/549-дневные календарные месячные окна. Recalc не создаёт дублей, не сбрасывает IMPLEMENTED/comment/baseline. Неизвестные старые contentSignals не трактуются как отсутствие коммерческих элементов; метаданные могут дать Title/Description/H1 рекомендации.

## Production File Acceptance

Файл: C:/Users/4way0/Downloads/shop.gazpromneft-sm.ru_ac664341769d27db78d001b.xlsx. SHA-256: e95d002b7eebcc1bdcd5a0c4329628e67652d593b973e483bc927a13a2c72449; исходник не изменён. Повторные upload/commit и SEO recalculation: PASS.

| Import / Search | Результат |
| --- | --- |
| Формат / grain | YANDEX_NATIVE_MONTHLY / MONTH |
| Строк Excel | 5 252 |
| Месяцев / период | 18 / 2025-03-01 — 2026-08-31 |
| Наблюдений | 94 536 |
| Отклонённых строк / observations | 0 / 0 |
| Пропущенных observations | 0 |
| Raw / normalized queries | 5 252 / 5 252 |
| URL | 1163 |
| Matched Pages / inventory | 621 / 1479 |
| Unmatched URL | 542 |
| Matched URL rate | 53,40% |
| Показы / клики, весь период | 210 134 / 15 142 |
| Monthly coverage | 18/18 |
| Спрос, последний месяц | 55,44 |

Intent, все 18 месяцев:

| Intent | Impressions | Share |
| --- | --- | --- |
| TRANSACTIONAL | 11 513 | 5,48% |
| B2B | 4 000 | 1,90% |
| PRODUCT | 42 521 | 20,24% |
| PACKAGING | 10 962 | 5,22% |
| APPLICATION | 257 | 0,12% |
| SPECIFICATION | 56 962 | 27,11% |
| ANALOG | 0 | 0,00% |
| BRAND | 92 187 | 43,87% |
| INFORMATIONAL | 120 | 0,06% |
| OTHER | 72 550 | 34,53% |

Intent-категории могут пересекаться; их доли не обязаны складываться в 100%.

packaging: [{"token": "канистра", "impressions": 3534, "share": 0.016817840044923715}, {"token": "бочка", "impressions": 2632, "share": 0.012525340972903004}, {"token": "205 л", "impressions": 2131, "share": 0.010141148029352698}, {"token": "20 л", "impressions": 1554, "share": 0.007395281106341667}, {"token": "4 л", "impressions": 839, "share": 0.003992690378520372}, {"token": "1 л", "impressions": 516, "share": 0.002455575965812291}, {"token": "5 л", "impressions": 275, "share": 0.0013086887414697288}, {"token": "50 л", "impressions": 52, "share": 0.00024746114384154873}].

application: [{"token": "гидравлика", "impressions": 174, "share": 0.0008280430582390284}, {"token": "редуктор", "impressions": 44, "share": 0.0002093901986351566}, {"token": "трансмиссия", "impressions": 29, "share": 0.0001380071763731714}, {"token": "компрессор", "impressions": 10, "share": 4.7588681507990136e-05}].

specification: [{"token": "5w40", "impressions": 8870, "share": 0.042211160497587254}, {"token": "10w 40", "impressions": 8482, "share": 0.040364719655077236}, {"token": "10w-40", "impressions": 6497, "share": 0.030918366375741194}, {"token": "5w30", "impressions": 4712, "share": 0.022423786726564955}, {"token": "5w-40", "impressions": 4024, "share": 0.019149685438815234}, {"token": "5w-30", "impressions": 2830, "share": 0.01346759686676121}, {"token": "15w40", "impressions": 2378, "share": 0.011316588462600054}, {"token": "10w30", "impressions": 1948, "share": 0.00927027515775648}, {"token": "15w-40", "impressions": 1455, "share": 0.006924153159412565}, {"token": "10w-30", "impressions": 1355, "share": 0.006448266344332664}].

SEO: 2026-06-01 — 2026-08-31, MONTH, 3 месяца. Threshold 100 сохранён. Всего 5. RULE 23: 0, RULE 24: 0.

Условия Engine: {"threshold": 100, "matchedSearchPages": 621, "successfulSnapshot": 171, "significantQuery": 5, "snapshotAndSignificantQuery": 4}. Только 5 страниц имеют normalized query с SUM >= 100 за выбранные 3 месяца; у 4 из них есть успешный snapshot. Не каждый прошедший gate создаёт action: нужен конкретный обнаруженный недостаток.

В данном файле каждый из 5 252 normalized query связан с одним URL, поэтому cannibalization = 0. Расширенные content/link/structured-data сигналы не выводятся из неизвестных snapshots; RULE 23/24 дополнительно требуют коммерческое/историческое evidence за тот же период.

| Priority | Count |
| --- | --- |
| VERY_HIGH | 0 |
| HIGH | 5 |
| MEDIUM | 0 |
| LOW | 0 |

| Category | Count |
| --- | --- |
| SNIPPET | 0 |
| TITLE | 1 |
| DESCRIPTION | 3 |
| H1 | 1 |
| FIRST_SCREEN | 0 |
| CONTENT | 0 |
| APPLICATION | 0 |
| SPECIFICATION | 0 |
| PACKAGING | 0 |
| INTERNAL_LINKING | 0 |
| CANNIBALIZATION | 0 |
| CONTENT_GAP | 0 |
| STRUCTURED_DATA | 0 |
| TECHNICAL | 0 |

### TOP-20 SEO Actions

| Page | Priority | Action | Impressions | CTR | Position | Demand | Intent B2B / transactional |
| --- | --- | --- | --- | --- | --- | --- | --- |
| https://shop.gazpromneft-sm.ru/catalog/filter/brand-is-0000000001/packing-is-2f0e6106-cad8-11e7-80e3-0050569eedf6/apply/ | HIGH | Усилить заголовок продуктом, фасовкой и коммерческим предложением | 3 917 | 27,62% | 4,29 | 763,42 | 0,0% / 0,0% |
| https://shop.gazpromneft-sm.ru/about/contacts/ | HIGH | Добавить метаописание страницы | 1 049 | 2,29% | 5,91 | 60,67 | 0,0% / 0,0% |
| https://shop.gazpromneft-sm.ru/catalog/ | HIGH | Добавить метаописание страницы | 13 058 | 14,91% | 6,86 | 219,72 | 0,0% / 0,0% |
| https://shop.gazpromneft-sm.ru/catalog/filter/brand-is-0000000001/packing-is-2f0e6106-cad8-11e7-80e3-0050569eedf6/apply/ | HIGH | Добавить метаописание страницы | 3 917 | 27,62% | 4,29 | 763,42 | 0,0% / 0,0% |
| https://shop.gazpromneft-sm.ru/catalog/filter/brand-is-0000000001/packing-is-2f0e6106-cad8-11e7-80e3-0050569eedf6/apply/ | HIGH | Уточнить основной заголовок | 3 917 | 27,62% | 4,29 | 763,42 | 0,0% / 0,0% |

Показаны все 5 доступных рекомендаций; TOP-20 не дополнен искусственно. Старые/отсутствующие snapshots ограничивают расширенные content/link actions; evidence threshold не снижен.

Подробный period/grain/monthsCovered/evidence сохранён в test-results/sprint3-5-1-production.json.

## Page Matching

Сопоставлено 621 Page и 621/1163 source URL (53,40%). Не сопоставлены 542 URL: 449 имеют числовой путь /catalog/<id>/, остальные 93 — другие пути/варианты.

Причина проверена по активному inventory: нет Page или наблюдавшегося redirect alias, соответствующего normalized URL. Источник не доказывает удаление, WAF или переход числового URL к конкретному slug. Сходство query/названия не используется для выдуманного matching. Импорт не создаёт Page и не запускает scan. Это объяснённое ограничение покрытия; 100% matching не заявляется.

### TOP-50 unmatched URL

| URL | Impressions | Clicks | Match reason |
| --- | --- | --- | --- |
| https://shop.gazpromneft-sm.ru/catalog/14134/ | 4 544 | 78 | page not scanned |
| https://shop.gazpromneft-sm.ru/catalog/5786/ | 2 476 | 38 | page not scanned |
| https://shop.gazpromneft-sm.ru/catalog/17282/ | 1 981 | 37 | page not scanned |
| https://shop.gazpromneft-sm.ru/catalog/14131/ | 1 656 | 25 | page not scanned |
| https://shop.gazpromneft-sm.ru/catalog/14245/ | 1 372 | 43 | page not scanned |
| https://shop.gazpromneft-sm.ru/catalog/5699/ | 1 170 | 17 | page not scanned |
| https://shop.gazpromneft-sm.ru/catalog/5889/ | 1 156 | 11 | page not scanned |
| https://shop.gazpromneft-sm.ru/catalog/16174/ | 1 124 | 29 | page not scanned |
| https://shop.gazpromneft-sm.ru/catalog/14136/ | 1 098 | 9 | page not scanned |
| https://shop.gazpromneft-sm.ru/catalog/16876/ | 1 006 | 20 | page not scanned |
| https://shop.gazpromneft-sm.ru/catalog/5747/ | 981 | 20 | page not scanned |
| https://shop.gazpromneft-sm.ru/catalog/5940/ | 957 | 24 | page not scanned |
| https://shop.gazpromneft-sm.ru/catalog/5675/ | 953 | 30 | page not scanned |
| https://shop.gazpromneft-sm.ru/catalog/14111/ | 866 | 21 | page not scanned |
| https://shop.gazpromneft-sm.ru/catalog/7030/ | 849 | 25 | page not scanned |
| https://shop.gazpromneft-sm.ru/catalog/7006/ | 730 | 16 | page not scanned |
| https://shop.gazpromneft-sm.ru/catalog/14230/ | 728 | 25 | page not scanned |
| https://shop.gazpromneft-sm.ru/catalog/5740/ | 723 | 11 | page not scanned |
| https://shop.gazpromneft-sm.ru/catalog/14213/ | 712 | 30 | page not scanned |
| https://shop.gazpromneft-sm.ru/catalog/5787/ | 659 | 23 | page not scanned |
| https://shop.gazpromneft-sm.ru/catalog/17305/ | 644 | 17 | page not scanned |
| https://shop.gazpromneft-sm.ru/catalog/5707/ | 544 | 6 | page not scanned |
| https://shop.gazpromneft-sm.ru/catalog/15887/ | 518 | 7 | page not scanned |
| https://shop.gazpromneft-sm.ru/catalog/15730/ | 512 | 9 | page not scanned |
| https://shop.gazpromneft-sm.ru/catalog/16909/ | 510 | 14 | page not scanned |
| https://shop.gazpromneft-sm.ru/catalog/5718/ | 498 | 11 | page not scanned |
| https://shop.gazpromneft-sm.ru/catalog/5881/ | 498 | 15 | page not scanned |
| https://shop.gazpromneft-sm.ru/catalog/14089/ | 494 | 8 | page not scanned |
| https://shop.gazpromneft-sm.ru/upload/doc/aeb/hc0zdvoio8p2jkatnfqi8713gs4iz1po/%20%D0%9F%D0%B0%D1%81%D0%BF%D0%BE%D1%80%D1%82%20%D0%B1%D0%B5%D0%B7%D0%BE%D0%BF%D0%B0%D1%81%D0%BD%D0%BE%D1%81%D1%82%D0%B8.pdf | 473 | 3 | page not scanned |
| https://shop.gazpromneft-sm.ru/catalog/16006/ | 470 | 14 | page not scanned |
| https://shop.gazpromneft-sm.ru/catalog/5893/ | 459 | 3 | page not scanned |
| https://shop.gazpromneft-sm.ru/catalog/14804/ | 447 | 18 | page not scanned |
| https://shop.gazpromneft-sm.ru/catalog/17448/ | 399 | 5 | page not scanned |
| https://shop.gazpromneft-sm.ru/upload/doc/533/0uv07r122oknxtuywnavgm0iqz3og083/%20%D0%9B%D0%B8%D1%81%D1%82%20%D1%82%D0%B5%D1%85%D0%BD%D0%B8%D1%87%D0%B5%D1%81%D0%BA%D0%BE%D0%B9%20%D0%B4%D0%BE%D0%BA%D1%83%D0%BC%D0%B5%D0%BD%D1%82%D0%B0%D1%86%D0%B8%D0%B8.pdf | 398 | 9 | page not scanned |
| https://shop.gazpromneft-sm.ru/catalog/5689/ | 383 | 4 | page not scanned |
| https://shop.gazpromneft-sm.ru/catalog/16833/ | 377 | 3 | page not scanned |
| https://shop.gazpromneft-sm.ru/catalog/16004/ | 369 | 4 | page not scanned |
| https://shop.gazpromneft-sm.ru/catalog/15807/ | 364 | 6 | page not scanned |
| https://shop.gazpromneft-sm.ru/catalog/14198/ | 349 | 10 | page not scanned |
| https://shop.gazpromneft-sm.ru/catalog/16740/ | 348 | 6 | page not scanned |
| https://shop.gazpromneft-sm.ru/catalog/16352/ | 335 | 9 | page not scanned |
| https://shop.gazpromneft-sm.ru/catalog/7057/ | 321 | 8 | page not scanned |
| https://shop.gazpromneft-sm.ru/catalog/5741/ | 317 | 16 | page not scanned |
| https://shop.gazpromneft-sm.ru/catalog/16167/ | 317 | 3 | page not scanned |
| https://shop.gazpromneft-sm.ru/catalog/5802/ | 301 | 18 | page not scanned |
| https://shop.gazpromneft-sm.ru/catalog/16542/ | 299 | 6 | page not scanned |
| https://shop.gazpromneft-sm.ru/upload/doc/b64/c2ss28wfzzc0inu38c5eivw2727qm9lt/%20%D0%9F%D0%B0%D1%81%D0%BF%D0%BE%D1%80%D1%82%20%D0%B1%D0%B5%D0%B7%D0%BE%D0%BF%D0%B0%D1%81%D0%BD%D0%BE%D1%81%D1%82%D0%B8.pdf | 299 | 12 | page not scanned |
| https://shop.gazpromneft-sm.ru/catalog/7023/ | 290 | 8 | page not scanned |
| https://shop.gazpromneft-sm.ru/catalog/5831/ | 286 | 10 | page not scanned |
| https://shop.gazpromneft-sm.ru/catalog/7034/ | 285 | 12 | page not scanned |

## Pages Requiring Rescan

| Показатель | Pages |
| --- | --- |
| Search-matched | 621 |
| Modern contentSignals | 0 |
| Требуют rescan | 621 |

Для полноценного content/link анализа нужен ручной targeted scan через существующий безопасный workflow. Production Scanner и новые API/export jobs не запускались.

## Tests

Остановить workers, app перед generate/build на Windows. DB/UI fixtures запускать последовательно: они временно меняют Target/Metrika/Webmaster config и восстанавливают в finally. Приложенный файл не изменяется; контролируется SHA-256. Production acceptance записывает только подтверждённый Search import и локальный Rules/SEO пересчёт.

```powershell
npm run check:sprint3-5-1
npm run build
npm start
node --env-file=.env --conditions=react-server --import=tsx scripts/acceptance-native-search-ui.ts
node --env-file=.env scripts/verify-sprint3-5-1-ui.mjs
# Только после восстановления Target Site из fixtures:
node --env-file=.env --conditions=react-server --import=tsx scripts/sprint3-5-1-production.ts
```

Baseline: test-results/sprint3-5-1-before.json. Полные hashes оригинальных API rows, Scans/JobRuns, Метрики и BusinessRecords, плюс защищённые configs сравниваются до/после. Новые fields grain/month/demand исключаются из legacy API hash; значения старых полей должны совпасть. Старые API metrics и очереди не переписываются.

| Check | Status |
| --- | --- |
| migration deploy | PASS |
| scanner regression | PASS |
| worker regression | PASS |
| coverage regression | PASS |
| waf regression | PASS |
| yandex regression | PASS |
| migration status | PASS |
| schema drift | PASS |
| clean database | PASS |
| sprint3 regression | PASS |
| sprint3-1 regression | PASS |
| commerce regression | PASS |
| sprint3-4 regression | PASS |
| typecheck | PASS |
| tests | PASS |
| seo-actions regression | PASS |
| native-search regression | PASS |
| sprint3-4 UI | PASS |
| commerce UI | PASS |
| business-data UI | PASS |
| sprint3 UI | PASS |
| sprint3-1 UI | PASS |
| native-search UI | PASS |
| seo-actions UI | PASS |
| localization | PASS |
| secrets | PASS |
| production monthly UI (read-only) | PASS |
| production native import + idempotency | PASS |
| build | PASS |
| final baseline safety + source SHA256 | PASS |

Unit tests: 132/132, fail 0. Browser acceptance: реальный XLSX preview без mapping, локальный MONTH commit, monthly selector/baseline, Query Explorer Demand, 1440/390 px без overflow. Логи: test-results/sprint3-5-1-checks и test-results/sprint3-5-1-ui-checks.

UI-регрессии Sprint 3.4/Commerce используют текущий период интерфейса вместо устаревшей даты 06.10.2026. Проверка group filter сравнивает точный состав ссылок с рассчитанными локальными результатами, а не фиксированное количество сигналов меняющегося окна. Production Rules/Commerce логика для этого не изменялась.

Месячный report читает существующий effective Search Dataset и общие aggregation/intent helpers, без полного Commerce dataset. Rules/SEO проверяют revision по metadata импортов; workbook читается только для SALES, где нужен список исключённых SKU. Это исключает повторную загрузку больших Search XLSX при каждом просмотре; формулы и правила не менялись.

Page 360 использует общий Search Dataset, intent/graph helpers и сохранённые actions без полного Commerce расчёта за историческое окно. Эквивалентность периода, поисковых строк и графа полному SEO dataset проверена локальной DB fixture.

| Production route (read-only) | Seconds |
| --- | --- |
| /webmaster/import?id=cmuxpie22000920eg04i0vna6 | 4,52 |
| /webmaster?period=M3 | 7,14 |
| /webmaster?period=M18 | 25,64 |
| /seo-actions | 26,92 |
| /pages/cmuvqpg8t000120ucrcsttj6h?searchPeriod=M18 | 28,57 |

## Known Limitations

- Native источник содержит clicks > shows и округлённый CTR; сохранены исходные значения, причина различий не установлена.
- Значительная часть URL не сопоставилась; реальные причины и TOP-50 приведены выше. Автоматический production crawl/redirect discovery не запускался.
- Исторический Search не доказывает актуальные позиции/спрос и не гарантирует наличие свежих продаж в том же периоде.
- Для расширенных рекомендаций нужны modern Scanner snapshots. Неизвестные content/links не заменяются предположениями.
- Demand имеет указанную описательную семантику, не используется для scoring/прогноза роста.
- WAF, API quota, безопасно заблокированный неопределённый export POST и отсутствие RBAC остаются. Workers оставлены остановленными. Sprint 4/5 не начаты.
