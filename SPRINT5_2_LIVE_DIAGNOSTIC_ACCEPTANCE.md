# Sprint 5.2 — Live Diagnostic Acceptance

## Результат и границы

**DIAGNOSTIC ACCEPTANCE PASS; SEO PRODUCT QUALITY — READY WITH FIXES, Sprint5.1 НЕ PASS.**

Выполнен ровно1 новый платный DeepSeek call для `https://shop.gazpromneft-sm.ru/catalog/`. Retries0. Все5 предложений разобраны, включая4REJECTED и1NEEDS_REVIEW. Исправлений кода/prompt/provider/model/guards/evidence не выполнялось. Новые спринты/crawl/sync/export не запускались. Серия остановлена.

Диагностическая цель достигнута: удалось отделить реальные ошибки ответа от ложных срабатываний отдельных условий. Практически полезны два диагностических brief, но нет принятого READY_CHANGE/GROWTH_HYPOTHESIS. Устойчивость полезных коммерческих SEO-рекомендаций одним ответом не доказана.

## Вызов и защищённый capture

| Показатель | Факт |
| --- | --- |
| Новый ledger | `test-results/sprint5-2-live-diagnostic.json` |
| RunID | `f113e32b-49be-4154-9372-3f45086d6705` |
| Prompt / model | PAGE_SEO_REVIEW_V2 / deepseek-flash |
| Calls / retries | **1 /0** |
| Input / output tokens | **15395 /4550** |
| Provider latency | **17521.58ms** |
| Capture parsing / additional diagnostics | 1.77ms /384.68ms |
| Generated / accepted / rejected | **5 /1 /4** |
| Accepted status | NEEDS_REVIEW (technical CHECK) |
| Expert reviews | 5/5: PASS2 /QUESTIONABLE2 /FAIL1 |
| Independent human approval | Нет; PENDING_HUMAN_REVIEW для всех5 |

Предварительно Windows ACL helper вернул ACL_OK. Existing CLI также проверил actual secure write до резервирования запроса. Ledger создан exclusive, durable reservation до вызова, budget1; предыдущие серии не сбрасывались. `finished=true`, `reviewStatus=COMPLETED_STOPPED`, `additionalCallsAllowed=0`; старый capture status сохранён как исторический CAPTURED_REVIEW_PENDING.

Protected artifact: `%USERPROFILE%\.growth-radar-local-ai-diagnostics\f113e32b-49be-4154-9372-3f45086d6705.json`. Все исходные proposal fields сохранены без projection truncation (`projectionLimited=false` для5/5), после штатной очистки. Original fields/validator decisions при добавлении review не изменены. Full transport/prompt/evidence profile не сохранялись. Полные отклонённые тексты не включены в этот отчёт или обычные файловые логи.

Created2026-10-09 10:38:42.936UTC; expiry **2026-10-10 10:38:42.936UTC (13:38:42.936МСК)**. Review TTL не продлевал. Cleanup — при запуске CLI/явной команде, не background daemon. После expiry подробный ответ должен считаться недоступным; safe summary и budget ledger сохраняются.

Полная service-validator latency текущим CLI не сохраняется. `timings.validationMs≈0` у live observer отражает получение уже готовых decisions, а не скорость реального production validator; не используется как performance claim.

## Причины отклонений

Счётчик — число рекомендаций с reason code, не число отдельных совпадений:

| Reason | Items (zero-based) | Count |
| --- | --- | ---: |
| FACT_VALUE_MISMATCH | 0,1,4 | 3 |
| UNBOUND_ABSENCE_CLAIM | 0,1,3 | 3 |
| INVENTED_NUMBER | 1,4 | 2 |
| INSUFFICIENT_GROWTH_CONTENT | 0 | 1 |
| PROMISED_METRIC_EFFECT | 0 | 1 |
| UNKNOWN_TARGET_URL | 3 | 1 |
| UNSUPPORTED_CTR | 4 | 1 |

Всего12 reason occurrences в4REJECTED. У принятого item2 — INCOMPLETE_EVIDENCE и HUMAN_SEO_REVIEW_REQUIRED, это review codes, не отказы.

## Все пять предложений: содержательный review

Ниже пересказ смысла, не полный защищённый текст модели. Оценка — **CODEX_EXPERT_ASSESSMENT**, не независимое human approval.

| Item | Смысл и конкретное место | Validator | Expert / вывод |
| --- | --- | --- | --- |
| 0 | HTML Title: вместо общего обозначения каталога явно назвать бренд и товарную тему, с коммерческими qualifiers | REJECTED | **QUESTIONABLE / POSSIBLE_FALSE_REJECT**. Конкретная потенциально полезная Title-гипотеза. Но официальность/оптовый формат не подтверждены cited facts, ассортимент и B2B intent требуют проверки. Нельзя передать как готовый к публикации текст |
| 1 | Проверить actual Description/H1, записать значения и сверить существующий finding до любой замены | REJECTED | **PASS как manual diagnostic brief / VALIDATOR_DEFECT_CONFIRMED на уровне отдельных условий**. Достаточно конкретно для SEO-специалиста. Это DATA_CHECK, не ростовая рекомендация. Partial claim E054 всё ещё нарушает exact contract |
| 2 | Проверить существующую JSON-LD/microdata и применимость каталоговой/навигационной разметки, не добавляя её по одному NOT_OBSERVED | NEEDS_REVIEW | **PASS / INSUFFICIENT_EVIDENCE_TO_DECIDE о необходимости изменения**. Полезный technical CHECK. E049=NOT_OBSERVED/PARTIAL, claim[] точный. Наличие/корректность разметки и смысл возможного добавления требуют ручной проверки |
| 3 | Проверить источники входящих внутренних ссылок на каталог, учитывая частичный граф | REJECTED | **QUESTIONABLE / POSSIBLE_FALSE_REJECT**. Разумный diagnostic brief, не доказательство orphan. Требование targetUrl для любого INTERNAL_LINKING затрагивает INSPECT без нового назначения ссылки. Полный граф в этом раунде не строился |
| 4 | Сопоставить URL по навигационным запросам и проверить возможное пересечение каталога с главной | REJECTED | **FAIL / VALIDATOR_TRUE_REJECT**. Направление исследования имеет смысл, но фактическая часть содержит неверную привязку query→metrics и внутреннее противоречие. Ложный CTR guard не делает весь item правильным |

### Восемь критериев

P=PASS, Q=QUESTIONABLE, F=FAIL. Подробные объяснения каждого критерия находятся только в protected artifact.

| Item | Назначение | Факты | Intent | Конкретность | SEO-обоснование | B2B-польза | Handoff | Ограничения |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 0 | Q | Q | Q | P | Q | Q | Q | P |
| 1 | P | Q | P | P | P | Q | P | P |
| 2 | P | P | Q | P | P | Q | P | P |
| 3 | P | P | Q | P | Q | Q | Q | P |
| 4 | P | F | Q | P | Q | Q | F | P |

Item1 overall PASS означает полезность ручного диагностического задания; не устраняет formal claim mismatch и не подтверждает бизнес-эффект. ReviewRequired0 означает все5Codex assessments выполнены, **не** согласование человеком.

## Конкретная диагностика claims и semantic conditions

### FACT_VALUE_MISMATCH: контрактная неполнота, не автоматически выдуманные данные

- Item0: `claims[1..4].value`, E023/E029/E031/E040. Отсутствуют `$.intents` (expected array) и `$.pageId` (expected string).
- Item1: `claims[2].value`, E054. Отсутствует `$.period` (expected object).
- Item4: `claims[0..3].value`, E027/E028/E037/E023. Отсутствуют `$.intents` и `$.pageId`.

Это17 missing-field details в9partial VALUE objects. Воспроизведённые поля этих claims не становятся ложными только из-за пропущенной metadata, однако текущий exact-equality contract действительно не выполнен. Guards здесь работают по действующей policy. Принимать partial claims автоматически нельзя.

### Подтверждённые дефекты отдельных условий

1. **Item0, rationale, PROMISED_METRIC_EFFECT.** Текст явно отрицает прогноз эффекта и гарантию. Lexical pattern на growth+CTR срабатывает внутри отрицательной оговорки. Это доказанный scope-of-negation false positive; другие причины отказа item0 остаются.
2. **Item4, rationale, UNSUPPORTED_CTR.** В условии прямо указано, что без benchmark нельзя заключать низкий CTR. Pattern видит low+CTR, игнорируя запрет на такой вывод. Это подтверждённый false positive данного условия, не оправдание неверных query metrics.
3. **Item1, proposedAction/verificationSteps, UNBOUND_ABSENCE_CLAIM.** Сначала запрошена проверка UNKNOWN tags; следующие действия обусловлены фактически подтверждённым отсутствием. Guard трактует условный antecedent как утверждение текущего отсутствия. В uncertainty также срабатывает упоминание отсутствия сохранённого HTML, хотя metadata подтверждает ограничение snapshot; это не утверждение отсутствия Description.
4. **Item1, verificationSteps[2], INVENTED_NUMBER.** Дата2026-10-07 в инструкции совпадает с `page.snapshotAt`/observedAt сохранённого snapshot. Tokens10/07 не находятся в cited `value`, поскольку дата — metadata. Это не выдуманная SEO-метрика. Numeric guard не учитывает источник даты.

Доказательства хранятся как field paths, exact predicate observations и metadata comparisons в protected `expertDiagnostics`. Эти выводы относятся к конкретным conditions, не являются acceptance override. Код не исправлен.

### Absence: обоснованные и потенциально чрезмерные отказы

- Item0 finding сравнивает известный полный Title с недостающими словами; наблюдение имеет опору в E001, но не оформлено как required MISSING_TERM claim. Отдельный formal отказ не снимается.
- Item3 rationale — условие проверки inbound на PARTIAL graph, не утверждение orphan. Потенциально чрезмерное отклонение аналогично item1. Missing targetUrl — нарушение текущей policy; для INSPECT это candidate design issue, не доказанный выдуманный URL.
- Item0 INSUFFICIENT_GROWTH_CONTENT обоснован действующей policy: кроме scalar Title и Search в cited IDs нет второго content/product evidence. Наличие body в общем profile само по себе не равно citation.

### Числа: полный дополнительный аудит

Пересмотрены все numeric occurrences всех textual fields. В protected supplemental сохранены10неподдержанных lexical occurrences:2в дате item1 и8в finding item4. В штатных detailed observations есть limit12 numeric matches/field: для длинного item4 finding он не раскрывал последние3unsupported occurrences (9,44;48,9;1,2). Они разобраны отдельно без изменения observer/guards и добавлены в protected supplement. Reason code был сохранён и до дополнения.

- Item4 значения9,78;10,64;9,44;48,9;1,2 являются округлениями существующих position/CTR. Это candidates на semantic false reject, не новые исходные метрики. Правило допустимого округления сейчас отсутствует; произвольный tolerance не вводился.
- Диапазон8–10 — неточная агрегация: одно cited значение position10,64199 выходит за верхнюю границу. Это требует исправления формулировки, не оправдывается округлением всех чисел.
- Главное: один query в начале finding получил показатели другого query, а позже тот же query приведён с корректными числами. Это реальная фактическая ошибка модели, которую простой known-numeric-token lookup не распознаёт как неверную привязку.

| Public Search evidence | Source impressions / clicks / avgPosition | Неверная атрибуция в item4 |
| --- | --- | --- |
| E037 — «газпромнефть сайт официальный сайт» | 132 /0 /9,4378787879 | В одном месте приписаны192 /0 /9,78 |
| E027 — «сайт газпромнефть официальный сайт» | 192 /0 /9,7770833333 | Источник перепутанных показателей; округление9,78 само по себе корректно для E027 |

Таблица — проверяемое сопоставление исходных чисел; полный отклонённый текст не воспроизводится. Фактический FAIL item4 сохраняется независимо от ложного UNSUPPORTED_CTR.

## Query relevance каталогу и B2B

Источник — сохранённые page-level наблюдения за2026-06-01–2026-08-31, не новый live crawl. Их наличие показывает выдачу этой страницы, а не доказанный целевой коммерческий интент.

| Query / evidence | Impressions / clicks / CTR% | Экспертная оценка |
| --- | --- | --- |
| «газпромнефть масло», E029 | 174 /27 /15,5172 | Товарная тема релевантна каталогу; B2B отдельно не подтверждён |
| «масло газпромнефть», E031 | 150 /4 /2,6667 | Аналогично; потенциальный product intent, не доказательство оптового спроса |
| «газпромнефть магазин», E023 | 264 /129 /48,8636 | Навигационный брендовый поиск магазина; ассортимент/B2B нужно уточнить |
| «газпромнефть магазин каталог товаров на заправках», E040 | 116 /69 /59,4828 | Возможно магазин товаров при АЗС; риск чужого ассортиментного intent, не основание для B2B Title |
| «газпром маркет», E017 | 1101 /5 /0,4541 | UNCERTAIN: возможен другой сервис; не объявлять окончательно нерелевантным без проверки |
| «газпромнефть официальный сайт», E020 | 533 /11 /2,0638 | NAVIGATIONAL, возможен корпоративный сайт, не обязательно каталог |
| «газпромнефть подбор масла», E022 | 372 /1 /0,2688 | ADJACENT/service intent; проверить существующее покрытие до новой посадочной |

В selected profile нет достаточного explicit B2B подтверждения для предложенных коммерческих qualifiers. Из broad brand/product queries нельзя вывести официальный статус магазина, доступность опта или необходимость новой страницы. Item4 идея intent separation содержательно разумна, но numerical contradiction и смешение возможного другого сервиса требуют исправления до handoff.

## Целостность и безопасность

Перед вызовом зафиксированы367files: production src, diagnostic modules/CLI, provider/prompt/guards, tests, Prisma, config/ENV и прежние ledgers. После вызова whole-file SHA256 совпали. Whole-row hashes10tables совпали (Scan/ScanPage/JobRun/Metrika/Webmaster/BusinessRecord/Import/Page+aliases/Opportunity/SeoAction). Evidence hash до/после/capture совпал:

`a6b40638b170c3729efbc505d97f73e22740a45d9861c5535110d29a1350b475`.

Проверки: `test-results/sprint5-2-live-integrity-before.json`, `...after.json`, соответствующие logs. Offline integrity проверки имеют0network requests; это не обнуляет единственный платный call в новом budget ledger.

Новые файлы — отчёт, acceptance fingerprints/safe summaries и offline review runner в test-results. Новых production changes нет. Полный model output находится только в защищённом TTL artifact; review также там. Configured secrets проверены без вывода значений. Доступ через public/API не добавлен.

Page360 measured через5warm local GETs после диагностики: **median484.69ms /mean509.87ms /max641.45ms,5/5HTTP200**. Benchmark использует существующий contacts route, не production crawl и не AI request. Результат в `test-results/sprint4-page360-sprint5-2-live-after.json`. Не утверждается прирост производительности по одному короткому замеру.

## Не более трёх приоритетных исправлений — только предложения

1. **Учитывать scope отрицания/условия в semantic guards.** Реальный ответ доказал false positives в uplift disclaimer, low-CTR caveat и verify-first absence CHECK. Сохранить запрет реальных обещаний/неподтверждённых утверждений, не освобождать всё поле из-за одной оговорки.
2. **Typed evidence references вместо воспроизведения целых объектов; связывать числа с query/field/metadata.** Разрешённые field paths с exact server resolution/проверкой page+period устранят обязанность копировать служебные поля; явные правила даты/округления должны сохранить источник. Одновременно проверять query→metric binding: этот ответ показал реальную ошибку, которую lexical whitelist пропускает. Partial claims автоматически не принимать.
3. **Проверять коммерческие qualifiers и page-purpose relevance до handoff ростовых гипотез.** Title должен иметь content citations и доказательства оптового/официального позиционирования; navigation/АЗС/other-service intent не считать B2B автоматически. Учитывать имеющееся покрытие до новых landing hypotheses.

Ни одно из этих исправлений в текущем раунде не реализовано. Новые API calls, retries, спринты и публикация запрещены без нового задания. **Диагностика завершена и остановлена. Sprint5.1 PASS не объявлен.**
