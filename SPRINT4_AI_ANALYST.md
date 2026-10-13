# Sprint 4 — AI Analyst MVP · 08.10.2026

## Status

**READY WITH FIXES**. Реализация и автоматические проверки завершены; реальная приёмка A/B/C не дала полного PASS: последняя серия A/B отклонена semantic guards, C успешно вернула0 рекомендаций. Полезные ответы ранее получались, но качество нестабильно, включая ошибочную интерпретацию существующего Title. Это blocker для обычного использования без обязательного human review, а не основание отключать guards. Reference: `FINAL_PRE_AI_HARDENING.md`. Новое задание пользователя заменяет старые требования master Sprint4 об истории/TOP-5 batching: только одна Page, ручной запуск, без persistence/migrations.

## Architecture

Page360 → ручной click → Next server action `pageAiAnalysis(pageId)` → current Site ownership validation → `buildAiPageEvidence()` → provider interface → DeepSeek → JSON/schema/reference/semantic validation → UI. Browser передаёт только Page ID, не URL/evidence. Initial GET не строит AI evidence и не вызывает модель. Результат хранится только в состоянии клиентского блока до reload.

Модули: `src/lib/ai/{contract,config,evidence,prompt,provider,deepseek,validator,service}.ts`; action `src/app/ai-actions.ts`; UI `src/components/ai-analysis.tsx`. Deterministic engines/formulas/scoring/matching/aliases/75% coverage не менялись. Schema и migrations не менялись. Нет новых queues/cache/history/streaming/bulk/Competitive Benchmark.

## DeepSeek provider

`AiProvider.analyzePage()` изолирует транспорт. DeepSeek использует server-side POST `/chat/completions`, JSON Output, explicitly `thinking:{type:'disabled'}`, temperature0.2, configurable model, max tokens, timeout, без tools/stream. Redirect запрещён, body ограничен100KB, text result40KB. HTTP failures/body/headers не отражаются в UI или logs.

Подтверждение API: [официальный JSON Output guide](https://api-docs.deepseek.com/guides/json_mode/) описывает `response_format: json_object`, необходимость JSON в prompt и пример модели `deepseek-flash`. Это выбранное значение ENV, не зависимость бизнес-кода от конкретной модели. Модель можно заменить ENV.

[Thinking mode documentation](https://api-docs.deepseek.com/guides/thinking_mode/) сообщает enabled/high по умолчанию. Первые три UI requests завершились INVALID_RESPONSE до schema validation; ни один ответ не отображён. В final adapter thinking выключен явно, finish_reason=length классифицируется OUTPUT_TRUNCATED и не retry. Исходный metadata sample сохранён отдельно; причинность первой ошибки не подтверждена raw response, поэтому не утверждается как доказанный единственный root cause.

## Environment

```dotenv
AI_ENABLED=true
DEEPSEEK_API_KEY=<server-side only>
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-flash
AI_TIMEOUT_MS=60000
AI_MAX_OUTPUT_TOKENS=6000
```

`.env` настроен по запросу пользователя; ключ добавил пользователь, его значение не выводилось. `.env.example` default AI_ENABLED=false/key/model пустые. URL только HTTPS без credentials/query/hash. Timeout1000–120000ms, tokens256–8000; invalid numeric setting использует безопасный default. AI_ENABLED=false/нет key/model/invalid baseURL → UI «AI-анализ недоступен», остальная Page360 работает. После изменения ENV перезапустить `npm start`; production build также пересобрать для согласованной конфигурации.

## AI input contract

`AiPageAnalysisInput` vAI_EVIDENCE_V1: page identity/current URL/canonical/observed aliases/type/snapshot ID/source/time; independent Search period; coverage/summary/TOP15 queries/intents; content fields; exact technical observed/normalized values; technical HTTP/canonical/robots/indexability/schema; independent Commerce period/coverage/provenance/metrics; stock; saved deterministic findings; quality/limitations. Все evidence имеют IDs и состояния KNOWN_PRESENT/KNOWN_ABSENT/NOT_OBSERVED/UNKNOWN. CompetitiveEvidence определён как extension type, не используется в MVP/prompt.

## Evidence builder

Ownership проверяется через read-only current Target Site lookup, затем Page query с siteId. Нет arbitrary URL fetch, crawl/sync/recalc. Search использует существующий `seoPageView(M3)`/effective transport/aggregateQueries/searchCoverage/classifyQuery; Commerce — existing page-local `commerceForPage(28)`. Граф читается только после click, а не initial GET.

Search TOP15 по impressions с deterministic tie-break; query evidence сохранённого SEO finding включается в bounded FINDING evidence отдельно. Findings: до5 current ACTIVE SEO Actions и до5 ACTIVE сохранённых COMMERCE Opportunities (с историческими периодами, isCurrent явно передан). Opportunity evidence — узкая projection сохранённых signal/period/visits/sales/coverage/provenance; конфигурации, full Page profiles, trends/benchmarks и внутренние IDs из evidence не передаются. Нет автоматического создания signal. Opportunity не имеет отдельного persisted confidence: передаётся UNKNOWN, severity используется как сохранённый priority, score неизменен. Поддерживаются findings covered period09.09–06.10 даже при partial current KPI10.09–07.10.

Sales totals неполного периода передаются как null/UNKNOWN, даже когда наблюдаемая часть содержит0: непокрытый день не превращается в ноль. Сохранённый covered finding отдельно сохраняет свои подтверждённые нули и даты. Это только AI projection; Dashboard/Commerce calculations не изменены.

Excerpt/string600 characters, arrays15, object35 keys, depth4, aliases30; payload ≤60KB. `truncated=true`/explicit limitations обозначают усечение. Raw HTML и source workbook не передаются. Existing publicData + bounded redaction убирают configured secrets, credential-like fields/strings, emails. Не следует помещать персональные данные в SEO content/queries; redaction не является полноценной DLP.

## Prompt

Version **AI_ANALYST_V1**. Findings first, explicit VALID_EVIDENCE_IDS, supporting evidence second. System prompt считает все Page/query/finding strings untrusted data, запрещает выполнять их инструкции, пересчитывать metrics/scores и выдумывать UNKNOWN. B2B производитель смазочных материалов, профессиональный покупатель; minimum order не выдумывается. Period каждого блока/finding независим. Качественные effects без обещаний +N%/₽. Один finding обычно1–2 recommendations, несколько findings позволяют3–5. Консервативная политика MVP: нет saved meaningful findings →0 recommendations, а не новые проблемы из слабого спроса.

## Output schema

Zod strict object: executiveSummary;0–5 recommendations с title/problem/recommendation/rationale/expectedEffect/confidence/evidenceIds, optional uncertainty/proposedChange(area/example); limitations. Unknown fields, пустые обязательные строки, oversized strings/list/response, invalid enum/IDs отвергаются. No HTML rendering: React plain text escaping. Model/provider/prompt version присутствуют в result metadata.

## Validators

JSON parse → Zod → actual evidence-ID registry → meaningful referenced evidence → semantic guards. Каждый ID должен существовать; quality-only/UNKNOWN-only grounds недостаточны. Рекомендации по сохранённому сигналу цитируют FINDING; отдельная техническая проверка может опираться на релевантные TECH/CONTENT observations. При пустом findings рекомендации запрещены. Unsupported inventory conclusions, physical missing schema claims, adding known technical token, unsupported low CTR conclusions и количественные обещания эффекта отвергаются. B2B/M3/5W-40 в качественном описании не считаются численным обещанием. Для partial graph — LOW + explicit uncertainty. При partial sales zero-sales conclusion требует сохранённого covered RULE_11/RULE_16, ссылки на него и explicit finding period/covered-period qualifier. Deterministic limitations добавляются сервером независимо от model output.

Guard различает B2B «решение о закупке» и складское пополнение: обычная покупка не запрещена при unknown stockKg. Он также допускает «не добавляйте5w40 повторно», но запрещает положительное добавление/дублирование KNOWN_PRESENT характеристики. Subcodes INVALID_EVIDENCE_* обозначают только категорию нарушения, без response text.

Semantic guards — консервативные правила распознавания типовых противоречий, а не математическая гарантия истинности свободного текста на любом языке. Они могут reject осторожный ответ; human review остаётся обязательным. Known technical addition guard консервативен, в том числе при переносе существующей характеристики в новый блок.

## Safety guards

Server-only ENV/provider/config/evidence/service. Browser не имеет API key, готового input или arbitrary URL. Next server action сохраняет framework Origin/Host protection. Текущая app — local/internal, bind127.0.0.1, отдельной новой auth/RBAC нет; нельзя публиковать сервис как анонимный public analyzer.

Request-local analysis, без writes. Ephemeral in-flight guard: один запрос на Page, максимум2 одновременных запросов процесса; это не queue/cache и не durable rate limit. Failure result не меняет Opportunity/SEO status/priority/score/type. Metadata logs только timestamp/pageId/provider/model/promptVersion/latency/success/error code/input-output bytes. Ни prompt/query/content/error body/key/headers не логируются.

## Page360 UX

Отдельный блок AI-анализ, кнопка «Проанализировать страницу», disclosure «AI использует сохранённые данные Page360 и не изменяет сайт». SearchM3/Commerce28 явно подписаны; фактические периоды в evidence. Loading не блокирует остальные panels. Summary,0–5 recommendation cards: почему/что изменить/пример/qualitative effect/confidence/uncertainty; expandable ID+state+bounded observed evidence; отдельные limitations. Deterministic cards отдельно. Reload удаляет analysis.

## Error handling

AI disabled/missing config: unavailable. Timeout/network/syntax invalid JSON — максимум один retry, итого2 provider attempts. Schema/reference/semantic invalid,429/5xx/403/truncated envelope не retry. Transporttimeout60s на attempt, worstcase provider waiting≈120s плюс evidence preparation; нет вечного provider wait. UI generic «Не удалось выполнить AI-анализ. Попробуйте повторить», никаких fake recommendations. Current Site mismatch/page missing отклоняется до provider call.

## Tests

Production build PASS; typecheck PASS; финальный полный fixture suite174/174 PASS,0 skipped,137.393s. Отдельные17/17 AI tests также PASS. Финальный повтор полного suite зафиксирован в `test-results/sprint4-tests-final.log`. Secrets PASS: configured values, включая DeepSeek key, отсутствуют в client assets и rendered responses, включая реальную Page360. Schema check PASS:11 migrations up to date, no drift; новых migrations нет. Fixtures без production DeepSeek: fake provider + fake HTTP response, A–F, malformed JSON/schema/IDs/count/confidence/empty/huge, partial graph, sales UNKNOWN, retry cases, injection as data, credentials redaction/config, arbitrary URL early rejection. Изменение зависимостей: Zod; npm install audit0 vulnerabilities.

Disabled AI acceptance PASS (Page360 HTTP200, UNAVAILABLE). Arbitrary URL/missing Page action guards PASS до provider call. Protected source hashes PASS: raw tables, Opportunities, Page identities/types/aliases, saved SEO Actions неизменны. Fixed Commerce09.09–06.10:14 Growth/3 Risk; configured summary совпадает с baseline. Artifacts: `sprint4-build.log`, `sprint4-typecheck.log`, `sprint4-ai-tests-final.log`, `sprint4-secrets.log`, `sprint4-migrations.log`, `sprint4-drift.log`, `sprint4-disabled.json`, `sprint4-action-guards.json`, `sprint4-protected.json`, `sprint4-final-data-check.log` в `test-results/`.

## Production-local acceptance

Три выбранные read-only saved Pages:

| Case | Page | Deterministic input | Result |
| --- | --- | --- | --- |
| A | `/about/contacts/` · cmuv6ydso000t20gomgcaf3mg | current SEO A02 | ERROR: INVALID_EVIDENCE_CTR,15.819s UI |
| B | `/catalog/gazpromneft-hydraulic-hlp-46-kanistra-20-l/` · cmuwa1gdu000h2054jfhxhiaj | saved RULE_11,09.09–06.10.2026 | ERROR: INVALID_EVIDENCE_INVENTORY_PROPOSAL,13.767s UI |
| C | `/catalog/g-energy-expert-l-5w-40-kanistra-4-l/` · cmuwa2ozp00292054wa8hppfl | no ACTIVE findings | SUCCESS:0 recommendations,5.033s UI |

Ручной click выполняется автоматизированной локальной UI acceptance, последовательно по трём Page, через тот же server action. Реальный provider только для этого явно запрошенного acceptance. Production target site не читается; никаких crawl/export/sync. Artifacts: `test-results/sprint4-acceptance-pages.json`, `sprint4-production-local-ui.json`.

Последняя серия не подменяется ранее успешными ответами. Development rounds сохранены в `sprint4-production-local-ui-{initial,second,third,fourth,fifth}.json`; встречались INVALID_RESPONSE, OUTPUT_TRUNCATED, INVALID_SCHEMA/JSON, semantic rejects и успешные A/C. Отдельные read-only review artifacts также содержат ошибки сети/контракта. Исправлены доказанные проблемы projection/guard/prompt: partial sales передаются null/UNKNOWN, narrowed saved Opportunity, explicit evidence allowlist/enum/array contract, thinking disabled, max output6000, false-positive «закупка»/B2B и negative technical addition. Guard failures не retry автоматически, как требует scope. Raw rejected responses в приложении не сохраняются: для последнего A/B известна категория guard, но нельзя объявить все их утверждения доказанными hallucinations без raw human review. Новые реальные запросы ради улучшения статистики не продолжаются.

## Performance

Paired PageA M3: warm-up +5 sequential initial GET до/после, всеHTTP200. Mean1.0695s →0.9076s; median1.0574s →0.8825s. В этой небольшой серии регрессии initial GET не обнаружено; снижение не доказывает устойчивое ускорение (cache/нагрузка/разброс). AI evidence/model не вызываются initial GET. Median final UI analysis13.767s включая два failed validation; единственный SUCCESS5.033s. Artifacts: `test-results/sprint4-page360-before.json`/`sprint4-page360-after.json`. Historical pre-hardening product Page360 sample не подменяет paired before.

## Human quality review

Human review проведён по6 сохранённым рекомендациям development samples, отдельно от последней UI серии: A из `sprint4-production-local-ui-fourth.json`, B из `sprint4-review-b-artifact.json`. B artifact первоначально отвергнут прежним overbroad «закупка» guard; после его исправления повторная локальная validation с fresh evidence прошла, нового provider call для этой перепроверки не было. Это не SUCCESS последней B UI acceptance.

| Page / recommendation | Evidence correct | Actionable | Hallucination / uncertainty | Result |
| --- | --- | --- | --- | --- |
| A / метаописание | FINDING_01 A02 и реальные query/content IDs; description UNKNOWN явно оговорён | Да, есть текст | Подтверждение HTML перед публикацией; численного обещания нет | PASS |
| A / уточнить Title | IDs существуют, но Title уже начинается «Контакты и реквизиты» | Текст предложен | Утверждение, что Title не отражает контакты/реквизиты, противоречит CONTENT_01; указание hypothesis не исправляет факт | FAIL |
| B / B2B CTA на первом экране | FINDING_01:97visits/0orders за09.09–06.10; реальные CONTENT IDs | Да, КП/менеджер | Усечённое содержимое не доказывает отсутствие существующего B2B блока/CTA; причина нуля не установлена | QUESTIONABLE |
| B / выбор фасовки | Реальные observed volumes и FINDING_01 | Да, вариант интерфейса | Из text excerpt нельзя установить состояние действующего selector и барьер конверсии | QUESTIONABLE |
| B / применение и совместимость | Реальные excerpt/documents IDs | Да, после проверки полного текста | LOW/усечение явно указаны; нельзя утверждать, что полного блока применения нет | QUESTIONABLE |
| B / ручная проверка Product/Offer | TECH_05 NOT_OBSERVED/TECH_02 UNKNOWN корректно трактованы | Да, сначала проверить HTML | Не утверждает физическое отсутствие schema, LOW; внедрение только после проверки | PASS |

Итого2 PASS/3 QUESTIONABLE/1 FAIL. Модель иногда создаёт правдоподобное, но неподтверждённое объяснение; semantic regex guards не заменяют human review. Пример Title — конкретное ограничение текущего MVP. Последний C:0 recommendations корректно, не считается рекомендацией для процентов качества.

## Known limitations

Главное ограничение: финальные A/B не прошли, стабильность JSON/evidence semantics не подтверждена; для обычного использования нужна доработка качества генерации и новая согласованная приёмка. Guards консервативны и могут отклонить корректную оговорку о неизвестных остатках. При этом прошедший guard текст тоже может неверно интерпретировать Title или усечённый layout: обязательна проверка человеком. No silent fallback.

Graph partial, schema NOT_OBSERVED, kgPerUnit0/1909, stockKg/daysOfStock UNKNOWN, sales07.10+UNKNOWN, unmatched165 — ограничения baseline, передаются явно. Нет saved findings →0 recommendations. AI server policy фиксирует SearchM3/Commerce28, даже если пользователь просматривает другие периоды Page360; это явно подписано в блоке. No persisted history/durable concurrency/cost dashboard. Initial generation snapshots are read-only sequential reads, not multi-source transaction; stale evidence даты показаны. Review и публикация выполняются человеком вне MVP.

## Metrics

Последняя UI серия: AI analysis success1/3 (33.3%); validation failures2/3 (66.7%); accepted recommendations A/B/C=0/0/0. Recommendations per successful analysis=0 (C); rejected output не считается пустым успешным анализом. Median UI latency13.767s, server action latency13.380s (включая evidence preparation и failed validation); единственный SUCCESS C5.033s UI/4.835s server. Это sample3, не статистическая оценка production success rate; development reruns не скрыты и не объединены с ним.

Human quality по отдельному сохранённому sample6: PASS2/6=33.3%, QUESTIONABLE3/6=50%, FAIL1/6=16.7%. Fixtures и6 development recommendations не смешиваются с real final API success metrics.

## Next step

Закрыть нестабильность генерации/семантической grounding и повторить согласованную A/B/C приёмку; текущий итог READY WITH FIXES, а не PASS. До этого — только ручная оценка сохранённых результатов с human review. Bulk, Competitive Benchmark, auto-publish и следующий Sprint не начинались и автоматически не запускаются.
