# G-market Growth Radar — Sprint 3–5

# SPRINT 3. Excel + Rules Engine + Opportunities

## Цель

Получить первую реально полезную версию, которая сама отвечает:

> куда смотреть в первую очередь?

LLM пока не использовать.

## 3.1. Excel Import Wizard

Поддержать `.xlsx`.

Шаги:
1. Upload
2. Preview первых 20 строк
3. Column mapping
4. Validation
5. Import
6. Results

Показывать:
- imported;
- skipped;
- errors.

## 3.2. Поддерживаемые поля

Система не должна требовать все колонки.

### Product / Page
- URL
- SKU
- productName
- category
- productGroup

### Commercial
- price
- stock
- available
- package
- priority

### Sales, если есть
- date
- orders
- quantityKg
- revenue

### Custom fields
Дополнительные колонки хранить в JSON attributes.

## 3.3. Import Profiles

Пользователь сохраняет mapping, например:

> Еженедельная выгрузка G-market

Следующая загрузка того же формата не требует нового mapping.

## 3.4. Import History

Хранить:
- filename;
- importedAt;
- rows;
- profile;
- errors;
- status.

Новая загрузка не должна молча удалять историю.

## 3.5. Rules Engine

Независимый от UI движок.

Каждое правило возвращает:

```text
ruleId
pageId
severity
score
title
description
evidence
period
createdAt
```

## 3.6. Базовые правила

### RULE 01. High Impressions / Low CTR
Высокие показы, хорошая позиция, CTR ниже benchmark.

### RULE 02. Striking Distance
Средняя позиция примерно 5–15 при достаточном спросе.

### RULE 03. Traffic Without Conversion
Есть визиты, но Primary Goal conversion низкая.

### RULE 04. Falling Search Demand
Сравнить последние 28 дней с предыдущими 28 днями.

### RULE 05. Position Drop
Позиция ухудшилась при сохраняющемся спросе.

### RULE 06. Growing Demand
Impressions существенно выросли.

### RULE 07. Search Demand but Page Problem
Есть спрос, но страница:
- 404;
- 5xx;
- noindex;
- canonical указывает на другой URL.

### RULE 08. Good Demand / Low Content
Есть высокий спрос и явные on-page проблемы:
- missing title;
- missing description;
- missing H1;
- подозрительно низкий word count.

Не считать короткий текст проблемой сам по себе.

### RULE 09. Availability Issue
Если Excel содержит availability:
- есть поисковый спрос;
- товар unavailable.

### RULE 10. Sales Drop With Stable Traffic
Только если Excel содержит продажи:
- search/visits stable;
- sales materially down.

## 3.7. CTR Benchmark

Не использовать универсальное `CTR < 3%`.

Два режима:

### Simple
Threshold задает пользователь.

### Relative
Сравнение страниц одного диапазона позиций:
- 1–3;
- 4–5;
- 6–10;
- 11–20.

Relative режим предпочтительный.

## 3.8. Opportunity Score

Прозрачная формула 0–100.

Пример:

- Search demand: 0–30
- Position opportunity: 0–20
- CTR opportunity: 0–20
- Conversion opportunity: 0–15
- Business priority: 0–15

Показывать breakdown:

```text
Opportunity Score = 78

Search demand      +26
Position gap       +18
CTR gap            +17
Conversion         +7
Business priority  +10
```

AI здесь не использовать.

## 3.9. Opportunities UI

Таблица:

| Score | URL | Opportunity | Impressions | Position | CTR | Visits | Conversion |

Фильтры:
- period;
- page type;
- rule;
- score;
- category;
- priority.

Сортировка по Score.

## 3.10. Opportunity Detail

Показывать:
- почему найдено;
- evidence;
- search trend;
- traffic trend;
- top queries;
- site scan status;
- Excel attributes;
- score breakdown.

## 3.11. Dashboard v1

Компактно:

### KPI
- Search impressions
- Organic clicks
- CTR
- Organic visits
- Primary conversions

Если импортированы:
- orders
- revenue
- kg

### TOP-5 opportunities

### Alerts
- broken pages
- sync failures
- crawler errors

## Sprint 3 Acceptance

Без LLM система сама формирует TOP opportunities на реальных данных.

Для каждой Opportunity пользователь понимает:
- почему она появилась;
- на каких данных основана;
- почему у нее такой score.

Build/typecheck/tests PASS.

Создать `SPRINT3_RUNBOOK.md`.

---

# SPRINT 4. AI Analyst

## Цель

LLM не ищет аномалии.

LLM получает уже найденную Opportunity и помогает объяснить ее.

## 4.1. Provider abstraction

Не привязываться жестко к OpenAI.

Интерфейс:

```typescript
interface LlmProvider {
  analyzeOpportunity(input): Promise<Analysis>
}
```

ENV:

```text
LLM_PROVIDER=
LLM_API_URL=
LLM_API_KEY=
LLM_MODEL=
```

Поддержать корпоративный OpenAI-compatible endpoint, если он будет доступен.

## 4.2. Что передавать модели

Только данные конкретной Opportunity.

### Page
- URL
- type
- title
- description
- H1
- headings
- word count
- relevant content extract

### Search
- impressions
- clicks
- CTR
- position
- dynamics

### Top queries
Максимум 20–30.

### Metrika
- visits
- bounce
- conversion
- dynamics

### Excel
Если доступны:
- availability
- price
- product group
- priority
- sales

### Rules
Сработавшие правила.

### Benchmark
С чем сравниваем.

## 4.3. Что НЕ отправлять модели

Не отправлять:
- весь сайт;
- полные выгрузки Метрики;
- все запросы;
- исходные Excel;
- OAuth tokens;
- cookies;
- персональные данные.

## 4.4. Structured output

Возвращать JSON schema:

```json
{
  "summary": "",
  "diagnosis": "",
  "hypotheses": [
    {
      "title": "",
      "reason": "",
      "evidence": [],
      "confidence": "low|medium|high"
    }
  ],
  "recommendedActions": [],
  "expectedEffect": "",
  "responsibleArea": "seo|content|ecommerce|technical|assortment|analytics",
  "dataGaps": []
}
```

Ограничения:
- максимум 3 hypotheses;
- максимум 5 recommended actions.

## 4.5. Anti-hallucination

System prompt должен запрещать:
- придумывать отсутствующие показатели;
- утверждать причинность по одной корреляции;
- давать точный финансовый эффект без данных;
- придумывать запросы;
- придумывать содержимое страницы.

Каждая гипотеза должна иметь evidence.

При недостатке данных использовать `dataGaps`.

## 4.6. UI

Opportunity → `Analyze with AI`.

Показывать:
- AI Summary
- Likely diagnosis
- Hypotheses
- Recommended actions
- Responsible area
- Missing data
- Generated at
- Model

## 4.7. AI History

Не перезаписывать старый анализ.

Хранить историю.

## 4.8. Batch Analysis

Кнопка:

`Analyze TOP-5`

Не разрешать массово анализировать весь сайт.

## Sprint 4 Acceptance

TOP-5 Opportunity можно проанализировать через LLM.

Анализ:
- основан на фактах;
- содержит максимум 3 гипотезы;
- содержит evidence;
- сохраняется в истории.

Если LLM недоступен, остальная система продолжает работать.

Создать `SPRINT4_RUNBOOK.md`.

---

# SPRINT 5. Growth Radar + Weekly Cycle

## Цель

Превратить систему в регулярный инструмент управления.

## 5.1. Weekly Radar

Создать snapshot:

### GrowthRadarReport
- id
- periodFrom
- periodTo
- createdAt
- opportunitiesCount
- snapshotJson

## 5.2. Главный Weekly экран

### Search
- Impressions
- Clicks
- CTR
- Average position

### Site
- Organic visits
- Primary conversion

### Business, если импортирован
- Orders
- Revenue
- Kg

## 5.3. Dynamics

Сравнение:
- Current 28 days
- Previous 28 days

Допустимо добавить week-over-week.

## 5.4. TOP-5 Growth Opportunities

Каждая карточка:

```text
#1 <Page/Product>

Opportunity Score: 84

Что происходит
...

Почему важно
...

Evidence
...

AI hypothesis
...

Recommended action
...

Responsible area
...
```

## 5.5. Opportunity workflow

Статусы:

```text
NEW
REVIEWING
ACCEPTED
REJECTED
IMPLEMENTED
MEASURING
CLOSED
```

Добавить комментарий пользователя.

Не превращать это в Jira.

## 5.6. Baseline

При `ACCEPTED` сохранить baseline:
- impressions;
- clicks;
- CTR;
- position;
- visits;
- conversion;
- orders, если есть.

## 5.7. Measurement

После реализации пользователь задает `Implemented date`.

Сравнивать before/after.

Например:

```text
CTR
1.1% → 2.0%

Clicks
210 → 370

Conversion
3.8% → 3.9%
```

Не утверждать причинность.

Формулировка:
> После изменения наблюдалось...

## 5.8. Change Detection

По `contentHash` фиксировать:
- detectedAt;
- previousHash;
- newHash.

## 5.9. Scheduled Jobs

Settings:

### Site scan
- manual
- daily
- weekly

### Webmaster
- daily

### Metrika
- daily

### Weekly Radar
- weekly

Показывать:
- next run;
- last run;
- status;
- duration.

## 5.10. Data Freshness

Dashboard:

```text
Site scan       Updated 4h ago
Webmaster       Updated 8h ago
Metrika         Updated 7h ago
Business Excel  Updated 5d ago
```

Если источник устарел, показывать warning.

## 5.11. System Health

Секции:
- Scanner
- Webmaster API
- Metrika API
- Database
- LLM
- Jobs
- Excel

Состояния:

```text
HEALTHY
WARNING
ERROR
NOT_CONFIGURED
```

## Sprint 5 Acceptance

Пользователь может:
1. открыть Growth Radar;
2. увидеть свежесть данных;
3. увидеть TOP-5;
4. открыть Opportunity;
5. получить AI-анализ;
6. принять/отклонить;
7. отметить реализацию;
8. позже увидеть before/after.

Создать `SPRINT5_RUNBOOK.md`.
