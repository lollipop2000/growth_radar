# Sprint 4.2 — Structured AI Actions · 08.10.2026

Subsequent local hotfix: [Sprint 4.2.1 — Specificity Gate](SPRINT4_2_1_SPECIFICITY_GATE.md), READY FOR LIVE REVALIDATION, zero new API calls. Historical live results below remain unchanged; they are not retroactively PASS.

Subsequent [three-call-budget live revalidation](SPRINT4_2_1_LIVE_REVALIDATION.md) stopped after 1 call: A1 technical SUCCESS / substantive review FAIL. This is a separate ledger; historical counts below are not merged or overwritten.

## Status

**READY WITH FIXES; live acceptance FAIL.** User separately authorized at most four paid calls, no retries, stop on first failed scenario. A1 returned one proposal; it was rejected as GENERIC_ACTION. Series halted after exactly one API call. B1/A2/B2 were not run; Case C was not called again. Practical usefulness, especially RULE_11 in Case B, remains unproven. Local checks PASS; no guards or code changed following rejection. No Sprint 5, TDS ingestion or production scan/sync/export.

## Baseline

Reference: `SPRINT4_1_AI_GROUNDING.md`. V2: 195 tests PASS, eight live calls, zero accepted recommendations (seven shared-envelope failures, one all-rejected). The previous eight-call authorization is exhausted. This sprint has its own maximum four-call series, subject to new authorization and the first-pair quality gate.

## ActionContext builder

`src/lib/ai/action-context.ts` is pure and deterministic. It consumes the existing evidence builder's saved ACTIVE findings; no new findings or metrics are calculated. CTX IDs bind to both finding evidence ID and saved finding ID. Unknown rules, meaningless findings and unsupported contexts yield no allowed task. Validator rederives contexts rather than trusting supplied overrides. Model receives compact contexts and a sanitized subject; it does not receive raw Search queries, metrics, periods, full content or evidence registry.

Real A: contacts / A02 / DESCRIPTION; saved null Description remains UNKNOWN, so CHECK only. Real B: hydraulic HLP 46 / RULE_11 / commercial CHECK, with its saved 09.09–06.10.2026 covered period. C: no meaningful ACTIVE finding, contexts empty.

## Action policy

TITLE/H1/DESCRIPTION CHANGE requires complete, non-truncated present scalar or verified absence. Fullness refers to the saved scalar, not present-day freshness. Null/import gaps never become absence. CONTENT/APPLICATION/SPECIFICATION/PACKAGING/FIRST_SCREEN CHANGE requires FULL verified deficit; positive/partial/excerpt evidence permits CHECK only. INTERNAL_LINKING and STRUCTURED_DATA are conservative CHECK contexts; partial graph and NOT_OBSERVED schema never become established defects.

RULE_11: CHECK CTA visibility, ordering information, packaging information and professional-buyer journey, with no established explanation of zero sales. RULE_16: CHECK conditions, journey, content and observations/matching; no causal diagnosis. Unknown rule IDs do not grant actions. Manual inspection is read-only; no forms, cart changes or checkout execution.

## AI_ANALYST_V3

Active `prompt.ts` is V3. V1/V2 prompt, validator, V2 service and renderer remain separate for regression/reference. No model, temperature, token limit, provider transport, process-local concurrency or normal transport retry policy changed. Acceptance explicitly uses one attempt only. Prompt tells the model to choose allowed actions and provide practical criteria rather than repeat facts or infer defects. TDS can later contribute verified evidence without making the model a factual authority; no TDS integration is added now.

## Output contract

Strict envelope `{proposals: [...]}`, maximum five; zero allowed. Each item: `contextId`, `actionType`, `area`, `proposedAction`, `rationale`, optional `example`, optional `questionsToVerify`. Model-generated summary, facts, limitations, IDs lists, priority, score, confidence and effects are forbidden. CHECK cannot carry an example. Structural item errors reject that item; malformed JSON/global contract errors reject the response.

## Server-owned facts

Server assembles signal title/ID/rule/period/priority/score/confidence, facts with registry evidence IDs, relevant limitations, accepted action and deterministic summary. Covered orders/revenue use the saved finding's coverage, not the partially covered current Commerce panel. Saved Title/H1 and observed technical values are displayed from registry. Partial graph receives an explicit preliminary LOW limitation, without rewriting the saved finding's confidence.

## Validation

Parse → strict envelope → per-item schema → real context/type/area → semantic guards on each model field independently → exact normalized dedup → server assembly. No semantic checks on server-owned facts; no concatenation of unrelated fields. Decisions/counts/reason codes include SUCCESS, PARTIAL_SUCCESS, ALL_REJECTED and VALID_EMPTY. Rejected text is excluded from UI/logs/artifacts. Semantic rejection never triggers a new model call. No repair model/fuzzy similarity.

Guards cover existing content/technical values, unsupported absence, causal/CTR/inventory claims, unknown specifications/order terms, metric reproduction, numerical promises, partial graph, unsafe interactions and injection. Negative caveats such as “не считать отсутствие заказов доказательством дефекта” remain permissible; a neighboring positive diagnosis remains rejected. Free-text safeguards are conservative and do not replace quality review.

## Page360 UX

Existing manual button/loading/error wrapper retained. Cards show server signal and period/facts, CHANGE or CHECK, AI action/rationale, CHANGE-only example or CHECK questions, server limitations and evidence provenance. Partial success shows accepted cards and hidden-item count. ALL_REJECTED does not declare that problems are absent. Empty reasons distinguish NO_FINDINGS/NO_ALLOWED_CONTEXT (no provider) and MODEL_EMPTY (provider called). Initial GET never invokes AI.

## Local tests

Final full suite: **223/223 PASS**, including 28 new structured tests and all 195 legacy tests; zero skipped, 145.580 s. Final build/typecheck, UI fixtures, regressions, secrets, migrations/drift PASS before any paid request. Fake A/B/C, server ownership/immutability, four outcomes, strict envelope, source-bound contexts, known technical normalization, injection, negative caveats (including a neighboring positive diagnosis), item isolation, dedup and retry budget are covered. CHECK cannot smuggle a broken CTA or incorrect packaging as an established defect. Pure React renderer fixtures cover CHANGE/CHECK, partial/all-rejected/empty and rejected-text exclusion.

Real C diagnostic calls the actual server action with external fetch replaced by a rejecting counter: VALID_EMPTY, zero actions, apiCalls=0, external requests=0. Artifact stores diagnostic metadata/context bindings, no full source content or query text.

## Live A/B/C acceptance

User authorized at most four paid calls for the new series. Executed `scripts/acceptance-ai-structured.ts --authorized-four-calls first`: exactly **one** reserved/completed DeepSeek request, zero retries. API returned text; JSON/global schema valid. One generated proposal, zero accepted, one rejected: `GENERIC_ACTION`. A1 is **FAIL / ALL_REJECTED**. The runner persisted `halt=true` and stopped before B1, as required on failure of either first scenario. A2/B2 not run; three remaining calls unused. Previous Case C server diagnostic retained; no Case C API request or rerun. Ledger: `test-results/sprint4-2-live.json`; call log: `sprint4-2-live-first.log`; summary: `sprint4-2-live-metrics.json`.

The rejecting predicate at `src/lib/ai/validator.ts:48` requires a DESCRIPTION-specific expression (`description`, `метаопис`, `мета.?опис`) in proposedAction and at least 25 trimmed characters. GENERIC_ACTION means one of these conditions failed. Context/type/area and earlier structural/semantic guards passed, but the specificity gate did not. Rejected text is deliberately not saved; the ledger does not retain which subcondition failed. Therefore no claim is made that the real text was hallucinated, unsafe or necessarily useless to a human; a safe synonym false rejection cannot be ruled out. This is a concrete diagnostic limitation, not permission to weaken the guard or issue another paid request.

The persistent runner reserves before transport, forbids phase replay and requires reviewed useful PASS on both first scenarios for repeat phase. After this halt, running either phase is blocked. No generation until success, silent repair, replacement model or changed thresholds.

## Human quality review

Accepted live actions **0**. No cards to assess for factual correctness, finding relevance, practical specificity, B2B usefulness, causality or limitations. Human-review PASS/QUESTIONABLE/FAIL are **N/A**, not a vacuous zero-FAIL quality PASS. `sprint4-2-human-review.json` is empty. Scenario A1 failed acceptance; this is not a human FAIL verdict on unavailable rejected text. B1 not executed, so RULE_11 usefulness has no live evaluation. Local synthetic outputs do not establish live quality. Case B remains subject to concrete commercial diagnostics and verifiable questions in any future separately authorized acceptance.

## Performance

Paired warm Page360 baseline: five HTTP 200 GETs plus warmup, median **0.915 s**, mean 0.932 s. Earlier after sample under concurrent local checks: median 1.750 s, outlier 6.459 s; retained as `sprint4-2-page360-during-checks.json`. After checks: median **1.061 s**, mean 1.087 s, range 1.006–1.281 s, five HTTP 200s (`sprint4-page360-sprint4-2-after.json`); +146 ms / 16% prompted caution rather than a claimed PASS.

Requested post-live control: five HTTP 200 GETs plus warmup, median **0.713 s**, mean 0.677 s, range **0.575–0.761 s** (`sprint4-page360-sprint4-2-live-final.json`). Source-hash verification also ran during this small control series; it is not an isolated benchmark. The final measured sample shows no degradation relative to the 0.915 s baseline, but the differing loads and small samples do not establish a sustained speedup or prove regression absent under every load. No Page360 query/render-preparation logic changed; initial AI only calls aiAvailable and renders an idle manual button, not evidence builder/provider. All samples kept, no performance code modified or selective deletion.

A1 end-to-end **3.858 s**: evidence builder **1.840 s**, context builder **1 ms**, provider **1.965 s**, validator **52 ms**. Input tokens **1030**, output tokens **209**. Transport/global schema compliance 1/1, accepted-useful run 0/1, all-rejected run 1/1, no partial or model-empty runs. These are one-call results, not reliability percentages for production. Output limit remains 6000; no tuning following rejection. Previous C diagnostic: total 4.632 s / builder 4.595 s, provider 0, no API cost; not rerun. Prior V2 median 6.166 s included failures and is not a useful-action latency benchmark.

## Data integrity

Before/after and **post-live** hashes match prior immutable baseline: Webmaster/Metrika sources, BusinessRecord, Page identities/types/aliases, Opportunities, SeoActions (`sprint4-2-integrity-live-final.json/log`). No Prisma/schema changes, recalculation, scans, export or sync. Fixed Commerce period 09.09–06.10 remains 14 Growth / 3 Risk; configured summary matches baseline. All 11 migrations up to date, no schema drift. Final production build/typecheck and secrets check PASS. A temporary Prisma DLL EPERM during concurrent checks was resolved by completing tests before rebuilding; no unrelated processes were stopped. App supervisor and Scanner worker are running; no production scan launched.

## Known limitations

Live series failed A1 and halted: usefulness/repeatability not proven; B1/B2 never tested. Rejection reason does not distinguish short text from missing area expression; rejected text unavailable for substantive review, possible false rejection not excluded. Final GET control did not show degradation, but loads/sample size limit certainty. Saved Description UNKNOWN restricts A to checking the actual field. Partial excerpts/graph/schema and unknown kg/Days of Stock remain uncertain. Regex/text guards cannot prove all semantics; review mandatory. Process-local concurrency and manual retry behavior remain unchanged; no history/cache/queue/streaming/bulk. API C is skipped even if Page360 otherwise contains extensive data.

## Next step

Stop: no further paid requests under this halted series, no guard changes and no generation until successful. Report the failure and diagnostic limitation. A future request could authorize focused local diagnosis of the specificity gate, preserving concrete-action requirements and adding safe reason subcodes; that work is not done here. Any new live series needs its own explicit agreement. Do not call Sprint 4.2 complete PASS, spend the remaining three calls, ingest TDS or start Sprint 5.

