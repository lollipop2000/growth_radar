# G-market Growth Radar — Sprint 0–2

# SPRINT 0. Foundation

## Цель

Создать безопасный фундамент проекта и убедиться, что приложение может работать из корпоративной сети и сканировать целевой интернет-магазин.

## 0.1. Базовая структура UI

Создать разделы:

```text
/
Dashboard

/pages
Pages

/scanner
Site Scanner

/webmaster
Yandex Webmaster

/metrika
Yandex Metrika

/imports
Excel Imports

/opportunities
Opportunities

/settings
Settings

/system
System Status
```

Разделы могут быть пустыми до соответствующих спринтов.

## 0.2. PostgreSQL + Prisma

Минимальные таблицы:

### Site
- id
- name
- baseUrl
- createdAt
- updatedAt

### Page
- id
- siteId
- url
- normalizedUrl
- path
- firstSeenAt
- lastSeenAt
- active
- createdAt
- updatedAt

### Scan
- id
- siteId
- startedAt
- finishedAt
- status
- pagesDiscovered
- pagesScanned
- errorsCount

### ScanPage
- id
- scanId
- pageId
- statusCode
- responseTimeMs
- error
- scannedAt

### Integration
- id
- type
- enabled
- status
- lastSuccessfulSyncAt
- lastError
- configJson

Секреты не хранить в `configJson`.

## 0.3. Проверка доступа к сайту

Settings → `Test site connection`.

Показать:
- resolved URL;
- HTTP status;
- response time;
- content type;
- размер ответа;
- title;
- понятную ошибку при сбое.

Корректно обрабатывать:
- DNS error;
- timeout;
- certificate error;
- 401;
- 403;
- redirects.

## 0.4. System Status

Показать:
- Database
- Target Site
- Yandex Metrika
- Yandex Webmaster
- LLM

Состояния:
- Connected / Configured
- Error
- Not configured

Хранить время последней проверки.

## Sprint 0 Acceptance

PASS только если:
- проект запускается локально;
- PostgreSQL подключается;
- миграции применяются на чистой БД;
- приложение видит сайт из подсети;
- secrets не попадают во frontend;
- production build PASS;
- typecheck PASS;
- создан `SPRINT0_RUNBOOK.md`.

---

# SPRINT 1. Site Scanner

## Уточнение: WAF / Browser / Excel Crawl Import

HTTP остаётся первым способом. 403/challenge → BLOCKED_BY_WAF; browser fallback применяется только для недоступной через HTTP страницы либо в явно выбранном Browser Scan mode. Browser concurrency 1, delay default 1500 ms (1000–2000), timeout 20 sec; первый acceptance максимум 50 страниц. Не выполнять mutating requests, login/challenge bypass, stealth или подмену User-Agent поискового робота; не взаимодействовать с формами/корзиной/checkout.

Если браузер не читает страницу, доступен Excel Crawl Import (XLSX/CSV): URL, Status Code, Title, Meta Description, H1, H2, Canonical, Robots, Word Count. Все источники заполняют общие Page / ScanPage, с `source = HTTP | BROWSER | IMPORT`. Сначала проверить Browser Scan на одном реальном URL; при WAF/challenge остановиться и зафиксировать ограничение в SPRINT1_RUNBOOK.md.

## Цель

Научить приложение самостоятельно строить карту интернет-магазина и хранить технические и контентные характеристики страниц.

## 1.1. Discovery URL

Поддержать три способа.

Приоритет:

1. `/robots.txt` и sitemap;
2. внутренние `<a href>`;
3. вручную заданные seed URL.

Поддержать sitemap index.

## 1.2. Crawl boundaries

Не выходить за разрешенный host.

Не обходить:
- внешние домены;
- mailto;
- tel;
- javascript;
- anchors;
- logout;
- служебные URL.

Настраиваемые exclude patterns, например:

```text
/admin
/login
/logout
/cart
/checkout
/api
```

## 1.3. Rate limits

Настройки:

```text
Concurrency: default 2
Delay: default 500 ms
Timeout: default 15 sec
Max pages per scan
```

Нельзя создавать высокую нагрузку на production.

## 1.4. Данные каждой страницы

### HTTP
- URL
- normalized URL
- final URL
- status code
- redirects
- response time
- content type
- content length

### HTML
- title
- meta description
- canonical
- robots meta
- H1
- H2 list
- lang
- word count
- internal links count
- external links count

### OpenGraph
- og:title
- og:description
- og:image

### Structured data
Определять наличие:
- Product
- Offer
- BreadcrumbList
- FAQ
- Organization

### Content hash
Сохранять fingerprint страницы для будущего определения изменений.

## 1.5. ScanPage

Расширить полями:
- finalUrl
- title
- description
- canonical
- h1
- h2Json
- robots
- wordCount
- internalLinksCount
- externalLinksCount
- structuredDataJson
- contentHash

## 1.6. Site Scanner UI

Показывать:
- last scan;
- duration;
- discovered;
- scanned;
- failed.

Actions:
- Start full scan
- Stop scan
- Scan one URL

История сканирований.

## 1.7. Pages UI

Таблица:

| URL | Status | Title | H1 | Words | Canonical | Last scan |

Фильтры:
- status;
- type;
- missing title;
- missing description;
- missing H1;
- duplicate;
- indexable / non-indexable.

Поиск по URL/title/H1.

## 1.8. Rule-based page classification

Типы:
- homepage;
- category;
- product;
- article;
- search;
- informational;
- other.

Правила через URL patterns.

Пользователь может вручную изменить тип.

LLM не использовать.

## Sprint 1 Acceptance

PASS если:
1. crawler находит sitemap;
2. строит список страниц;
3. не выходит за домен;
4. соблюдает concurrency/delay;
5. собирает Title/H1/Description/Canonical/status;
6. повторный scan не плодит дубликаты;
7. ошибки видны;
8. URL normalization покрыт unit tests;
9. scan можно остановить;
10. build/typecheck/tests PASS;
11. создан `SPRINT1_RUNBOOK.md`.

---

# SPRINT 2. Яндекс Вебмастер + Метрика

## Цель

Добавить реальные данные поискового спроса и поведения пользователей.

## 2.1. OAuth

В MVP токены задаются через ENV.

Полный OAuth callback flow пока не обязателен.

Токены только server-side.

## 2.2. Webmaster Test Connection

Settings → Test Webmaster.

Проверить:
- token;
- user;
- host;
- права.

Показывать нормализованную ошибку.

## 2.3. Webmaster data model

### WebmasterQueryDaily
- id
- siteId
- date
- pageId nullable
- url
- normalizedUrl
- query
- region nullable
- impressions
- clicks
- avgPosition
- ctr
- importedAt

Добавить unique constraint для защиты от дублей.

## 2.4. Webmaster Sync

Поддержать:
- Initial import: 7 / 30 / 90 дней;
- Incremental sync;
- Manual sync;
- Scheduled sync раз в сутки.

По возможности использовать расширенную выгрузку поисковых запросов по URL.

Не строить архитектуру на предположении, что один простой endpoint всегда вернет все запросы.

## 2.5. Webmaster UI

Показывать:
- impressions;
- clicks;
- CTR;
- average position;
- queries;
- pages.

Периоды:
- 7d;
- 30d;
- 90d.

Графики:
- impressions;
- clicks;
- CTR;
- position.

## 2.6. URL matching

Связывать Webmaster URL с Page по normalizedUrl.

Если сопоставление не удалось:
- статус `UNMATCHED`;
- отдельный экран Unmatched URLs.

## 2.7. Metrika Test Connection

Проверить:
- token;
- counter;
- права.

## 2.8. Metrika data model

На первом этапе использовать API отчетов, не Logs API.

### MetrikaPageDaily
- siteId
- pageId nullable
- date
- url
- normalizedUrl
- visits
- visitors
- pageviews
- bounceRate
- avgVisitDuration
- goalConversionsJson
- importedAt

## 2.9. Goals mapping

Получить доступные цели счетчика.

В Settings пользователь отмечает Primary Goals.

Не создавать новые цели автоматически.

Хранить mapping.

## 2.10. Metrika Sync

Поддержать:
- initial 90 days;
- daily incremental;
- manual sync.

Показывать:
- started;
- completed;
- rows;
- duration;
- API errors.

При rate limit использовать retry/backoff.

## 2.11. Page 360

На `/pages/[id]`:

### Site
- Title
- Description
- H1
- Status
- Canonical
- Word count

### Search
- Impressions
- Clicks
- CTR
- Position

### Behaviour
- Visits
- Visitors
- Bounce
- Goals

### Top queries
TOP-20 запросов страницы.

Периоды:
- 7d
- 30d
- 90d

## Sprint 2 Acceptance

Для реального URL магазина можно открыть Page 360 и увидеть:

```text
HTML страницы
+
данные Вебмастера
+
данные Метрики
```

Дополнительно:
- повторный sync не создает дублей;
- API errors логируются;
- tokens не видны frontend;
- unmatched URLs доступны;
- build/typecheck/tests PASS;
- создан `SPRINT2_RUNBOOK.md`.
