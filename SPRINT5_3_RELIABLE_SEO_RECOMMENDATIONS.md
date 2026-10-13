# Sprint 5.3 — Reliable SEO Recommendations

## 1. Status

**READY FOR LIVE REVALIDATION.** Реализован отдельный `PAGE_SEO_REVIEW_V3`; выполнены только offline проверки. **DeepSeek API calls: 0; retries: 0.** Реальные SEO-рекомендации новой модели в этом спринте не получались. Performance остаётся с открытым замечанием: финальные warm Page360 серии 868–1012 ms против baseline 551 ms; причина не установлена, performance PASS не объявлен. Sprint 5.1/5.3 product PASS не объявлен.

Grounding reliability подтверждается указанными ниже fixtures, а не универсальным пониманием естественного языка. SEO usefulness на синтетических предложениях проверена только как возможность провести содержательный вариант через контракт. Способность DeepSeek стабильно генерировать такие варианты ещё требует live revalidation и экспертного review.

## 2. Baseline

Изучены Sprint 5, 5.1, 5.2 implementation/live reports, текущие contract/evidence/schema/validator/quality/prompt/service и diagnostic pipeline. До изменений сохранены `test-results/sprint5-3-before.json` и warm Page360 baseline.

Аудит исходного контракта и зависимостей:

| Узел | Исходное поведение | Граница изменения |
| --- | --- | --- |
| evidence.ts | Read-only сборка ограниченного saved profile; ID, kind, state, coverage, period | Сохранён без изменений; Scanner/источники не вызываются |
| contract.ts / schema.ts | V2 claims копируют VALUE; строгая per-item schema | Новая V3 schema в отдельном каталоге, смешанная форма отвергается |
| validator.ts / quality.ts | Точные VALUE comparisons, target/content/security gates, lexical numbers/absence/CTR | V2 сохранён; V3 переиспользует target/security gates и заменяет только соответствующие lexical predicates |
| prompt.ts | V2 просит воспроизводить VALUE-объекты | V2 сохранён; новый отдельный V3 prompt |
| service.ts / DeepSeek transport | Один manual review, saved URL lookup, без автоматических повторов | V2/provider сохранены; отдельный V3 adapter над тем же transport |
| Page360 | Ручная server action, локальное состояние результата | Action переключена на V3; initial GET не строит AI evidence и не вызывает provider |
| diagnostics | Local-only observer, ACL, TTL, отдельный live ledger | Явный выбор V2/V3; default V2 и его ledger сохранены |

V1/V2 prompts, schemas, validators, services и старые AI modules не переписаны. `.env`, provider, модель и transport byte-identical относительно baseline.

## 3. Root causes

Последний Sprint 5.2 live дал generated 5 / accepted 1 / rejected 4; единственный принятый результат — DATA_CHECK. Из того ответа подтверждены:

1. Модель копировала неполные VALUE-объекты; пропуск служебных полей давал FACT_VALUE_MISMATCH, даже когда основное наблюдение могло быть корректным.
2. Lexical gates смешивали утверждение с отрицанием/условием; оговорка или условный CHECK ошибочно считались обещанием/текущим отсутствием.
3. Числа проверялись без достаточной связи query→metric; metadata-даты и корректные округления могли отклоняться. При этом реальная подмена метрик E027→E037 обязана остаться отказом.
4. Search observation не доказывает коммерческие условия магазина и не делает навигацию/АЗС целевым B2B-интентом каталога.

Полные защищённые rejected proposals в этот отчёт не скопированы. Исторический ответ не переотправлялся и не «исправлялся до успеха».

## 4. V3 evidence contract

`src/lib/seo-review/v3/contract.ts`:

```ts
type EvidenceReference = {
  evidenceId: string;
  fieldPath: string;
  purpose: 'OBSERVE' | 'INSPECT' | 'ABSENT' | 'MISSING_TERM';
  term?: string;
};
```

При отсутствии purpose schema использует OBSERVE. Полного model-supplied `claims[].value` больше нет. V3 не принимает одновременно старые claims/evidenceIds и новую форму.

`statements` различают OBSERVED_FACT / SEO_INFERENCE / GROWTH_HYPOTHESIS. Ссылки statement должны быть объявлены в evidenceReferences; INSPECT нельзя использовать для OBSERVED_FACT. Label гипотезы не освобождает текст от числовых, factual, commercial или security guards.

Сервер возвращает `verifiedFacts` с точным разрешённым значением, purpose/state/coverage и metadata. Это доказательство значения поля, а не SEO-эффекта. Свободный SEO-текст V3 остаётся NEEDS_REVIEW; существование ID не превращает интерпретацию в SUPPORTED.

## 5. Field resolver

`resolver.ts` использует kind-specific allowlist и own-property traversal после проверки пути. Нет eval, произвольного JSON accessor, prototype/constructor access, слешей или `..`.

| Kind | Разрешённые поля |
| --- | --- |
| search.query | value.query / impressions / clicks / ctr / avgPosition, period.from / to |
| content scalars | value только известного соответствующего scalar kind |
| content.h2 / excerpts | массив строк; ограниченные value[0..2].text |
| technical | canonical/robots/finalUrl strings, httpStatus number, indexable boolean, schema string array |
| links | ограниченные summary counts; url/pageType наблюдаемых связанных страниц |
| product | category; groups[0..14].name/code; skus[0..19].name/sku/productGroup |
| finding | rule/title/area/priority |
| metadata | observedAt/period где есть; виртуальный E_PAGE: snapshotAt/currentUrl/pageType |

Проверяются уникальность ID, наличие поля, тип (число должно быть finite), pageId и Search period. Вложенный null не становится наблюдаемым значением. Metadata-дата может быть известна при UNKNOWN содержимом; это не доказывает содержимое.

ABSENT требует FULL KNOWN_ABSENT, supportsAbsenceClaim, отсутствия truncation и действительно пустого значения. MISSING_TERM допускается только для полного известного Title/Description/H1; присутствующий term даёт EXISTING_CONTENT. UNKNOWN/NOT_OBSERVED допускают INSPECT, но не вывод об отсутствии.

## 6. Query-metric binding

Числовое утверждение связывается с конкретным query reference и конкретным metric path; page и period проверяются resolver. Учитываются exact query mentions с кавычками и без, evidence IDs, либо единственный однозначный metric source при отсутствии другого названного запроса.

Обязательный counterexample: E037 = «газпромнефть сайт официальный сайт», 132 / 0 / позиция ≈9,44; E027 = «сайт газпромнефть официальный сайт», 192 / 0 / ≈9,78. Подмена отвергается QUERY_METRIC_MISMATCH; наличие обоих ID её не легализует. Одинаковый 0 у разных запросов сам по себе не доказывает привязку. Неоднозначность даёт UNBOUND_NUMERIC_ASSERTION.

## 7. Negation and conditional guards

Проверяются отдельные clauses, а не весь field. Исправлены Unicode boundaries русских слов. Проверки охватывают finding/rationale/proposedAction/suggestedText/uncertainty/verificationSteps/statements.

Положительные fixtures: «Нельзя гарантировать рост CTR»; «Без benchmark нельзя считать CTR низким»; «Отсутствие schema не подтверждено»; «Частичный граф не доказывает отсутствие входящих ссылок»; условный CHECK «Если тег отсутствует, подготовить вариант».

Отрицательные fixtures: независимое обещание после оговорки (в том числе после «но»), текущая schema absence при NOT_OBSERVED, отсутствие входящих ссылок при PARTIAL, текущий UNKNOWN Description absence. Reasons: PROMISED_METRIC_EFFECT / UNSUPPORTED_CTR / UNBOUND_ABSENCE_CLAIM.

Commercial caveat «Поисковый запрос не подтверждает оптовые продажи» разрешён; следующее независимое утверждение об оптовых ценах без evidence отклоняется. Неизвестные продажи, INVENTORY и causal guards сохранены.

## 8. Numeric/date handling

Авторитетно точное исходное значение. Для CTR/average position разрешено детерминированное округление с точностью, выводимой из записи; counts не округляются, произвольной tolerance нет. Процент не заменяет позицию. Диапазон обязан включать точные связанные значения: 10,64199 не входит в 8–10.

Даты YYYY-MM-DD / DD.MM.YYYY сопоставляются только с явно цитируемыми snapshotAt/observedAt/period metadata. Правдоподобная дата без ссылки даёт UNBOUND_DATE. Формат/реальность metadata-даты проверяются.

SKU допускается через typed SKU source, с сохранением ведущих нулей и отказом для другого кода; SAE/ISO/HLP/HVLP/упаковка — только через attributable full content/current product facts. Порядковые номера инструкций не считаются метриками. Произвольная арифметика не объявляется проверенным фактом.

Известные quoted current Title/Description/H1 assertions сравниваются с соответствующим cited scalar (CONTENT_FACT_MISMATCH); currentText отдельно проходит сохранённую V2 target/content policy. Произвольная парафраза не получает SUPPORTED автоматически.

## 9. Commercial/page-intent grounding

Неподтверждённые official store / wholesale / wholesale prices / best prices / national delivery / certified supplier assertions дают UNVERIFIED_COMMERCIAL_QUALIFIER. Предлагаемый copy не освобождается от проверки фразой «гипотеза».

Proof берётся из положительного FULL известного Title/Description/H1, не из query или соседнего partial product snippet. Wholesale sales не доказывают wholesale prices. Отрицательное исходное утверждение не является positive proof. Условная проверка или нейтральный вариант допустимы.

V3-local intent helper отдельно различает product topic, corporate navigation, подбор, АЗС и другой сервис. Для product/category growth одного навигационного запроса недостаточно. Учитывается русская форма «масел». Product-topic relevance не объявляется доказанным B2B; исходные intent tags/UNKNOWN сохраняются. Search classifier, matching и deterministic scoring не менялись.

## 10. V3 prompt

Отдельный компактный prompt + strict JSON schema; saved profile остаётся bounded и неизменным. Требуются объект/место, конкретный вариант/структура, Search binding, ограничения и verification criteria. ACTIVE finding не обязателен; zero recommendations допустимы. Unknown field не блокирует гипотезу по другому известному полю.

Запрещено копировать большие JSON VALUE-объекты. Метрики необязательно дублировать свободным текстом: сервер показывает связанные значения. Provider/model/transport/timeout не изменены.

## 11. Validator

Pipeline: JSON/envelope → strict per-item schema → typed resolution → preserved target/security gates → field/text consistency → clause/numeric/commercial/intent checks → per-item decision.

V2 numerical/absence/CTR/promise lexical predicates заменены V3 проверками, остальные gates сохранены. Внутренние server-derived legacy values служат только совместимости этих gates, а не доказательством произвольного model text.

Сохраняются per-item rejection, duplicate-ID rejection, safe codes и отсутствие rejected text в production logs/UI. Model summary/strengths/limitations не считаются фактами; summary пересобирается сервером.

READY_CHANGE / GROWTH_HYPOTHESIS / DATA_CHECK считаются отдельно. Generic «улучшить SEO» и growth без конкретного proposedContent/uncertainty/verification отвергаются. INSPECT не заменяет наблюдаемый content proof. Гипотеза посадочной остаётся предварительной: без нового URL, с read-only saved overlap lookup и обязательной проверкой каннибализации.

## 12. Offline fixtures

`tests/seo-review-v3.test.ts`, `tests/ai-diagnostics-v3.test.ts`, synthetic diagnostic fixture и `scripts/acceptance-seo-v3-offline.ts`.

- Positive: нейтральная concrete catalog Title hypothesis; READY_CHANGE на полном scalar; DATA_CHECK отдельно; корректные metric rounding/date/range; ordinals; attributable technical value; conditional absence/commercial checks; genuine positive commercial proof.
- Negative: wrong ID/path/type/page/period/proto/traversal; fake current scalar; UNKNOWN как факт; MISSING_TERM/existing content policy; E037/E027; wrong CTR/position; невалидный диапазон/дата/арифметика; unsupported technical/qualifier; navigation-only growth; generic action/wrong target; mutation/checkout/inventory/unknown-sales/causal/foreign-URL guards.
- Operational: strict mixed-contract rejection, partial success/empty output, no retries, D without provider, V3 diagnostic fields/redaction, old V2 default compatibility.

Saved production profiles используются только read-only. Синтетический provider формирует один нейтральный Title proposal для каждого B/A/E, все три проходят как GROWTH_HYPOTHESIS / NEEDS_REVIEW. D `/catalog/tp-30-kub-1-000-l/` не имеет saved snapshot/Search: пустой результат, **0 fake provider calls**. E не имеет ACTIVE findings. Никаких новых данных от production сайта не получено.

## 13. Regression

**Full: 458/458 PASS (220,44 s).** Из них 68 новых V3 checks, остальные 390 — существующий regression. Финальный V3 targeted: 68/68; diagnostic regression после уточнения V3 intent metadata: 53/53. Build/typecheck PASS; 11 migrations applied, schema drift отсутствует. Secrets/security PASS. Логи: `test-results/sprint5-3-full-tests.log`, `sprint5-3-build.log`, `sprint5-3-typecheck.log`, `sprint5-3-migrations.log`, `sprint5-3-drift.log`, `sprint5-3-client-secrets.log`, `sprint5-3-security.log`.

Локальные HTTP/Browser fixtures покрывают scanner modes, pacing 3s, WAF, timeout stage, redirects/aliases, matching и cancellation. Search aggregation/import precedence, Commerce coverage/zero-fill/RULE_11, deterministic SEO/Opportunities и старые AI contracts входят в полный набор. Production integration scripts с записью fixture Pages/SeoActions в рабочую БД не запускались.

Устаревший тест диагностического CLI теперь сравнивает существующий Sprint 5.2 ledger до/после вместо требования его отсутствия. Ledger не удалялся. Промежуточный EPERM Prisma generation был вызван Windows DLL lock; финальный build выполнен после освобождения процесса. Guards ради тестов не ослаблялись.

## 14. Performance

| Profile | Input / messages bytes | Builder median ms | Validator median ms | Offline total median ms |
| --- | ---: | ---: | ---: | ---: |
| B | 39422 / 53811 | 562.72 | 2.46 | 573.79 |
| A | 35881 / 50406 | 446.39 | 2.56 | 449.73 |
| E | 56232 / 70685 | 403.30 | 2.77 | 408.78 |
| D | 13389 / 25639 | 382.03 | 0.15 | 382.94 |

Page360 baseline: median **551,30 ms**, mean 571,95, max 717,52. Final normal-worker series: median **995,44 ms**, mean 968,73, max 1025,89; steady repeat median **868,32 ms**. Control on the same final build without worker: median **1012,15 ms**. All responses HTTP 200. Earlier intermediate controlled series was 563,97 ms. All measurements are retained; the slower final series is not replaced by the earlier faster sample.

**Открытое performance-наблюдение:** итоговые серии медленнее baseline; отключение worker не устранило разницу. Причина не установлена. Нельзя приписывать её worker или заявлять отсутствие regression только по промежуточной серии. V3 evidence/provider не выполняются на GET; Scanner/основной Page360 data path byte-identical. Это ограничение коротких локальных замеров, требующее отдельного расследования, не продуктовый performance PASS. Логи/JSON: `sprint5-3-page360-after.log`, `sprint5-3-page360-steady.log`, `sprint5-3-page360-controlled.log`, `sprint5-3-page360-worker-first.json`, `sprint5-3-offline-performance.json`.

Warm Page360: пять последовательных запросов после прогрева, одинаковый contacts URL/M3, все HTTP 200. Это короткая локальная серия, не доказательство статистической эквивалентности. Initial GET не запускает evidence/provider; V3 анализ остаётся ручным.

Builder/validator: saved B/A/E/D, одна warm-up итерация и пять измеряемых итераций, fake provider, fetch запрещён; без параллельного build/tests. Input bytes — сохранённый profile, request bytes — сериализованный messages payload; это не измеренные DeepSeek tokens. Никаких provider latency/tokens для Sprint 5.3 нет.

## 15. Security

Production client assets/rendered routes secrets check PASS. Новые source/reports/artifacts проверены на фактические configured secrets без их вывода. Prompt и rejected text не логируются в production; UI показывает только принятые предложения и safe rejection codes.

CLI `npm run ai:diagnostics -- replay --contract V3 --enable-local-diagnostics` выполнен offline: 0 API, synthetic artifact в защищённом локальном хранилище, без raw output в stdout. Windows ACL actual write/read и TTL 24h покрыты regression. V3 сохраняет все допустимые 25 refs без прежнего array projection limit 20. Полные V2/V3 system prompts редактируются перед сохранением диагностических фрагментов.

`live --contract V3` подготовлен, но **не запускался**. Default CLI остаётся V2. V3 diagnostic intent metadata использует тот же V3-local intent helper, что и validator, без изменения исторического V2 helper. V3 B diagnostic требует отдельного authorization flag, отдельного `sprint5-3-live-diagnostic.json`, exclusive creation, одного POST/0 retries; существующий ledger не переиспользуется. Новый live ledger пока отсутствует.

Local-only/deployment refusal, fixed external storage path, ACL fail-closed, redaction, size/path/link restrictions и cleanup остались. TTL enforced on read/CLI cleanup; фонового deletion daemon нет. Исторический защищённый ответ не перенесён в обычные документы.

## 16. Data integrity

Сопоставлены whole-row hashes/counts десяти таблиц: Scan, ScanPage, JobRun, MetrikaPageDaily, WebmasterQueryDaily, BusinessRecord, Import, Opportunity, Page, SeoAction. **Все совпадают с before.** Это покрывает sources, Page aliases, SeoActions/Opportunities и отсутствие автоматических публикаций/создания сущностей.

Из 205 baseline files 200 byte-identical; пять разрешённых integration changes: manual action, две UI components, diagnostic engine/redact. Старые prompts/validators/evidence/services, Scanner, Search, Commerce, Prisma, provider, `.env` и старые stopped ledgers не изменились. Новые V3 files проверены тестами/build отдельно; это не заявление, что весь проект не менялся.

Доказательства: `test-results/sprint5-3-before.json`, `sprint5-3-after.json`, `sprint5-3-integrity-after.log`, `sprint5-3-summary.json`.

## 17. Live acceptance plan

Только после нового явного разрешения: **B → A → E**, максимум три новых платных вызова, 0 retries. Отдельный ledger; прошлые бюджеты не действуют. Каждый следующий вызов — только после substantive review предыдущего. Diagnostic CLI сейчас намеренно ограничивает отдельный B capture одним вызовом; никакая автоматическая серия A/E не добавлена.

Два независимых критерия:

- Reliability PASS: служебные поля не создают ложного VALUE refusal; E037/E027 и истинные contradictions отвергаются; оговорки/условия корректны; UNKNOWN/qualifiers защищены.
- SEO Usefulness PASS: хотя бы одна применимая READY_CHANGE/GROWTH_HYPOTHESIS с релевантным intent, конкретным местом/вариантом и проверяемыми основаниями. DATA_CHECK сам по себе недостаточен.

Review каждого accepted/NEEDS_REVIEW и доступного protected REJECTED: factual correctness, intent, current content, usefulness/handoff, defect type, validator verdict и экспертный verdict. Codex review не равен независимому human approval. При системном FAIL серия останавливается.

## 18. Known limitations

Bounded clause/number/current-scalar recognition не является универсальным NLP. Неизвестные формулировки могут давать conservative rejection или требовать ручного review; свободная интерпретация никогда не получает автоматический SUPPORTED. Whole-field disclaimer bypass не добавлен.

Quoted current-scalar checks покрывают известные формы, но не каждую парафразу. Неподдерживаемая арифметика отклоняется. Commercial proof консервативно ограничен полными attributable scalar fields; Search и partial body не доказывают свойства магазина/продукта.

Saved category H1/Description остаются UNKNOWN; DOM/category structure и full-site link/landing coverage не появились. Новые scans/sync/export не выполнялись. B2B relevance — гипотеза/наблюдение существующих tags, не утверждение о покупателях каждого запроса.

Во время проверки локальный сервер запускался с process-only `SCANNER_WORKER_DISABLED=1`; `.env` не менялась. После подтверждения отсутствия активных/queued scans восстановлен штатный supervisor и сервер на 127.0.0.1:3000. Последующий integrity check PASS. Ни crawl, ни sync/export, ни CMS не запускались.

## 19. Next step

Ожидать отдельное разрешение live revalidation. До него: **0 DeepSeek calls**. Не начинать Site SEO Strategy, TDS, Competitive Benchmark, bulk AI или автоматическую публикацию. Продуктовый результат оценивать по реальным рекомендациям, а не по acceptance rate/числу CHECK.
