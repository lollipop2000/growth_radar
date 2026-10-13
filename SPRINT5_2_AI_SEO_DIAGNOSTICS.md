# Sprint 5.2 — AI SEO Diagnostics & Quality Review

## 1. Status
**OFFLINE PASS; LIVE DIAGNOSTIC ACCEPTANCE выполнена и остановлена.** Offline phase:0API calls. По отдельному разрешению пользователя выполнен1новый платный call,0retries; generated5 /accepted1 /rejected4. Подробности: [SPRINT5_2_LIVE_DIAGNOSTIC_ACCEPTANCE.md](SPRINT5_2_LIVE_DIAGNOSTIC_ACCEPTANCE.md). Нижележащие offline measurements/план сохранены как историческая запись. Sprint5.1 продуктовый PASS не объявлен.

Исторический ответ B не восстановлен. Новый separately authorized capture показал и ошибки модели, и ложные срабатывания отдельных guards. PAGE_SEO_REVIEW_V2, модель, provider и production guards не изменены.

## 2. Baseline
Sprint 5.1 B: generated 5 / accepted 0 / rejected 5. FACT_VALUE_MISMATCH 4; UNBOUND_ABSENCE_CLAIM 3; INVENTED_NUMBER 2; UNSUPPORTED_CTR 2. Rejected texts are unavailable. These counts do not establish five hallucinations or identify their SEO usefulness. Old ledgers remain stopped.

Audit completed before implementation:

| Stage | Available data | Loss / boundary |
| --- | --- | --- |
| Page evidence | Bounded saved profile, exact IDs/state/coverage/period | Saved HTML/semantic DOM blocks unavailable upstream |
| Prompt | V2 system/schema + user profile/query evidence in memory | Not logged/persisted |
| DeepSeek | Parsed transport envelope, model content string, numeric usage | Raw headers/envelope discarded by existing adapter |
| JSON/schema | Output string; envelope and per-item parse issues | Invalid envelope raises safe code; production does not retain text |
| Evidence | Bound query IDs, canonical comparison, saved URL lookup | Mismatch currently reduced to a reason code |
| Semantic guards | Text fields, cited values, lexical rule conditions | Field/token/phrase context reduced to codes |
| Decisions | Accepted recommendations and all safe per-item codes | Rejected proposal text excluded from result |
| Page360 | Accepted cards only; codes for rejected items | No rejected content or prompt exposed |
| Old acceptance | Temporary response in memory; decisions/usage persisted | Process exit destroys rejected text; no retrospective recovery |

Architecture: separate local diagnostic observer; no changes to these production stages, prompt, provider or guards. VALUE equality remains exact. Diagnostic replay may identify partial/paraphrased object claims but must not repair or accept them.

## 3. Diagnostic architecture

`scripts/ai-diagnostics.ts` — отдельный CLI. `src/lib/ai-diagnostics` содержит observer, bounded projection/redaction, storage, reason details, local relevance и отдельную expert review schema. Production service/validator/Page360 не импортируют этот код.

- `replay` использует сохранённый `/catalog/` profile и пять **synthetic-only** предложений. Глобальный fetch запрещён; provider не импортируется.
- `live` требует одновременно явных `--enable-local-diagnostics` и `--authorize-one-live-call`. Только `/catalog/`, новый ledger, максимум один provider call и один POST к настроенному chat endpoint; no retries.
- `review` дописывает отдельную оценку к защищённому артефакту, не меняя proposal/validator decision.
- `cleanup` удаляет только распознаваемые diagnostic files в фиксированной локальной директории.

Observer вызывает действующий validator с существующей policy. При live использует фактические decisions из `reviewPage`, включая saved URL lookup. Существующая production query binding policy наблюдается, но новой автоматической коррекции нет. Model summary/strengths/limitations не считаются доказательствами и не архивируются как факты.

## 4. Security model

По умолчанию режим отключён. Запрещены NODE_ENV=production, production deployment marker, Vercel/Netlify/cloud markers и CI=true. HTTP, cookies, query strings и model output не могут включить CLI. UI/API routes не добавлены.

Хранение: `%USERPROFILE%\.growth-radar-local-ai-diagnostics`, вне workspace, Git и Next public. Две защитные записи `.gitignore` исключают случайно скопированные диагностические каталоги. В `.next/static`, `.next/server` и standalone trace диагностический observer/артефакты не обнаружены.

Windows: .NET DACL с отключённым наследованием, единственным ACE FullControl текущего SID, проверкой owner, списка ACE и прав до записи содержимого. Стандартный PowerShell Set-Acl оказался несовместим с данным окружением (audit privilege); итоговый helper использует .NET AccessControl и не требует изменения SACL. При невозможности ограничения/проверки прав — SECURE_STORAGE_UNAVAILABLE, сохранение запрещено. Уже существующая небезопасная директория не исправляется молча: verification завершается отказом. POSIX — текущий UID, directory 0700/file 0600.

Проверяются reparse/symlink ancestors, hard links, тип файла, UUIDv4 basename и границы root. Запись через пустой exclusive temp file: ACL проверяется до записи, затем fsync/rename/повторная проверка. Никакого рекурсивного удаления произвольных путей.

До диска удаляются configured secrets, Bearer/JWT/sk-like tokens, email, credentials/sensitive URL query, sensitive header lines, env assignments, SYSTEM_PROMPT и запрещённые containers. Redaction выполняется до truncation. Нет полного HTTP envelope, cookies/authorization/headers, `.env`, полного prompt или evidence profile. Numeric token usage остаётся числовым. Строка от модели не может исполняться.

Границы: raw content <=60 KB; artifact <=256 KiB (до и после redaction); proposal strings <=2000, depth <=12, claims <=5 KB; malformed fragment <=2048 characters. Слишком большой файл отвергается до expensive cleanup. Администратор ОС может переопределить ACL; механизм не является защитой от администратора/компрометации текущего аккаунта.

## 5. Capture and cleanup

Offline команды:

```powershell
npm run ai:diagnostics -- replay --enable-local-diagnostics
npm run ai:diagnostics -- review --enable-local-diagnostics --run-id <UUID> --item 0 --review-file <local-review.json>
npm run ai:diagnostics -- cleanup --enable-local-diagnostics
npm run ai:diagnostics -- cleanup --enable-local-diagnostics --all
```

В stdout только safe metadata: runId/path, counts/codes, timing, call count. Сырые предложения изучаются непосредственно в защищённом локальном файле; не копировать их в обычные logs, отчёты, public или exports. Review input — JSON до16 KB, strict schema с восемью критериями; см. `review.ts`.

TTL = 24h от createdAt. **Фонового удаления нет.** Каждый разрешённый запуск CLI сначала выполняет cleanup expired files; отдельная команда выполняет ту же процедуру; `--all` удаляет распознанные артефакты явно. Проверено: expired file действительно удалён subprocess CLI, непросроченный сохранён. Остатки temp files удаляются по TTL/--all. Ошибки permissions/corruption/unknown directory entries — fail closed.

Offline acceptance artifact: run `507d9930-9b13-4f6a-8ac7-2d801642f642` (synthetic, автоматически станет недоступен после TTL/cleanup). Постоянный safe summary: `test-results/sprint5-2-offline-acceptance.json`. Старые ledgers не изменены; `test-results/sprint5-2-live-diagnostic.json` **не создан**. Будущий ledger переживает TTL/cleanup и не позволяет повторно использовать серию.

## 6. Validation reason details

Все production reason codes остаются без изменений. В защищённом артефакте добавлены item index, field/JSON path, matched condition и bounded context. Максимум64 expanded details/item; каждый reason code сохраняется даже при исчерпании этого лимита. Детали — observer observations, не новый verdict.

| Class | Диагностика | Policy |
| --- | --- | --- |
| FACT_VALUE_MISMATCH | Scalar/type/nested/array mismatch, missing/extra key, partial object, expected/actual type, evidence ID и JSON path | Exact equality сохранена. Полный registry не копируется. Пересказ/частичный объект не принимается автоматически |
| UNBOUND_ABSENCE_CLAIM | Поле, отдельное предложение, фрагмент, ASSERTION/HYPOTHESIS/CONDITIONAL/QUESTION_OR_CHECK/NEGATIVE_CAVEAT, declared relation, cited state/coverage | Второе независимое утверждение не освобождается первой оговоркой. ABSENT отдельно показывает eligibility состояния/coverage |
| INVENTED_NUMBER | Token, локальный контекст, cited lookup/IDs; metric/percent/arithmetic/ordinal/product code/technical name/date/unclassified | Совпадение токена не доказывает семантическую опору. Категория не отменяет guard |
| UNSUPPORTED_CTR | Фраза, Search IDs, lexical predicate, fact/conditional/caveat/promise/causal label, отсутствие сравнимого benchmark | Фактическая метрика отличается от low-CTR вывода. Отрицательная оговорка всё ещё может отклоняться |
| Other | ITEM_SCHEMA issue paths, INVALID_EVIDENCE_ID, absence eligibility, все прочие safe reason codes и production predicate marker | Ни одна причина не скрывается; не все lexical details являются формальным доказательством |

При неверном JSON — bounded redacted fragment, при envelope/schema error — issue paths/codes и ограниченная projection. Transport containers полностью исключены.

## 7. SEO expert review

Отдельная strict schema: pagePurpose, factualCorrectness, searchIntent, specificity, seoRationale, b2bUsefulness, handoff, uncertainty. Для каждого status/explanation; общий PASS/QUESTIONABLE/FAIL/NOT_REVIEWED, disposition, rationale, reviewer и PENDING_HUMAN_REVIEW. CODEX_EXPERT_ASSESSMENT не является INDEPENDENT_HUMAN_APPROVAL. Decisions и исходные предложения immutable относительно review; reviewRequired уменьшается только после отдельной оценки.

Synthetic demonstration (полные original fields и восемь критериев только в защищённом артефакте):

| Item | Validator | Expert | Disposition / rationale |
| --- | --- | --- | --- |
| 0 | NEEDS_REVIEW | QUESTIONABLE | INSUFFICIENT_EVIDENCE_TO_DECIDE: конкретная Title-гипотеза; широта ассортимента/B2B intent требуют проверки |
| 1 | REJECTED / FACT_VALUE_MISMATCH | FAIL | VALIDATOR_TRUE_REJECT: частичный Search VALUE-object не равен registry; это не доказывает галлюцинацию всего SEO-предложения |
| 2 | REJECTED / UNBOUND_ABSENCE_CLAIM | FAIL | VALIDATOR_TRUE_REJECT: UNKNOWN Description не доказывает отсутствие |
| 3 | NEEDS_REVIEW | QUESTIONABLE | INSUFFICIENT_EVIDENCE_TO_DECIDE: пункт списка не метрика; принятие числового токена само по себе не доказывает полезность |
| 4 | REJECTED / UNSUPPORTED_CTR | QUESTIONABLE | POSSIBLE_FALSE_REJECT: отрицательная оговорка попала в lexical guard; исправление не выполнено |

Generated5 / accepted2 / rejected3; reviewRequired0 означает пять Codex assessments, **human review pending для всех пяти**, не human approval. Подтверждённых для исправления дефектов исторического live B нет.

## 8. Query relevance

Отдельные local rules, <=25 queries сохранённого profile, source `LOCAL_DIAGNOSTIC_RULES_V1_NOT_SEARCH_CLASSIFIER`; evidence ID, actual query, rationale/confidence — в protected artifact. Source Search data и deterministic intent classifier не изменены. TARGET_B2B / ADJACENT / NAVIGATIONAL / IRRELEVANT / UNCERTAIN — диагностический vocabulary; текущие ограниченные правила не выдают IRRELEVANT без уверенной базы.

Примеры: explicit product+B2B signal → TARGET_B2B (medium, требуется проверка ассортимента); «масло газпромнефть» → ADJACENT; «официальный сайт» → NAVIGATIONAL; «газпром маркет» → UNCERTAIN (возможно другой сервис); «подбор масла» → ADJACENT/service; неизвестный запрос → UNCERTAIN. Эти labels не фильтруют source rows и не становятся доказательствами необходимости блока/landing page.

## 9. Offline fixtures

53 новых tests, synthetic only на существующем catalog profile:

- FACT: scalar/type/nested/extra/missing/array order/length/object/reordered keys/partial object/paraphrase/invalid ID.
- Absence: proven absence, UNKNOWN, NOT_OBSERVED, question/hypothesis/condition/caveat/hidden assertion in second sentence; fragment и тип выражения различаются по предложениям.
- Numbers: real Search CTR, invented metric, percent, arithmetic, ordinal, SAE5W-40, SKU, date, unitless token. Категоризация наблюдательная.
- CTR: recorded value, unsupported comparison, cause, conditional, promise, negative caveat, neutral explanation.
- Security: actual Windows ACL, fail-closed permissions, 24h deletion, size bounds, path/deployment/default/authorization refusal, pre-truncation prompt/secrets/header redaction, injection, no route/static exposure.
- Review: восемь критериев, rejected review без acceptance override, отсутствие independent human approval, local B2B/navigation/other-service/ambiguous intent, concrete/generic/wrong target.

Исторические пять B proposals не реконструировались как реальные. Наблюдаемые synthetic false-positive candidates нельзя переносить на неизвестный исторический ответ.

## 10. Tests

| Check | Result / evidence |
| --- | --- |
| Full suite | **390/390 PASS**, 146.64s: `test-results/sprint5-2-tests.log` |
| Existing AI V1/V2/V3; SEO Review V1/V2 | PASS в полном наборе; production byte hashes unchanged |
| Scanner/WAF/pacing/errors/redirect aliases/supervisor | PASS, local fixtures only |
| Search matching / Commerce / deterministic rules | PASS, full suite |
| Final security/diagnostic changes | Targeted regression PASS; `sprint5-2-security-final.log`, `sprint5-2-diagnostic-final-regression.log` |
| Typecheck / optimized build | PASS: `sprint5-2-typecheck.log`, `sprint5-2-build.log` |
| Offline acceptance | PASS, real ACL/write/read/review/cleanup + three HTTP404 checks |
| Client/rendered secrets | PASS: `sprint5-2-secrets.log` |
| Diagnostic artifact/source/log secrets | PASS: `sprint5-2-diagnostic-secrets.json` (only counts emitted) |
| Migrations | 11/11 applied; schema up to date |
| Prisma schema drift | No difference detected; `sprint5-2-drift.log` |
| Source/data/old-ledger integrity | PASS197 protected files +10 table hashes;0 requests |

Нет production crawl/sync/export, массового AI или CMS публикации. Старт локального приложения восстановлен после сборки. Проверки HTTP идут только к127.0.0.1.

## 11. Performance

| Measurement | Result |
| --- | --- |
| Diagnostic parsing | 12.30ms |
| Existing validation | 78.89ms |
| Additional diagnostic processing | 257.70ms |
| Protected artifact writing incl Windows ACL subprocess checks | 7814.32ms |
| Cleanup integration incl CLI startup/ACL/read/delete | 11376.76ms |
| Page360 before,5 warm GETs | median584.54ms / mean593.39ms / max656.86ms |
| Page360 after concurrent secrets route sweep | median799.91ms / mean1225.60ms / max2521.84ms |
| Page360 after isolated,5 warm GETs | **median512.79ms / mean500.53ms / max562.78ms**, allHTTP200 |

Изолированный median -12.3% к baseline; это короткий локальный sample, не доказательство ускорения. Конкурентный замер сохранён, не скрыт. Dedicated diagnostic CLI/ACL overhead значительный, но не находится на Page360 GET path. Production code не изменён, diagnostic module отсутствует в build route graph. Общая history/cache/queue не добавлена.

## 12. Data integrity

До/после: whole-row sorted hashes, не только row counts. PASS:

| Entity | Rows unchanged |
| --- | ---: |
| Scan / ScanPage | 317 /2287 |
| JobRun | 221 |
| MetrikaPageDaily | 26971 |
| WebmasterQueryDaily | 97689 |
| BusinessRecord / Import | 12511 /184 |
| Page (включая aliasesJson) | 2564 |
| Opportunity | 1074 |
| SeoAction | 309 |

197 baseline file fingerprints unchanged: существующие production src, Prisma/schema/migrations, `.env`, старые stopped acceptance ledgers. Matching/Commerce/scoring code unchanged; findings не пересчитывались. Diagnostic rows в БД не создавались. Доказательства `sprint5-2-before.json`, `sprint5-2-after.json`, integrity logs. Новые observer/scripts/tests, README/package/gitignore и этот отчёт — разрешённые изменения.

## 13. Known limitations

- Нет исторического rejected text, поэтому root cause и SEO-ценность B неизвестны. Exact object comparison мог reject partial/paraphrase, но факт конкретной причины требует нового separately authorized capture.
- Heuristics категорий чисел/языковых выражений/relevance не являются semantic proof. Токен в cited content ещё не доказывает metric relation. Generic details остальных guards сохраняют reason, но не заменяют экспертный разбор.
- Production lexical guards намеренно сохранены, включая возможный false reject отрицательной CTR-оговорки.
- Projection bounded: oversized/deep claims могут быть опущены; missing raw schema fields видны по issue paths, не через полный transport/profile dump.
- TTL deletion выполняется при CLI launch/explicit cleanup. Пока CLI не запускается, фонового удаления нет. Будущий metadata-only budget ledger сохраняется после удаления model content.
- Windows ACL subprocess overhead измерен; на машине без безопасных ACL capture будет заблокирован. В новой deployment среде защита должна fail closed.
- Human approval отсутствует. Live capture transport/actual recommendation quality в5.2 ещё не проверены.

## 14. Live diagnostic acceptance plan

После отдельного разрешения пользователя: `/catalog/`, **максимум1 новый платный DeepSeek call,0 retries**, прежние бюджеты не используются. Тот же prompt/model/provider/guards. CLI command (сейчас **не выполнялась**):

```powershell
npm run ai:diagnostics -- live --enable-local-diagnostics --authorize-one-live-call
```

Перед оплатой: actual secure storage preflight и новый exclusive budget ledger; durable call reservation до provider; существующий ledger запрещает повтор. Capture model proposals после bounded redaction, фактические decisions/usage/latency, reason details. Проверить все предложения, включая rejected и NEEDS_REVIEW, по восьми критериям; сравнить quality и validator без automatic repair. Отчёт с safe diagnostics; rejected full text остаётся только в protected TTL storage. При provider/validation failure — остановка, без retries/ответов до удачи. При ошибке записи fail closed, никакого увеличения бюджета.

## 15. Next step

Запросить отдельное разрешение на один diagnostic live call. До этого DeepSeek calls **0**. Не объявлять продуктовый PASS, не менять guards на основании synthetic fixture; Site SEO Strategy/TDS/Competitive Benchmark не запускать.
