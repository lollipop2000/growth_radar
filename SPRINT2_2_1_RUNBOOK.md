# Sprint 2.2.1 — диагностика WAF и управление Coverage Scan

## Границы и результат анализа

### Общая пауза 3 секунды (06.10.2026)

По актуальному запросу пользователя default pause = **3000 ms**, concurrency = **1**. Browser navigation timeout остаётся 20 sec, HTTP network budget — 15 sec. Common Scanner, Metrika Coverage и TOP unmatched используют эти defaults. Пауза действует после завершения чтения, поэтому между началами запросов может пройти больше трёх секунд. HTTP, Browser fallback и robots/sitemap discovery используют один Pacer: HTTP403 не запускает Browser немедленно. Между Coverage batches выдерживается та же пауза; новый Pacer следующей пачки не ускоряет очередь.

На `/scanner` добавлен выбор 3/10/20/30/60 sec для нового Coverage Scan и для ручного Resume. Обычный Scanner допускает заданную пользователем паузу до 60 sec. Значение сохраняется в checkpoint `coverage.delayMs`; старые checkpoints без этого поля получают 3 sec и concurrency1 при следующем ручном запуске, даже если прежний config содержал 500 ms/concurrency2. Resume сохраняет интервал и продолжает только оставшиеся URL. Никаких автоматических Resume или повторных Webmaster POST нет.

В HTTP adapter ожидание Pacer вынесено за сетевой timeout, в том числе между redirect hops; на fetch/body остаётся общий активный бюджет 15 sec. HTTP body completion продлевает cooldown; Stop/abort отменяет ожидание длинной паузы. Историческая timeout stage RATE_LIMIT_WAIT остаётся читаемой в старых diagnostics; новая преднамеренная пауза сама не создаёт timeout.

Проверка по умолчанию с реальным Chromium на локальных fixtures: `scripts/acceptance-pacing.ts`, отчёт `test-results/pacing-acceptance.json`. Две пачки, HTTP403 → Browser200: фактические интервалы 3044/4516/4304/3021/4189 ms. Проверены обновление legacy checkpoint, custom Resume delay и сохранность готовых результатов. Production scan не выполнялся. Три неразрешённых WAF-сигнала подряд по-прежнему сохраняют checkpoint и приостанавливают очередь. Пауза не гарантирует доступ, если WAF запрещает автоматическое чтение независимо от частоты.

Итог проверки изменений паузы: 39/39 tests PASS; production build/typecheck PASS; Scanner, Coverage (50+6, Pause/Stop/Resume, forced restart, rematch/no duplicates) и WAF regression PASS; schema diff отсутствует; secrets checks PASS. Read-only проверка `/scanner` подтвердила default3000 ms в обычной форме и Coverage. Приложение и оба workers перезапущены; активных scan jobs после перезапуска нет. Результат: `test-results/pacing-verification.json`.

### Исправление адреса запроса: trailing slash (06.10.2026)

Обнаружена отдельная причина 404: `crawlUrl` возвращал `normalizeUrl`, который удаляет завершающий `/`. Этот ключ использовался как адрес HTTP-запроса и Playwright navigation. На сервере со строгими путями `/catalog/item` и `/catalog/item/` имеют разные ответы. Исторические Browser 404 нельзя автоматически считать WAF-блокировкой.

Теперь `crawlUrl` сохраняет исходный pathname, включая `/`, при прежних фильтрах безопасности и очистке tracking/hash. `normalizeUrl` остаётся ключом matching/deduplication. Common Scanner, sitemap, HTML links, HTTP и Browser используют адрес запроса; импорт сохраняет исходный адрес с дедупликацией по прежнему ключу. При успешном чтении обновляется и `Page.url` существующей карточки: раньше этот адрес задавался только при создании Page. Ошибка следующего scan не заменяет успешный адрес. Схема БД и ключи аналитики не меняются.

Coverage queue хранит `url` (identity) и дополнительный `requestUrl` (адрес запроса). Адрес выбирается из исходных Metrika URL с тем же normalized identity; при наличии обоих вариантов предпочитается явно наблюдавшийся вариант с `/`. Файлам и произвольным endpoints `/` не добавляется. Значимые query параметры сохраняются; внешние и секретные варианты исключаются. Targeted TOP unmatched использует тот же выбор адреса. Manual test сохраняет адрес, введённый пользователем.

Старые checkpoints без `requestUrl` совместимы: адрес восстанавливается для ещё не обработанных записей перед выполнением. Локальная metadata repair выполнена при остановленном worker (`scripts/repair-request-urls.ts --apply`): в последней production queue `cmuwds2m8000p20zoipyl1b4a` восстановлены 1563 допустимых адреса, из них 675 с исходным `/`; в предыдущей `cmuwa0o6o000o208s90v4ou8e` — 1524, из них 636 с `/`. Небезопасные варианты не восстановлены. История уже обработанных записей, статусы очередей и результаты не переписаны; автоматического повторения 404 нет. Уже запрошенный Stop последней очереди завершён перед repair. Обе production очереди остаются STOPPED. Отчёт без исходных URL/секретов: `test-results/request-url-repair.json`.

Проверки slash-sensitive локальных fixtures: HTTP only, Browser only, HTTP403 → Browser200 fallback, legacy checkpoint recovery, manual test, sitemap/relative links, файлы без `/`, query identity, CSV canonical/dedup. DB acceptance: одна Page, coverage 100% на локальном dataset (`test-results/request-url-acceptance.json`). Это не показатель production coverage. Production scan во время исправления не запускался; отсутствие 404/WAF на реальном сайте требует ручного диагностического теста одного корректного URL.

Команда локального acceptance: `node --env-file=.env --conditions=react-server --import=tsx scripts/acceptance-request-url.ts`. Команда repair не запускает scanner или Resume; её применять только без активных scan jobs. Все повторные реальные проверки пользователь запускает вручную через `/scanner` с корректным URL с `/`.

После исправления: 36/36 unit tests PASS, build/typecheck PASS, Scanner/Coverage/WAF/worker regression PASS, slash-sensitive DB acceptance PASS (включая обновление существующей Page). 3 миграции up to date, schema diff пустой. Secrets check PASS для client assets, SSR/Page360/Coverage и исторических секретных query значений. Приложение и оба workers перезапущены с актуальным кодом; обе production очереди остаются STOPPED. Итог: `test-results/request-url-verification.json`; read-only state verification: `test-results/request-url-state.json`.

Sprint 3 не начинался. В рамках этой работы production scan не запускался: использована только сохранённая история БД и локальные HTTP/Chromium fixtures. Новых Webmaster export POST нет; guard неопределённой задачи не изменён.

Существующая production Coverage job `cmuwa0o6o000o208s90v4ou8e` уже STOPPED: 46/1642 processed, 1596 remaining. Все 46 страниц сначала вернули HTTP 403. Browser дал 24 × 403/BLOCKED_BY_WAF, 21 × 404/ERROR и 1 × 200/OK. Ошибки 404 не являются доказательством Browser WAF. В других сохранённых сканах этого Site есть 56 Browser 200. Это подтверждает различие доступности конкретных страниц, но не доказывает бан IP, конкретный порог запросов либо правило WAF. Доказательства без секретных URL: `test-results/waf-history.json`.

Установленная архитектурная причина лишней нагрузки: Coverage с HTTP first делает запрос страницы до browser navigation и раньше продолжал массовую очередь после повторяющихся browser-блокировок. Browser Scan в явно выбранном Browser режиме не делает первоначального HTTP GET страницы и прекращается при первой browser-блокировке. Причину конкретного решения production WAF нельзя установить без новых пользовательских диагностических результатов или логов владельца WAF. Обход не выполняется.

## Сравнение обычного Scanner и Coverage

| Параметр | Обычный Browser Scan | Coverage default HTTP + Browser fallback |
|---|---|---|
| Adapter | Тот же BrowserReader и crawl | Тот же BrowserReader и crawl, перед ним readHttp |
| Chromium | Стандартный headless Chromium, без stealth и UA override | Идентично |
| Browser lifetime | Один экземпляр на crawl | Новый экземпляр на каждую логическую пачку; закрывается после неё |
| Context | Новый изолированный context на URL; cookies между страницами не переносятся | Идентично, включая fallback |
| Navigation | goto, DOMContentLoaded; без кликов/форм/login | Идентично |
| Browser limits | concurrency 1; default delay 3000 ms, допустимо 1000–60000; timeout 20 sec | Browser concurrency 1; default delay 3000 ms; timeout 20 sec |
| HTTP traffic | Нет page HTTP GET; discovery при обычном non-single scan читает robots/sitemaps HTTP | Page HTTP first, concurrency 1, default delay 3000 ms, timeout 15 sec; общий Pacer с Browser |
| Discovery | single пропускает discovery; non-single читает robots/sitemaps и добавляет links | seedOnly: только robots.txt, seeds из Метрики; без sitemap/link expansion |
| Page budget | Max Pages 1–50 для задания | Batch size 1–50; вся queue может быть больше; выбранный delay между пачками, default3000 ms |
| HTTP fallback | В HTTP Scanner: 403/challenge, network failure либо JS shell | Те же условия; HTTP 404/500 сами по себе не запускают browser |
| 403/challenge | Browser BLOCKED_BY_WAF останавливает обычную очередь | Раньше продолжал каждый URL. Теперь пауза после 3 подряд неразрешённых WAF evidence |
| Timeout/network | Обычная очередь прекращается при недоступном browser | Ошибка отдельного URL сохраняется, очередь продолжает работу, если нет повторяющейся подтверждённой WAF |
| HTTP403 + BrowserERROR | Обычный HTTP Scanner сохраняет прежнюю общую BLOCKED_BY_WAF классификацию | Coverage сохраняет итоговый Browser TIMEOUT/HTTP_ERROR/NETWORK_ERROR отдельно от исходного HTTP403 |
| Redirects | Browser response redirectedFrom chain; same-origin boundaries; максимум 6 navigation requests; запрещены служебные пути | Тот же browser; HTTP вручную максимум 5 redirects с теми же boundaries. Изменения transport redirects не обходят ограничения |

Browser only Coverage использует mode BROWSER существующего Scanner: concurrency 1 / default3000 ms / 20 sec. HTTP only отключает browserFallback и не запускает Chromium. HTTP + Browser fallback остаётся default, в том числе для старых checkpoints без поля transport. Browser only всё равно читает robots.txt через HTTP; это не запрос сканируемой страницы. Обычный single Browser Scan поэтому не полностью идентичен Coverage test одного URL по discovery traffic.

Общий BrowserReader дополнительно сохраняет наблюдаемый navigation status до DOMContentLoaded, чтобы timeout не терял уже полученный 403. 403/401 корректно распознаются и при text/plain ответе. Нет новых browser профилей, persistent cookies либо маскировки под поисковых роботов.

## Запуск пользователем

На `/scanner` в Metrika Coverage Scan выбрать period/scope/batch и обновить Preview scope. Выбрать транспорт непосредственно перед запуском. Транспорт явно показан и фиксируется в checkpoint; Resume не меняет его автоматически.

Последнее Coverage задание текущего сайта выбирается отдельно от короткой общей истории: многочисленные fixture/другие jobs больше не скрывают его checkpoint и controls.

1. **Test one URL**: ровно одна разрешённая страница. Пустое поле URL берёт первый URL текущей queue. Явный URL текущего Site позволяет проверить ранее matched страницу; он не обязан быть unmatched. Robots/boundaries/exclusions остаются обязательными.
2. **Start diagnostic scan**: первые N URL выбранного scope, Diagnostic Max URLs обязательно 1–50, default 10. Server проверяет лимит и отрезает queue до создания задания; это общий лимит задания, не только размер пачки.
3. **Start Metrika Coverage Scan**: обычная полная queue выбранного scope, со встроенным WAF предохранителем. Не запускать после неуспешного теста одного URL.

Тест и diagnostic создают обычную Coverage Scan с Page/ScanPage/checkpoint/rematch. Нового crawler нет. Значимые query параметры сохраняются. Secret/CSRF query keys исключаются из scan; старые sensitive URL параметры редактируются в Coverage report. CAPTCHA/challenge, authentication и правила WAF не обходятся; только GET/HEAD, без корзины/checkout/форм и mutating requests.

## Диагностика и автоматическая пауза

Для каждого обработанного URL в `Scan.configJson.coverage.queue[].diagnostics` атомарно со snapshot сохраняются mode, отдельные HTTP/Browser outcome/status/classification/elapsedMs/timeoutStage, total elapsedMs и итоговая классификация. UI раскрывает эти попытки в per-URL таблице. Browser attempt отсутствует в HTTP only и когда fallback не потребовался. HTTP page attempt отсутствует в Browser only. Исторические записи показывают отсутствие диагностики, а не выдуманные значения.

HTTP timeout stages: HEADERS, BODY; историческая RATE_LIMIT_WAIT сохраняется в старых данных. Browser: BROWSER_LAUNCH, BROWSER_CONTEXT, NAVIGATION, CONTENT. Stage заполнен только при timeout. Total elapsed включает ожидание pacers; adapter elapsed Browser измеряет само чтение и запуск/context, HTTP включает ожидание своего pacer, но ожидание не расходует сетевой budget. HTTP headers stage объединяет DNS/connect/TLS/ожидание ответа: fetch не раскрывает эти этапы отдельно. Сохраняется минимальный набор полей; cookies, токены, заголовки и сырые exception messages в диагностике отсутствуют.

Порог — **3 consecutive unresolved WAF signals**: итоговая BLOCKED_BY_WAF либо подтверждённая WAF-блокировка одной из попыток без итогового OK. Browser200 после HTTP403 сбрасывает streak; простой timeout/network/401 без WAF evidence тоже не увеличивает streak. HTTP403 + Browser timeout/404 остаётся подтверждённым HTTP WAF evidence и учитывается консервативно; это не утверждение Browser ban.

Streak хранится между пачками и коммитится в той же транзакции, что результат. Coverage сохраняет готовые результаты в порядке queue. На пороге выставляется PAUSING, прекращается выдача новых запросов, вызывается abort и сохраняется PAUSED с объяснением и checkpoint. Остаток queue не отмечается SKIPPED. Все Coverage modes теперь имеют concurrency1: после третьего неразрешённого WAF четвёртая страница не запускается.

Resume только вручную: сбрасывает guard/streak, продолжает непроцессированные URL, не повторяет сохранённые blocked URLs. Старая STOPPED production job не возобновлена. Для смены транспорта безопасно оставить старую очередь остановленной и создать ограниченное diagnostic задание в новом режиме. Если Browser тоже блокируется, оставить массовую queue на паузе и использовать существующий Excel Crawl Import, затем rematch.

## Проверки

Все автоматические scan tests направлены на локальные fixtures. Основной новый отчёт — `test-results/waf-acceptance.json`: три режима, diagnostics/caps, browser200 после HTTP403, WAF pause через границу пачек, сохранённый остаток queue, explicit Resume без повторения committed URL, read-only и отсутствие cookie/header данных. `tests/scanner-diagnostics.test.ts` проверяет WAF evidence и реальные HTTP timeout stages. Существующие Browser/Scanner, Coverage restart/control/rematch/dedup регрессии сохранены.

Локальные результаты: 33/33 unit tests PASS; WAF acceptance PASS (включая отмену четвёртого browser fallback); Coverage acceptance PASS, 50+6 URL, controls/restart/rematch/no duplicates; Scanner и worker regression PASS; typecheck PASS; 3 существующие миграции применены, schema drift отсутствует. Fixture Browser403 с зависшим script сохранил status403/BLOCKED_BY_WAF и timeout stage NAVIGATION; production URL для этого не использовался.

Команды при остановленных app и workers (Windows Prisma DLL):

```powershell
npm test
npm run acceptance:waf
npm run acceptance:coverage
npm run acceptance:scanner
npm run acceptance:worker
npm run build
npm run typecheck
npm run db:status
node node_modules/prisma/build/index.js migrate diff --from-schema-datasource prisma/schema.prisma --to-schema-datamodel prisma/schema.prisma --exit-code
npm start
# После Ready:
$env:COVERAGE_SCAN_CHECK_ID=(Get-Content test-results/waf-acceptance.json -Raw | ConvertFrom-Json).cases[2].scanId
npm run check:secrets
# Read-only история + локальный HTML; не production crawl:
node --env-file=.env scripts/check-coverage-secrets.mjs cmuwa0o6o000o208s90v4ou8e
```

DB fixture checks выполнять последовательно, без пользовательских pending scan. Новых миграций и schema изменений нет: diagnostics и guard используют существующий JSON checkpoint, общий storage сохраняет Page/ScanPage без transient diagnostics поля. Matching и Yandex exports не изменены. Итог проверки фиксируется в `test-results/sprint2-2-1-verification.json`.

Проверка secrets охватывает ENV значения в client assets/HTML и чувствительные query values из существующей истории в локальном Coverage report, включая сериализованные React данные и общую таблицу ScanPage. Значения секретов не выводятся в лог. История в БД сохраняется; в UI вместо этих значений показан REDACTED.

## Ограничения и пользовательская production приёмка

Production доступность новым кодом не проверялась. Пользователь сначала выбирает Browser only, вводит один известный URL, запускает Test one URL и проверяет статус/Title/H1. При 403/challenge остановиться и использовать Import. При успехе сравнить тот же URL в HTTP + Browser fallback, затем диагностическую очередь ≤10 URL. Массовую очередь запускать только при достаточной успешности этих проверок. Не увеличивать rate limits ради прохождения WAF.

Единичный 200 не гарантирует доступность остальных URL. Fresh context означает отсутствие общей сессии между страницами. DOMContentLoaded не гарантирует поздний SPA контент. WAF rule/IP decision без логов владельца неизвестны. Старые timings/stages восстановить нельзя. Browser config failure и DB/worker failures по-прежнему приостанавливают job. Фактический прирост production traffic coverage этим спринтом не заявляется.
