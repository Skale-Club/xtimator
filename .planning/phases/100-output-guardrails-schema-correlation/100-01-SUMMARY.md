---
phase: 100-output-guardrails-schema-correlation
plan: 01
subsystem: ai
tags: [zod, schema-validation, estimate-engine, provider-fallback, bounded-retry, typed-failure]

# Dependency graph
requires:
  - phase: 99-unified-error-model
    provides: "FailureReason union (incl. 'invalid_output'), ProvidersUnavailableError brand pattern, callWithFallback provider-fallback wrapper"
  - phase: 100-00
    provides: "Wave-0 RED contracts (schema/output-retry/price-source-tagging/never-throw invalid_output)"
provides:
  - "estimateOutputSchema (zod v4) as the single source of truth for EstimateOutput"
  - "Non-throwing safeParse normalizeOutput returning a discriminated NormalizeResult"
  - "InvalidEstimateOutputError typed marker (invalidOutput brand)"
  - "Bounded schema-retry seam (cap 1) at the provider-fallback boundary, inherited by refine in Phase 101"
  - "All three adapters (openrouter/gemini/anthropic) validate output and throw the typed marker"
  - "generate node maps InvalidEstimateOutputError -> { failure: { reason: 'invalid_output' } } (never throws)"
affects: [101-unified-multimodal-refine, 100-02-price-anchoring-totals, 100-03-correlation-id, 103-eval-harness]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "zod-first single-sourced type: EstimateOutput = z.infer<typeof estimateOutputSchema>"
    - "Discriminated NormalizeResult ({ ok: true, value } | { ok: false, error }) so the parse site never throws"
    - "Typed marker error with a boolean brand (invalidOutput) surviving module-instance boundaries, mirroring ProvidersUnavailableError"
    - "Orthogonal bounded retries: OUTER schema-retry (cap 1) over INNER provider-fallback (once); validation errors bypass provider fallback"

key-files:
  created:
    - lib/ai/schema.ts
  modified:
    - lib/ai/types.ts
    - lib/ai/normalize.ts
    - lib/ai/with-fallback.ts
    - lib/ai/provider-with-fallback.ts
    - lib/ai/providers/openrouter.ts
    - lib/ai/providers/gemini.ts
    - lib/ai/providers/anthropic.ts
    - lib/estimate/graph/nodes/generate.ts
    - tests/unit/services/generate-estimate.test.ts

key-decisions:
  - "Anthropic adapter validated too (not just openrouter/gemini): it shares normalizeOutput and otherwise breaks tsc; consistent GUARD-01 coverage across all adapters"
  - "callWithFallback rethrows InvalidEstimateOutputError immediately so a schema-validation failure never triggers provider fallback (keeps schema-retry re-calling the SAME served provider and avoids masking invalid output)"
  - "EstimateOutput's suggested_client_name is now required-as-(string|null) in the inferred output (transform always yields a value); one consumer test fixture updated to include suggested_client_name: null"

patterns-established:
  - "appendRetryHint(userContent, retryHint?) shared helper so every adapter applies the schema-repair hint identically"
  - "retryHint?: string rides on EstimateInput/RefineEstimateInput so the wrapper triggers a corrective re-call without the adapter knowing about retries"

requirements-completed: [GUARD-01]

# Metrics
duration: 13min
completed: 2026-06-21
---

# Phase 100 Plan 01: GUARD-01 Output Schema Validation + Bounded Retry Summary

**zod `estimateOutputSchema` is now the single source of `EstimateOutput`; `normalizeOutput` is a non-throwing safeParse, every adapter throws a typed `InvalidEstimateOutputError` on invalid output, the provider-fallback wrapper retries exactly once with a schema-repair hint, and the generate node maps a second failure to `{ failure: { reason: 'invalid_output' } }` without ever throwing.**

## Performance

- **Duration:** ~13 min
- **Started:** 2026-06-21T15:22:13Z
- **Completed:** 2026-06-21T15:34:57Z
- **Tasks:** 3
- **Files modified:** 9 (1 created, 8 modified)

## Accomplishments
- `lib/ai/schema.ts` defines `estimateOutputSchema` (zod v4) mirroring `EstimateOutput`, with the D-15 `price_source` preprocess (non-`price_book` → `ai_estimate`) and the `suggested_client_name` trim/empty→null transform; `EstimateOutput = z.infer<...>` re-exported from `types.ts` so the validator and type can never drift.
- `normalizeOutput` migrated to a non-throwing `safeParse` returning a discriminated `NormalizeResult`.
- `InvalidEstimateOutputError` (invalidOutput brand) added; all three adapters consume `NormalizeResult` and throw it on `!ok`, appending an optional `retryHint` to user content.
- `withSchemaRetry` seam (cap 1) wraps both generate + refine at the provider-fallback boundary; valid-first-time = exactly one served-provider call; first invalid → one corrective re-call; second invalid propagates. Refine inherits the seam for Phase 101.
- Generate node maps the marker to the typed `'invalid_output'` reason, preserving ENGINE-04 never-throw.

## Task Commits

Each task committed atomically:

1. **Task 1: estimateOutputSchema + safeParse normalize + single-sourced EstimateOutput** - `d41d4bd` (feat)
2. **Task 2: InvalidEstimateOutputError brand + adapters validate + retry-once seam** - `53840ea` (feat)
3. **Task 3: map InvalidEstimateOutputError → invalid_output in generate node** - `891f79c` (feat)

_TDD note: Tasks 1 and 2 were TDD tasks whose Wave-0 RED tests were already authored in Plan 100-00; this plan supplied the source to turn them GREEN, so each landed as a single feat commit rather than separate test→feat commits._

## Files Created/Modified
- `lib/ai/schema.ts` (created) - `estimateOutputSchema`, `EstimateOutput = z.infer<...>`; D-15 preprocess + client-name transform live here.
- `lib/ai/types.ts` - re-export `EstimateOutput` from `./schema` (local import for `RefineEstimateInput`); add `retryHint?: string` to `EstimateInput` + `RefineEstimateInput`.
- `lib/ai/normalize.ts` - safeParse `normalizeOutput` returning `NormalizeResult`; `appendRetryHint` helper.
- `lib/ai/with-fallback.ts` - `InvalidEstimateOutputError`; `callWithFallback` rethrows it immediately (no fallback on validation errors).
- `lib/ai/provider-with-fallback.ts` - `withSchemaRetry` OUTER seam over the INNER fallback for generate + refine.
- `lib/ai/providers/openrouter.ts` - consume `NormalizeResult`, throw marker, append `retryHint`.
- `lib/ai/providers/gemini.ts` - same.
- `lib/ai/providers/anthropic.ts` - same (deviation: in-scope to keep tsc clean).
- `lib/estimate/graph/nodes/generate.ts` - brand-check branch mapping the marker to `'invalid_output'`.
- `tests/unit/services/generate-estimate.test.ts` - fixture updated for the tightened `suggested_client_name` (consumer adaptation).

## Decisions Made
- **Anthropic adapter included in the validation change.** The plan named only openrouter + gemini, but `anthropic.ts` also funnels through `normalizeOutput`; the return-shape change broke its `tsc` typing. Validating it (throw on `!ok` + append `retryHint`) is the correct, consistent fix and keeps GUARD-01 coverage uniform across all adapters.
- **`callWithFallback` rethrows `InvalidEstimateOutputError` immediately.** Required by the output-retry contract: the test's unmocked Gemini fallback would otherwise resolve `undefined` and mask the invalid output. A schema-validation failure is not a provider-availability failure, so it must bypass provider fallback and reach the OUTER `withSchemaRetry`, which re-calls the SAME served provider once.
- **`suggested_client_name` tightened to required-`(string | null)`** in the inferred `EstimateOutput` (the transform always produces a value). One consumer test fixture was updated to include `suggested_client_name: null`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Validated the Anthropic adapter too**
- **Found during:** Task 2 (adapter validation wiring)
- **Issue:** `lib/ai/providers/anthropic.ts` also returns `normalizeOutput(raw)`; after the return-shape change it failed `tsc` (NormalizeResult not assignable to EstimateOutput).
- **Fix:** Imported `InvalidEstimateOutputError` + `appendRetryHint`; consume `NormalizeResult` and throw on `!ok` in both generate + refine; append `retryHint` to user content. Mirrors openrouter/gemini.
- **Files modified:** lib/ai/providers/anthropic.ts
- **Verification:** `npx tsc --noEmit` clean of all 100-01-introduced errors; output-retry/schema suites GREEN.
- **Committed in:** 53840ea (Task 2 commit)

**2. [Rule 3 - Blocking] callWithFallback must rethrow InvalidEstimateOutputError before fallback**
- **Found during:** Task 2 (retry-once seam)
- **Issue:** The shared `callWithFallback` caught all errors and tried the fallback provider; the GUARD-01 marker would trigger provider fallback (masking invalid output) instead of the schema-retry, breaking the "retry once then succeed = exactly two primary calls" contract.
- **Fix:** Added a brand-check at the top of `callWithFallback`'s catch to rethrow `InvalidEstimateOutputError`/`invalidOutput` markers immediately so the OUTER `withSchemaRetry` handles them.
- **Files modified:** lib/ai/with-fallback.ts
- **Verification:** output-retry.test.ts GREEN (valid=1 call, retry=2 calls, second-invalid propagates).
- **Committed in:** 53840ea (Task 2 commit)

**3. [Rule 1 - Bug] Updated a consumer test fixture for the tightened EstimateOutput**
- **Found during:** Task 2 (single-sourced type compile)
- **Issue:** `EstimateOutput` now requires `suggested_client_name` (transform output is `string | null`, always present); `tests/unit/services/generate-estimate.test.ts` fixture omitted it → `tsc` error.
- **Fix:** Added `suggested_client_name: null` to the `DEFAULT_AI_OUTPUT` fixture (consumer adaptation; not a 100-02/100-03-owned source file).
- **Files modified:** tests/unit/services/generate-estimate.test.ts
- **Verification:** `tsc` clean; services suite collects without the prior TS2741.
- **Committed in:** 53840ea (Task 2 commit)

---

**Total deviations:** 3 auto-fixed (3 blocking; #3 also a type-contract bug fix)
**Impact on plan:** All three are correctness/compile prerequisites of the single-sourced schema + retry seam. No scope creep — no new features, only the wiring the GUARD-01 contract requires.

## Issues Encountered
- The Task 1 (normalize return-shape) and Task 2 (adapter consumption) changes are `tsc`-coupled: committing Task 1 alone leaves the adapters temporarily non-compiling. Resolved by verifying Task 1 via its targeted tests (which do not need `tsc`) and gating `tsc` after Task 2, where all 100-01-introduced type errors are resolved together.

## Deferred / Out-of-Scope Failures (NOT regressions)
The broader `tests/unit/ai tests/unit/estimate` run shows these still-RED files, all authored as Wave-0 RED by commit `ebe169c (100-00)` for sibling plans — untouched by this plan:
- `tests/unit/ai/price-anchoring.test.ts` — GUARD-02 (Plan 100-02)
- `tests/unit/estimate/totals-authority.test.ts` — GUARD-03 (Plan 100-02)
- `tests/unit/estimate/observability.test.ts` (OBS-03 + GUARD-04 correlationId cases) — GUARD-04 (Plan 100-03)

Remaining pre-existing `tsc` errors are likewise out of scope: the two 100-02 RED modules above, the `schema.test.ts` `z.ZodTypeAny` `result.data` unknowns (test-local typing), `observability.test.ts` es2018 regex-flag, and unrelated `generate-estimate-job.test.ts` / `account-emails.test.ts` / `xphere-client.test.ts`. The xphere files were left untouched per execution mode.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- GUARD-01 complete: malformed AI output fails zod validation, gets exactly one bounded repair attempt, and a still-invalid result surfaces a typed `invalid_output` failure (no persistence, no 500).
- The schema-retry seam lives on the shared provider-fallback boundary, so Phase 101's refine inherits it unchanged.
- Plans 100-02 (GUARD-02/03 price anchoring + totals authority) and 100-03 (GUARD-04 correlation id) remain; their Wave-0 RED contracts are still red by design.

## Self-Check: PASSED

- All created/modified key files exist on disk (schema.ts, normalize.ts, with-fallback.ts, provider-with-fallback.ts, generate.ts verified).
- All three task commits exist in history: `d41d4bd`, `53840ea`, `891f79c`.
- Contract greps confirmed: `estimateOutputSchema`, `safeParse`, `InvalidEstimateOutputError`, `invalid_output` present in their respective files.
- Targeted GUARD-01 tests GREEN: schema (16), output-retry (3), price-source-tagging (3), never-throw incl. invalid_output (6).

---
*Phase: 100-output-guardrails-schema-correlation*
*Completed: 2026-06-21*
