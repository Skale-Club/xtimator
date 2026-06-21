---
phase: 100-output-guardrails-schema-correlation
plan: 02
subsystem: api
tags: [price-anchoring, totals, guardrails, estimate-engine, zod-adjacent, observability]

# Dependency graph
requires:
  - phase: 100-00
    provides: Wave-0 RED contracts (price-anchoring.test.ts, totals-authority.test.ts)
  - phase: 100-01
    provides: zod EstimateOutput schema + bounded retry (schema-valid AI output reaching the service)
provides:
  - "lib/ai/price-anchoring.ts — anchorAndClampSections + normalizeNameForMatch + UNIT_PRICE_CEILING (price-book authority + clamp)"
  - "lib/estimate/totals.ts — round2 + assertFinitePositive + computeTotalsDiscrepancy + TOTALS_EPSILON (server totals authority + discrepancy)"
  - "generate-estimate.ts wiring: anchor/clamp before the recalculation, finite-positive guards on persisted totals, best-effort totals_discrepancy signal"
affects: [phase-101-refine-through-graph, phase-103-eval-harness, generate-estimate]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pure pre-persist guardrail helpers unit-tested in isolation, wired into the service around (not over) the existing math"
    - "Server numbers are authoritative; AI arithmetic recorded as a discrepancy signal, never persisted"

key-files:
  created:
    - lib/ai/price-anchoring.ts
    - lib/estimate/totals.ts
  modified:
    - lib/services/generate-estimate.ts

key-decisions:
  - "round2 itself applies the finite/>=0 coercion (NaN/negative -> 0) to satisfy the test contract; assertFinitePositive kept as the documented sibling guard for already-rounded persisted totals"
  - "computeTotalsDiscrepancy preserves a SIGNED delta/delta_pct (round2 alone would zero a negative server<AI delta) so a server-below-AI divergence is still observable"
  - "Discrepancy sink = structured console.info('[totals_discrepancy]', ...) inside try/catch; pipeline_events has no free-form metadata column, so Plan 100-03's Langfuse trace metadata is left as the documented seam"

patterns-established:
  - "Anchor-before-clamp ordering: a price-book match wins over the ceiling clamp"
  - "Tenant scope at the pure-function boundary: the helper consults ONLY the passed (companyId-scoped) price-book array"

requirements-completed: [GUARD-02, GUARD-03]

# Metrics
duration: 5min
completed: 2026-06-21
---

# Phase 100 Plan 02: Price Anchoring + Totals Authority Summary

**Server-side price-book anchoring + $1M unit-price clamp on AI output, plus formalized authoritative totals with finite/>=0 guards and a best-effort server-vs-AI totals_discrepancy signal — the AI's arithmetic is never persisted.**

## Performance

- **Duration:** 5 min
- **Started:** 2026-06-21T15:49:04Z
- **Completed:** 2026-06-21T15:54:35Z
- **Tasks:** 3
- **Files modified:** 3 (2 created, 1 modified)

## Accomplishments
- `anchorAndClampSections` overrides a matched item's `unit_price` with the price-book value and sets `price_source='price_book'`; unmatched `ai_estimate` prices above `UNIT_PRICE_CEILING` (1,000,000) clamp to the ceiling; `0` is kept; anchor takes precedence over clamp.
- `lib/estimate/totals.ts` formalizes the existing math: `round2` (NaN/negative -> 0), `assertFinitePositive`, `computeTotalsDiscrepancy`, `TOTALS_EPSILON`.
- `generate-estimate.ts` snapshots the pre-anchor AI-implied subtotal, anchors/clamps the AI sections BEFORE the recalculation (math untouched), guards persisted subtotal/tax/total via `assertFinitePositive`, logs the grand==subtotal+tax invariant, and emits a best-effort `totals_discrepancy`.
- Wave-0 RED suites `price-anchoring.test.ts` + `totals-authority.test.ts` are GREEN; full targeted run `tests/unit/ai tests/unit/estimate` = 120/120, 0 failures, no regressions.

## Task Commits

1. **Task 1: Pure helpers — price-anchoring.ts + totals.ts** - `271ceeb` (feat)
2. **Task 2: GUARD-02 — wire anchor/clamp before totals math** - `e12f017` (feat)
3. **Task 3: GUARD-03 — totals assertions + discrepancy signal** - `8a8a802` (feat)

## Files Created/Modified
- `lib/ai/price-anchoring.ts` - Pure anchor/clamp helper + `normalizeNameForMatch` + `UNIT_PRICE_CEILING`; tenant-safe (reads only the passed book), non-fatal (malformed rows skipped).
- `lib/estimate/totals.ts` - `round2` / `assertFinitePositive` / `computeTotalsDiscrepancy` / `TOTALS_EPSILON`; pure, never-throw.
- `lib/services/generate-estimate.ts` - Pre-anchor subtotal snapshot; `anchorAndClampSections` feeding `guardedSections` into the unchanged `calculatedSections` math; finite-positive guards on persisted totals; log-only invariant; best-effort `totals_discrepancy`.

## Decisions Made
- **`round2` applies the finite/>=0 guard itself.** The totals-authority test asserts `round2(NaN)===0` and `round2(-5)===0`, so the coercion lives in `round2` (the test contract is authoritative over the plan's prose, which described a bare `Math.round`). `assertFinitePositive` is retained as the documented sibling for guarding already-rounded persisted totals.
- **Signed discrepancy.** Because `round2` zeros negatives, `delta`/`delta_pct` are computed on the absolute value and the sign is reapplied, so a server-below-AI divergence stays observable rather than collapsing to 0.
- **Discrepancy sink.** `pipeline_events` has no free-form metadata column, so the signal is emitted via structured `console.info('[totals_discrepancy]', ...)` inside try/catch; Plan 100-03's Langfuse trace metadata is the documented seam for end-to-end correlation.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `round2` must coerce NaN/negative to 0 (test-contract divergence from plan prose)**
- **Found during:** Task 1 (pure helpers)
- **Issue:** Plan prose described `round2(x) = Math.round(x*100)/100` with a separate `assertFinitePositive`, but `totals-authority.test.ts` asserts `round2(NaN)===0` and `round2(-5)===0`. A bare `Math.round` returns `NaN` / a negative and fails the suite.
- **Fix:** `round2` now returns `0` for non-finite/negative input before rounding; `assertFinitePositive` kept for the persisted-totals guards.
- **Files modified:** lib/estimate/totals.ts
- **Verification:** `totals-authority.test.ts` GREEN (round2 NaN/negative cases pass).
- **Committed in:** `271ceeb` (Task 1 commit)

**2. [Rule 1 - Bug] Signed delta in `computeTotalsDiscrepancy`**
- **Found during:** Task 1 (pure helpers)
- **Issue:** Plan formula `delta = round2(s - a)` would zero any negative (server < AI) delta because `round2` now floors negatives to 0, silently hiding a real divergence.
- **Fix:** Compute `delta`/`delta_pct` from `Math.abs(...)` and reapply the sign.
- **Files modified:** lib/estimate/totals.ts
- **Verification:** Positive-delta test cases (`delta=25`, `delta_pct=10`) pass; negative divergence preserved by construction.
- **Committed in:** `271ceeb` (Task 1 commit)

---

**Total deviations:** 2 auto-fixed (2 bugs, both test-contract / correctness driven)
**Impact on plan:** Both were required to satisfy the Wave-0 contract and keep the discrepancy signal meaningful. No scope creep — same surface, same exports.

## Issues Encountered
- `npx tsc --noEmit` reports pre-existing errors in unrelated test files (`schema.test.ts`, `observability.test.ts`, `generate-estimate-job.test.ts`, `account-emails.test.ts`, `xphere-client.test.ts`). None are in this plan's three files (all clean). Logged to `deferred-items.md`; not fixed (out of scope; xphere explicitly off-limits per execution mode).

## Known Stubs
None — all three files are real implementations wired into the live generation path.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- GUARD-02 + GUARD-03 complete. Phase 100 GUARD requirements (01/02/03/04) now all landed across plans 100-01/100-02/100-03.
- Plan 100-03's Langfuse trace metadata is the documented seam to attach `totals_discrepancy` for end-to-end correlation; Phase 101's refine will inherit these guardrails by routing through the same post-AI processing path.

---
*Phase: 100-output-guardrails-schema-correlation*
*Completed: 2026-06-21*

## Self-Check: PASSED

- Files: lib/ai/price-anchoring.ts, lib/estimate/totals.ts, lib/services/generate-estimate.ts, 100-02-SUMMARY.md — all FOUND
- Commits: 271ceeb, e12f017, 8a8a802 — all FOUND
