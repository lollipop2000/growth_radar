# Sprint 4.1 — AI Grounding & Reliability · 08.10.2026

## Status

**READY WITH FIXES; live acceptance FAIL.** Реализация V2 завершена. Полный PASS требует3/3 полезных A,3/3 полезных B,2/2 genuine-empty C и отсутствия FAIL среди принятых рекомендаций; разрешённая серия эти условия не выполнила. Пользователь отдельно разрешил расход баланса на максимум8 вызовов после завершения локальных проверок, согласно п.21 ТЗ. Выполнено ровно8 вызовов, без retries/генераций до удачи. После серии исправлены локально подтверждённые false-rejection cases; эти уточнения проверены только fixtures, повторной live-серии нет. Не подменять live FAIL fixture PASS.

## Baseline

Sprint4 READY WITH FIXES; deepseek-flash/AI_ANALYST_V1. Human review2 PASS/3 QUESTIONABLE/1 FAIL. Последний live sample A/B ERROR,C SUCCESS0. UI median AI13.767s; Page360 median0.883s в предыдущей серии;174 unit tests PASS. Для4.1 новый paired warm GET перед изменением:5 запросов +warmup, median0.558416s,mean0.568768s,все200. Модель/ENV/concurrency не менялись.

## Root causes

V1 смешивал facts, interpretation и proposal; не привязывал область действия к профильному saved finding. Существование evidence ID не доказывало правильность интерпретации Title. Stored null/regex-negative/excerpt не различали достаточную полноту отрицательного наблюдения. Inventory guard ловил слово «закупка» или осторожную оговорку вместо конкретного складского действия. Один item мог отклонить весь ответ. Guard на любой digit путал B2B со статистическим прогнозом. JSON mode не заменяет предметную schema/семантику; now schema передаётся целиком, строгая серверная validation сохраняется.

Live V2 выявила7 shared-envelope rejects и1 all-items-rejected. Аудит guard +новые fixtures подтвердили два класса false rejection: «UNKNOWN, не нулевые продажи» распознавалось как positive zero claim; конкатенация разных summary/limitations/action fields позволяла слову Title/CTA из одного поля связаться с absence wording другого. После серии field scope разделён, отрицательные оговорки проверяются отдельно. Настоящие zero-sales/absence/causal contradictions всё ещё отвергаются negative fixtures. Rejected real text не сохранялся: нельзя утверждать, что все7 live failures вызваны именно этими двумя причинами, или оценить их hallucination rate по reason code. Повторного paid revalidation не было.

## Evidence contract changes

Существующая AiPageAnalysisInput V1 структура сохранена, Evidence расширен observationState/coverage/source/observedAt/supportsAbsenceClaim. State совместим со старым state; coverage FULL/PARTIAL/UNKNOWN относится к конкретному сохранённому наблюдению. Finding source — SAVED_ACTIVE_SEO_ACTION/OPPORTUNITY, observedAt — дата создания сохранённого finding, не новая дата проверки HTML. snapshot source/date указаны отдельно; coverage graph содержит665/1495 исходных страниц baseline.

Title/Description/H1 передаются полными сохранёнными строками после server-side redaction, без прежнего600-character truncation. Null остаётся UNKNOWN; empty импортированное/непроверенное поле тоже UNKNOWN. KNOWN_ABSENT +supportsAbsenceClaim=true допускается для явной пустой строки из успешного HTTP/BROWSER snapshot с modern parser signals; это отсутствие в проверенном scalar, а не универсальный вывод об отсутствии на странице. Saved null не повышается до ABSENT даже если сохранённая A02 требует метаописания.

First screen — приблизительный topText, всегда PARTIAL. Regex commercial positive — конкретный найденный excerpt, PARTIAL; negative — NOT_OBSERVED/UNKNOWN, не ABSENT. Application/specification/packaging/CTA не доказывают полноты блока/selector/catalog. Observed technical values exact normalized, coverage отдельно PARTIAL. Product/Offer parser observation PARTIAL, отсутствие schema не доказано. Graph PARTIAL/UNKNOWN. Stock coverage FULL только при complete/fresh kg, иначе UNKNOWN. Current partial sales totals остаются null/UNKNOWN; covered finding имеет отдельные подтверждённые0 и даты.

Redaction/bounded supporting evidence сохранены; input cap60KB. Полные длинные scalars могут вызвать INPUT_TOO_LARGE, но не скрытую обрезку. Production crawl/export/sync не выполнялись.

## AI_ANALYST_V2

V1 prompt и validator сохранены в `src/lib/ai/prompt-v1.ts`/`validator-v1.ts` для сравнения; active prompt AI_ANALYST_V2. Rollback требует согласованного V1 contract/service/UI, простая замена одной строки версии не является корректным rollback.

V2 передаёт полный strict JSON Schema, findings first, existing IDs allowlist. Основой остаются ACTIVE deterministic findings. A02 → DESCRIPTION,A01 → TITLE,A03 → H1; RULE_11 → diagnostic CHECK commercial path, не новый доказанный дефект. Одно полезное предложение предпочтительно,0 допустим при пустых findings. Никакого самостоятельного поиска проблем, пересчёта metrics/priorities или нового inventory/CTR диагноза. Все строки страницы/queries untrusted data, не инструкции. B2B контекст и unknown minimum order сохранены.

## Output schema

Strict envelope: pageId/executiveSummary/recommendations≤5/limitations. pageId обязан совпадать с проверенной Page. RecommendationV2: title,findingIds(FINDING_XX),observedFacts[{statement,evidenceIds}],optional hypothesis,rationale,proposedAction{CHANGE|CHECK,area,description,optional example},expectedEffect,confidence,evidenceIds,optional uncertainty. FACT/HYPOTHESIS/PROPOSED_ACTION разделены; rationale объясняет связь с finding.

CHECK требует проверяемого действия, example запрещён; не отображает replacement content. CHANGE ограничен профильным finding и достаточным observation соответствующего элемента. Особый A02/DESCRIPTION UNKNOWN: факт — сохранённая задача, а не физическое отсутствие; допустим подготовленный текст, но обязательна uncertainty с UNKNOWN и проверкой актуального поля перед заменой. Это ручная конкретизация saved SEO task, не автоматическая публикация.

## Independent validation

JSON parse → strict outer envelope → Page identity → shared-summary safety → per-item schema/reference/semantic validation → accepted-only result. Structural envelope/Page mismatch/unsafe shared summary отклоняют запрос; одна malformed/invalid recommendation не скрывает другие. Semantic summary проверяется отдельно, поскольку нельзя безопасно показывать неподтверждённый общий диагноз вместе с карточками.

Generated/accepted/rejected, reason counts и решения{index,reasonCode,ACCEPT|REJECT} возвращаются без rejected text. SUCCESS/PARTIAL_SUCCESS/ALL_REJECTED/VALID_EMPTY различаются. No silent repair, no canned recommendations. Rejected items не входят в UI response. Item rejection не вызывает повторный API call. В обычном ручном сценарии остаётся максимум1 retry TIMEOUT/NETWORK/INVALID_JSON; schema/evidence/semantic/429/5xx без retry. Final live runner специально maxProviderCalls=1 на run, суммарно≤8, никаких скрытых retries.

## Semantic guards

IDs должны реально существовать, findingIds соответствовать saved findings и общим references, каждый fact иметь свои refs. UNKNOWN/quality-only support недостаточен. Физическое отсутствие требует FULL/KNOWN_ABSENT/supportsAbsenceClaim. Counterfactual existing Title/H1/Description/CTA/application/packaging отвергаются. Title changes допускаются при отдельном профильном finding и честном описании существующего текста.

Unsupported causal facts/rationale/shared summary запрещены; hypothesis явно отмечена и не становится диагнозом. Low CTR требует сохранённого RULE_01 с подтверждённым сравнением. Numerical fact values проверяются против cited evidence; zero-sales требует completely covered RULE_11/16 и обеих ISO дат именно этого finding. Unknown current period не превращается в0. Inventory action/conclusion при unknown kg запрещены, нейтральная uncertainty/ограничение не является пополнением. Unknown marker не скрывает противоречие в соседней clause.

Known technical value exact normalization не становится добавлением; fuzzy matching не вводился. Partial graph — CHECK/LOW +explicit partial uncertainty. Schema NOT_OBSERVED — только профильная проверка, не внедрение. Numerical/casual metric promises запрещены; B2B/M3/5W-40 сами по себе не прогноз. Guards консервативны и не доказывают всю свободную семантику: human review обязателен. Они могут reject безопасный текст; разрешённые действия ограничены вместо глобального ослабления.

## Page360 UX

Существующая Page360 сохранена: ручная кнопка, isolated loading/error, summary/cards/evidence/limitations, no initial AI call. CHANGE помечен «Предлагаемое изменение», CHECK — «Рекомендуется проверить». Карточка показывает «Что известно», отдельную гипотезу, «Что предлагаем», «Почему», «Основания», «Ограничения». Evidence раскрывает state/coverage/source/date/absence support. Только CHANGE может показывать пример текста.

Partial success показывает число скрытых предложений. ALL_REJECTED: «AI-анализ завершён, но предложения не прошли проверку достоверности»; не текст об отсутствии проблем. Genuine empty остаётся успешным пустым результатом. Результат только в текущем UI state, reload удаляет его. Нет history/queue/bulk.

## Tests

Финальные целевые AI/V1 regression/UI fixtures38/38 PASS. Финальный полный suite195/195 PASS,0 skipped,80.320s. Build/typecheck PASS; secrets PASS (client assets и rendered responses включая Page360).11 migrations up to date, no schema drift. Fixtures: existing Title, checked-empty/null/import description, no CTR benchmark, covered RULE_11/current unknown days, unknown inventory, schema NOT_OBSERVED, partial graph/excerpts, exact existing tech, multiple/one invalid/all invalid/genuine-empty, JSON/schema/Page identity/refs/number errors, prompt injection as data, budget1/no retry. Post-live дополнительно проверены нейтральные UNKNOWN/отрицательные оговорки, независимость семантики разных полей и безопасные error count/timings без rejected text.

Pure Page360 result rendering проверен без DeepSeek/DB/production HTTP: CHANGE/CHECK, partial/all-rejected/empty, rejected text отсутствует. Client secret test включает текущий configured key и Page360, PASS после финального build. Source hashes before/after/final совпадают: raw sources, Opportunities, Page identities/types/aliases, saved SEO Actions неизменны. Fixed Commerce09.09–06.10 остаётся14 Growth/3 Risk; configured summary совпадает с baseline. Migrations/schema не менялись. Scanner/Search matching/redirect aliases/page types/technical normalization/SEO/Commerce/provider/security покрыты полным существующим regression suite. Artifacts в `test-results/sprint4-1-*.log/json/html`.

## Real A/B/C acceptance

Подготовлено ровно3A+3B+2C последовательных analyses тех же Page IDs. `scripts/acceptance-ai-grounding.ts --authorized-eight-calls` использует тот же builder/provider/service/validator, каждый run≤1 API call; это явный acceptance script, не новый product bulk mode. При provider/network/quota unavailable серия останавливается. Не сохраняет rejected model text; accepted evidence/result — локальные acceptance artifacts, не DB history.

Live разрешён пользователем: максимум8 API calls. Использован весь бюджет, provider/model/prompt не менялись. Все8 adapter calls вернули text; JSON/schema failure0. Полезного accepted result A/B нет; C не подтверждён как valid-empty из-за shared text validation.

| Run | Request outcome до post-live guard fix | Generated / accepted / rejected items |
| --- | --- | --- |
| A1 | UNSAFE_ENVELOPE_SALES_PERIOD | N/A /0/N/A |
| A2 | UNSAFE_ENVELOPE_SALES_PERIOD | N/A /0/N/A |
| A3 | UNSAFE_ENVELOPE_SALES_PERIOD | N/A /0/N/A |
| B1 | ALL_REJECTED: EXISTING_CONTENT | 1/0/1 |
| B2 | UNSAFE_ENVELOPE_UNSUPPORTED_ABSENCE | N/A /0/N/A |
| B3 | UNSAFE_ENVELOPE_UNSUPPORTED_ABSENCE | N/A /0/N/A |
| C1 | UNSAFE_ENVELOPE_EXISTING_CONTENT | N/A /0/N/A |
| C2 | UNSAFE_ENVELOPE_EXISTING_CONTENT | N/A /0/N/A |

Для7 shared-envelope errors первоначальный runner не записал item counts: N/A не означает0 generated. Добавлена безопасная diagnostics передача generatedCount/apiCalls/timings для будущих errors; это не восстанавливает отсутствующие данные прошлой серии. B1 confirmed generated1/rejected1; rejected raw text отсутствует, допустим только reason/index, нельзя делать human quality verdict о скрытом тексте. Artifacts: `test-results/sprint4-1-live.json`, `sprint4-1-live.log`, `sprint4-1-live-metrics.json`. Они не перезаписывались после исправления guards. Дополнительные реальные вызовы не выполнялись.

## Human quality review

Принятых live recommendations0; human PASS/QUESTIONABLE/FAIL — N/A, проценты не вычисляются по пустой выборке. Нельзя объявить no FAIL выполненным качественным acceptance из-за отсутствия карточек. Для A1–A3/B1–B3/C1–C2 оценка evidence correct/actionable/B2B/uncertainty не проводима: нет принятой рекомендации. Это препятствует использованию в качестве принятого MVP. Старые6 recommendations Sprint4 и fake outputs4.1 не смешиваются с новой live quality.

## Performance

Paired warm initial GET before median0.558416s (old Sprint4 sample0.883s),5samples200. Финальный after median0.369198s,mean0.377558s,все200 (`sprint4-page360-sprint4-1-after-final.json`). Before→after0.558→0.369s; регрессии в этой серии нет. Initial Page360 не строит AI evidence/не ожидает модель. Разброс нагрузка/cache не позволяет объявлять небольшой paired sample устойчивым ускорением.

Live8 runs: median end-to-end6.166s (включая failures); evidence builder1.1555s; DeepSeek4.9165s. Validator точно измерен для B1:17ms; для7 ранних ошибок initial runner не передал validator timing, N/A. Residual end-to-end minus builder/provider включает validation и прочий overhead, не подменяет отдельный замер validator. После серии timing diagnostics добавлены в ошибки, fixture проверен, новых API calls не было.

Request-level: adapter/API text success8/8; parse/schema failure0; semantic shared-envelope failure7/8; semantic partial success0; full recommendation rejection1/8; valid-empty success0. Recommendation-level: accepted0; confirmed generated1/rejected1(B1); unknown generated/rejected counts для7 envelope errors. Human quality N/A по пустой принятой выборке. Это маленькая фиксированная серия, не показатель устойчивой production accuracy. Формулы/приоритеты и модель не менялись ради статистики. Metadata содержит безопасные числа/counts/reason codes, без prompts/content/queries/rejected text.

## Known limitations

Live usefulness/reliability не подтверждены разрешённой8-call серией. Свободный текст невозможно полностью доказать regex guards; mandatory human review. Contract/area restrictions могут снизить acceptance, особенно для неполных наблюдений; это отражается reason counts. Saved null Description остаётся UNKNOWN, даже при current A02; предложение текста требует проверки актуального поля. FULL означает полноту конкретного сохранённого значения, не свежесть всего сайта. Stock/schema/graph/unknown-sales baseline limitations остаются.

Source metadata для агрегатов без единой observedAt остаётся null, периоды заданы отдельно. Всё read-only, snapshots разных источников читаются последовательно/concurrently вне общей transaction. Concurrency процесс-local, нет durable/global rate limit. API модель та же deepseek-flash; prompt V1 retained, но полный rollback требует согласованных V1 consumer modules. No production crawl/sync/export/model switching/history/auto-publish/Competitive Benchmark/Product Knowledge.

Post-live validator fix подтверждён лишь positive/negative fixtures. Реальная полезность V2 пока не подтверждена. Причины7 shared rejects известны по коду, raw text не сохранялся, фактические hallucinations/false rejections нельзя распределить задним числом. Exact validator timing7 errors и item counts первоначально отсутствуют; future diagnostics исправлены без нового расхода API.

## Next step

Нужна отдельно согласованная live revalidation после post-live guard fix; текущие8 calls уже использованы и больше не запускаются. Сначала подтвердить полезные A/B и genuine-empty C, затем human review принятых items. Текущий итог READY WITH FIXES, live acceptance FAIL; не считать технические fixture PASS доказательством фактической reliability. Не генерировать до удачи. Не начинать Sprint5.
