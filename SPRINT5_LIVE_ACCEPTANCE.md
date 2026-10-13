# Sprint 5 — Page SEO Review · Live acceptance · 09.10.2026

## Статус и решение

**Live acceptance FAIL / READY WITH FIXES.** Выполнены D → A → B. D прошёл без API; A прошёл экспертную оценку с оговорками; на B серия остановлена по качеству. C и E не запускались. Использовано **2 из 4** платных вызовов DeepSeek, **0 retries**, **2 неиспользованных**. Ledger закрыт halt=true, stopReason=B_GROUNDING_AND_UTILITY_FAILURE; его нельзя сбрасывать или переигрывать.

Главный положительный результат: конкретная очистка META_DESCRIPTION товарной страницы с готовым текстом на известных фактах. Это не доказывает устойчивую полезность на других типах страниц. Из пяти принятых карточек одна CHANGE и четыре CHECK; все пять имеют NEEDS_REVIEW. Продуктовый PASS Sprint 5 не объявлен.

## Серия и фактические counts

| Case | URL | Calls | Generated | Accepted | Rejected | Экспертная оценка |
| --- | --- | ---: | ---: | ---: | ---: | --- |
| D | https://shop.gazpromneft-sm.ru/catalog/tp-30-kub-1-000-l/ | 0 | 0 | 0 | 0 | PASS: empty / 0 API |
| A | https://shop.gazpromneft-sm.ru/catalog/gazpromneft-premium-n-5w-40-kanistra-4-l/ | 1 | 5 | 4 | 1 | PASS |
| B | https://shop.gazpromneft-sm.ru/catalog/ | 1 | 5 | 1 | 4 | FAIL |
| C | https://shop.gazpromneft-sm.ru/about/contacts/ | 0 | N/A | N/A | N/A | NOT RUN: остановка после B |
| E | https://shop.gazpromneft-sm.ru/ | 0 | N/A | N/A | N/A | NOT RUN: остановка после B |

Всего: generated **10**, accepted **5**, rejected **5**; SUPPORTED **0**, NEEDS_REVIEW **5**. Эксперт: четыре квалифицированных PASS для A, один QUESTIONABLE для B. Экспертная оценка выполнена Codex по сохранённым данным; это не отдельная подпись независимого human reviewer. Никакой дополнительный judge API не использован.

## Зафиксированная конфигурация и неизменность

Model: **deepseek-flash**. Prompt: **PAGE_SEO_REVIEW_V1**. Перед каждой попыткой проверены SHA-256 кода/provider/guards/builder/config/.env/старых ledgers и before/after DB hashes. Профиль каждой страницы также проверен по отдельному hash. E на preflight имеет ACTIVE findings=0; его provider не вызван после остановки. У A тоже ACTIVE findings=0: один useful result без finding prerequisite наблюдался, но E этим не подменяется.

Финальная integrity: **PASS**, codeUnchanged=true, dataUnchanged=true. Source rows, snapshots, Pages/types/aliases, Imports/BusinessRecord, Metrika/Webmaster, Opportunities и SeoActions не изменены. Старые остановленные ledgers не сброшены/не использованы. Между вызовами не менялись prompt/provider/guards/data. Только новый acceptance harness, review artifacts и отчёт; application code не дорабатывался.

## Latency и токены

| Case | Builder ms | DeepSeek transport ms | Validator ms | Total measured ms | Input tokens | Output tokens |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| D | 1034.0 | 0.0 | 24.7 | 1070.4 | 0 (no API) | 0 (no API) |
| A | 2692.4 | 14721.9 | 86.2 | 17523.2 | 12662 | 4117 |
| B | 988.9 | 14405.4 | 102.6 | 15534.6 | 14318 | 3047 |

Итого DeepSeek: **26 980 input + 7 164 output = 34 144 tokens**. Измеренный total начинается со сборки evidence и включает request/validation/safe diagnostics; предварительные file/data-hash проверки и запуск CLI не входят. Это два разных сценария по одной попытке, не latency distribution.

Стандартный publicData маскирует ключи usage, содержащие token, даже для числовой статистики. Acceptance harness отдельно сохранил числовой usage существующего transport response, без сохранения API response text. Provider/production serializer не исправлялись во время серии.

## Все причины отклонения — без отклонённого текста

| Case | Item index (0-based) | Все проваленные conditions |
| --- | ---: | --- |
| A | 0 | FACT_VALUE_MISMATCH |
| B | 0 | QUERY_NOT_CITED, FACT_VALUE_MISMATCH, UNKNOWN_TARGET_URL, UNBOUND_ABSENCE_CLAIM |
| B | 1 | QUERY_NOT_CITED, UNSUPPORTED_MISSING_TERM |
| B | 2 | UNSAFE_TEXT |
| B | 3 | FACT_VALUE_MISMATCH |

- FACT_VALUE_MISMATCH: claim VALUE не совпал с JSON.stringify registry value. Сравнение чувствительно в том числе к порядку ключей; код сам по себе не доказывает фактическую галлюцинацию. Какая именно свободная формулировка была отклонена, не восстанавливается: текст не сохранён.
- QUERY_NOT_CITED: target query не связан с соответствующим cited search evidence. Это не то же самое, что выдуманный запрос.
- UNKNOWN_TARGET_URL: URL не находится в ограниченном allowed registry, а не доказанно не существует на сайте.
- UNBOUND_ABSENCE_CLAIM: распознанное утверждение об отсутствии не связано с разрешённым ABSENT/MISSING_TERM claim.
- UNSUPPORTED_MISSING_TERM: evidence не подтверждает отсутствие термина по требованиям full scalar/state/type/truncation.
- UNSAFE_TEXT: сработал существующий lexical guard. Без закрытого текста нельзя утверждать злонамеренность либо назвать точное совпавшее слово.

B не объявлен «четырьмя доказанными галлюцинациями». Наблюдалась системная неспособность получить пригодный validated set, а единственное принятое действие недостаточно для практического SEO-результата. Это основание остановки; guards не ослаблялись и вызовы не повторялись.

## Полные принятые рекомендации и экспертная оценка

Ниже **все пять** принятых карточек, включая NEEDS_REVIEW, без сокращений модельных полей, proposed content, verification steps, claims и cited evidence. Полные evidence values относятся только к принятым карточкам. Configured secrets/чувствительные поля отредактированы штатным publicData; отклонённых ответов, полного prompt и raw response нет. Экспертные замечания отделены от текста AI и не переписывают его задним числом.

### A · rec-description-rewrite · NEEDS_REVIEW

**DESCRIPTION / MEDIUM / CHANGE / META_DESCRIPTION**

**Экспертная оценка**

PASS с оговорками. Практическое изменение: заменить именно HTML meta description, убрать список артикулов и символ #. Готовая строка содержит подтверждённые синтетический тип, SAE и фасовку; это можно передать SEO-специалисту после проверки актуального метатега и уникальности текста.

Опора: E002 — полный сохранённый Description; E008 — наблюдалось «Синтетическое» и 5W-40. Реальные запросы E021/E031/E038: соответственно 8/4/3 показов, по 0 кликов, за 01.06–31.08.2026. Это небольшой объём наблюдений, не доказательство будущего роста CTR.

Модельная фраза «не описывая продукт» чрезмерна: текущий Description уже называет продукт, моторное масло и всесезонное применение. Полезность состоит в конкретной очистке метатега, а не в этом диагнозе. SAE и фасовка уже есть: рекомендация переписывает поле, не доказывает их отсутствие.

Назначение товарной страницы сохранено. Допуски/совместимость/причины отсутствия продаж не придуманы. Экспертный PASS означает полезность задания, а не подтверждённый эффект или разрешение публикации.

**Полная принятая карточка: текст AI и все доказательства**

```json
{
  "id": "rec-description-rewrite",
  "area": "DESCRIPTION",
  "priority": "MEDIUM",
  "recommendationType": "CHANGE",
  "finding": "Description (E002) содержит три артикула, служебный символ «#» и повторяет Title, не описывая продукт и его применение.",
  "rationale": "В профиле есть запросы с указанием типа масла и характеристик: «масло газпромнефть 5w40 синтетика» (E021), «моторное масло газпромнефть 5w40 синтетика характеристики» (E031), «купить масло газпромнефть 5w40 синтетика премиум» (E038). Description может отражать подтверждённые свойства: синтетическое, 5W-40, канистра 4 л.",
  "proposedAction": "Переписать META_DESCRIPTION, убрав артикулы и служебный символ, добавив подтверждённые свойства продукта.",
  "placement": "META_DESCRIPTION",
  "operation": "REWRITE",
  "proposedContent": {
    "currentText": "Купить Gazpromneft Premium N 5W-40 Канистра 4 л 000253140423, 002389900144, 002389907666, Масло моторное универсальное всесезонное Gazpromneft Premium N 5W-40 (канистра п/э 4л)# в интернет-магазине «Газпромнефть-СМ». Оригинальные масла по доступным ценам от производителя.",
    "suggestedText": "Gazpromneft Premium N 5W-40 — синтетическое моторное масло в канистре 4 л. Купить в интернет-магазине «Газпромнефть-СМ».",
    "placement": "META_DESCRIPTION"
  },
  "targetQueries": [
    "масло газпромнефть 5w40 синтетика",
    "моторное масло газпромнефть 5w40 синтетика характеристики",
    "купить масло газпромнефть 5w40 синтетика премиум"
  ],
  "targetUrl": "https://shop.gazpromneft-sm.ru/catalog/gazpromneft-premium-n-5w-40-kanistra-4-l/",
  "evidenceIds": [
    "E002",
    "E008",
    "E021",
    "E031",
    "E038"
  ],
  "uncertainty": "Сохранённый снимок не подтверждает текущее состояние live-сайта. Влияние на CTR не оценивается.",
  "verificationSteps": [
    "Проверить текущий META_DESCRIPTION на live-странице.",
    "Сравнить с сохранённым значением E002.",
    "Убедиться, что описание не дублирует другие карточки."
  ],
  "claims": [
    {
      "evidenceId": "E002",
      "relation": "VALUE",
      "value": "Купить Gazpromneft Premium N 5W-40 Канистра 4 л 000253140423, 002389900144, 002389907666, Масло моторное универсальное всесезонное Gazpromneft Premium N 5W-40 (канистра п/э 4л)# в интернет-магазине «Газпромнефть-СМ». Оригинальные масла по доступным ценам от производителя."
    },
    {
      "evidenceId": "E008",
      "relation": "VALUE",
      "value": "томобили Вид масла Синтетическое Вязкость по SAE 5W-40 Вид двигателя Дизель Бренд Газпромнефть Вес нетто, кг 3.427 Вес брутто, кг 3.701 Добавить "
    }
  ],
  "status": "NEEDS_REVIEW",
  "reasonCodes": [
    "INCOMPLETE_EVIDENCE",
    "HUMAN_SEO_REVIEW_REQUIRED"
  ],
  "evidence": [
    {
      "id": "E002",
      "kind": "content.description",
      "value": "Купить Gazpromneft Premium N 5W-40 Канистра 4 л 000253140423, 002389900144, 002389907666, Масло моторное универсальное всесезонное Gazpromneft Premium N 5W-40 (канистра п/э 4л)# в интернет-магазине «Газпромнефть-СМ». Оригинальные масла по доступным ценам от производителя.",
      "state": "KNOWN_PRESENT",
      "coverage": "FULL",
      "source": "SAVED_SNAPSHOT:BROWSER",
      "observedAt": "2026-10-07T15:49:19.956Z",
      "truncated": false,
      "supportsAbsenceClaim": false
    },
    {
      "id": "E008",
      "kind": "content.specifications",
      "value": "томобили Вид масла Синтетическое Вязкость по SAE 5W-40 Вид двигателя Дизель Бренд Газпромнефть Вес нетто, кг 3.427 Вес брутто, кг 3.701 Добавить ",
      "state": "KNOWN_PRESENT",
      "coverage": "PARTIAL",
      "source": "SAVED_SNAPSHOT:BROWSER",
      "observedAt": "2026-10-07T15:49:19.956Z",
      "truncated": false,
      "supportsAbsenceClaim": false
    },
    {
      "id": "E021",
      "kind": "search.query",
      "value": {
        "query": "масло газпромнефть 5w40 синтетика",
        "impressions": 8,
        "clicks": 0,
        "demand": 226,
        "ctr": 0,
        "avgPosition": 40.8625,
        "intents": [
          "PRODUCT",
          "SPECIFICATION",
          "BRAND"
        ]
      },
      "state": "KNOWN_PRESENT",
      "coverage": "FULL",
      "source": "SAVED_WEBMASTER",
      "observedAt": null,
      "truncated": false,
      "supportsAbsenceClaim": false,
      "period": {
        "from": "2026-06-01",
        "to": "2026-08-31"
      }
    },
    {
      "id": "E031",
      "kind": "search.query",
      "value": {
        "query": "моторное масло газпромнефть 5w40 синтетика характеристики",
        "impressions": 4,
        "clicks": 0,
        "demand": 13,
        "ctr": 0,
        "avgPosition": 35.5,
        "intents": [
          "PRODUCT",
          "SPECIFICATION",
          "BRAND"
        ]
      },
      "state": "KNOWN_PRESENT",
      "coverage": "FULL",
      "source": "SAVED_WEBMASTER",
      "observedAt": null,
      "truncated": false,
      "supportsAbsenceClaim": false,
      "period": {
        "from": "2026-06-01",
        "to": "2026-08-31"
      }
    },
    {
      "id": "E038",
      "kind": "search.query",
      "value": {
        "query": "купить масло газпромнефть 5w40 синтетика премиум",
        "impressions": 3,
        "clicks": 0,
        "demand": 30,
        "ctr": 0,
        "avgPosition": 32.333333333333336,
        "intents": [
          "TRANSACTIONAL",
          "PRODUCT",
          "SPECIFICATION",
          "BRAND"
        ]
      },
      "state": "KNOWN_PRESENT",
      "coverage": "FULL",
      "source": "SAVED_WEBMASTER",
      "observedAt": null,
      "truncated": false,
      "supportsAbsenceClaim": false,
      "period": {
        "from": "2026-06-01",
        "to": "2026-08-31"
      }
    }
  ]
}
```

### A · rec-application-spec-check · NEEDS_REVIEW

**APPLICATION / MEDIUM / CHECK / APPLICATION_BLOCK**

**Экспертная оценка**

PASS как первичная диагностическая задача, не как готовое изменение контента. Указаны конкретные блоки применения/спецификаций и сравнение с E007/E008/E014; ненаблюдение не объявлено отсутствием.

Запросы E021/E031 реально содержат интерес к синтетическому маслу/характеристикам. Характеристики уже наблюдались, поэтому добавлять их повторно на основании этого CHECK нельзя.

SEO-специалист может выполнить чтение HTML и зафиксировать состояние существующих блоков. Критерий полноты сформулирован слабее, чем метаданные: оценивать его нужно по утверждённым продуктовым фактам, без новых OEM/application claims. Диагностическая полезность есть, немедленная ценность для реализации ограничена.

**Полная принятая карточка: текст AI и все доказательства**

```json
{
  "id": "rec-application-spec-check",
  "area": "APPLICATION",
  "priority": "MEDIUM",
  "recommendationType": "CHECK",
  "finding": "В сохранённом снимке блок применения и спецификаций представлен фрагментарно (E007, E008, E014); полнота и наличие отдельных блоков не подтверждены.",
  "rationale": "Запросы «моторное масло газпромнефть 5w40 синтетика характеристики» (E031) и «масло газпромнефть 5w40 синтетика» (E021) указывают на интерес к характеристикам и применению. Без проверки HTML нельзя утверждать отсутствие блоков.",
  "proposedAction": "Проверить HTML страницы на наличие блоков применения и спецификаций, а также их полноту.",
  "placement": "APPLICATION_BLOCK",
  "operation": "INSPECT",
  "targetQueries": [
    "моторное масло газпромнефть 5w40 синтетика характеристики",
    "масло газпромнефть 5w40 синтетика"
  ],
  "targetUrl": "https://shop.gazpromneft-sm.ru/catalog/gazpromneft-premium-n-5w-40-kanistra-4-l/",
  "evidenceIds": [
    "E007",
    "E008",
    "E014",
    "E021",
    "E031"
  ],
  "uncertainty": "Сохранённый снимок PARTIAL; ненаблюдение не означает отсутствие. Требуется проверка live-сайта.",
  "verificationSteps": [
    "Открыть live-страницу и проверить наличие блоков применения и спецификаций.",
    "Сравнить с сохранёнными фрагментами E007, E008, E014.",
    "Зафиксировать результат в отдельном отчёте."
  ],
  "claims": [
    {
      "evidenceId": "E007",
      "relation": "VALUE",
      "value": "асла Синтетическое Вязкость по SAE 5W-40 Вид двигателя Дизель Бренд Газпромнефть Вес нетто, кг 3.427 Вес брутто, кг 3.701 Добавить в корзину 0002"
    },
    {
      "evidenceId": "E008",
      "relation": "VALUE",
      "value": "томобили Вид масла Синтетическое Вязкость по SAE 5W-40 Вид двигателя Дизель Бренд Газпромнефть Вес нетто, кг 3.427 Вес брутто, кг 3.701 Добавить "
    }
  ],
  "status": "NEEDS_REVIEW",
  "reasonCodes": [
    "INCOMPLETE_EVIDENCE",
    "HUMAN_SEO_REVIEW_REQUIRED"
  ],
  "evidence": [
    {
      "id": "E007",
      "kind": "content.application",
      "value": "асла Синтетическое Вязкость по SAE 5W-40 Вид двигателя Дизель Бренд Газпромнефть Вес нетто, кг 3.427 Вес брутто, кг 3.701 Добавить в корзину 0002",
      "state": "KNOWN_PRESENT",
      "coverage": "PARTIAL",
      "source": "SAVED_SNAPSHOT:BROWSER",
      "observedAt": "2026-10-07T15:49:19.956Z",
      "truncated": false,
      "supportsAbsenceClaim": false
    },
    {
      "id": "E008",
      "kind": "content.specifications",
      "value": "томобили Вид масла Синтетическое Вязкость по SAE 5W-40 Вид двигателя Дизель Бренд Газпромнефть Вес нетто, кг 3.427 Вес брутто, кг 3.701 Добавить ",
      "state": "KNOWN_PRESENT",
      "coverage": "PARTIAL",
      "source": "SAVED_SNAPSHOT:BROWSER",
      "observedAt": "2026-10-07T15:49:19.956Z",
      "truncated": false,
      "supportsAbsenceClaim": false
    },
    {
      "id": "E014",
      "kind": "content.characteristics",
      "value": "от подделок. товар от производителя Описание Характеристики Масло моторное универсальное всесезонное Gazpromneft Premium N 5W-40 (канистра п/э 4л",
      "state": "KNOWN_PRESENT",
      "coverage": "PARTIAL",
      "source": "SAVED_SNAPSHOT:BROWSER",
      "observedAt": "2026-10-07T15:49:19.956Z",
      "truncated": false,
      "supportsAbsenceClaim": false
    },
    {
      "id": "E021",
      "kind": "search.query",
      "value": {
        "query": "масло газпромнефть 5w40 синтетика",
        "impressions": 8,
        "clicks": 0,
        "demand": 226,
        "ctr": 0,
        "avgPosition": 40.8625,
        "intents": [
          "PRODUCT",
          "SPECIFICATION",
          "BRAND"
        ]
      },
      "state": "KNOWN_PRESENT",
      "coverage": "FULL",
      "source": "SAVED_WEBMASTER",
      "observedAt": null,
      "truncated": false,
      "supportsAbsenceClaim": false,
      "period": {
        "from": "2026-06-01",
        "to": "2026-08-31"
      }
    },
    {
      "id": "E031",
      "kind": "search.query",
      "value": {
        "query": "моторное масло газпромнефть 5w40 синтетика характеристики",
        "impressions": 4,
        "clicks": 0,
        "demand": 13,
        "ctr": 0,
        "avgPosition": 35.5,
        "intents": [
          "PRODUCT",
          "SPECIFICATION",
          "BRAND"
        ]
      },
      "state": "KNOWN_PRESENT",
      "coverage": "FULL",
      "source": "SAVED_WEBMASTER",
      "observedAt": null,
      "truncated": false,
      "supportsAbsenceClaim": false,
      "period": {
        "from": "2026-06-01",
        "to": "2026-08-31"
      }
    }
  ]
}
```

### A · rec-schema-check · NEEDS_REVIEW

**TECHNICAL_SEO / MEDIUM / CHECK / STRUCTURED_DATA**

**Экспертная оценка**

PASS как конкретная техническая проверка Product/Offer в HTML/JSON-LD и проверка валидности. E049 = [] имеет NOT_OBSERVED/PARTIAL, E053 подтверждает товарный mapping.

Предложение не объявляет schema отсутствующей и не требует немедленно внедрить или продублировать её. Назначение карточки понято правильно. Можно передать SEO-специалисту как read-only проверку; если разметка уже валидна, диагностическую задачу следует закрыть без изменений.

Наличие schema не гарантирует специальное представление в поиске; эффект этой проверки не измерялся.

**Полная принятая карточка: текст AI и все доказательства**

```json
{
  "id": "rec-schema-check",
  "area": "TECHNICAL_SEO",
  "priority": "MEDIUM",
  "recommendationType": "CHECK",
  "finding": "В сохранённом снимке структурированные данные не наблюдаются (E049, schema=[]), но покрытие PARTIAL.",
  "rationale": "Для карточки товара структурированные данные Product/Offer могут улучшить представление в поиске. Отсутствие в снимке не доказывает отсутствие на live-сайте.",
  "proposedAction": "Проверить HTML на наличие JSON-LD или микроразметки Product/Offer.",
  "placement": "STRUCTURED_DATA",
  "operation": "INSPECT",
  "targetUrl": "https://shop.gazpromneft-sm.ru/catalog/gazpromneft-premium-n-5w-40-kanistra-4-l/",
  "evidenceIds": [
    "E049",
    "E053"
  ],
  "uncertainty": "Сохранённый снимок PARTIAL; schema=[] не доказывает отсутствие на live-сайте.",
  "verificationSteps": [
    "Проверить HTML на наличие script type=\"application/ld+json\".",
    "Проверить валидность разметки через инструменты.",
    "Сравнить с сохранённым значением E049."
  ],
  "claims": [
    {
      "evidenceId": "E049",
      "relation": "VALUE",
      "value": []
    },
    {
      "evidenceId": "E053",
      "relation": "VALUE",
      "value": {
        "groups": [
          {
            "code": "2419",
            "name": "Gazpromneft Premium N 5W-40 Канистра 4 л"
          }
        ],
        "skus": [
          {
            "sku": "2389907666",
            "name": "Gazpromneft Premium N 5W-40 Канистра 4 л",
            "productGroup": "2419"
          },
          {
            "sku": "2389900144",
            "name": "Gazpromneft Premium N 5W-40 Канистра 4 л",
            "productGroup": "2419"
          },
          {
            "sku": "253140423",
            "name": "Gazpromneft Premium N 5W-40 Канистра 4 л",
            "productGroup": "2419"
          }
        ],
        "category": "Масло"
      }
    }
  ],
  "status": "NEEDS_REVIEW",
  "reasonCodes": [
    "INCOMPLETE_EVIDENCE",
    "HUMAN_SEO_REVIEW_REQUIRED"
  ],
  "evidence": [
    {
      "id": "E049",
      "kind": "technical.schema",
      "value": [],
      "state": "NOT_OBSERVED",
      "coverage": "PARTIAL",
      "source": "SAVED_SNAPSHOT:BROWSER",
      "observedAt": "2026-10-07T15:49:19.956Z",
      "truncated": false,
      "supportsAbsenceClaim": false
    },
    {
      "id": "E053",
      "kind": "product",
      "value": {
        "groups": [
          {
            "code": "2419",
            "name": "Gazpromneft Premium N 5W-40 Канистра 4 л"
          }
        ],
        "skus": [
          {
            "sku": "2389907666",
            "name": "Gazpromneft Premium N 5W-40 Канистра 4 л",
            "productGroup": "2419"
          },
          {
            "sku": "2389900144",
            "name": "Gazpromneft Premium N 5W-40 Канистра 4 л",
            "productGroup": "2419"
          },
          {
            "sku": "253140423",
            "name": "Gazpromneft Premium N 5W-40 Канистра 4 л",
            "productGroup": "2419"
          }
        ],
        "category": "Масло"
      },
      "state": "KNOWN_PRESENT",
      "coverage": "FULL",
      "source": "CONFIRMED_MAPPING",
      "observedAt": null,
      "truncated": false,
      "supportsAbsenceClaim": false
    }
  ]
}
```

### A · rec-internal-links-check · NEEDS_REVIEW

**INTERNAL_LINKING / LOW / CHECK / INTERNAL_LINK**

**Экспертная оценка**

PASS как предварительная LOW-проверка входящих ссылок на один известный URL. E050 даёт наблюдаемый минимум inbound=0 при 665/1495 source Pages; это не orphan-факт.

E054–E058 относятся к OUTBOUND. Они дают контекст, но не подтверждают отсутствие входящих ссылок. Exact URL/aliases и неполные исторические snapshots остаются ограничениями.

Можно передать специалисту проверку уже существующих ссылок из категорий/связанных товаров и aliases. Предложенный общий crawl дороже targeted inspection и не является разрешённым действием этой приёмки: новый crawler/production scan не запускался. Готового задания на добавление ссылок здесь нет.

**Полная принятая карточка: текст AI и все доказательства**

```json
{
  "id": "rec-internal-links-check",
  "area": "INTERNAL_LINKING",
  "priority": "LOW",
  "recommendationType": "CHECK",
  "finding": "В сохранённом графе inbound для страницы пуст (E050, inbound=0), при этом граф покрывает 665 из 1495 страниц (PARTIAL).",
  "rationale": "Входящие внутренние ссылки важны для обнаружения и распределения веса. Пустой inbound в PARTIAL-графе не доказывает orphan.",
  "proposedAction": "Проверить входящие внутренние ссылки на карточку через live-краулер или панель вебмастера.",
  "placement": "INTERNAL_LINK",
  "operation": "COMPARE",
  "targetUrl": "https://shop.gazpromneft-sm.ru/catalog/gazpromneft-premium-n-5w-40-kanistra-4-l/",
  "evidenceIds": [
    "E050",
    "E054",
    "E055",
    "E056",
    "E057",
    "E058"
  ],
  "uncertainty": "Граф PARTIAL: 665/1495 страниц. Нельзя доказать orphan. Списки links ограничены.",
  "verificationSteps": [
    "Запустить краулер по сайту и собрать входящие ссылки на URL.",
    "Сравнить с сохранённым inbound=0 (E050).",
    "Проверить наличие ссылок из категорий и связанных товаров."
  ],
  "claims": [
    {
      "evidenceId": "E050",
      "relation": "VALUE",
      "value": {
        "observedPages": 665,
        "totalPages": 1495,
        "inbound": 0,
        "outbound": 63
      }
    },
    {
      "evidenceId": "E054",
      "relation": "VALUE",
      "value": {
        "url": "https://shop.gazpromneft-sm.ru/",
        "pageType": "homepage"
      }
    }
  ],
  "status": "NEEDS_REVIEW",
  "reasonCodes": [
    "PARTIAL_GRAPH",
    "INCOMPLETE_EVIDENCE",
    "HUMAN_SEO_REVIEW_REQUIRED"
  ],
  "evidence": [
    {
      "id": "E050",
      "kind": "links.summary",
      "value": {
        "observedPages": 665,
        "totalPages": 1495,
        "inbound": 0,
        "outbound": 63
      },
      "state": "KNOWN_PRESENT",
      "coverage": "PARTIAL",
      "source": "SAVED_LINK_GRAPH",
      "observedAt": null,
      "truncated": false,
      "supportsAbsenceClaim": false
    },
    {
      "id": "E054",
      "kind": "links.outbound",
      "value": {
        "url": "https://shop.gazpromneft-sm.ru/",
        "pageType": "homepage"
      },
      "state": "KNOWN_PRESENT",
      "coverage": "PARTIAL",
      "source": "SAVED_LINK_GRAPH:BROWSER",
      "observedAt": "2026-10-07T14:08:07.817Z",
      "truncated": false,
      "supportsAbsenceClaim": false
    },
    {
      "id": "E055",
      "kind": "links.outbound",
      "value": {
        "url": "https://shop.gazpromneft-sm.ru/about/",
        "pageType": "informational"
      },
      "state": "KNOWN_PRESENT",
      "coverage": "PARTIAL",
      "source": "SAVED_LINK_GRAPH:BROWSER",
      "observedAt": "2026-10-07T14:08:30.280Z",
      "truncated": false,
      "supportsAbsenceClaim": false
    },
    {
      "id": "E056",
      "kind": "links.outbound",
      "value": {
        "url": "https://shop.gazpromneft-sm.ru/about/contacts/",
        "pageType": "informational"
      },
      "state": "KNOWN_PRESENT",
      "coverage": "PARTIAL",
      "source": "SAVED_LINK_GRAPH:BROWSER",
      "observedAt": "2026-10-07T14:09:08.177Z",
      "truncated": false,
      "supportsAbsenceClaim": false
    },
    {
      "id": "E057",
      "kind": "links.outbound",
      "value": {
        "url": "https://shop.gazpromneft-sm.ru/about/delivery/",
        "pageType": "informational"
      },
      "state": "KNOWN_PRESENT",
      "coverage": "PARTIAL",
      "source": "SAVED_LINK_GRAPH:BROWSER",
      "observedAt": "2026-10-07T14:08:50.390Z",
      "truncated": false,
      "supportsAbsenceClaim": false
    },
    {
      "id": "E058",
      "kind": "links.outbound",
      "value": {
        "url": "https://shop.gazpromneft-sm.ru/about/manipulation/",
        "pageType": "informational"
      },
      "state": "KNOWN_PRESENT",
      "coverage": "PARTIAL",
      "source": "SAVED_LINK_GRAPH:BROWSER",
      "observedAt": "2026-10-07T14:08:58.917Z",
      "truncated": false,
      "supportsAbsenceClaim": false
    }
  ]
}
```

### B · rec-title-check · NEEDS_REVIEW

**TITLE / MEDIUM / CHECK / HTML_TITLE**

**Экспертная оценка**

QUESTIONABLE; сценарий B — FAIL. Карточка безопасна и использует настоящие данные, но как единственный сохранившийся результат категории с существенным Search даёт слишком мало практической SEO-ценности.

E001: полный Title «Каталог продукции». E002 Description и E003 H1 — UNKNOWN. Реальные запросы E029/E031/E023/E024 имеют 174/27, 150/4, 264/129, 258/1 показов/кликов за M3 соответственно. Запросы не выдуманы, категорийное назначение понято.

Ничего уже наблюдаемого не предлагается добавить как отсутствующее. UNKNOWN H1/Description не объявлены пустыми. Но действие сводится к сбору метаданных и повторной оценке позднее: нет предложенного Title, конкретного несоответствия или критерия выбора формулировки. Неизвестность H1/Description сама по себе не исключает квалифицированной гипотезы по известному Title и Search.

Можно передать как обычную проверку полноты данных, но не как реализационное SEO-ТЗ. Предположение о шаблонном Title всех категорий page-level evidence не доказывает. Вместе с отказом 4/5 items по нескольким grounding conditions этого недостаточно для полезного сценария B — серия остановлена.

**Полная принятая карточка: текст AI и все доказательства**

```json
{
  "id": "rec-title-check",
  "area": "TITLE",
  "priority": "MEDIUM",
  "recommendationType": "CHECK",
  "finding": "Title сохранён как «Каталог продукции» (E001). В search-профиле присутствуют брендовые и продуктовые запросы (например, «газпромнефть масло», «масло газпромнефть», «газпромнефть магазин»), но без подтверждённого H1 и Description нельзя оценить полноту соответствия Title интенту категории.",
  "rationale": "Title — единственное подтверждённое метаполе. Прежде чем предлагать REWRITE, нужно проверить H1 и Description, чтобы не дублировать формулировки и не потерять релевантность.",
  "proposedAction": "Проверить H1 и Description живой страницы, затем сопоставить Title с релевантными запросами профиля. При подтверждённом несоответствии — CHANGE с текстом только из подтверждённых свойств каталога.",
  "placement": "HTML_TITLE",
  "operation": "COMPARE",
  "targetQueries": [
    "газпромнефть масло",
    "масло газпромнефть",
    "газпромнефть магазин",
    "газпромнефть цены"
  ],
  "targetUrl": "https://shop.gazpromneft-sm.ru/catalog/",
  "evidenceIds": [
    "E001",
    "E003",
    "E002",
    "E029",
    "E031",
    "E023",
    "E024"
  ],
  "uncertainty": "Title может быть шаблонным для всех категорий; без подтверждённого H1 и Description нельзя утверждать, что Title не соответствует интенту.",
  "verificationSteps": [
    "Получить HTML живой страницы.",
    "Зафиксировать Title, H1 и Description.",
    "Сопоставить Title с релевантными запросами профиля.",
    "При подтверждённом несоответствии — оформить CHANGE."
  ],
  "claims": [
    {
      "evidenceId": "E001",
      "relation": "VALUE",
      "value": "Каталог продукции"
    }
  ],
  "status": "NEEDS_REVIEW",
  "reasonCodes": [
    "INCOMPLETE_EVIDENCE",
    "HUMAN_SEO_REVIEW_REQUIRED"
  ],
  "evidence": [
    {
      "id": "E001",
      "kind": "content.title",
      "value": "Каталог продукции",
      "state": "KNOWN_PRESENT",
      "coverage": "FULL",
      "source": "SAVED_SNAPSHOT:BROWSER",
      "observedAt": "2026-10-07T19:22:36.585Z",
      "truncated": false,
      "supportsAbsenceClaim": false
    },
    {
      "id": "E003",
      "kind": "content.h1",
      "value": null,
      "state": "UNKNOWN",
      "coverage": "UNKNOWN",
      "source": "SAVED_SNAPSHOT:BROWSER",
      "observedAt": "2026-10-07T19:22:36.585Z",
      "truncated": false,
      "supportsAbsenceClaim": false
    },
    {
      "id": "E002",
      "kind": "content.description",
      "value": null,
      "state": "UNKNOWN",
      "coverage": "UNKNOWN",
      "source": "SAVED_SNAPSHOT:BROWSER",
      "observedAt": "2026-10-07T19:22:36.585Z",
      "truncated": false,
      "supportsAbsenceClaim": false
    },
    {
      "id": "E029",
      "kind": "search.query",
      "value": {
        "query": "газпромнефть масло",
        "impressions": 174,
        "clicks": 27,
        "demand": 665,
        "ctr": 15.517241379310345,
        "avgPosition": 9.072413793103447,
        "intents": [
          "PRODUCT",
          "BRAND"
        ]
      },
      "state": "KNOWN_PRESENT",
      "coverage": "FULL",
      "source": "SAVED_WEBMASTER",
      "observedAt": null,
      "truncated": false,
      "supportsAbsenceClaim": false,
      "period": {
        "from": "2026-06-01",
        "to": "2026-08-31"
      }
    },
    {
      "id": "E031",
      "kind": "search.query",
      "value": {
        "query": "масло газпромнефть",
        "impressions": 150,
        "clicks": 4,
        "demand": 725,
        "ctr": 2.6666666666666665,
        "avgPosition": 9.475333333333335,
        "intents": [
          "PRODUCT",
          "BRAND"
        ]
      },
      "state": "KNOWN_PRESENT",
      "coverage": "FULL",
      "source": "SAVED_WEBMASTER",
      "observedAt": null,
      "truncated": false,
      "supportsAbsenceClaim": false,
      "period": {
        "from": "2026-06-01",
        "to": "2026-08-31"
      }
    },
    {
      "id": "E023",
      "kind": "search.query",
      "value": {
        "query": "газпромнефть магазин",
        "impressions": 264,
        "clicks": 129,
        "demand": 85,
        "ctr": 48.86363636363637,
        "avgPosition": 1.2018939393939394,
        "intents": [
          "BRAND"
        ]
      },
      "state": "KNOWN_PRESENT",
      "coverage": "FULL",
      "source": "SAVED_WEBMASTER",
      "observedAt": null,
      "truncated": false,
      "supportsAbsenceClaim": false,
      "period": {
        "from": "2026-06-01",
        "to": "2026-08-31"
      }
    },
    {
      "id": "E024",
      "kind": "search.query",
      "value": {
        "query": "газпромнефть цены",
        "impressions": 258,
        "clicks": 1,
        "demand": 150,
        "ctr": 0.3875968992248062,
        "avgPosition": 7.624418604651163,
        "intents": [
          "BRAND"
        ]
      },
      "state": "KNOWN_PRESENT",
      "coverage": "FULL",
      "source": "SAVED_WEBMASTER",
      "observedAt": null,
      "truncated": false,
      "supportsAbsenceClaim": false,
      "period": {
        "from": "2026-06-01",
        "to": "2026-08-31"
      }
    }
  ]
}
```

## Page360 performance

Один и тот же route /pages/cmuv6ydso000t20gomgcaf3mg?searchPeriod=M3, warm-up плюс пять GET без нажатия AI-кнопки. До: mean **563.2 ms**, median **537.4 ms**. После: mean **517.8 ms**, median **470.4 ms**. Все 10 измеренных ответов HTTP 200. В этой небольшой локальной выборке деградации не наблюдалось; ускорение не гарантируется. Initial GET не вызывал evidence builder/DeepSeek.

## Проверки, безопасность и ограничения

Acceptance harness typecheck PASS. Preflight profiles и финальные code/data hashes PASS. Ранее выполненные offline checks сохраняют результат 286/286 full tests, 30/30 SEO Review, 129/129 AI regression, build/secrets/migrations PASS; полный suite и build не повторялись для acceptance-only script. Новый секрет-поиск по artifacts проверяется отдельно. Никаких production crawl/sync/export, recalculation, изменения CMS, Site SEO Strategy, TDS ingestion, Competitive Benchmark, bulk AI или публикации.

Сохранены только принятые карточки и их evidence, экспертные замечания, metadata/counters/reason codes. Нет raw rejected text. Диагностика кодами не позволяет реконструировать отклонённые строки или отличить все semantic violations от lexical/serialization false positives; такую неопределённость нельзя скрывать.

## Артефакты и следующий шаг

- `test-results/sprint5-live-2026-10-09.json`: отдельный stopped ledger, accepted cards, counts, usage, freeze hashes и final integrity.
- `test-results/sprint5-live-review-2026-10-09.json`: поэлементная экспертная оценка A/B.
- `test-results/sprint5-live-{init,D,A,B,integrity,typecheck}.log`: safe execution records.
- `test-results/sprint4-page360-sprint5-live-{before,after}.json`: Page360 measurements.

Серия завершена остановкой после B; два неиспользованных вызова не расходуются автоматически. Следующий отдельный этап может исследовать grounding consistency и полезность конкретных category hypotheses, но в этой приёмке код не меняется. C/E остаются непроверенными, устойчивый продуктовый PASS не подтверждён.
