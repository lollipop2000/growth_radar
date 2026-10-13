# Sprint 5.1 — SEO Evidence & Recommendation Quality

## 1. Status

**READY WITH FIXES / LIVE REVALIDATION FAIL.** Offline acceptance и regression PASS. При реализации было 0 DeepSeek calls; отдельная согласованная live-серия использовала 1 из 3 новых вызовов, B accepted=0/rejected=5; A/E не запускались. Полный актуальный результат: `SPRINT5_1_LIVE_REVALIDATION.md`. Sprint 5 live FAIL remains the baseline; no production PASS is asserted. Model/provider and ENV unchanged. Old stopped ledgers, including the unused Sprint 5 budget, are preserved and not reused.

## 2. Baseline

Sprint 5: A generated 5 / accepted 4 / rejected 1, useful Description change with qualifications; B generated 5 / accepted 1 / rejected 4, weak diagnostic-only output, FAIL. D empty without provider; C/E not called. See `SPRINT5_LIVE_ACCEPTANCE.md` for the complete accepted recommendations. Rejected text was deliberately not stored, so exact historical wording/URLs/claims cannot be reconstructed.

New before fingerprints: `test-results/sprint5-1-before.json`; baseline warm Page360: `test-results/sprint4-page360-sprint5-1-before.json`. Audit was performed against saved data before changing the prompt. No production crawl/export/sync was run.

## 3. Root-cause audit

| Problem | Observation | Root cause / proof boundary | Fix? |
| --- | --- | --- | --- |
| H1 UNKNOWN | Both saved Browser snapshots of `/catalog/` (05.10 and 07.10) contain null H1. Latest has modern content signals. | Null already exists in ScanPage. Builder does not lose a saved value. Parser maps missing/empty extracted strings to null; original HTML is not persisted, so absence vs extraction/DOM timing cannot be established retrospectively. | Keep UNKNOWN; expose exact data gap. No guessed H1 or rescan. |
| Description UNKNOWN | Both snapshots contain null description; Title is `Каталог продукции`. | Same boundary. Browser reads `page.content()` → common `parseHtml` → saveScanPage persists scalar fields directly. No saved original HTML to prove a parser defect. | Keep UNKNOWN and explain limitation. |
| FACT_VALUE_MISMATCH | A item 0; B items 0/3. Validator compared JSON.stringify values. | Proven order-sensitive implementation defect for objects. It is NOT proven that these particular rejected claims differed only by key order. | Exact structural comparison, with typed negative fixtures. |
| QUERY_NOT_CITED | B items 0/1. Query string and corresponding evidence ID checked separately. | Code proves an uncited query ID condition; why the model omitted/misassigned it cannot be recovered. TOP-only selection and a large JSON also make reference use harder. | One query-ID list; exact unambiguous binding with explicit repair diagnostics; no fuzzy matching. |
| UNKNOWN_TARGET_URL | B item 0. Only current bounded registry URLs were accepted. | Proven scope limitation: saved Pages/aliases outside profile were not consulted. Historical target URL not retained; cannot assert it actually existed. | Same-site read-only exact lookup. Unknown means not in saved data, not physical nonexistence. |
| Insufficient AI usefulness | Sole accepted B item defers Title to checking unrelated unknown H1/Description; 4/5 rejected. | V1 says unknown field → CHECK, and CREATE_HYPOTHESIS is restricted to landing. This prevents a typed Title growth hypothesis despite known Title/Search. | V2 supports grounded growth hypotheses for existing-page areas, with uncertainty and confirmation criteria. |
| UNSAFE_TEXT | B item 2. Original regex had broad substrings. | Historical trigger not reconstructible. Synthetic Russian `токенизацию` reproduces a lexical false positive in the old `токен` substring guard. It does not prove that B contained this word. | Specific unsafe-condition codes; word/morphology boundaries; secret, injection, executable and mutation guards retained. |

Latest category snapshot: `cmuyhvkix00vx20qcislhclj7`, BROWSER, 07.10.2026 19:22:36.585Z; H2 `Нужна консультация менеджера?`; 28 saved links; visibleText/topText/commercial present. Older snapshot lacks modern signals. Audit evidence: `test-results/sprint5-1-catalog-before.json` / after.json.

## 4. Content evidence improvements

Full saved Title/Description/H1 remain exact; null never becomes empty/ABSENT. UNKNOWN fields carry explicit reasons in limitations. Body windows remain PARTIAL. Category subcategory structure, filters, product-list structure and information block are separately UNKNOWN because the saved flattened text cannot distinguish them reliably. H1/H2 and observed typed links remain separate evidence.

Scanner extracts title/meta/H1/H2, meaningful main/body text and internal links; a local HTML fixture verifies category and product links and removal of header/footer from meaningful text. Browser/common parser/persistence flow was inspected. No confirmed production parser bug could be demonstrated without stored HTML; Scanner code and WAF/redirect/rate guards remain byte-identical.

Technical values in proposed copy must be attributable to full saved scalar fields or confirmed current product mapping. Partial snippets and neighbouring product cards cannot establish a technical value for the current product. This is conservative: legitimate values observed only in an unscoped body need a check instead of an invented certainty.

## 5. Search evidence improvements

Bound 25: TOP 15 by impressions, then highest-ranked representative of each existing intent class, then remaining TOP to fill the bound; stable ordering, deduplication. No classifier/dictionary/clustering/scoring changes. Low-volume intent fixture demonstrates retention. Actual raw representative query spelling is selected deterministically from existing rows; metrics remain aggregated over the existing normalization group. Period, pageId, impressions/clicks/CTR/position and existing intent labels accompany the ID.

`demand` provenance: `src/lib/search/native.ts` reads native monthly `YYYY-MM_demand`; import stores it without conversion. Existing aggregate computes mean query/region demand for the latest observed month. The code does not establish the upstream unit/definition. Therefore demand is excluded from AI query and summary evidence; raw/source/aggregate logic is unchanged. Impressions are page observations, clicks observed clicks, CTR is clicks/impressions × 100, average position is impression-weighted. No market-demand or traffic forecasts.

Prompt has one QUERY_EVIDENCE list. The same query records are removed from PROFILE.search to avoid duplicate/conflicting tables. Summary remains a page aggregate, not another query listing.

## 6. Validator corrections

Canonical structural equality ignores object key order only. Nested objects, arrays and values compare recursively; array order, type, null, missing keys and exact numbers remain significant. No approximate matching. MISSING_TERM is limited to FULL nontruncated KNOWN_PRESENT Title/Description/H1; technical formatting equivalence uses the existing utility. Partial body cannot prove a missing scalar term.

Absence assertions remain guarded. Narrow check questions and epistemic caveats are distinct from facts; a caveat cannot exempt a second assertion in another sentence or clause. Unsafe conditions have separate codes: UNSAFE_EXECUTABLE_TEXT, UNSAFE_INSTRUCTION, UNSAFE_SECRET_REFERENCE, UNSAFE_HTTP_MUTATION, plus UNSAFE_TEXT umbrella. Original causal/CTR/inventory/unknown-sales/technical/existing-content/interaction guards remain active. No rejected model text in response/logs. Synthetic diagnostics contain reason codes only.

## 7. URL/query resolution

Exact query or its existing formatting normalization may restore one current evidence ID. Diagnostics: QUERY_ID_RESTORED / QUERY_FORMAT_NORMALIZED; reject QUERY_NOT_IN_CURRENT_PROFILE, QUERY_AMBIGUOUS, QUERY_PERIOD_MISMATCH, QUERY_PAGE_MISMATCH, INVALID_EVIDENCE_ID. Unknown/fuzzy variants are never attached to a similar query. Existing invalid IDs are not silently discarded.

URL sources: current registry, exact saved same-site Page URL or alias outside profile, or UNKNOWN_TARGET_URL if not found. No HTTP request. Resolve at most 30 candidate URLs per bounded response. A new landing cannot specify targetUrl or create a Page.

Accepted landing hypotheses trigger a read-only preliminary lookup of saved Page titles/URLs/aliases using actual query terms, bounded to 10 displayed candidates. This partial lexical lookup is NOT a cannibalization audit, and empty results do not establish a free niche. Every landing remains NEEDS_REVIEW with CANNIBALIZATION_REVIEW_REQUIRED.

## 8. Recommendation outcomes

Server-derived, not guessed by the model:

- READY_CHANGE: concrete suggested content, known complete relevant source observations; ready only for human consideration.
- GROWTH_HYPOTHESIS: CREATE_HYPOTHESIS/PROPOSE or a proposed change whose supporting content is partial. Known Title plus real Search/content may support a Title hypothesis while H1/Description stay UNKNOWN. Scalar hypothesis requires a concrete variant, known target, uncertainty and verification.
- DATA_CHECK: CHECK/INSPECT or COMPARE, a concrete diagnostic task; suggested replacement text forbidden.

Unsupported combinations are rejected. No fixed outcome mix. SUPPORTED remains exact mechanical comparison only; interpretation/hypotheses remain NEEDS_REVIEW. Partial success and genuine empty result preserved. Priority does not change deterministic scores.

Per-card quality: confirmed cited queries and page impressions/period, observed B2B label or UNKNOWN, rationale as potential SEO value (not measured uplift), evidence completeness. Implementation complexity is UNKNOWN because saved analytics do not establish CMS/template implementation cost. No invented forecasts or complexity estimates.

## 9. PAGE_SEO_REVIEW_V2

V1 prompt and schema retained in `prompt-v1.ts` / `schema-v1.ts`. V2 separates unknown-field checks from opportunities based on known data, requires actionable variants and verification criteria, distinguishes category/product scope, retains B2B, injection, uncertainty, technical and no-effect-promise rules. Same transport/model; one call maximum per manual request, no retries. No new provider, action entity or publication mechanism.

## 10. Page360 UX

Manual-only button retained. Initial Page360 GET does not build AI evidence or call the provider. Cards show server-derived outcome, priority, review status, actual search observations, B2B state, potential value, complexity UNKNOWN and evidence completeness; original full evidence/provenance/period/current/suggested content and verification remain visible. No rejected text. JSX escaping and all three outcomes verified by static render fixtures.

Numeric provider token counters are restored after general text/secret redaction, only as nonnegative safe integers. The old generic `token` key redactor incorrectly hid inputTokens/outputTokens. No secret-redaction policy or shared AI transport was changed.

## 11. Fixtures

`tests/seo-quality.test.ts` and sanitized saved `tests/fixtures/seo-review-catalog.json`: canonical key order/nesting/types/array order/null-missing; actual catalog UNKNOWN fields and useful Title hypothesis; product Description READY_CHANGE; partial body GROWTH_HYPOTHESIS; diagnostic DATA_CHECK; exact/restored/normalized/ambiguous/foreign-period/foreign-page/fuzzy query references; diverse existing intents; known/outside-profile/alias/unknown/external URLs; preliminary landing lookup; hypothesis verification/unknown scalar/area combinations; caveat and factual absence including second-clause bypass; full scalar technical normalization; unscoped neighbouring product specifications; injection, secrets, mutation, fabricated numbers, inventory, causal claims/CTR; safe API and tokenization wording; per-item rejection and numeric usage; original Scanner extraction.

Offline acceptance uses real saved A/B/D/E inputs and explicitly synthetic proposals, with global fetch forbidden. A product Description → READY_CHANGE; B catalog Title → GROWTH_HYPOTHESIS; D → empty with zero fake/provider calls; missing Description → DATA_CHECK; landing → hypothesis plus saved overlap review. Real existing URL/alias lookup PASS. These checks prove contract behaviour, not DeepSeek usefulness.

## 12. Regression

**337/337 PASS**, 0 skipped/cancelled. Build и typecheck PASS. 51 новых SEO quality fixtures плюс 30 исходных SEO Review; legacy AI V1/V2/V3 входят в полный прогон (99 прежних AI tests, суммарно 180 AI/SEO Review). Итоговый лог `test-results/sprint5-1-tests.log`; промежуточный отдельный AI-прогон 176/176 предшествует четырём финальным fixtures. Full suite includes legacy AI V1/V2/V3, Scanner/Browser/WAF/pacing/page-errors/queue/redirect aliases, Search matching/native imports, Commerce/transactional coverage and deterministic SEO. No live scanner acceptance scripts were executed against production.

## 13. Performance

Paired warm Page360 M3: one warm-up excluded, five sequential GETs, same contacts route. Before mean 567.950 ms / median 563.533 ms / range 511.962–639.038 ms; all 200. Final after mean **571.651 ms** / median 537.627 ms / range 517.971–664.325 ms; all 200. Mean +0.65%, median −4.60%: no material regression within local variation, still below 1.5 s. Measurements taken after tests/build completed, no concurrent profiler. All samples retained; no repetition to select a favourable result.

Saved-data offline builder sample: B 1539.665 ms, A 652.426 ms, D 573.715 ms, E 524.579 ms (single builder samples during fixture workload; not a paired performance claim). Pure validator on actual B, 25 samples: median 0.713 ms, min 0.506, max 4.259 ms. Provider latency/tokens N/A: 0 real API calls. Manual builder/resolution stays out of initial Page360. No new queue/cache/stream/bulk architecture.

## 14. Data integrity

Whole-row counts/hashes protect Scan, ScanPage, JobRun, MetrikaPageDaily, WebmasterQueryDaily, BusinessRecord, Import, Opportunity, Page and SeoAction. Source hashes protect Scanner, Search, deterministic SEO/Commerce/business, legacy AI, Yandex, Prisma, ENV and old ledgers. Before/after matched. No source values, identities, aliases, matching, rules or scores changed. No migrations introduced. 11 applied migrations, schema up to date; migrate diff reports no difference. Secrets check PASS for configured credentials in built client assets and rendered responses. Logs: sprint5-1-build/typecheck/migrations/drift/secrets/integrity.log.

## 15. Live acceptance plan

План отдельно согласован и выполнен до stop condition: B ALL_REJECTED, серия остановлена, новый ledger halt=true. Два неиспользованных вызова автоматически не расходуются. Далее приведён исходный план для истории:

Separate authorization required: NEW ledger, maximum 3 paid calls, sequential **B → A → E**, no retries or repeated generation until success. Review every accepted recommendation including NEEDS_REVIEW. Stop at systemic rejection/irrelevance/uselessness. B must yield a meaningful READY_CHANGE or GROWTH_HYPOTHESIS, not solely DATA_CHECK. Freeze prompt/model/guards/data across runs; D remains offline. Old stopped budgets are not available for reuse.

## 16. Known limitations

H1/Description category UNKNOWN remain unresolved observations. No raw HTML/DOM semantic blocks stored, no retrospective proof of original parser timing/absence. Body/graph/landing lookup partial; no full-site cannibalization proof. Existing intent classes can include broad/gas-station queries: V2 must assess page relevance, not assume every observed query is a target. demand unit remains unverified and omitted. Free-form semantic usefulness still needs human review and new model acceptance. Historical rejected texts cannot be audited verbatim. Complexity UNKNOWN. No claim of stable live usefulness until new authorized series.

## 17. Next step

**Live-серия остановлена после B FAIL.** Дальше нужна отдельно поставленная offline-задача по оставшимся отказам; новых генераций в остановленной серии не выполнять. Новый live возможен только после отдельного разрешения и нового ledger. No Site SEO Strategy, TDS ingestion, Competitive Benchmark, CMS publication, new Pages/SeoActions, production crawl/export/sync or mass AI analysis.


Verification artifacts: `test-results/sprint5-1-offline-acceptance.json` (synthetic accepted proposals and full public evidence), `sprint5-1-before.json` / `sprint5-1-after.json` (fingerprints), `sprint5-1-catalog-before.json` / after.json (audit), `sprint4-page360-sprint5-1-before.json` / after.json (five samples each). Protected rows: Scan 317; ScanPage 2287; JobRun 221; MetrikaPageDaily 26971; WebmasterQueryDaily 97689; BusinessRecord 12511; Import 184; Opportunity 1074; Page 2564; SeoAction 309.

Changed/new implementation: src/lib/seo-review/{contract,evidence,prompt,prompt-v1,schema-v1,quality,validator,url-resolution,service}.ts; src/components/page-seo-review-output.tsx. Tests/tools: tests/seo-quality.test.ts, tests/fixtures/seo-review-catalog.json, scripts/{check-seo-quality,acceptance-seo-quality}.ts, scripts/acceptance-seo-review-ui.tsx. README and this report. Shared provider, Scanner, deterministic modules, schema and ENV unchanged.
