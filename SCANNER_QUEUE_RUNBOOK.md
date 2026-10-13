# Scanner queue reliability — 07.10.2026

## Ошибки отдельных страниц: продолжение пачки

После дополнительного обращения пользователя исправлена изоляция page errors. HTTP 403 с последующим Browser 404 теперь является обычной HTTP-ошибкой страницы, а не подтверждённым WAF. Targeted/обычный scan продолжается; Coverage не увеличивает WAF streak из-за такого 404. Browser 403/challenge/auth и неразрешённый HTTP WAF по-прежнему используют существующие предохранители. Ошибки robots discovery не подменяют успешный browser результат страницы.

Исключение read/parse одной страницы сохраняется как PAGE_PROCESSING_ERROR с безопасным кодом; следующий URL читается. Ошибка данных snapshot или истёкшая транзакция P2028 допускает одну попытку сохранить упрощённый ERROR snapshot без повторного сетевого чтения. Если даже этот snapshot сохранить нельзя, job завершается с конкретным кодом. Ошибки подключения/доступа к БД не маскируются и не пропускаются. Coverage сохраняет error snapshot и queue checkpoint в одной транзакции. Browser configuration error остаётся причиной остановки; cleanup error добавляется в диагностику, не аннулируя прочитанные страницы.

Transaction budget saveScanPage: timeout 30 sec / maxWait 10 sec вместо стандартных 5 sec. Worker lastError сообщает безопасный код, например P2028, вместо общего неподтверждённого совета про PostgreSQL. Raw exception text/headers/cookies/tokens не сохраняются. Старые FAILED и старые неверно классифицированные snapshots автоматически не переписываются и не повторяются.

Проверки: 146 unit tests PASS; локальные Scanner, WAF и redirect/alias acceptance PASS. Дополнительный fixture checkpoint длиной 6 sec успешно сохранился, доказывая превышение прежнего 5-sec бюджета. Логи: `test-results/page-errors-tests.log`, `page-errors-focused.log`, `page-errors-scanner.log`, `page-errors-waf.log`, `page-errors-alias.log`, `page-errors-save-budget.json`, `page-errors-build.log`, `page-errors-typecheck.log`, `page-errors-secrets.log`. Production scan для проверки не запускался. Причину исключения старого FAILED восстановить нельзя: предыдущая версия worker её не сохраняла; увеличение timeout не выдаётся за доказанную причину старого сбоя.

## Причина

Задание `cmuy99pra000820gk8ew67rby` находилось PENDING без heartbeat. Worker PID 43544 был жив; перед claim он завершал восстановление targeted rematch предыдущей пачки `cmuy8wv61000520gkgrs638kn` (50 selected URLs, COMPLETED_WITH_ERRORS). Других RUNNING/IMPORTING jobs не было. Rematch вычислял matchUrl заново для каждой daily/query row и выполнял отдельный UPDATE на строку. Большой Search dataset блокировал получение следующего задания. Общая ошибка worker ошибочно говорила только о PostgreSQL/миграциях и не показывала rematch.

## Изменения

- `rematchSite` сохраняет прежние правила matching, site/scope filters и cursor batches 500, но использует request-local matcher/cache по исходному URL и один параметризованный UPDATE FROM VALUES для изменившихся строк каждого batch. Raw URL, metrics, provenance и history не меняются. updatedAt обновляется только у изменившихся строк; повторный rematch не выполняет лишние UPDATE.
- `npm start` запускает Scanner worker вместе с приложением. Supervisor перезапускает worker после выхода с backoff 1–30 sec и при отсутствии heartbeat 90 sec. Yandex worker автоматически не запускается. Завершение app server останавливает managed Scanner worker. Не нужно дополнительно запускать `npm run worker` при использовании npm start.
- Worker публикует небольшой локальный health файл в `.runtime/`, отдельный для DATABASE_URL. В нём только PID, время и стадия STARTING/RECOVERY/REMATCH/QUEUE/SCANNING/ERROR/STOPPED. Адрес БД/credentials/cookies/HTTP headers не записываются. UI получает только available/stage. Папка исключена из Git.
- Ошибка восстановления прежнего targeted rematch не предотвращает claim новой очереди; прежний rematch остаётся PENDING и повторяется позже. Успешный rematch по-прежнему завершает audit как DONE.
- Scanner UI показывает, когда worker занят rematch предыдущего задания, либо недоступен. При отсутствии здорового worker PENDING старше 2 минут переводится в FAILED с явным сообщением при обновлении `/scanner` или создании обычного/targeted задания. Это не автоматический retry и не новый crawl.
- Fixture UI server явно отключает auto worker (`SCANNER_WORKER_DISABLED=1`), чтобы UI acceptance не запускал jobs без отдельного тестового worker.

## Проверки

Все сетевые acceptance requests выполнялись только на локальных fixtures, DATABASE_URL `radar_stabilization1_*`.

- 1500 Search rows: rematch 658 ms; все строки сопоставлены; raw fields/metrics сохранены; повторный rematch idempotent. `test-results/queue-fix-fixtures.json`.
- Здоровый busy worker не отменяет старую очередь; недоступный worker превращает старое PENDING в явный FAILED без сетевых запросов.
- Supervisor unit tests: запуск, crash/restart/backoff, stale heartbeat restart, stop без respawn.
- Existing worker acceptance: PASS — persisted queue claim, Stop, stale scan recovery; localhost only.
- Redirect alias regression: PASS — 301/302, Search/Metrika rematch, raw preservation, no double count, idempotency.
- `npm test`: 143 PASS. `npm run typecheck`: PASS.
- Build/schema/secrets logs: `test-results/queue-fix-build.log`, `queue-fix-schema.log`, `queue-fix-secrets.log`.

## Эксплуатация и ограничения

Production scan специально для проверки не создавался. Read-only проверка lifecycle metadata установила, что прежний worker уже принял задание `cmuy99pra000820gk8ew67rby`: heartbeat присутствует, status FAILED, finishedAt 15:29:21 UTC. После исправления приложение и managed worker запущены, активной очереди нет. Старое FAILED автоматически не повторяется; новый пользовательский запуск допустим через прежнюю форму. HTTP/content results production не проверялись. Пауза 3 секунды, выбранный URL scope, Max Pages, read-only и WAF stop/pause сохранены.

Использовать `npm start` для собранного приложения. Для `npm run dev` worker запускается отдельно командой `npm run worker`; UI всё равно показывает недоступность worker. Не запускать отдельный worker одновременно с managed worker без необходимости.

Без доступной БД приложение не может сохранить статус: после восстановления БД queue health работает снова. Queue timeout применяется при чтении/создании задания, а не отдельным cron. Healthy worker может ожидать завершения другого scan — это законное ожидание, оно не считается отсутствием worker. WAF, VPN и authentication могут остановить уже принятый scan; это отличается от зависания PENDING. При аварийном принудительном завершении процесса приложения Windows может оставить дочерний worker; существующий транзакционный claim/advisory lock предотвращает параллельную обработку одной очереди. Новая схема/миграции не вводились.
