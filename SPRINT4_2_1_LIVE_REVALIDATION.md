# Sprint 4.2.1 — Live revalidation · 09.10.2026

## Status

**READY WITH FIXES; live revalidation FAIL.** User authorized a separate maximum-three-call series A1 → B1 → A2, without retries, with substantive review after each call and stop at failure. Exactly **1/3** calls used, **0 retries**, **2 unused**. A1 technically accepted one action but failed review for the wrong task target. Series halted; B1/A2 not run, C not called. Sprint 4.2 is not completed PASS. No Sprint 5, TDS or Competitive Benchmark.

## Series isolation and safety

New ledger: `test-results/sprint4-2-1-revalidation-2026-10-09.json`. Previous stopped `sprint4-2-live.json` not reset/reused/modified (SHA-256 verified). New runner `scripts/revalidate-ai-specificity.ts` reserves one request before transport, enforces the three-call total and A1/B1/A2 ordering, calls the existing service with maxProviderCalls=1, and requires every accepted prior action reviewed useful PASS before the next step. Protected source/config hashes must remain unchanged. New ledger now has halt=true, stopReason=REVIEW_FINDING_TARGET_MISMATCH. No replay or generation until success.

The request uses unchanged deepseek-flash / AI_ANALYST_V3 / provider / guard code. The runner captures per-item diagnostic code lists through the existing diagnoseProposal() in memory, then discards raw response text. Artifacts contain accepted cards, sanitized server facts, provenance without raw values, safe counts/timings/token usage and code lists; no rejected text, full prompt, full content, search queries or credentials.

## Actual results

| Scenario | API calls | Generated | Accepted | Rejected | Validation | Review |
| --- | ---: | ---: | ---: | ---: | --- | --- |
| A1 | 1 | 1 | 1 | 0 | SUCCESS | FAIL |
| B1 | 0 | N/A | N/A | N/A | NOT RUN | N/A |
| A2 | 0 | N/A | N/A | N/A | NOT RUN | N/A |
| C | 0 | N/A | N/A | N/A | Not rerun; previous zero-call diagnostic retained | N/A |

A1 item 0: validation reasonCodes=[]; no failed validator conditions. No malformed JSON, schema, context, action-type, area or specificity rejection. Review failure is **REVIEW_FINDING_TARGET_MISMATCH**, an expert-review label, not a production validator reason code. Technical acceptance is not a practically useful scenario PASS.

## Substantive / human-quality review

Reviewer: Codex expert assessment, not a separate human sign-off or another model/API call. Accepted actions: **0 PASS / 0 QUESTIONABLE / 1 FAIL**. Complete six-criterion record: `test-results/sprint4-2-1-revalidation-review-2026-10-09.json`.

Finding A02 concerns SEO meta description. The accepted CHECK instead asks to open contacts on mobile/desktop and inspect visible introductory text below H1, clipping, overlays, accessibility without images/styles and agreement with CMS content. That is an executable layout/body-content inspection, but it does not inspect the meta description field or its appropriateness for the search snippet. The model conflates the declared DESCRIPTION area with visible body description.

- Server facts/period/UNKNOWN preservation: PASS. Saved finding and current Title/H1 remain server-owned; physical absence is not asserted.
- Finding relevance: FAIL. Wrong element for A02.
- Specificity: PASS. Concrete procedure and questions, for a different task.
- B2B relevance: QUESTIONABLE. Generic layout checks do not establish useful A02 work for a professional buyer.
- Unsupported causality: PASS. No CTR/sales causal diagnosis or numerical promise.
- Limitations: PASS. Server states DESCRIPTION UNKNOWN and absence/defect unproven.

Overall FAIL is required even though some criteria pass. Case B RULE_11 usefulness remains untested; no B1 request was made after A1 review failed. Guards were not tightened/loosened and prompt/model were not edited to obtain a better response.

## Latency and tokens

One A1 call, no retry:

| Measurement | Actual |
| --- | ---: |
| End-to-end analysis | 4521 ms |
| Evidence builder | 2192 ms |
| Context builder | 0 ms, rounded |
| DeepSeek adapter | 2210 ms |
| Validator | 117 ms |
| Input tokens | 1030 |
| Output tokens | 256 |

The safe per-item post-response diagnostic is outside the measured service validation interval. One sample is not a reliability or performance distribution. Input/output limits, temperature, thinking mode and model unchanged. No extrapolated monetary price, no further paid judge call.

## Verification and data integrity

Runner typecheck PASS; preflight local diagnostic PASS (24 code-only checks, zero API calls). Existing hotfix acceptance remains 256/256 full tests and 98/98 AI regression; those whole suites were not rerun for this isolated acceptance script. No application runtime code changed in this series.

Post-call source/identity/type/alias/Opportunity/SeoAction hashes PASS against the immutable baseline (`sprint4-2-1-revalidation-integrity.json/log`). Protected validator/specificity/ActionContext/prompt/provider/service/config/ENV and previous halted ledger hashes PASS (`sprint4-2-1-revalidation-preservation.log`). No production scan/sync/export, recalculation or deterministic finding changes.

## Limitations and next step

The specificity hotfix removed the previous lexical/length false-rejection class, and this A1 passed that gate. It does not prove semantic alignment with the underlying finding or usefulness of RULE_11 checks. This real response demonstrates why substantive review cannot be replaced by a valid area enum or concrete verbs/objects.

Stop this series with two calls unused. Any future work to improve grounding of the task target needs a separate implementation request, followed by local checks and a newly agreed live series. Do not silently add meta-specific keyword requirements, change guards between runs, rewrite this failed result as PASS, clear the ledger, spend remaining calls or proceed to Sprint 5/TDS/Competitive Benchmark.
