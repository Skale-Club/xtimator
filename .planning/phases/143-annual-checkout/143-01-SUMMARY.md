---
phase: 143-annual-checkout
plan: "01"
subsystem: billing
tags: [billing, stripe, checkout, annual, interval]
requirement: ANN-03

dependency_graph:
  requires:
    - phase: 141-annual-pricing-config
      provides: "STRIPE_PRICE_PRO_ANNUAL / STRIPE_PRICE_BUSINESS_ANNUAL env pattern"
  provides:
    - "create-checkout-session accepts billingInterval: 'month' | 'year' (default 'month')"
    - "annual interval selects STRIPE_PRICE_PRO_ANNUAL / STRIPE_PRICE_BUSINESS_ANNUAL"
    - "billing_interval stored in session metadata and subscription_data.metadata"
    - "month path byte-identical to pre-change behavior"
    - "env example files document annual Price ID vars with placeholders"
  affects:
    - 144-interval-aware-seat-billing
    - 145-pricing-ui-toggle

tech_stack:
  added: []
  patterns:
    - "billingInterval ternary routing: year → annual price IDs, else → monthly (retrocompat default)"
    - "envVarName derived from plan + interval to produce clear 500 error messages"

key_files:
  created:
    - tests/unit/billing/annual-checkout.test.ts
  modified:
    - app/api/billing/create-checkout-session/route.ts
    - .env.local.example
    - .env.production.example

decisions:
  - "Annual price IDs are optional env vars (commented out in .env.production.example) — routes 500 clearly when missing rather than silently falling back to monthly"
  - "billingInterval defaults to 'month' when absent from request body, making the change fully retrocompat"

metrics:
  duration: "5 minutes"
  completed: "2026-06-28"
  tasks_completed: 3
  files_changed: 4
---

# Phase 143 Plan 01: Annual Checkout Summary

## One-liner

Extended `create-checkout-session` to accept `billingInterval: 'month' | 'year'`, routing annual requests to `STRIPE_PRICE_PRO_ANNUAL` / `STRIPE_PRICE_BUSINESS_ANNUAL` and stamping `billing_interval` in both Stripe metadata objects.

## What Was Done

### Task 1: Extend checkout route

`app/api/billing/create-checkout-session/route.ts` was updated to:

1. Parse `billingInterval` from request body (`'year'` | `'month'`, defaults to `'month'` when absent)
2. Select `priceId` based on both `plan` and `billingInterval` — annual path uses the new `STRIPE_PRICE_PRO_ANNUAL` / `STRIPE_PRICE_BUSINESS_ANNUAL` env vars
3. Compute `envVarName` (e.g. `STRIPE_PRICE_PRO_ANNUAL`) before the guard so the 500 error names the exact missing variable
4. Add `billing_interval: billingInterval` to both `metadata` and `subscription_data.metadata`

The monthly path is byte-identical to the previous implementation — only `billing_interval: 'month'` is added to the metadata objects, which is additive and non-breaking.

### Task 2: Document env vars

Both `.env.local.example` and `.env.production.example` were updated with commented-out placeholder entries for `STRIPE_PRICE_PRO_ANNUAL` and `STRIPE_PRICE_BUSINESS_ANNUAL`. No real price IDs were committed.

### Task 3: Unit tests

`tests/unit/billing/annual-checkout.test.ts` was created with 9 test cases covering:
- `billingInterval: 'year'` + `plan: 'pro'` → `STRIPE_PRICE_PRO_ANNUAL` used; `billing_interval: 'year'` in metadata
- `billingInterval: 'year'` + `plan: 'business'` → `STRIPE_PRICE_BUSINESS_ANNUAL` used
- `billingInterval: 'year'` with annual env unset → 500 with `STRIPE_PRICE_PRO_ANNUAL` in error body
- `billingInterval: 'month'` → monthly price ID; `billing_interval: 'month'` in metadata
- No `billingInterval` field → same as `'month'` (retrocompat default)
- `subscription_data.metadata` carries `billing_interval` for both annual and monthly paths

## Verification Results

```
RUN  v4.1.4
 Test Files  1 passed (1)
      Tests  9 passed (9)
   Duration  2.77s
```

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED

- `app/api/billing/create-checkout-session/route.ts` — modified (confirmed)
- `.env.local.example` — modified (confirmed)
- `.env.production.example` — modified (confirmed)
- `tests/unit/billing/annual-checkout.test.ts` — created (confirmed)
- Commit `3f809085` exists on main branch (confirmed)
