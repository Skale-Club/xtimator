---
phase: 145-pricing-ui-toggle
plan: "01"
subsystem: billing-ui
tags: [billing, ui, annual, toggle, i18n, pricing]
requires:
  - phase: 141-annual-pricing-config
    provides: subscriptionPriceAnnualCents per tier in billing_config
  - phase: 143-annual-checkout
    provides: create-checkout-session accepts billingInterval year
provides:
  - Monthly/Annual toggle on tier cards grid
  - Annual view: annual price + per-month-equivalent + derived save-X% badge
  - billingInterval threads into handleSelect checkout API call
  - Graceful degradation when annual price is null/0
  - i18n strings through t() / T component
tech-stack:
  added: []
  patterns:
    - server-to-client prop threading for server-only config
    - derived save percentage (never stored, always computed)
key-files:
  created:
    - tests/unit/billing/pricing-ui-no-hardcode.test.ts
  modified:
    - components/billing/tier-cards-grid.tsx
    - components/billing/tier-card.tsx
    - app/(app)/settings/billing/page.tsx
decisions:
  - Pass annualPrices + monthlyPricesCents from server component via getBillingConfig() rather than duplicating prices in client TIERS constant
  - savePct derived at render time from Math.round(1 - annual/(12*monthly)); never stored
  - Graceful degradation: if annualPrice is null for a paid tier, card falls back to monthly display (no unavailable state needed)
  - billingInterval toggled as client state; threaded into checkout fetch body
metrics:
  duration: ~10 minutes
  completed: 2026-06-28
  tasks: 5
  files: 4
---

# Phase 145 Plan 01: Pricing UI Toggle Summary

## One-liner

Monthly/Annual billing toggle on tier cards with server-config-driven annual prices and Math.round-derived save-X% badge — no hardcoded percentages or price strings.

## What Was Done

### Task 1: Read current files
Examined all four target files to understand existing structure before making changes.

### Task 2: Update billing page to pass annual prices
`app/(app)/settings/billing/page.tsx` now imports `getBillingConfig` (server-only), calls it to read `subscriptionPriceAnnualCents` and `subscriptionPriceCents` for pro/business tiers, and passes them as `annualPrices` and `monthlyPricesCents` props to `TierCardsGrid`.

### Task 3: Update TierCardsGrid with Monthly/Annual toggle
`components/billing/tier-cards-grid.tsx` received:
- New props: `annualPrices` and `monthlyPricesCents` (both optional with null-safe access)
- `billingInterval` state (`'month' | 'year'`, defaults to `'month'`)
- Monthly/Annual toggle buttons above the grid using `cn()` for active styling
- `billingInterval` threaded into the `create-checkout-session` POST body
- `getAnnualDisplay(tier)` helper that computes formatted annual price, per-month equivalent, and save percentage — all derived from props, no hardcoded values
- TIERS.map now uses `tierItem` (not `t`) to avoid shadowing the `t()` i18n function

### Task 4: Update TierCard to display annual pricing
`components/billing/tier-card.tsx` received four new optional props: `showAnnual`, `annualPrice`, `annualPerMonth`, `savePct`. The price section conditionally shows:
- Annual total (`annualPrice`) with "/ year" label when `displayAnnual` is true
- Monthly breakdown (`annualPerMonth` + "/ mo · billed annually") when annual data available
- Save badge (`Save X%`) when savePct is non-null — uses `<T text={...}>` for i18n
- Falls back to monthly `price`/`period` when annual data is not available (graceful degradation)

### Task 5: Static no-hardcode test
`tests/unit/billing/pricing-ui-no-hardcode.test.ts` asserts:
1. No hardcoded `'Save X%'` string literals
2. No hardcoded annual price strings like `'$280'`/`'$290'`
3. `billingInterval` threads into checkout call
4. `annualPrices` + `monthlyPricesCents` flow through props
5. `Math.round` and `annualCents` computation pattern present

All 5 tests pass.

## Commits

| Hash | Message |
|------|---------|
| 671f26f7 | feat(billing-ui): Monthly/Annual toggle on pricing cards with derived save badge (ANN-05) |

## Verification Results

```
vitest run tests/unit/billing/pricing-ui-no-hardcode.test.ts
  Test Files  1 passed (1)
      Tests  5 passed (5)

tsc --noEmit | grep tier-card|tier-cards|billing/page
  (no output — no errors)
```

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Variable shadowing: `t` iterator conflicted with `t()` i18n function**
- **Found during:** Task 3
- **Issue:** TIERS.map used `(t) =>` as the iterator variable, shadowing the `t()` from `useTranslation()`. This would cause `t.tier`, `t.name` etc. to break translation calls.
- **Fix:** Renamed the map parameter to `tierItem` throughout the map callback.
- **Files modified:** components/billing/tier-cards-grid.tsx
- **Commit:** 671f26f7

## Known Stubs

None. Annual prices flow from `getBillingConfig()` which reads from the database (with `DEFAULT_BILLING_CONFIG` as fallback). The default annual prices are placeholder values noted as "CALIBRATE BEFORE CHARGING" in billing-config.ts — this is intentional per Phase 141 and not a stub in this component's context.

## Self-Check: PASSED

- components/billing/tier-cards-grid.tsx: exists and modified
- components/billing/tier-card.tsx: exists and modified
- app/(app)/settings/billing/page.tsx: exists and modified
- tests/unit/billing/pricing-ui-no-hardcode.test.ts: exists (new file)
- Commit 671f26f7: verified via git log
