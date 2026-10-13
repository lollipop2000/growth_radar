# G-market Growth Radar — архитектура и модель данных

## 1. Предлагаемый стек

Если существующий проект не диктует другой стек:

### Frontend / application
- Next.js App Router
- React
- TypeScript
- Tailwind CSS

### Backend
- Next.js server routes / server actions
- при необходимости отдельный Node worker для длительных jobs

### Database
- PostgreSQL

### ORM
- Prisma

### Site crawling
- fetch / undici
- cheerio
- стандартный URL API

Playwright использовать только если конкретная страница действительно не может быть корректно проанализирована обычным HTTP GET.

Не использовать headless browser по умолчанию для всего сайта.

### Уточнение Sprint 1: WAF и источники crawl

Первый способ получения страницы — HTTP GET с честным User-Agent приложения. HTTP 403 классифицируется как `BLOCKED_BY_WAF`. Для конкретного недоступного URL допускается стандартный Playwright Chromium; Browser Scan для всего задания включается только явно пользователем. Никаких stealth-плагинов, подмены под поискового робота, автоматического login или решения challenge.

Browser: concurrency 1, delay 1000–2000 ms (default 1500), timeout 20 sec, обязательный Max Pages. Первое acceptance ограничено 50 страницами. Все браузерные запросы разрешены только как GET/HEAD внутри origin; корзина, checkout, формы и служебные URL не используются.

При недоступности браузера/WAF используется Excel Crawl Import (.xlsx/.csv). HTTP, BROWSER и IMPORT возвращают общий PageResult и записываются одним storage adapter в Page / ScanPage. `ScanPage.source` содержит `HTTP | BROWSER | IMPORT`; остальные спринты используют те же данные независимо от источника. Отсутствующие при импорте поля остаются null, а не выдумываются.

### Excel
- `xlsx` или совместимая библиотека

### Charts
- Recharts

### Jobs
На MVP:
- таблица jobs;
- worker;
- cron/scheduler.

Не вводить Redis, Kafka, RabbitMQ и т.п. без доказанной необходимости.

### Deployment
Приложение не должно зависеть от Vercel-specific functionality.

---

## 2. Общая архитектура

```text
                           ┌─────────────────┐
                           │ Интернет-магазин│
                           │ внутри подсети  │
                           └────────┬────────┘
                                    │ crawl
                                    ▼
                           ┌─────────────────┐
                           │   Site Scanner  │
                           └────────┬────────┘
                                    │
                                    ▼
┌────────────────┐         ┌─────────────────┐
│Яндекс Вебмастер│────────►│                 │
└────────────────┘         │                 │
                           │   PostgreSQL    │
┌────────────────┐         │                 │
│Яндекс Метрика  │────────►│                 │
└────────────────┘         └────────┬────────┘
                                    ▲
                                    │
                             ┌──────┴───────┐
                             │ Excel Import │
                             └──────────────┘
                                    │
                                    ▼
                           ┌─────────────────┐
                           │ Rules + Scoring │
                           └────────┬────────┘
                                    │
                                    ▼
                              Opportunities
                                    │
                                    ▼
                           ┌─────────────────┐
                           │   LLM Analyzer  │
                           └────────┬────────┘
                                    │
                                    ▼
                           ┌─────────────────┐
                           │  Growth Radar   │
                           └─────────────────┘
```

---

## 3. Главная связующая сущность

Центр всей системы: canonical / normalized URL.

Нужно добиться цепочки:

```text
URL сайта
↓
результат crawler
↓
данные Вебмастера
↓
данные Метрики
↓
данные Excel
↓
сигналы
↓
Opportunity Score
↓
AI-анализ
```

Нельзя строить независимые отчеты по каждому источнику.

---

## 4. URL normalization

Создать отдельный utility с unit tests.

Учитывать:
- trailing slash;
- fragment;
- UTM;
- tracking parameters;
- порядок query params;
- редиректы;
- canonical URL.

Не объединять URL, если query parameter реально определяет отдельную страницу.

---

## 5. Минимальная модель данных к завершению MVP

Ориентировочно:

```text
Site
Page

Scan
ScanPage

WebmasterQueryDaily
MetrikaPageDaily

Import
ImportProfile
BusinessRecord

Rule
Opportunity
OpportunityEvidence
OpportunityStatusHistory

AiAnalysis

PageChange

GrowthRadarReport

Job
JobRun

Integration
```

Перед реализацией каждого спринта проверить, можно ли решить задачу меньшим количеством таблиц без потери прозрачности.

---

## 6. ENV

Подготовить `.env.example`.

Минимально:

```text
DATABASE_URL=

APP_URL=
SITE_BASE_URL=

YANDEX_METRIKA_TOKEN=
YANDEX_METRIKA_COUNTER_ID=

YANDEX_WEBMASTER_TOKEN=

LLM_PROVIDER=
LLM_API_URL=
LLM_API_KEY=
LLM_MODEL=
```

Sprint 2: Webmaster user ID и выбранный host ID определяются API и сохраняются в Integration.configJson. ENV требует только token. Метрика использует существующие token/counter ENV. Дневные API records связаны с Page и JobRun; secrets в JSON не хранятся. Reports API Метрики имеет явную гранулярность landing page × day; полные Webmaster URL/query данные получаются асинхронным export с durable checkpoints и только базовым тарифом.

---

## 7. Нефункциональные требования

### Security
Все OAuth tokens, API keys и credentials только server-side.

### Network safety
Crawler работает против production-магазина, поэтому обязательны:
- низкий default concurrency;
- configurable delay;
- timeout;
- stop button;
- max pages;
- защита от циклических URL;
- запрет бесконечного crawl.

### Reliability
Повторный sync/import не должен плодить дубликаты.

### Observability
Каждый background job хранит:
- start;
- finish;
- status;
- rows;
- errors;
- duration.

### Audit
Хранить историю:
- imports;
- AI analysis;
- opportunity workflow;
- detected page changes.
