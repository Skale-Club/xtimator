---
phase: 132-deposit-markup-stripe
plan: 01
subsystem: pricing
tags: [deposit, balance-due, totals, estimate-engine, vitest, guard-03]

# Dependency graph
requires:
  - phase: 129
    provides: dormant estimates.deposit_type / deposit_value / balance_due columns
  - phase: 130
    provides: GUARD-03 pure totals authority (lib/estimate/compute-totals.ts)
provides:
  - computeEstimateTotals returns deposit + balanceDue via the LOCKED sequence (after grandTotal)
  - engine persists estimates.deposit_type / deposit_value / balance_due (no longer dormant default)
  - hand-computed deposit golden (percent / amount / none / negative-edge)
affects: [133-deposit-editor, 134-pdf-deposit, 132-03-stripe-charge-amount]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Deposit math is a server-side, deterministic extension of the single GUARD-03 authority (AI never computes it)"
    - "Pure subtraction at the math layer — no clamp; out-of-range guarding deferred to the Phase-133 editor"

key-files:
  created:
    - tests/unit/estimate/deposit-totals.test.ts
  modified:
    - lib/estimate/compute-totals.ts
    - lib/services/generate-estimate.ts

key-decisions:
  - "deposit/balanceDue use the same Math.round(x*100)/100 form as the other totals (no round2 import) for byte-consistency"
  - "No clamp at the math layer: balanceDue may be negative (documented in case 4); editor guards in Phase 133"
  - "At generation deposit_value persists null + deposit_type 'none' explicitly; balance_due = safeBalanceDue (=grandTotal)"
  - "assertFinitePositive guards persisted balance_due (floors a negative to 0 — never persists a negative)"

patterns-established:
  - "Extend the GUARD-03 totals authority in place; never parallel it"
  - "Byte-identical retrocompat discipline: deposit_type='none' collapses to today's standing goldens"

requirements-completed: [DEP-01]

# Metrics
duration: 4min
completed: 2026-06-25
---

# Phase 132 Plan 01: Deposit math — Wave 1 Summary

**Activated the dormant deposit + balance_due scaffold: computeEstimateTotals now derives deposit (percent/amount/none) and balanceDue = grandTotal − deposit, and the engine persists deposit_type/deposit_value/balance_due — byte-identical retrocompat when deposit_type='none'.**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-06-25T12:25:00Z
- **Completed:** 2026-06-25T12:28:24Z
- **Tasks:** 3
- **Files modified:** 3 (1 created, 2 modified)

## Accomplishments
- `computeEstimateTotals` returns `deposit` + `balanceDue` via the LOCKED sequence computed AFTER `grandTotal`
- `ComputeTotalsOptions` gains `depositType` / `depositValue`; `ComputeTotalsResult` gains `deposit` / `balanceDue`
- Engine persists `estimates.deposit_type` ('none') / `deposit_value` (null) / `balance_due` (= grandTotal) — replacing the dormant Phase-129 default
- 4 hand-computed deposit goldens (275/825, 400/700, 0/1100, 1500/-400); all standing goldens stay byte-identical

## Task Commits

Each task was committed atomically:

1. **Task 1: Deposit golden test (RED)** - `d7c9ce9f` (test)
2. **Task 2: Extend compute-totals with LOCKED deposit sequence (GREEN)** - `01df2826` (feat)
3. **Task 3: Engine persists deposit_type/deposit_value/balance_due** - `3f76dea1` (feat)

_Note: Task 2 (TDD GREEN) needed no separate refactor commit — the minimal implementation passed._

## Files Created/Modified
- `tests/unit/estimate/deposit-totals.test.ts` - 4 hand-computed deposit goldens (percent/amount/none/negative edge)
- `lib/estimate/compute-totals.ts` - deposit + balanceDue in result + options; LOCKED sequence after grandTotal
- `lib/services/generate-estimate.ts` - destructure deposit/balanceDue, guard balanceDue, persist the 3 deposit columns

## Decisions Made
- Used the inline `Math.round(x*100)/100` form (not a round2 import) in compute-totals.ts for byte-consistency with the existing totals
- No clamp at the pure-math layer — balanceDue is a faithful subtraction (case 4 documents the negative edge); persistence still floors via assertFinitePositive
- Persisted `deposit_value: null` + `deposit_type: 'none'` explicitly at generation (no AI/owner deposit input exists yet — that lands in Phase 133)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Avoided an unused-variable strict error for the destructured `deposit`**
- **Found during:** Task 3 (engine persistence)
- **Issue:** The plan destructures `deposit` from the result, but at generation `deposit_value` persists as `null` (no deposit input), so `safeDeposit` would be an unused binding under TypeScript strict / no-unused-vars.
- **Fix:** Destructured `deposit` per the LOCKED contract and `void deposit` with an explanatory comment instead of creating an unused `safeDeposit` constant; persisted `balance_due: safeBalanceDue` as specified.
- **Files modified:** lib/services/generate-estimate.ts
- **Verification:** Full service + estimate suites green (220 passed); no new tsc error on the touched files.
- **Committed in:** `3f76dea1` (Task 3 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Faithful to the LOCKED return contract and persistence intent; only avoids a strict-mode dead binding. No scope creep.

## Issues Encountered
- A pre-existing `tsc` error in `tests/unit/inngest/generate-estimate-job.test.ts(150,66)` (vitest mock typing, `TS2348`) surfaced during typecheck. Confirmed present on the parent commit via `git stash` baseline — out of scope per the SCOPE BOUNDARY rule. Logged to `132-deposit-markup-stripe/deferred-items.md`; not fixed. All Vitest runs pass.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- `deposit` + `balanceDue` are now real server-computed fields ready for: the Phase-133 editor (owner-set deposit input), the Phase-134 PDF, and the Plan 132-03 Stripe charge-amount contract.
- ENG-01 fence stays green (no deposit AI field added); GUARD-03 totals authority unchanged on the flat/per-category paths.

---
*Phase: 132-deposit-markup-stripe*
*Completed: 2026-06-25*

## Self-Check: PASSED
- Files: deposit-totals.test.ts, compute-totals.ts, generate-estimate.ts, 132-01-SUMMARY.md — all FOUND
- Commits: d7c9ce9f, 01df2826, 3f76dea1 — all FOUND
