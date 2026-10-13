# Sprint 4.2.1 — Specificity Gate Hotfix · 09.10.2026

Subsequent separately agreed [live revalidation](SPRINT4_2_1_LIVE_REVALIDATION.md): one technical acceptance followed by review FAIL (wrong A02 target); stopped after 1/3 calls. Local readiness below describes the pre-live hotfix checks, not a current live PASS.

## Status

**READY FOR LIVE REVALIDATION.** All required local checks PASS. **0 DeepSeek API calls** in this hotfix. Sprint 4.2 live acceptance remains FAIL / READY WITH FIXES; this local fix does not retrospectively accept A1 or prove Case B useful. No Sprint 5, TDS ingestion or Competitive Benchmark.

## Root cause

At the time of Sprint 4.2 live acceptance, `validator.ts` used `!specific[p.area].test(p.proposedAction) || p.proposedAction.trim().length < 25` and returned one `GENERIC_ACTION` code. That duplicated area validation already performed against a saved server ActionContext. Valid paraphrases such as «Сверить анонс в HTML с назначением страницы» could fail only because the DESCRIPTION regex required description/метаописание in the action itself. A concrete short action could fail the arbitrary 25-character threshold, while a long vague phrase was not made actionable merely by its length.

The separate generic CHECK predicate also relied on a narrow text vocabulary. It has been replaced by the same operation/object check rather than another area-word requirement. The real rejected A1 text was not retained; neither the precise failing branch nor human usefulness of that actual proposal can be reconstructed. Fixtures reproduce the false-rejection classes, not the original unavailable response.

## Changes and rationale

- `contextId` is still resolved from rederived server contexts; unknown context → `INVALID_CONTEXT`.
- `actionType` still needs server permission; unauthorized CHANGE → `UNPROVEN_CHANGE`.
- Declared `area` must be in context policy; mismatch → `ACTION_AREA_MISMATCH` (replaces the active V3 `FINDING_AREA` code only; V1/V2 unchanged).
- `specificity.ts` receives only actionType/proposedAction, with no area parameter or area classifier. It checks an explicit inspection/change operation and a concrete object in the same clause, within ten tokens. Common object vocabulary is shared across all areas. CHECK/CHANGE operations are distinguished; negated operations and disconnected sentences cannot qualify.
- Eight characters is a fragment filter, not proof of specificity. «Проверить H1» and «Уточнить заголовок» pass with valid contexts; a much longer «Улучшить SEO страницы…» does not.
- `ACTION_TOO_SHORT` and `ACTION_NOT_ACTIONABLE` are independent. `diagnoseProposal()` returns all applicable condition codes, never text. Production per-item decisions retain the first reason and continue accepting unrelated valid items.
- Existing structural, context, absence, UNKNOWN/NOT_OBSERVED, inventory, CTR, causal, metric, technical-values, existing-content, schema and partial-graph safeguards remain. Description and Title/H1 absence guards additionally recognize the newly accepted synonyms within the already-declared area, preventing a synonym from becoming a safety bypass.
- No prompt/model/provider/config/service/ActionContext policy changes. No automatic repair or extra calls after semantic rejection. No rejected text in returned rejected items or production logs.

## Fixtures

Authored synthetic fixtures, not saved model outputs, in `tests/fixtures/ai-specificity.ts`:

Positive: «Проверить краткое описание», «Сверить анонс в HTML…», «Оценить понятность сниппета…», «Убедиться, что поле в HTML отражает способы связи», nominal «Проверка краткого описания…», CHANGE «Подготовить анонс…», short «Проверить H1» / «Уточнить заголовок», object-before-operation, and commerce procedure/placement/conditions checks without the previous CTA-keyword requirement.

Negative: short/blank fragments, short and long «Улучшить SEO», «Проверить SEO страницы», «Проверить всё внимательно», «Оценить качество», object without operation, negated operation, disconnected operation/object sentences and CHECK containing only a CHANGE operation. Additional policy/safety fixtures cover wrong area, UNKNOWN CHANGE, UNKNOWN/NOT_OBSERVED/KNOWN_PRESENT absence through synonyms, known Title/H1 contradictions, generic actions disguised by good questions/rationale, and partial success with all three new codes.

The fixture matrix contains 23 phrase cases plus a multi-condition diagnostic. `Правка` with unauthorized TITLE under A02 gives all three codes: ACTION_AREA_MISMATCH, ACTION_TOO_SHORT, ACTION_NOT_ACTIONABLE.

## Local diagnostics and privacy

Run `node --conditions=react-server --import=tsx scripts/diagnose-ai-specificity.ts`. Output/artifact `test-results/sprint4-2-1-specificity-diagnostic.json` contains only stable synthetic fixture IDs, PASS and reason codes, plus apiCalls=0. It never records action/rationale/questions, snippets, raw model output or full prompt. Production logging shape remains unchanged. Existing accepted-only UI fixtures still check rejected-text exclusion.

## Verification

Full suite: **256/256 PASS**, zero skipped (33 new hotfix tests). Separate AI regression (V1/V2/V3/hotfix and renderer fixtures): **98/98 PASS**. Initial targeted hotfix/V3 run: 61/61 PASS. Production build/typecheck and security/secrets checks PASS (configured secrets absent from client assets and rendered Page360 responses). All 11 migrations up to date; schema drift check: no difference. Full runner reported an overnight-spanning duration; it is not used as a latency benchmark.

Artifacts: `sprint4-2-1-tests.log`, `sprint4-2-1-ai-regression.log`, `sprint4-2-1-build.log`, `sprint4-2-1-typecheck.log`, `sprint4-2-1-secrets.log`, `sprint4-2-1-migrations.log`, `sprint4-2-1-drift.log` in `test-results`. Build ran after test processes completed to avoid the prior Windows Prisma DLL lock. Only this application's verified supervisor and children were restarted; the app and Scanner worker are running. No production scan launched.

## No API calls and preservation

No acceptance runner, production scan, sync or export was invoked. Offline A/B/C service test uses two in-memory fake responses, C skips provider entirely; an external-fetch trap confirms zero transport attempts. Fake provider invocation counters are not DeepSeek calls. The local diagnostic imports only fixtures and pure validation, not the DeepSeek transport. The previous Sprint 4.2 live ledger remains halted and is not cleared/replayed; its old one call is not a new hotfix call.

SHA-256 comparison **PASS**: prompt, provider, DeepSeek adapter, configuration, ActionContext builder, service, V1/V2 validators and `.env` unchanged. Previous halted live ledger hash unchanged. Before/after database hashing **PASS**: sources, Page identities/types/aliases, Opportunity and SeoAction match the unchanged historical baseline (`sprint4-2-1-integrity-before/after.json/log`, `sprint4-2-1-preservation.log`). No migrations or deterministic rules/scoring/matching changes.

## Limitations and next step

Operation/object checks are conservative language heuristics, not proof of all natural-language meaning or real-world usefulness. The shared object vocabulary is not exhaustive; unusual wording may require focused fixtures. Existing semantic guards and substantive quality review remain necessary. Accepted short actions can still be QUESTIONABLE under live quality review.

Status: READY FOR LIVE REVALIDATION, supported by local checks only. No paid revalidation is authorized or performed in this task. A new explicitly agreed series must preserve the halted old ledger and the stop-on-first-failure policy. Sprint 4.2 cannot be declared completed PASS without new real useful A/B acceptance.
