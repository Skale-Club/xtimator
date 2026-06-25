---
phase: 134-pdf-text-totals
plan: 01
subsystem: estimate
tags: [deposit, balance-due, pdf, share-view, plain-text, totals, retrocompat]

# Dependency graph
requires:
  - phase: 129-schema-foundation
    provides: "estimates.deposit_type/deposit_value/balance_due columns + GUARD-03 byte-identity lock"
  - phase: 132-deposit-markup
    provides: "server-computed balance_due (DEP-01) — the persisted value this seam reads"
provides:
  - "deriveDepositDisplay() — the single shared read seam for deposit/balance-due across PDF, share view, and plain-text"
  - "deposit_type/deposit_value/balance_due fields on the Estimate TypeScript interface"
affects: [134-02-pdf-totals, 134-03-share-view-totals, 134-04-plain-text-totals]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Shared read seam: one pure helper reads the PERSISTED server row so all renderers agree (GUARD-03 — trust persisted, never recompute)"

key-files:
  created:
    - lib/estimate/deposit-display.ts
    - tests/unit/estimate/deposit-display.test.ts
  modified:
    - lib/queries/estimate.ts

key-decisions:
  - "depositAmount derived as round2(total − balance_due) — the inverse of the engine's persisted balanceDue — NOT recomputed from deposit_value (GUARD-03)"
  - "Retrocompat short-circuit on deposit_type none/null OR null balance_due → showDeposit:false, balanceDue:total (byte-identical legacy renders)"
  - "Used Math.round(x * 100) / 100 inline (matching compute-totals.ts byte-discipline) rather than a round2 import"

patterns-established:
  - "Read seam pattern: renderers consume a pure display helper rather than each re-deriving deposit/balance math"

requirements-completed: [PUI-02]

# Metrics
duration: 6min
completed: 2026-06-25
---

# Phase 134 Plan 01: Shared Deposit/Balance-Due Read Seam Summary

**deriveDepositDisplay() — a pure helper that reads the persisted estimates.balance_due/deposit_type/total and returns { showDeposit, depositAmount, balanceDue } so PDF, share view, and plain-text agree without recomputing.**

## Performance

- **Duration:** ~6 min
- **Started:** 2026-06-25T09:57Z
- **Completed:** 2026-06-25T10:00Z
- **Tasks:** 2
- **Files modified:** 3 (2 created, 1 modified)

## Accomplishments
- Widened the `Estimate` interface with `deposit_type`/`deposit_value`/`balance_due` (type-visibility only; data layers already `select('*')`)
- Created `deriveDepositDisplay()` — the single shared deposit/balance-due read seam for plans 02/03/04
- Locked GUARD-03 (trust persisted balance_due, never recompute) with a dedicated mismatched-balance test
- 5 unit tests green: retrocompat (none + null/legacy) + percent + amount + reads-persisted-not-recompute

## Task Commits

1. **Task 1: Add deposit columns to the Estimate type** - `ba25b7c5` (feat)
2. **Task 2: deriveDepositDisplay() pure helper + unit test** - `da395c7f` (feat)

_Both tasks are TDD; here each landed as a single feat commit (type widening, then helper+test together)._

## Files Created/Modified
- `lib/estimate/deposit-display.ts` - The pure `deriveDepositDisplay()` read seam + `DepositDisplayRow`/`DepositDisplay` interfaces
- `tests/unit/estimate/deposit-display.test.ts` - 5 cases covering retrocompat + active deposit + persisted-not-recompute
- `lib/queries/estimate.ts` - `deposit_type`/`deposit_value`/`balance_due` on the `Estimate` interface
- `tests/unit/utils/estimate-template.test.ts` - Fixture updated to satisfy the widened type (deviation, see below)

## Decisions Made
- depositAmount = `round2(total − balance_due)`, the inverse of the persisted engine `balanceDue` — never re-derived from `deposit_value` (GUARD-03). Test 5 (balance_due 800 against a 30%-implied 700) locks this.
- Retrocompat short-circuit when `deposit_type` is null/'none' OR `balance_due` is null → `{ showDeposit:false, depositAmount:0, balanceDue:total }`.
- Inline `Math.round(x * 100) / 100` (not a round2 import) to match compute-totals.ts byte-discipline.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Updated estimate-template.test fixture for the widened type**
- **Found during:** Task 1 (Add deposit columns to the Estimate type)
- **Issue:** Widening `Estimate` made `deposit_type`/`deposit_value`/`balance_due` required; the `SAMPLE_ESTIMATE: EstimateWithSections` fixture in `tests/unit/utils/estimate-template.test.ts` then failed tsc (TS2739, missing the three new properties)
- **Fix:** Added `deposit_type: 'none', deposit_value: null, balance_due: null` to the fixture (retrocompat no-op values)
- **Files modified:** tests/unit/utils/estimate-template.test.ts
- **Verification:** `npx tsc --noEmit` shows no errors in the touched files
- **Committed in:** ba25b7c5 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Necessary to keep the build green after the type widening. No scope creep. Pre-existing unrelated tsc errors (es2018 regex flags, markup-totals fixture, Entitlements.chatEnabled, step-runner mock) were left untouched per scope boundary.

## Issues Encountered
None beyond the documented deviation.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- The shared seam is ready for plans 134-02 (PDF), 134-03 (share view), and 134-04 (plain-text/WhatsApp/MCP) to consume `deriveDepositDisplay()`.
- No blockers.

## Self-Check: PASSED

All claimed files exist (lib/estimate/deposit-display.ts, tests/unit/estimate/deposit-display.test.ts, lib/queries/estimate.ts) and both commits (ba25b7c5, da395c7f) are present in git history.

---
*Phase: 134-pdf-text-totals*
*Completed: 2026-06-25*
