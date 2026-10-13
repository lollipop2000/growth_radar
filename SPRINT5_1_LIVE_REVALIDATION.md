# Sprint 5.1 — Live revalidation · 09.10.2026

## Статус

**LIVE REVALIDATION FAIL / READY WITH FIXES.** Главный сценарий B не дал ни одной принятой рекомендации. Серия остановлена после единственного вызова. A и E не запускались. Продуктовый PASS не объявлен; offline PASS не заменяет live-полезность.

## Ledger и ограничения

Новый ledger: test-results/sprint5-1-live-2026-10-09.json. Максимум 3 новых платных вызова; использован **1**, retries **0**, исходящих запросов **1**, не использовано **2**. halt=true; stopReason=B_ALL_REJECTED_NO_USEFUL_RECOMMENDATION. Старые Sprint 4/5 ledgers сохранены, их остатки не переиспользованы. Ни этот остановленный ledger, ни его остаток автоматически продолжаться не будут.

Model **deepseek-flash**, prompt **PAGE_SEO_REVIEW_V2**. Единственный POST выполнен штатным provider. Harness допускает ровно один HTTP-запрос за процесс только к настроенному chat/completions; reservation записана до вызова, повторные шаги запрещены. Между preflight и finish hashes кода, provider, guards, ENV, старых ledgers и десяти таблиц проверены; профиль B совпал с preflight hash.

## Сценарии

| Case | Calls | Generated | Accepted | Rejected | Review |
| --- | ---: | ---: | ---: | ---: | --- |
| B /catalog/ | 1 | 5 | 0 | 5 | FAIL: нет полезного принятого результата |
| A товар | 0 | N/A | N/A | N/A | NOT RUN: B FAIL |
| E главная | 0 | N/A | N/A | N/A | NOT RUN: B FAIL |

## Полный текст принятых рекомендаций и содержательный review

**Принятых рекомендаций нет (0), включая NEEDS_REVIEW и SUPPORTED.** Поэтому нет принятого текста, предлагаемого изменения, placement или evidence IDs рекомендации, которые можно честно предъявить SEO-специалисту. READY_CHANGE=0, GROWTH_HYPOTHESIS=0, DATA_CHECK=0. Отклонённые тексты не сохранялись и не включены в отчёт.

Оценка B: **FAIL**. Требовалась хотя бы одна practically useful READY_CHANGE/GROWTH_HYPOTHESIS. Пустой принятый результат этому условию не соответствует. Поэлементный содержательный review принятых карточек неприменим: карточек нет. Это оценка Codex по фактическому результату, а не независимая подпись human reviewer. Judge API не применялся.

## Диагностика отклонений

| Proposal index (1-based) | Все проваленные условия |
| ---: | --- |
| 1 | FACT_VALUE_MISMATCH, UNBOUND_ABSENCE_CLAIM |
| 2 | FACT_VALUE_MISMATCH, UNBOUND_ABSENCE_CLAIM |
| 3 | FACT_VALUE_MISMATCH, INVENTED_NUMBER, UNSUPPORTED_CTR |
| 4 | UNBOUND_ABSENCE_CLAIM |
| 5 | FACT_VALUE_MISMATCH, INVENTED_NUMBER, UNSUPPORTED_CTR |

Частоты: FACT_VALUE_MISMATCH — 4 items; UNBOUND_ABSENCE_CLAIM — 3; INVENTED_NUMBER — 2; UNSUPPORTED_CTR — 2. Это 11 срабатываний в 5 items, а не 11 рекомендаций.

Что установлено кодом: структурный VALUE не совпал с registry по точным типам/значениям/структуре; отсутствие в свободном тексте не было связано с допустимым absence claim; в тексте появились числовые токены вне cited evidence; CTR-формулировка попала под запрет вывода о низком CTR без benchmark.

Границы диагностики: полный отклонённый текст/claim не хранится. Нельзя указать конкретную отличающуюся цифру, поле или фразу, объявить все отказы доказанными галлюцинациями либо исключить semantic false positive (например, отрицательную оговорку о CTR). Порядок ключей уже не влияет на сравнение; это не доказательство того, какой именно ключ/тип отличался в этой попытке. QUERY_NOT_CITED, UNKNOWN_TARGET_URL и UNSAFE_TEXT в этой серии не сработали, но это не доказывает исправление всех возможных случаев.

Без изменения guards/prompt/model/data нельзя получить другую попытку в этой серии. Серия остановлена; новые платные генерации не выполнялись.

## Исходные Search evidence и content

Page https://shop.gazpromneft-sm.ru/catalog/; pageType=category; snapshot=cmuyhvkix00vx20qcislhclj7, BROWSER, 2026-10-07T19:22:36.585Z; ACTIVE findings=1. Search period 2026-06-01–2026-08-31; unique queries=502, selected=25.

Title: Каталог продукции (E001, KNOWN_PRESENT/FULL). H1 E003: UNKNOWN; Description E002: UNKNOWN. Наличие null не доказывает отсутствие на production.

Полный Search summary:

```json
{
  "impressions": 13058,
  "clicks": 1947,
  "ctr": 14.910399754939501,
  "avgPosition": 6.857137387042431,
  "days": 0,
  "grain": "MONTH",
  "monthsCovered": 3,
  "coverage": 1
}
```

| ID | Исходный запрос | Показы | Клики | CTR % | Avg position | Existing intents |
| --- | --- | ---: | ---: | ---: | ---: | --- |
| E017 | газпром маркет | 1101 | 5 | 0.45413260672116257 | 9.103814713896456 | OTHER |
| E018 | gazpromneft | 766 | 14 | 1.8276762402088773 | 8.065404699738904 | BRAND |
| E019 | газпромнефть | 598 | 9 | 1.5050167224080269 | 10.253846153846155 | BRAND |
| E020 | газпромнефть официальный сайт | 533 | 11 | 2.0637898686679175 | 9.415572232645403 | BRAND |
| E021 | газпром маркет официальный сайт | 413 | 6 | 1.4527845036319613 | 7.85956416464891 | OTHER |
| E022 | газпромнефть подбор масла | 372 | 1 | 0.26881720430107525 | 8.901612903225805 | BRAND |
| E023 | газпромнефть магазин | 264 | 129 | 48.86363636363637 | 1.2018939393939394 | BRAND |
| E024 | газпромнефть цены | 258 | 1 | 0.3875968992248062 | 7.624418604651163 | BRAND |
| E025 | газпром магазин | 237 | 115 | 48.52320675105485 | 1.1970464135021097 | OTHER |
| E026 | газпроммаркет официальный сайт | 213 | 1 | 0.4694835680751174 | 8.61924882629108 | OTHER |
| E027 | сайт газпромнефть официальный сайт | 192 | 0 | 0 | 9.777083333333334 | BRAND |
| E028 | газпром маркет 3.0 сайт официальный | 181 | 0 | 0 | 10.641988950276241 | OTHER |
| E029 | газпромнефть масло | 174 | 27 | 15.517241379310345 | 9.072413793103447 | PRODUCT, BRAND |
| E030 | масло газпром | 163 | 3 | 1.8404907975460123 | 8.414723926380368 | PRODUCT |
| E031 | масло газпромнефть | 150 | 4 | 2.6666666666666665 | 9.475333333333335 | PRODUCT, BRAND |
| E032 | что такое топ товары на азс газпромнефть | 9 | 0 | 0 | 7.211111111111112 | BRAND, INFORMATIONAL |
| E033 | канистра на азс газпром | 5 | 3 | 60 | 2.2 | PACKAGING |
| E034 | газпромнефть цена | 72 | 0 | 0 | 8.375 | TRANSACTIONAL, BRAND |
| E035 | масла газпромнефть официальный сайт цены | 135 | 16 | 11.851851851851851 | 2.7696296296296294 | BRAND |
| E036 | газпром подбор масла | 132 | 3 | 2.272727272727273 | 7.5598484848484855 | OTHER |
| E037 | газпромнефть сайт официальный сайт | 132 | 0 | 0 | 9.437878787878788 | BRAND |
| E038 | заправка газпромнефть официальный сайт цены | 131 | 2 | 1.5267175572519085 | 8.356488549618321 | BRAND |
| E039 | газпром масло | 120 | 6 | 5 | 7.6575 | PRODUCT |
| E040 | газпромнефть магазин каталог товаров на заправках | 116 | 69 | 59.48275862068966 | 1.2060344827586207 | BRAND |
| E041 | подбор масла газпромнефть | 106 | 0 | 0 | 9.696226415094339 | BRAND |

Это фактические 25 bounded Search records из неизменного профиля, переданного модели, а не evidence IDs принятых рекомендаций. Все относятся к указанным странице/периоду. demand не передавался. Полные provenance/state/coverage и period для каждого ID: test-results/sprint5-1-live-B-evidence.json.

## Latency и фактические tokens

| Case | Builder ms | DeepSeek transport ms | Validator ms | End-to-end ms | Input tokens | Output tokens |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| B | 983.31 | 20249.79 | 202.54 | 21444.63 | 15395 | 5579 |

Всего **20974 tokens**. Счётчики взяты из usage реального transport, не оценены по длине текста. End-to-end включает подготовку/валидацию и acceptance overhead. A/E latency/tokens N/A — вызовов не было.

## Page360 performance

Тот же contacts Page360 M3, один warm-up исключён, затем по пять последовательных GET. До mean 535.96 ms / median 565.50 ms; после mean 581.67 ms / median 598.90 ms; изменение mean 8.53%. Все 10 измеренных ответов 200. Это отдельный initial GET без запуска AI builder/provider; timings DeepSeek в него не входят. Локальная серия не доказывает универсальную latency при иной нагрузке.

Samples before: 565.50, 661.14, 621.32, 420.41, 411.43 ms. Samples after: 607.68, 655.49, 538.20, 508.09, 598.90 ms.

## Integrity / проверки

Final integrity: PASS. Whole-row hashes совпали для Scan, ScanPage, JobRun, MetrikaPageDaily, WebmasterQueryDaily, BusinessRecord, Import, Opportunity, Page, SeoAction. Prompt/provider/guards/config/ENV/old ledgers не изменены. Production crawl/sync/export, новые Pages/SeoActions, публикация и другие запрещённые направления не запускались.

Application code не дорабатывался в live-приёмке. Новый harness прошёл typecheck; исходные 337/337 offline tests/build/schema/security результаты остаются прежней отдельной технической проверкой, не новым product PASS. После серии выполнен secrets check.

## Следующий шаг

**READY WITH FIXES / LIVE FAIL.** Нужна отдельная offline-задача на диагностику оставшихся FACT_VALUE/absence/number/CTR отказов и проверку полезности. Не ослаблять guards ради acceptance; не менять текущую серию и не генерировать повтор до удачи. Дальнейший live — только после отдельно согласованных изменений и нового разрешения/ledger.
