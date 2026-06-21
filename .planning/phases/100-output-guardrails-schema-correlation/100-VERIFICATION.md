---
phase: 100-output-guardrails-schema-correlation
verified: 2026-06-21T12:05:00Z
status: passed
score: 17/17 must-haves verified
notes:
  - "Phase goal fully achieved in SOURCE: GUARD-01..04 land on the generate path, all tsc-clean."
  - "6 TS18046 nits remain in the NEW test file tests/unit/ai/schema.test.ts (result.data narrowing in `result.success && result.data` short-circuit form). Runtime green (120/120). Non-blocking — type-narrowing ergonomics in a test, not a behavioral defect. Tracked, not a goal gap."
  - "observability.test.ts /s-flag TS1501 errors are PRE-EXISTING (present since phase-97 commit 61139e5; tsconfig target ES2017). Not introduced by phase 100."
  - "All other tsc errors (generate-estimate-job, account-emails, xphere-client) pre-date this phase and are out of scope per deferred-items.md."
human_verification:
  - test: "Trigger a real generation run, then pull the same run id across pipeline_events, the Langfuse trace, and (on an induced failure) the Sentry event."
    expected: "One correlationId (=attemptId) joins all three systems end-to-end."
    why_human: "Requires live Langfuse v5 + Sentry + a real Inngest run; cannot be verified by static analysis."
  - test: "Feed the model a deliberately malformed/hallucinated output in a real run and confirm no garbage is persisted (failure surfaces as invalid_output, never a 500)."
    expected: "Exactly one bounded retry, then a clean invalid_output failure; estimates table untouched."
    why_human: "Requires exercising the live provider boundary with a controllable bad response."
---

# Phase 100: Output Guardrails, Schema & Correlation — Verification Report

**Phase Goal:** No malformed, hallucinated, or mis-totaled AI output is ever persisted, and any single generation run is traceable end-to-end across pipeline_events, Langfuse and Sentry; guardrails land on the generate path so the Phase-101 refine inherits them.
**Verified:** 2026-06-21T12:05:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| #  | Truth | Status | Evidence |
| -- | ----- | ------ | -------- |
| 1  | Structurally valid output parses; malformed (missing field, negative qty/price, non-finite) fails zod validation | ✓ VERIFIED | `lib/ai/schema.ts:15-47` — `description.min(1)`, `quantity/unit_price.finite().nonnegative()`, required `summary`/`suggested_project_name`/`sections` |
| 2  | First invalid → retry exactly once with repair hint; valid-first-time = 0 extra calls | ✓ VERIFIED | `provider-with-fallback.ts:46-59` `withSchemaRetry` (cap 1) over `callWithFallback`; `SCHEMA_REPAIR_HINT` threaded via `retryHint` |
| 3  | Second-invalid surfaces InvalidEstimateOutputError → generate node maps to `{ failure: { reason: 'invalid_output' } }`, never throws | ✓ VERIFIED | `with-fallback.ts:62-68` brand; `generate.ts:53-57` brand-check → `invalid_output`; node resolves, never throws (ENGINE-04) |
| 4  | EstimateOutput single-sourced from schema; types.ts re-exports it | ✓ VERIFIED | `schema.ts:49` `z.infer`; `types.ts:2,30` `import/export type { EstimateOutput } from './schema'` |
| 5  | normalizeOutput is safeParse discriminated NormalizeResult; D-15 price_source coercion preserved | ✓ VERIFIED | `normalize.ts:14-22` `{ ok, value } | { ok, error }`; D-15 preprocess lives in `schema.ts:22-25` |
| 6  | Matched line item → unit_price overridden by book value + price_source='price_book' | ✓ VERIFIED | `price-anchoring.ts:88-95` anchor branch, `anchoredCount++` |
| 7  | ai_estimate > 1_000_000 clamped to ceiling; zero kept; counts recorded | ✓ VERIFIED | `price-anchoring.ts:28` CEILING; `:97-101` clamp; `:103` zero/in-bounds kept |
| 8  | Anchor precedes clamp; tenant-scoped (reads only passed priceBook); malformed row skipped | ✓ VERIFIED | `price-anchoring.ts:87` anchor-first; `:63-72` guarded try/catch skip; helper takes only `priceBook` arg |
| 9  | Server subtotal/tax/grandTotal authoritative, asserted finite & >=0, invariants within epsilon | ✓ VERIFIED | `totals.ts:22-34` `round2`/`assertFinitePositive`; `generate-estimate.ts:305-313` `safe*` + epsilon invariant |
| 10 | totals_discrepancy computed (server vs pre-anchor AI grand); AI total never persisted | ✓ VERIFIED | `generate-estimate.ts:258-271` pre-anchor snapshot; `:326-338` `computeTotalsDiscrepancy`; persists only `safeGrandTotal` (`:382`) |
| 11 | Totals math NOT rewritten — only wrapped/asserted; safeGrandTotal is sole persisted total | ✓ VERIFIED | `generate-estimate.ts:295-300` original math intact; `:305-307` wrappers; `:382,:443` only `safeGrandTotal` written |
| 12 | Anchoring/clamping/totals assertions non-fatal & companyId-scoped | ✓ VERIFIED | helper pure/non-throwing; caller passes `priceBookItems.map(...)` (already companyId+currency scoped); discrepancy in best-effort try/catch |
| 13 | attemptId promoted to THE correlation id across all sinks | ✓ VERIFIED | `inngest/.../generate-estimate.ts:86` attemptId; `:149` `correlationId: attemptId`; pipeline_events already carry attemptId |
| 14 | graph.invoke config carries correlationId + langfuseSessionId/langfuseUserId (closes OBS-03) | ✓ VERIFIED | `inngest/.../generate-estimate.ts:146-150` metadata block |
| 15 | asResponse tags Sentry scope with correlation_id from XtimatorError.meta | ✓ VERIFIED | `errors/index.ts:97-98` `scope.setTag('correlation_id', ...)`; `failure.ts:60-68` threads correlationId into meta |
| 16 | All correlation/observability additions best-effort/never-throw | ✓ VERIFIED | metadata object inert; Sentry tag guarded by `if (err.meta?.correlationId)`; discrepancy emission in try/catch |
| 17 | Refine inherits the schema-retry seam (Phase-101 ready) | ✓ VERIFIED | `provider-with-fallback.ts:86-98` `refineEstimate` wrapped in same `withSchemaRetry`; all 3 adapters validate refine output |

**Score:** 17/17 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `lib/ai/schema.ts` | estimateOutputSchema + EstimateOutput=z.infer | ✓ VERIFIED | exists, 50 lines, single source, re-exported |
| `lib/ai/normalize.ts` | safeParse NormalizeResult + appendRetryHint | ✓ VERIFIED | discriminated union, never throws |
| `lib/ai/with-fallback.ts` | InvalidEstimateOutputError brand | ✓ VERIFIED | `invalidOutput=true`; callWithFallback rethrows it (no fallback masking) |
| `lib/ai/provider-with-fallback.ts` | withSchemaRetry outer over fallback inner | ✓ VERIFIED | cap=1; ProvidersUnavailableError rethrown without schema-retry |
| `lib/estimate/graph/nodes/generate.ts` | InvalidEstimateOutputError → invalid_output, never throws | ✓ VERIFIED | brand-check duo; resolves with `{ failure: { reason } }` |
| `lib/ai/price-anchoring.ts` | anchorAndClampSections + CEILING 1_000_000 | ✓ VERIFIED | anchor/clamp/zero-keep/precedence/tenant-scope all present |
| `lib/estimate/totals.ts` | round2 + assertFinitePositive + computeTotalsDiscrepancy | ✓ VERIFIED | non-finite/negative→0; delta_pct null on aiGrand 0 |
| `lib/services/generate-estimate.ts` | anchor-before-totals + discrepancy + safeGrandTotal sole total | ✓ VERIFIED | math not rewritten; AI total never persisted |
| `lib/inngest/functions/generate-estimate.ts` | correlationId=attemptId + langfuse tokens | ✓ VERIFIED | OBS-03 closed |
| `lib/estimate/failure.ts` | correlationId into XtimatorError.meta | ✓ VERIFIED | optional 3rd arg, backward compatible |
| `lib/errors/index.ts` | Sentry correlation_id tag | ✓ VERIFIED | guarded best-effort |

### Key Link Verification

| From | To | Via | Status |
| ---- | -- | --- | ------ |
| provider-with-fallback.ts | normalize/with-fallback | withSchemaRetry + InvalidEstimateOutputError | ✓ WIRED |
| openrouter/gemini/anthropic adapters | normalize | `if (!r.ok) throw InvalidEstimateOutputError` | ✓ WIRED (all 3) |
| generate.ts | failure.ts | map InvalidEstimateOutputError → 'invalid_output' | ✓ WIRED |
| generate-estimate.ts | price-anchoring.ts | anchorAndClampSections before calculatedSections | ✓ WIRED |
| generate-estimate.ts | totals.ts | computeTotalsDiscrepancy + assertFinitePositive | ✓ WIRED |
| inngest/generate-estimate.ts | Langfuse trace | config metadata.correlationId/langfuseSessionId/langfuseUserId | ✓ WIRED |
| errors/index.ts | Sentry scope | setTag('correlation_id', err.meta.correlationId) | ✓ WIRED |

### Data-Flow Trace (Level 4)

| Artifact | Data | Source | Real Data | Status |
| -------- | ---- | ------ | --------- | ------ |
| generate-estimate.ts persisted items | calculatedSections | guardedSections (anchored) → estimate_items insert | ✓ anchored unit_price + price_source persist (`:418-428`) | ✓ FLOWING |
| estimates.total | safeGrandTotal | server recalculation only | ✓ AI total excluded | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| GUARD-01/02/03 + OBS-03 contracts | `npx vitest run tests/unit/ai tests/unit/estimate` | 23 files, 120/120 tests passed | ✓ PASS |
| Source type safety | `npx tsc --noEmit` (phase source files) | 0 errors in any `lib/**` phase file | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Status | Evidence |
| ----------- | ----------- | ------ | -------- |
| GUARD-01 | 100-00, 100-01 | ✓ SATISFIED | schema + bounded retry + invalid_output mapping; REQUIREMENTS.md `[x]`, table Complete |
| GUARD-02 | 100-00, 100-02 | ✓ SATISFIED | price-book anchor + ceiling clamp; REQUIREMENTS.md `[x]`, table Complete |
| GUARD-03 | 100-00, 100-02 | ✓ SATISFIED | server-authoritative totals + discrepancy; REQUIREMENTS.md `[x]`, table Complete |
| GUARD-04 | 100-00, 100-03 | ✓ SATISFIED | correlationId=attemptId across Langfuse/Sentry/pipeline_events; REQUIREMENTS.md `[x]`, table Complete |

No orphaned requirements: all four GUARD IDs appear in plan frontmatter and in REQUIREMENTS.md traceability.

### Anti-Patterns Found

| File | Pattern | Severity | Impact |
| ---- | ------- | -------- | ------ |
| (none in phase source) | TODO/FIXME/placeholder/empty-return scan | — | No anti-patterns in any phase `lib/**` file |
| tests/unit/ai/schema.test.ts | TS18046 `result.data` is unknown (x6) — `result.success && result.data` short-circuit narrowing | ℹ️ Info | NEW phase test file; runtime green (120/120). Type-narrowing ergonomics, not behavior. Tracked, non-blocking. |
| tests/unit/estimate/observability.test.ts | TS1501 `/s` regex flag needs es2018 (x3) | ℹ️ Info | PRE-EXISTING since phase-97 commit 61139e5 (tsconfig target ES2017). Not a phase-100 regression. |

### Type-Safety Assessment (requested)

`npx tsc --noEmit` reports 0 errors in every phase SOURCE file (`lib/ai/*`, `lib/estimate/*`, `lib/services/generate-estimate.ts`, `lib/inngest/functions/generate-estimate.ts`, `lib/errors/index.ts`). Executors' claim that source is tsc-clean is confirmed.

Remaining tsc errors, classified by git history:
- **PRE-EXISTING (not phase 100):** `generate-estimate-job.test.ts` (phase 95-01), `account-emails.test.ts`, `xphere-client.test.ts`, and `observability.test.ts` `/s`-flag errors (present since phase-97 commit 61139e5). None are phase-100 regressions.
- **Phase-100-new (test only):** `schema.test.ts` 6× TS18046 `result.data` narrowing nits. These are in a NEW test file but are type-assertion ergonomics, not source defects or behavioral bugs — vitest is 120/120 green. No source regression. Recorded as a tracked non-blocking nit, not a goal gap.

### Human Verification Required

1. **End-to-end correlation** — Trigger a real run; confirm one correlationId (=attemptId) joins pipeline_events, the Langfuse trace, and (on induced failure) the Sentry event. Requires live Langfuse v5 + Sentry + Inngest.
2. **Malformed-output persistence guard** — Force a hallucinated/malformed model output in a live run; confirm exactly one bounded retry then a clean `invalid_output` failure with nothing persisted and no 500. Requires exercising the live provider boundary.

### Gaps Summary

No goal gaps. All 17 observable truths verified against the actual source, all 11 artifacts pass levels 1–4 (exist, substantive, wired, data-flowing), all 7 key links wired, all 4 requirements satisfied, and the targeted suite is 120/120 green. GUARD-01..04 land on the generate path and the schema-retry seam is shared so Phase-101 refine inherits it. The only outstanding items are: (a) 6 type-narrowing nits in the NEW `schema.test.ts` (runtime-green, non-blocking) and (b) two inherently live behaviors routed to human verification.

---

_Verified: 2026-06-21T12:05:00Z_
_Verifier: Claude (gsd-verifier)_
