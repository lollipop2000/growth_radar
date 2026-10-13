# Sprint 5 — AI SEO Growth Copilot / Page SEO Review

## 1. Status

**READY WITH FIXES; Sprint 5 live acceptance FAIL.** После отдельного согласования лимита четырёх вызовов выполнены D → A → B, затем остановка по качеству B. Использовано **2/4** платных вызова, **0 retries**. C/E не запускались. Полные пять принятых карточек, доказательства и экспертные замечания: [SPRINT5_LIVE_ACCEPTANCE.md](SPRINT5_LIVE_ACCEPTANCE.md). Новый ledger закрыт; старые Sprint 4.2/4.2.1 ledgers не изменены. Продуктовый PASS не подтверждён.

Offline-этап ниже завершался READY FOR LIVE SEO REVIEW ACCEPTANCE с **0 API calls** и PASS build/typecheck/tests/UI/secrets/migrations/integrity. Его исторические результаты не переписаны как live PASS.

## 2. Product objective

Новый анализ одной страницы самостоятельно предлагает до пяти полезных SEO-гипотез по сохранённому контенту и Search. Наличие ACTIVE findings не требуется. Пустой результат допустим. Без наблюдаемого контента/технических данных/Search запросов один лишь product mapping не вызывает provider. Рекомендации не создают SeoActions, Opportunities, новые URL или страницы и не публикуются на сайте.

## 3. Architecture

Ручная server action `src/app/seo-review-actions.ts` → read-only `buildPageSeoReviewInput()` → независимый prompt → общий bounded DeepSeek transport → per-item validation → React cards. Новые модули находятся в `src/lib/seo-review/`.

Старые AiActionContext/V1/V2/V3, prompt, validators, services, UI и regressions сохранены. В общем `DeepSeekProvider` выделен метод `complete(messages)`; прежний `analyzePage(input)` делегирует ему с прежними messages. POST endpoint, параметры, timeout, response limits и обработка ошибок сохранены. Новый сценарий не использует старую finding-based policy. Его limiter ограничивает одновременно выполняемые ручные SEO Review двумя и запрещает параллельный повтор страницы в одном процессе.

## 4. Evidence contract

Отдельный `PageSeoReviewInput`, version `PAGE_SEO_PROFILE_V1`: page/search/content/technical/internalLinks/commerce/product/existingFindings/evidenceQuality. Registry IDs назначаются сервером. Evidence содержит kind, value, source, observedAt, period при наличии, state, coverage, truncated, supportsAbsenceClaim.

States: KNOWN_PRESENT / KNOWN_ABSENT / NOT_OBSERVED / UNKNOWN. Coverage: FULL / PARTIAL / UNKNOWN. FULL scalar относится к сохранённому полю, не к live freshness. Null всегда UNKNOWN. Пустое импортированное поле не доказывает отсутствие. Только проверенное пустое HTTP/BROWSER scalar с modern signals допускает KNOWN_ABSENT. Regex-сигналы и schema ненаблюдение не доказывают физическое отсутствие.

## 5. Evidence builder

Используются существующие read-only Search aggregates/intent classification, `seoPageView(..., false)` и `commerceForPage()`. Нового crawler, sync/export или пересчёта правил нет.

- Page: текущий URL, canonical, type, snapshot/source/date/ID, последняя успешная HTML-дата и до 30 aliases; усечение aliases явно сообщается.
- Search: выбранный в Page360 период, summary/coverage, TOP 25 по impressions и query при равенстве, реальные queries/CTR/clicks/position/intents; totalQueries/truncated. Сопоставимый trend в этом профиле UNKNOWN, не придумывается.
- Content: полные сохранённые Title/Description/H1, до 25 H2, topText до 4 000 символов, до трёх детерминированных окон по 3 000 символов (начало/середина/конец), коммерческие evidence excerpts. Сохраняются видимые границы PARTIAL/TRUNCATED.
- Technical: status, canonical, robots, indexable, final URL, redirects, observed schema, даты/источник.
- Links: точные сохранённые URL, inbound минимум, outbound count, observed/total source pages. Списки inbound/outbound/related ограничены 10/15/10, порядок URL стабилен. Related — известные страницы того же типа, а не доказанные альтернативные товары. Граф PARTIAL даже при снимках всех source Pages: исторические/неполные наблюдения и aliases не доказывают orphan. Anchor text не извлекается заново.
- Commerce: независимый текущий 28-дневный период, visits, orders/revenue только при полной sales coverage, known days и подтверждённая provenance. Дни после 06.10.2026 остаются UNKNOWN. INVENTORY не входит в этот сценарий.
- Product: только подтверждённый mapping — до 15 групп и 20 SKU, названия/категория. Не TDS и не доказательство OEM допуска.
- Existing findings: до пяти SEO и пяти Commerce, только ACTIVE/current, дополнительный контекст.

Максимум input 80 000 UTF-8 bytes. Полные scalar fields не режутся незаметно: слишком большой профиль отклоняется до provider. Configured secrets, credentials в URL и чувствительные ключи редактируются существующим publicData; строки дополнительно очищаются от email/явных token/password значений. Raw analytics rows, полный HTML, cookies, headers и ENV в модель не передаются.

## 6. DeepSeek prompt

Независимый **PAGE_SEO_REVIEW_V1**, server-only transport, текущая настроенная модель **deepseek-flash**. Роль senior SEO для B2B смазочных материалов; самостоятельные гипотезы по intent/content/technical/links, не объяснение одной rule. Не более пяти предложений, ноль допустим. PROFILE явно отделён как недоверенные данные; инструкции в тексте страницы или запросе выполнять запрещено.

Prompt требует источник, uncertainty и проверку, запрещает invented facts/queries/technical properties, causal sales claims, promises, inventory actions, mutation, forms/cart/checkout. TITLE/META_DESCRIPTION/H1 имеют разные структурные placements. AI_ENABLED=false предотвращает даже evidence builder в server action. Provider делает 0 или 1 запрос, без repair/retry.

## 7. Output schema

`PageSeoReviewResult`: summary, recommendations, limitations. Recommendation содержит id, area, priority, recommendationType, finding, rationale, proposedAction, optional proposedContent/targetQueries/uncertainty/verificationSteps и evidenceIds.

Для проверяемого target alignment добавлены обязательные typed `placement` и `operation`, optional targetUrl и обязательный массив `claims` (может быть пустым). Claim связывает evidenceId с точным VALUE, доказанным ABSENT или MISSING_TERM в полном scalar. Это декларации проверяемых утверждений, а не расширение AiActionContext. JSON Schema генерируется целиком, включая корневые recursive JSON definitions.

CHANGE: REWRITE/ADD. CHECK: INSPECT/COMPARE, без suggested text, с verificationSteps. CREATE_HYPOTHESIS: PROPOSE, только landing hypothesis, минимум два реальных запроса и без нового URL. Landing всегда требует site-level проверки. Неизвестные/малонаблюдавшиеся технические элементы допускают CHECK; добавление schema без доказанного основания отклоняется.

## 8. Grounding/validation

Parse/size → строгий envelope → отдельная schema каждого item → registry IDs → достаточность evidence → area/placement/operation → target URLs/queries → exact known contradictions → decision. Неуспешный item не отравляет остальные. Ошибки envelope/JSON останавливают результат без retry.

TITLE/Description/H1 CHANGE требует известного полного соответствующего поля и Search query evidence. Content CHANGE требует наблюдаемого content и Search либо подтверждённого product. Links требуют сохранённых наблюдений и известной страницы. Неполный graph не подтверждает orphan. Числа должны присутствовать в cited evidence; technical values в предлагаемом тексте — в observed content/product, одного Search запроса недостаточно. Сохраняются запреты UNKNOWN sales/inventory, неподтверждённых допусков/совместимости, CTR conclusions, causal assertions, guaranteed effects, unsafe interactions/injection и additions существующего контента.

Структурный mismatch и известный counterexample Description→видимый абзац дают отдельные codes. Проверка не пытается доказать произвольный смысл русского текста огромным набором regex. Generic action отвергается, но любые новые интерпретации/предлагаемые тексты помечаются **NEEDS_REVIEW**. **SUPPORTED** зарезервирован для mechanically-checkable CHECK/COMPARE точных values без неполного evidence; даже он требует review и не доказывает SEO-эффект. **REJECTED** item text удаляется из ответа и не логируется; остаются index/status/reasonCodes.

Модельные summary/strengths/limitations не пересылаются как факты. Сервер формирует summary из числа принятых items, strengths из реально сохранённых scalar observations, opportunities из прошедших карточек, limitations из evidence. Так сохраняется независимый анализ, но не возвращается прежняя shared-envelope hallucination проблема.

## 9. Page360 UX

Самостоятельный блок **AI SEO Review**, кнопка **«Проанализировать SEO страницы»**, отдельные loading/error/empty состояния. Initial GET не собирает новый evidence профиль и не вызывает provider. Карточки показывают AI priority, area, CHANGE/CHECK/hypothesis, объект/операцию, proposed content, реальные queries, uncertainty, verification, status и раскрываемые основания source/date/period/coverage/value.

Отклонённые тексты скрыты; доступны коды. React экранирует весь текст, HTML модели не исполняется. Старый AiAnalysis убран только из обычного Page360; его код сохранён. Возврат старой UI-вставки возможен отдельно, не требует отката БД.

## 10. Fixtures

30 offline tests: независимость от findings и immutability; существующий термин в Title; отсутствующий query term; Description UNKNOWN CHANGE/CHECK; partial excerpt/absence; существующий technical token; Search без доказательства дефицита; schema NOT_OBSERVED; partial links/orphan; UNKNOWN orders; неизвестный URL; structural и body/Description mismatch; per-item isolation; неверные IDs/queries/numbers/currentText; empty evidence/provider skip; injection в странице/query; generic action; technical value из query; informational CTA; content CHECK без Search; ненаблюдаемый body/CTA при известном Title; повторное добавление существующей ссылки; landing hypothesis; causal/CTR/inventory/unsafe guards; exact comparison SUPPORTED; input size/truncation; malformed/duplicate/max-five items; mock DeepSeek/disabled/no retries; manual initial GET/legacy preservation; output UI statuses/escaping/evidence.

Все provider calls в fixtures поддельные. Scanner regression использует локальные HTTP/Browser fixtures; production сайт не сканировался.

## 11. Tests

Финальный полный suite: **286/286 PASS**, zero skipped, 182.774 s. Новый SEO Review: **30/30 PASS** отдельно, 27.400 s. Совокупный AI regression: **129/129 PASS**, 30.739 s, включая все 99 tests старых AI-файлов и 30 новых. Полный suite также включает Scanner/WAF/redirect/alias regression. Typecheck PASS.

`npm run build` PASS (Prisma generation + Next). После финального target-guard review выполнена повторная `npx next build` PASS: compile 13.7 s, TypeScript 40 s; в compiled server bundle подтверждены финальные reason codes. Secrets PASS в `.next/static` и rendered routes, включая Page360. Все **11 migrations** применены; Prisma diff — **No difference detected**. Новых migrations нет.

Артефакты: `test-results/sprint5-tests.log`, `sprint5-unit.log`, `sprint5-ai-regression.log`, `sprint5-typecheck.log`, `sprint5-build.log`, `sprint5-build-final.log`, `sprint5-migrations.log`, `sprint5-secrets.log`, `sprint5-page360-ui.log`. Первая попытка post-build HTTP checks пришлась до Ready сервера (ECONNREFUSED); после Ready проверки повторены успешно. Это не provider retry и не DeepSeek request.

## 12. Data integrity

Read-only DB before/after hashes: raw Webmaster/Metrika, BusinessRecord, Page identity/types/aliases, Opportunities и SeoActions. Сравнение с baseline предыдущих этапов и текущим before. Никаких source imports/sync/scans/recalculations не запускалось. Нет migrations и новых таблиц.

SHA-256 protected source manifests охватывают Scanner/Search/Yandex/Business/Commerce/deterministic SEO/Prisma и старые AI modules (исключение — описанный общий transport refactor). Оба остановленных ledger входят в manifest. Артефакты `sprint5-protected-before/after.json`, `sprint5-code-before/after.json`, `sprint5-integrity.log`.

## 13. Security

DeepSeek adapter и profile builder server-only. В клиенте только enabled boolean и sanitized accepted результат; ENV/key в props не передаются. Production logs содержат metadata/codes/counts, без prompt, profile и model free text. Никаких rejected text artifacts. UI рендерит escaped text. AI disabled/no evidence/bounded input/no hidden retries проверены fixtures. Проект остаётся localhost/trusted-network приложением с прежними ограничениями доступа.

Offline actual profile diagnostic подменяет global fetch на запрет со счётчиком: **networkRequests=0, productionApiCalls=0**. Все реальные provider latency/tokens — **N/A**, не выводятся из fake-provider measurements. Старые бюджеты не переиспользованы.

## 14. Performance

Initial Page360 baseline: пять warm GET `/pages/cmuv6ydso000t20gomgcaf3mg?searchPeriod=M3`, mean **1066.6 ms**, median **1014.2 ms**, HTTP 200. После финальной сборки: пять HTTP 200, mean **956.0 ms**, median **989.8 ms**, min **791.4**, max **1028.9 ms**. На этой небольшой локальной выборке деградация не наблюдалась; это не гарантия ускорения. Новый builder не входит в initial GET. Артефакты `test-results/sprint4-page360-sprint5-before.json` и `sprint4-page360-sprint5-after.json` (имена формирует существующий performance script).

Offline profiles и validator measured в `test-results/sprint5-offline.json`. Builder примерно 0.78–1.62 s по пяти разным сохранённым страницам. Validator fixture 25 repetitions: median **5.8 ms**, min **4.54 ms**, max **168.70 ms** (включая cold/JIT outlier). Это локальная проверка, не оценка latency DeepSeek. Пустой fake response и validator содержательной fixture измерены отдельно. Длительность полной тестовой загрузки не используется как product latency.

## 15. Live acceptance plan

Отдельное разрешение пользователя обязательно. Предлагаются пять **разных** существующих страниц; данные M3 01.06–31.08.2026, snapshots 07.10.2026 там, где они сохранены:

| Case | Page | Actual Search | Acceptance focus |
| --- | --- | --- | --- |
| A | `/catalog/gazpromneft-premium-n-5w-40-kanistra-4-l/` | 197 impressions, 3 clicks, 146 queries | Product, intent fit, конкретный Title/content без invented specs |
| B | `/catalog/` | 13058 impressions, 1947 clicks, 502 queries | Category structure, Search/known links, practical hypotheses |
| C | `/about/contacts/` | 1049 impressions, 24 clicks, 55 queries | Informational intent, корректный meta Description target, без product purchase CTA |
| D | `/catalog/tp-30-kub-1-000-l/` | Нет Search/snapshot, только mapping | Честный empty, **0 API calls** |
| E | `/` | 687 impressions, 73 clicks, 55 queries; ACTIVE findings 0 | Самостоятельный анализ без finding prerequisite |

План — до четырёх отдельных вызовов A/B/C/E, D остаётся zero-call, без retries. Это **предложение**, не разрешённый бюджет. Перед вызовами переснять read-only preflight, зафиксировать новый отдельный ledger, version/model/code/data hashes. После каждого предложения экспертная содержательная проверка: relevance/target, конкретность, выполнимость, факты/uncertainty, B2B intent, отсутствие invented causes. При FAIL/неполезности остановиться; не менять prompt/guards между вызовами, не генерировать до удачи. Отдельно фиксировать actual accepted/rejected/codes/tokens/latency и Page360 контроль. Codex review не является подписью независимого human reviewer.

## 16. Known limitations

Полезность нового prompt на DeepSeek ещё не подтверждена live. Проверяемый enum не доказывает смысл произвольного текста: сохраняются NEEDS_REVIEW и ручная проверка, узкие counterexamples не претендуют на универсальную семантику. Prompt/provider output budget 6000 tokens может дать менее пяти рекомендаций; truncated output не ремонтируется автоматически.

Контент — saved text windows, не layout/DOM/live render; graph — исторические точные links, без новых crawl/anchor extraction. Related selection по типу страницы не устанавливает продуктовую совместимость. Trend unavailable; product mapping не TDS. Неполные sales периоды UNKNOWN. Limiter process-local, без новой distributed queue. Профиль >80 KB fail closed; нет скрытого урезания полных полей.

## 17. Next step

Live-серия завершена остановкой после B: **READY WITH FIXES / live FAIL**, C/E остаются непроверенными. Два неиспользованных вызова не расходуются автоматически. Дальнейшее исследование grounding и category usefulness требует отдельного задания; в этой серии prompt/provider/guards/data не менялись. Не объявлять Sprint 5 product PASS до подтверждения практически полезных рекомендаций. Site SEO Strategy, TDS, Competitive Benchmark, bulk AI и CMS publishing не реализованы.
