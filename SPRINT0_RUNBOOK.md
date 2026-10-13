# Sprint 0 — Foundation

## Объём

Изучены все шесть исходных Markdown-файлов в `docs/`. До начала работы каталог содержал только спецификацию, без исходного кода и `.git`.

Реализованы девять маршрутов, Settings с сохранением URL и HTTP-проверкой, System Status, PostgreSQL/Prisma и начальная недеструктивная миграция. Таблицы: Site, Page, Scan, ScanPage, Integration. Дополнительное поле `Integration.lastCheckedAt` хранит время проверки. Unique constraints предотвращают дубли сайтов, страниц, результатов scan и типов интеграций. Delete relations — RESTRICT.

Sprint 1+ не реализован: crawler, normalization, sync API, Excel, rules, scoring, AI и scheduler отсутствуют. Разделы будущих спринтов — заглушки.

## Запуск

См. README.md. На этой машине `.env` уже создан с случайным паролем PostgreSQL и `SITE_BASE_URL=https://shop.gazpromneft-sm.ru/`; не публиковать `.env`.

```powershell
docker compose up -d db
npm ci
npm run db:migrate
npm run db:generate
npm run build
npm start
```

Приложение: http://127.0.0.1:3000 (IPv4 loopback). Если localhost разрешается только в IPv6, используйте этот адрес. Режим разработки: `npm run dev`.

При Windows EPERM на Prisma query engine завершите процесс приложения перед `prisma generate`/build: работающий процесс держит DLL. Перед сборкой не запускайте dev/start параллельно.

Docker-вариант: `docker compose --profile app up -d --build`. При запуске app применяются существующие миграции; SQL-схему вручную не редактировать. Доступ к магазину проверяется именно из контейнера/сервера приложения, который должен иметь сетевой маршрут до магазина.

## Проверка acceptance

1. `npm run build` — production build.
2. `npm run typecheck` — TypeScript.
3. `npm test` — реальные локальные HTTP fixtures: title/bytes/redirect, 401/403, timeout, цикл redirect, внешний host, лимит тела; дополнительно DNS/TLS и очистка ошибок.
4. `npm run db:status` — миграция применена. Повторный `npm run db:migrate` не меняет схему и данные.
5. `/settings`: сохранить адрес магазина, нажать Test site connection. Проверить resolved URL, HTTP status, duration, content type, bytes, title/error.
6. `/system`: Проверить систему. Database — Connected; Target Site — Connected при доступном магазине; Яндекс и LLM — Not configured без ENV, Configured при заполнении всех обязательных полей. Configured не означает проверки прав/API.
7. Обновить `/system` и перезапустить приложение: последние timestamps и статусы должны сохраниться в PostgreSQL. Время в интерфейсе — МСК.
8. Открыть все девять маршрутов: каждый отвечает HTTP 200.
9. В DevTools проверить HTML/RSC/network и клиентские chunks: DATABASE_URL, OAuth tokens, LLM_API_KEY не передаются. В configJson сохраняется только baseUrl. В логи не записываются raw exceptions или ENV.

CLI для повторяемой проверки и сохранения результатов: `npm run check:system` (выводит только статусы/нормализованные ошибки/timestamps).

## Фактическая проверка 05.10.2026

| Проверка | Результат |
| --- | --- |
| Production build | PASS |
| Typecheck | PASS |
| Unit/HTTP tests | PASS, 7/7 |
| Миграция на чистой PostgreSQL 17 | PASS |
| Повторный migrate deploy | PASS, нет pending migrations |
| Prisma diff БД → schema | PASS, No difference detected |
| Девять UI routes | PASS, HTTP 200 |
| Settings → Test site connection | PASS для обработки ошибки, результат сохранён в БД |
| System Status после перезапуска app | PASS, статусы и timestamps читаются из БД |
| `npm run check:secrets` | PASS для заданных в ENV секретов: client assets и HTML |
| npm audit | PASS, 0 vulnerabilities |
| Реальный магазин | Не принят: HTTPS connect timeout под VPN |
| Docker app image build | Подготовлен, полный build контейнера отдельно не проверялся |

Проверка drift: `npx prisma migrate diff --from-schema-datasource prisma/schema.prisma --to-schema-datamodel prisma/schema.prisma --exit-code`.
Скриншот UI: `test-results/sprint0-system.png` (локальный, исключён из Git).
В package.json установлен override `deepmerge-ts` ≥8 для устранения advisory у зависимости Prisma CLI; generate/migrate/diff проверены с ним.

## Сеть и ограничения

Один HTTP GET на проверку, deadline 15 секунд (SITE_TIMEOUT_MS, 1–30 секунд), до 5 redirects, до 2 MB декодированного тела, без retries. TLS проверяется. Credentials и query в настройках/redirect URL запрещены, fragment удаляется. Редиректы на другой hostname и понижение HTTPS запрещены. Если магазин требует перехода на другой host, укажите конечный доверенный URL напрямую.

HTTP GET не исполняет JavaScript. Авторизация магазина/cookies не поддерживаются. Заголовок title ограничен 300 символами. Размер ответа — фактически прочитанные bytes; при ошибке лимита тело неполное. Без БД можно открыть интерфейс, но нельзя сохранить настройки и durable timestamps; отображается понятная ошибка.

Доступ к целевому магазину под текущим VPN не подтверждён: DNS разрешился, HTTPS соединение истекло по таймауту. Пользователь планирует повторить проверку после выключения VPN. Поэтому Sprint 0 не следует объявлять полностью принятым до Connected на реальном магазине.

## Восстановление Docker на этой машине

Docker Desktop не запускался из-за устаревших AF_UNIX sockets `Docker/run/dockerInference` и `docker-secrets-engine/engine.sock`. При остановленных процессах оба runtime-каталога переименованы в `.backup-<timestamp>`, затем Docker создал новые. Docker Engine после этого ответил версией 29.5.3. Контейнеры, образы, volumes и диск WSL не сбрасывались. Резервные каталоги оставлены в AppData/Local. Описание аналогичной проблемы: https://github.com/docker/desktop-feedback/issues/554.

## Эксплуатация

Только localhost или закрытая сеть с защищённым reverse proxy: встроенной авторизации нет. Порты Compose привязаны к 127.0.0.1. При корпоративном CA использовать NODE_EXTRA_CA_CERTS до старта Node, никогда не отключать TLS verification.

Остановка: `docker compose down` сохраняет том. Не выполнять `down -v`, `prisma migrate reset` и `db push` на рабочей БД. Для следующих изменений создать и проверить новую additive Prisma migration. Бэкап: `docker compose exec -T db pg_dump -U radar -d growth_radar -Fc -f /tmp/growth-radar.dump`, затем `docker compose cp db:/tmp/growth-radar.dump ./growth-radar.dump`; сохранить файл вне репозитория.

## Изменённые/созданные файлы

- `src/app/`: layout, styles, dashboard, placeholders, settings, system, actions и error boundary.
- `src/components/settings-form.tsx`: форма и результат проверки.
- `src/lib/`: Prisma client, HTTP probe, health и хранение результатов.
- `prisma/schema.prisma`, `prisma/migrations/`: пять таблиц и миграция.
- `tests/connection.test.ts`, `scripts/`: проверки и production startup.
- `package.json`, `package-lock.json`, `tsconfig.json`, `next.config.ts`, `next-env.d.ts`, `postcss.config.mjs`.
- `.env.example`, `.gitignore`, `.dockerignore`, `Dockerfile`, `compose.yaml`, `README.md`, этот runbook. Исходные документы `docs/` сохранены.
