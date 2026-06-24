---
phase: 116-calibration-charge-on-validation
plan: 01
subsystem: payments
tags: [billing, credit-ledger, margin-invariant, calibration, vitest, supabase]

# Dependency graph
requires:
  - phase: 111-billing-config-store
    provides: "BillingConfig type + DEFAULT_BILLING_CONFIG (illustrative tiers the validator inverts)"
  - phase: 112-credit-ledger
    provides: "recordCreditDebit debit math (credits = round(realCost × markup / creditUnitUsd)) that validateMarginInvariant inverts"
  - phase: 110-real-cost-capture
    provides: "ai_cost_events table (real_cost_usd NULLABLE) that aggregateAiCostByOperation reads"
provides:
  - "validateMarginInvariant (pure): per-tier real-cost-of-grant ratio gated at ≤ 0.30; zero-price tiers skipped"
  - "recommendFromAggregate (pure): Σ mean × explicit usage profile, illustrative until prod data"
  - "aggregateAiCostByOperation: service-role read of ai_cost_events excluding NULL real_cost_usd; never throws"
  - "MARGIN_INVARIANT_MAX = 0.30 constant + TierMarginResult/OpCostStat types"
affects: [116-02 charge-on gate (saveBillingConfig), calibration-runbook, billing-panel pass/fail badge]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Purity split: pure validator/recommend carry NO 'server-only' (importable by gate + client badge); only the I/O aggregator guards itself, via a lazy `await import('@/lib/supabase/service')`"
    - "Inverted debit math: realCostOfGrant = grant × creditUnitUsd / markup mirrors recordCreditDebit exactly"
    - "Null-vs-0 discipline preserved in aggregation: .not('real_cost_usd','is',null), no `?? 0`"

key-files:
  created:
    - lib/billing/calibration.ts
    - tests/unit/billing/calibration.test.ts
  modified: []

key-decisions:
  - "The illustrative DEFAULT_BILLING_CONFIG FAILS the invariant by design (pro 0.69, business 0.67 > 0.30); the test ASSERTS the FAIL — defaults were NOT edited to make a test green (git diff of billing-config.ts is empty)"
  - "Validator ratio field = realCostOfGrant / subscriptionPriceUsd (0.69 for pro), not the research's '2.30' over-cap multiple; either representation locks the FAIL"
  - "Zero-price tiers (free/trial) skipped:true, pass:true — excluded from the gate (a free grant is a CAC cost, not a margin promise); overall pass is the AND over priced tiers only"
  - "No 'server-only' on calibration.ts; requireServiceClient reached only inside the aggregator via lazy dynamic import"
  - "Dormancy guard kept STRICT: calibration.ts is NOT a getBillingConfig consumer (validates a config passed IN via type-only BillingConfig import); resolved a guard trip by removing an incidental comment token, NOT by allowlisting"

patterns-established:
  - "Pure billing math modules avoid 'server-only' so both the server gate and a client badge can import them; I/O is isolated and self-guarded"

requirements-completed: [CALIB-02]

# Metrics
duration: 5min
completed: 2026-06-24
---

# Phase 116 Plan 01: Calibration Core (Margin-Invariant Validator + Cost Aggregator) Summary

**Pure `validateMarginInvariant` that inverts the credit-ledger debit math to gate each priced tier's real-cost-of-grant at ≤ 30% of price (the illustrative defaults correctly FAIL), plus a NULL-excluding `ai_cost_events` aggregator and a pure usage-profile recommender — zero migration, billing defaults untouched.**

## Performance

- **Duration:** 5 min
- **Started:** 2026-06-24T20:15:09Z
- **Completed:** 2026-06-24T20:19:38Z
- **Tasks:** 3
- **Files modified:** 2 (1 source, 1 test)

## Accomplishments
- `validateMarginInvariant(cfg)` computes `realCostOfGrant = grant × creditUnitUsd / markup` and `ratio = realCostOfGrant / priceUsd` per tier; PASSES iff ratio ≤ 0.30. The CURRENT illustrative defaults correctly FAIL (pro 0.6897, business 0.6734) and the test asserts the FAIL — the trap held.
- Zero-price tiers (free, trial) are `skipped:true` and never drag the overall pass; a calibrated fixture (pro grant 1000 @ $29, business 3000 @ $99) PASSES.
- `aggregateAiCostByOperation` reads `ai_cost_events` via the service role, applies `.not('real_cost_usd','is',null)`, computes mean/median/p90/n per `operation_type`, and returns `[]` on any read failure (never throws). A NULL-only operation_type is excluded entirely.
- `recommendFromAggregate` is pure: `Σ (mean × usageProfile[op])`, an op missing from the profile contributes 0 (no NaN).
- Full billing suite green (24 files / 181 tests); `git diff lib/billing/billing-config.ts` empty; tsc clean for the new file; Phase-111 dormancy guard still strict.

## Task Commits

Each task was committed atomically:

1. **Task 1: failing calibration test (RED)** - `0a410e17` (test)
2. **Task 2: implement lib/billing/calibration.ts (GREEN)** - `edec55d0` (feat)
3. **Task 3: dormancy guard confirmation + comment fix** - `4fe4ddac` (refactor)

**Plan metadata:** _(this docs commit)_

_TDD: Task 1 RED, Task 2 GREEN; no REFACTOR was needed for behaviour — the Task 3 refactor was a comment-only adjustment to keep the dormancy guard green._

## Files Created/Modified
- `lib/billing/calibration.ts` - Pure `validateMarginInvariant` + `recommendFromAggregate` + service-role `aggregateAiCostByOperation`; `MARGIN_INVARIANT_MAX`, `TierMarginResult`, `OpCostStat` exports. No `import 'server-only'`; type-only `BillingConfig` import.
- `tests/unit/billing/calibration.test.ts` - 12 deterministic tests: correct-FAIL on defaults, passing fixture, zero-price skip, aggregator NULL-exclusion + median/p90 + never-throw, pure recommender.

## Decisions Made
- **Ratio field semantics:** the validator's `ratio` is `realCostOfGrant / subscriptionPriceUsd` (pro = 0.6897), not the research worked-table's "2.30" over-cap multiple (= ratio / 0.30). Both representations lock the same FAIL; the direct ratio is the natural field to gate against `MARGIN_INVARIANT_MAX = 0.30`.
- **No allowlist edit for the dormancy guard:** see deviation below — calibration.ts is genuinely not a config consumer, so the strict guard was preserved by removing an incidental comment token rather than weakening the allowlist.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Phase-111 dormancy guard tripped on a comment token in calibration.ts**
- **Found during:** Task 3 (dormancy guard confirmation)
- **Issue:** The plan anticipated the guard would stay GREEN because calibration.ts uses a TYPE-ONLY `BillingConfig` import and never references the `getBillingConfig` symbol. It went RED — but only because a doc-comment in calibration.ts contained the bare word `getBillingConfig` while explaining why the module is NOT a consumer. The guard is a coarse `\bgetBillingConfig\b` source grep that cannot distinguish a comment from a real reference.
- **Fix:** Reworded the comment to drop the bare token (it now says "the billing-config reader SYMBOL"). The module remains a non-consumer, so the correct resolution was removing the incidental token — NOT adding a `CALIBRATION_PATH` allowlist entry (which would falsely imply calibration.ts legitimately consumes `getBillingConfig`). The allowlist stayed strict; the guard still fails on any real consumer.
- **Files modified:** lib/billing/calibration.ts (comment only)
- **Verification:** `grep getBillingConfig lib/billing/calibration.ts` returns nothing; `tests/unit/billing/billing-config.test.ts` 17/17 green; calibration tests still 12/12 green.
- **Committed in:** `4fe4ddac` (Task 3 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** The deviation was a guard-interaction edge case the plan flagged as a possibility ("likely stays green — confirm"). Resolved without weakening the guard and without touching the allowlist. No scope creep; the plan's intent (strict dormancy guard, type-only import) is preserved.

## Issues Encountered
None beyond the dormancy-guard comment-token interaction documented above.

## Known Stubs
`recommendFromAggregate` takes an EXPLICIT, illustrative per-tier usage profile and is documented LOUDLY as a guess until production usage data exists (CALIBRATION-RUNBOOK, a Plan 02 artifact). This is intentional and milestone-locked: Phase 116 ships the calibration MECHANISM, not final numbers — no production cost data exists yet. Not a blocking stub; it produces a finite, deterministic number from its inputs.

## User Setup Required
None - no external service configuration required. No migration, no secrets.

## Next Phase Readiness
- `validateMarginInvariant` is ready for the Plan 02 charge-on gate inside `saveBillingConfig` (the single write path for `enforcementEnabled`). The gate rejects a `false→true` enforcement flip when `pass === false`.
- `aggregateAiCostByOperation` + `recommendFromAggregate` are ready for the Plan 02 ops analysis script + the calibration runbook.
- `enforcementEnabled` stays OFF (no production data) — unchanged this plan.

## Self-Check: PASSED

All claimed files exist (lib/billing/calibration.ts, tests/unit/billing/calibration.test.ts, 116-01-SUMMARY.md) and all task commits exist (0a410e17, edec55d0, 4fe4ddac).

---
*Phase: 116-calibration-charge-on-validation*
*Completed: 2026-06-24*
