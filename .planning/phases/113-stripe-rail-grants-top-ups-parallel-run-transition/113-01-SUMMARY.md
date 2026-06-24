---
phase: 113-stripe-rail-grants-top-ups-parallel-run-transition
plan: 01
subsystem: testing
tags: [stripe, billing, credits, vitest, tdd, webhook]

# Dependency graph
requires:
  - phase: 112-credit-ledger-metering
    provides: grantCredits/checkCredits in lib/billing/credit-ledger.ts (the contract these tests mock)
  - phase: 111-billing-config
    provides: getBillingConfig + DEFAULT_BILLING_CONFIG tier grant numbers (mocked in tests)
provides:
  - RED unit-test scaffolding for the invoice.paid monthly grant (TOPUP-01)
  - RED unit-test scaffolding for the checkout.session.completed credit_topup arm (TOPUP-02 webhook side)
  - RED unit-test scaffolding for the create-topup-session route (TOPUP-02 route side)
  - RED unit-test scaffolding for buildOverageAffordance (TOPUP-03)
  - MIG-01 static guard asserting the webhook route stays additive (no count-path gating)
affects: [113-02, 113-03]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Wave-0 RED scaffolding: tests written against the exact Wave-1 contract, committed failing"
    - "Module-not-found-as-RED: importing the not-yet-created route/module is the contract that flips green when Wave-1 lands it"
    - "Static-source guard test: read route.ts via node:fs and assert the credit path is additive (no maxEstimatesPerMonth)"

key-files:
  created:
    - tests/unit/webhooks/stripe-credit-grant.test.ts
    - tests/unit/billing/topup-checkout.test.ts
    - tests/unit/billing/overage-affordance.test.ts
  modified: []

key-decisions:
  - "MIG-01 reuses the existing quota suite (no new file) — verified green before Wave 1; a static additive-guard block lives inside the Task-1 webhook test file"
  - "Top-up credits travel as a STRING in Stripe metadata; the webhook test asserts the grant call parses it back to the NUMBER 5000"
  - "Top-up uses inline price_data (unit_amount/currency), never a pre-created Stripe Price id"

patterns-established:
  - "RED-tolerant guard: an assertion that only passes after the paired Wave-1 plan lands, documenting intent until then"

requirements-completed: []  # Wave-0 RED only — TOPUP-01/02/03 + MIG-01 flip green in 113-02/03, marked complete there

# Metrics
duration: 4min
completed: 2026-06-24
---

# Phase 113 Plan 01: Stripe Rail RED Scaffolding Summary

**Wave-0 TDD RED: three failing unit-test files encoding the exact contract for the invoice.paid grant, the checkout credit_topup arm, the create-topup-session route, and the overage affordance — plus a static MIG-01 guard proving the credit path is additive to the count path.**

## Performance

- **Duration:** 4 min
- **Started:** 2026-06-24T17:27:35Z
- **Completed:** 2026-06-24T17:31:07Z
- **Tasks:** 3
- **Files modified:** 3 created

## Accomplishments
- `stripe-credit-grant.test.ts` — 6 webhook cases (TOPUP-01 invoice.paid grant keyed on event.id, free-tier 0-grant, 23505-redelivery no-op; TOPUP-02 credit_topup grant with STRING→number parse, top-up-before-subscription-guard, subscription-does-not-grant) + a MIG-01 additive-guard block.
- `topup-checkout.test.ts` — 3 route cases asserting the exact mode:'payment' inline-price session shape (unit_amount 6000, currency usd, metadata.type credit_topup, credits STRING '5000', NO pre-created price id), out-of-range packIndex 400, unauthenticated 401.
- `overage-affordance.test.ts` — 3 cases for the pure `buildOverageAffordance` contract (shortfall>0 → {topUpUrl, upgradeUrl}; shortfall===0 → null; enforcement-off path-not-block proof).
- MIG-01 baseline verified GREEN (existing `quota.test.ts` + `quota-price-research.test.ts`, 17/17) both before and after the new RED files — no existing suite broken.

## Task Commits

Each task was committed atomically:

1. **Task 1: RED webhook tests (TOPUP-01/02 + MIG-01 guard)** - `2a9b5425` (test)
2. **Task 2: RED top-up route + overage affordance tests (TOPUP-02/03)** - `fcd5a2b5` (test)
3. **Task 3: MIG-01 regression baseline + additive guard** - no separate commit (its sole artifact, the MIG-01 `describe` block, shipped inside Task 1's file/commit `2a9b5425`; quota baseline verified green, no file change)

**Plan metadata:** (this SUMMARY + STATE/ROADMAP) — final docs commit

## Files Created/Modified
- `tests/unit/webhooks/stripe-credit-grant.test.ts` - RED webhook grant tests (TOPUP-01/02) + MIG-01 additive static guard
- `tests/unit/billing/topup-checkout.test.ts` - RED create-topup-session route test (TOPUP-02 route side)
- `tests/unit/billing/overage-affordance.test.ts` - RED buildOverageAffordance contract test (TOPUP-03)

## Decisions Made
- Followed plan as specified. The MIG-01 guard block was authored inside the Task-1 file (the plan's `<files>` for Task 3 points back at `stripe-credit-grant.test.ts`), so Task 3 produced no separate commit — only the green-baseline verification run.
- Mocked `dispatchXphereSync` in the webhook test (fire-and-forget CRM call) so the grant path never reaches the network; consistent with keeping the RED failures isolated to grant assertions.

## Deviations from Plan
None - plan executed exactly as written.

## Issues Encountered
None. The RED states are intentional and match the plan's success condition:
- `stripe-credit-grant.test.ts` collects cleanly and fails 5 assertions (the grant arm is not yet wired); 2 pass (the subscription-no-grant case and the `not.toContain('maxEstimatesPerMonth')` guard half).
- `topup-checkout.test.ts` and `overage-affordance.test.ts` fail at module resolution (the route/module do not exist yet) — the plan explicitly declares module-not-found the expected Wave-0 RED state for these.

## Known Stubs
None. These are deliberately-failing TDD RED test fixtures (Wave-0), not stubbed production code. They flip GREEN when 113-02 (webhook grant + top-up route) and 113-03 (affordance helper) land the implementations.

## User Setup Required
None - no external service configuration required. (Stripe IDs in tests are placeholders: whsec_test, sub_test, evt_*, cs_top.)

## Next Phase Readiness
- 113-02 implements the webhook grant arm (invoice.paid + checkout credit_topup) and the create-topup-session route — turning the TOPUP-01/02 cases and the MIG-01 grantCredits-guard half green.
- 113-03 implements `lib/billing/overage-affordance.ts` `buildOverageAffordance` — turning the TOPUP-03 cases green.
- No blockers.

## Self-Check: PASSED

All 3 test files + SUMMARY.md exist on disk; both task commits (`2a9b5425`, `fcd5a2b5`) present in git history.

---
*Phase: 113-stripe-rail-grants-top-ups-parallel-run-transition*
*Completed: 2026-06-24*
