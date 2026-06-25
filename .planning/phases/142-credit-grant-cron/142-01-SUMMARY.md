---
phase: 142-credit-grant-cron
plan: 01
subsystem: payments
tags: [billing, credits, stripe, inngest, cron, idempotency]

# Dependency graph
requires:
  - phase: 112-credit-ledger-consumption-metering
    provides: "idempotent, never-throw grantCredits over credit_ledger"
  - phase: 113-stripe-rail-grants-topups
    provides: "invoice.paid monthly grant and checkout top-up webhook arms"
  - phase: 141-annual-pricing-config
    provides: "annual billing config foundation; credits remain monthly regardless of interval"
provides:
  - "monthGrantKey(companyId,date) as the single company-month idempotency key: grant:{companyId}:{YYYY-MM}"
  - "invoice.paid monthly credit grant keyed on monthGrantKey instead of Stripe event.id"
  - "monthlyCreditGrantJob Inngest cron at 05:00 UTC on the 1st of each month"
  - "runMonthlyCreditGrant(svc) grants active paying companies once per company-month via grantCredits"
  - "load-bearing no-double-grant regression proving webhook + cron share one dedup authority"
affects: [143-annual-checkout, 144-interval-aware-seat-billing, 145-pricing-ui-toggle]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Calendar-month credit grants use a shared UTC idempotency key rather than source-specific event ids"
    - "Cron functions expose a pure run* helper plus a thin Inngest wrapper, mirroring cleanup-audio"

key-files:
  created:
    - "lib/inngest/functions/monthly-credit-grant.ts"
    - "tests/unit/billing/month-grant-key.test.ts"
    - "tests/unit/inngest/monthly-credit-grant-job.test.ts"
    - "tests/unit/billing/credit-grant-no-double.test.ts"
  modified:
    - "lib/billing/credit-ledger.ts"
    - "app/api/webhooks/stripe/route.ts"
    - "lib/inngest/functions/index.ts"
    - "app/api/inngest/route.ts"
    - "tests/unit/webhooks/stripe-credit-grant.test.ts"
    - "tests/unit/billing/billing-config.test.ts"

key-decisions:
  - "The company-month key is the single dedup authority shared by invoice.paid and the monthly cron"
  - "Top-up grants stay keyed on Stripe event.id because top-ups are event purchases, not the monthly allowance"
  - "The cron has no interval branching; it grants by active paid tier and subscription presence only"
  - "getBillingConfig is now legitimately consumed by the monthly-credit-grant cron and is allowlisted in BILLCFG-03"

patterns-established:
  - "Use monthGrantKey(companyId,date) for monthly allowance grants only; do not reuse it for one-time top-ups"
  - "Background monthly grant jobs should rely on grantCredits idempotency instead of pre-checking ledger rows"

requirements-completed: [ANN-02]

# Metrics
duration: 18min
completed: 2026-06-25
---

# Phase 142 Plan 01: Monthly Credit Grant Decouple Summary

**Monthly AI credits are now granted once per company-month through one shared UTC idempotency key used by both Stripe invoice.paid and a registered Inngest monthly cron.**

## Performance

- **Duration:** ~18 min
- **Started:** 2026-06-25T18:06:00Z
- **Completed:** 2026-06-25T19:15:00-04:00
- **Tasks:** 3
- **Files modified:** 10 plus this summary

## Accomplishments
- Added exported `monthGrantKey(companyId, date)` in `lib/billing/credit-ledger.ts`, producing `grant:{companyId}:{YYYY-MM}` with UTC month discipline.
- Re-keyed the `invoice.paid` monthly credit grant from Stripe `event.id` to `monthGrantKey(grantCompany.id, new Date())`, while leaving `checkout.session.completed` top-ups keyed on `event.id`.
- Added and registered `monthlyCreditGrantJob` with cron `0 5 1 * *`; its pure `runMonthlyCreditGrant(svc)` selects active paying companies (`tier IN pro/business` and non-null `stripe_subscription_id`) and grants their configured `monthlyCreditGrant`.
- Added the load-bearing regression `credit-grant-no-double.test.ts`, proving webhook-then-cron and cron-then-webhook produce exactly one ledger row in the same month.
- Updated the billing-config consumer guard to allow the new cron as a legitimate runtime `getBillingConfig()` consumer.

## Task Commits

1. **Task 1: Shared monthGrantKey + webhook re-key** - `00c8bc65` (feat)
2. **Task 2: Monthly-credit-grant Inngest cron + registration** - `78981dba` (feat)
3. **Task 3: No-double-grant regression + guard allowance + docs** - final phase commit (test/docs)

## Files Created/Modified
- `lib/billing/credit-ledger.ts` - Added `monthGrantKey`, the shared company-month idempotency helper.
- `app/api/webhooks/stripe/route.ts` - Re-keyed only the `invoice.paid` allowance grant to `monthGrantKey`; top-up grant remains event-scoped.
- `lib/inngest/functions/monthly-credit-grant.ts` - New pure helper plus Inngest cron wrapper.
- `lib/inngest/functions/index.ts` - Barrel export for `monthlyCreditGrantJob`.
- `app/api/inngest/route.ts` - Registers `monthlyCreditGrantJob` in the serve functions array.
- `tests/unit/billing/month-grant-key.test.ts` - Pure UTC key-format/stability coverage.
- `tests/unit/webhooks/stripe-credit-grant.test.ts` - Updated invoice.paid assertions for the company-month key; top-up assertions unchanged.
- `tests/unit/inngest/monthly-credit-grant-job.test.ts` - Cron behavior/config/registration tests.
- `tests/unit/billing/credit-grant-no-double.test.ts` - Shared-ledger regression proving exactly one grant row across webhook + cron in one month.
- `tests/unit/billing/billing-config.test.ts` - Allowlists the cron as a legitimate `getBillingConfig()` consumer.

## Decisions Made
- The monthly allowance grant is deduped by company calendar month, not by Stripe event. This is what lets annual billing exist without starving annual subscribers for months 2-12.
- The cron deliberately ignores billing interval. Monthly and annual customers both receive the same monthly credit cadence for their tier.
- No ledger pre-check was added to the cron. `grantCredits` is already the idempotent never-throw boundary, so both paths converge through the same contract.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- `npx tsc --noEmit` still fails on unrelated pre-existing test type errors (regex target flags, stale BillingConfig/Entitlements fixtures, seat-billing mock tuple types, estimate markup fixture shape). No TypeScript failure points at the new Phase 142 source files.
- Full `npx vitest run` hit known/parallel-only failures in `mcp-route-contract`, `team-invite`, and `seat-billing-wiring`; all three files pass when run in isolation.

## User Setup Required
None - no external service configuration required for this phase. The Inngest cron is registered in code; production activation depends on the existing Inngest deployment/sync process.

## Next Phase Readiness
- Phase 143 can safely add annual checkout because annual customers will receive the immediate month-1 grant from `invoice.paid` and future monthly grants from the cron.
- Phase 144/145 should not add credit interval logic; credits are now monthly by construction.

## Verification

- `npx vitest run tests/unit/billing/month-grant-key.test.ts tests/unit/webhooks/stripe-credit-grant.test.ts tests/unit/inngest/monthly-credit-grant-job.test.ts tests/unit/billing/credit-grant-no-double.test.ts` - 4 files / 24 passed.
- `npx vitest run tests/unit/billing/billing-config.test.ts` - 1 file / 29 passed.
- `npx vitest run` - 368 files passed, 3 skipped; 4 failures in unrelated parallel-sensitive tests. Re-ran each failed file in isolation and all passed:
  - `npx vitest run tests/unit/mcp-route-contract.test.ts` - 8 passed.
  - `npx vitest run tests/unit/actions/team-invite.test.ts` - 10 passed.
  - `npx vitest run tests/unit/billing/seat-billing-wiring.test.ts` - 10 passed.

## Self-Check: PASSED

All required artifacts exist; `monthGrantKey` is used by both the webhook and cron; top-ups remain event-keyed; the cron is registered; the no-double-grant regression is present and green.

---
*Phase: 142-credit-grant-cron*
*Completed: 2026-06-25*
