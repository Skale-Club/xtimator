---
phase: 144-interval-aware-seat-billing
plan: 01
subsystem: billing
tags: [billing, stripe, seats, interval, annual, ANN-04]
requirement: ANN-04

# Dependency graph
requires:
  - phase: 141-annual-pricing-config
    provides: "seatPriceAnnualCents in billing_config"
  - phase: 139-seat-billing-service
    provides: "syncSubscriptionSeatItem in lib/billing/stripe-client.ts"
provides:
  - "syncSubscriptionSeatItem reads subscription interval dynamically (no hardcoded 'month')"
  - "annual subscriptions get seatPriceAnnualCents via inline price_data"
  - "monthly subscriptions unchanged — byte-identical to v4.12"
  - "syncSeatBilling passes annualUnitAmount to syncSubscriptionSeatItem"
affects: [145-pricing-ui-toggle]

# Tech stack
tech-stack:
  added: []
  patterns:
    - "Read subscription interval from items.data[0].plan.interval before building price_data"
    - "Backward-compatible optional annualUnitAmount field on desired object"

# Key files
key-files:
  modified:
    - lib/billing/stripe-client.ts
    - lib/billing/seat-billing.ts
  created:
    - tests/unit/billing/seat-billing-interval.test.ts

# Decisions
decisions:
  - "Pass annualUnitAmount as optional field on desired rather than a separate param — keeps signature backward-compatible and avoids double-retrieve"
  - "Read interval from subscription.items.data[0].plan.interval with 'month' fallback — same subscription already retrieved in the function"
  - "annualUnitAmount null/undefined falls back to unitAmount — graceful degradation when config missing annual price"

# Metrics
metrics:
  duration: ~15min
  completed: 2026-06-28
  tasks_completed: 3
  files_changed: 3
---

# Phase 144 Plan 01: Interval-Aware Seat Billing Summary

**One-liner:** `syncSubscriptionSeatItem` reads subscription interval dynamically and uses `seatPriceAnnualCents` for annual subscriptions, with monthly path byte-identical to v4.12.

## What Was Done

### Task 1 — stripe-client.ts: interval-aware syncSubscriptionSeatItem

Extended `syncSubscriptionSeatItem` in `lib/billing/stripe-client.ts`:

- Signature extended: `desired: { quantity: number; unitAmount: number; annualUnitAmount?: number }`
- Added interval read from the already-retrieved subscription:
  ```ts
  const subscriptionInterval = (
    (subscription.items?.data?.[0]?.plan?.interval) ?? 'month'
  ) as 'month' | 'year'
  ```
- Added unit amount resolution:
  ```ts
  const resolvedUnitAmount =
    subscriptionInterval === 'year' && desired.annualUnitAmount != null
      ? desired.annualUnitAmount
      : desired.unitAmount
  ```
- Replaced hardcoded `recurring: { interval: 'month' }` with `recurring: { interval: subscriptionInterval }`
- Used `resolvedUnitAmount` instead of `desired.unitAmount` in `priceData`

### Task 2 — seat-billing.ts: pass annualUnitAmount

Updated the `syncSubscriptionSeatItem` call in `syncSeatBilling`:

```ts
await syncSubscriptionSeatItem(stripe, subscriptionId, {
  quantity: billableSeats,
  unitAmount: cfg.seatPriceCents,
  annualUnitAmount: cfg.seatPriceAnnualCents ?? undefined,
})
```

`cfg.seatPriceAnnualCents` is already present in `BillingConfig` (added Phase 141). `?? undefined` ensures null from DB becomes undefined so the fallback logic in `syncSubscriptionSeatItem` activates.

### Task 3 — seat-billing-interval.test.ts: 8 new unit tests

New file `tests/unit/billing/seat-billing-interval.test.ts` with 8 tests covering:

1. Annual subscription + annualUnitAmount → creates item with annualUnitAmount and `interval: 'year'`
2. Annual subscription + annualUnitAmount → updates existing item with annualUnitAmount and `interval: 'year'`
3. Monthly subscription + annualUnitAmount provided → uses unitAmount and `interval: 'month'`
4. Monthly subscription without annualUnitAmount → uses unitAmount and `interval: 'month'`
5. Annual + annualUnitAmount omitted → falls back to unitAmount, interval still `'year'`
6. Annual + annualUnitAmount explicitly undefined → falls back to unitAmount
7. Single-owner (1 member, 1 includedSeat) → billableSeats = 0 → no Stripe write
8. enforcementEnabled: false → no Stripe write

## Verification Results

```
npx vitest run tests/unit/billing/seat-billing-interval.test.ts
  Test Files  1 passed (1)
  Tests       8 passed (8)

npx vitest run tests/unit/billing/seat-billing-wiring.test.ts
  Test Files  1 passed (1)
  Tests       10 passed (10)

npx vitest run tests/unit/billing/seat-billing.test.ts
  Test Files  1 passed (1)
  Tests       22 passed (22)

Combined: 3 test files, 40 tests — all passed

npx tsc --noEmit | grep stripe-client|seat-billing
  → No new errors introduced (3 pre-existing errors in seat-billing.test.ts confirmed
    pre-existing via git stash before/after comparison)
```

## Deviations from Plan

None — plan executed exactly as written.

## Commits

| Hash | Message |
|------|---------|
| aaaea94c | feat(seats): interval-aware seat billing — annual subs use seatPriceAnnualCents (ANN-04) |

## Self-Check: PASSED

- [x] `lib/billing/stripe-client.ts` modified — confirmed
- [x] `lib/billing/seat-billing.ts` modified — confirmed
- [x] `tests/unit/billing/seat-billing-interval.test.ts` created — confirmed
- [x] Commit `aaaea94c` exists — confirmed
- [x] 40/40 tests pass across all 3 test suites
- [x] No new TypeScript errors introduced
