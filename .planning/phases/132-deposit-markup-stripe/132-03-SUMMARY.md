---
phase: 132-deposit-markup-stripe
plan: 03
subsystem: billing
tags: [deposit, stripe, application-fee, DEP-02]
requires:
  - "Plan 132-01 (estimates.deposit_type/deposit_value/balance_due active on estimates)"
  - "lib/billing/estimate-fee.computeApplicationFee (single fee formula)"
provides:
  - "lib/billing/charge-amount.resolveChargeAmount — single authority for the Stripe-charged amount"
  - "generateInvoice's deposit kind charges the server-configured deposit (deposit_type/deposit_value)"
affects:
  - "lib/actions/invoice.ts (generateInvoice deposit path + estimate select)"
tech-stack:
  added: []
  patterns:
    - "Pure helper (no server-only / no DB) mirroring estimate-fee.ts for unit-testability"
    - "Fee composed by caller on the charged amount — fee math stays in one place"
key-files:
  created:
    - lib/billing/charge-amount.ts
    - tests/unit/billing/charge-amount.test.ts
  modified:
    - lib/actions/invoice.ts
decisions:
  - "resolveChargeAmount returns ONLY the charge amount; the 1% fee is computed by the caller via the existing computeApplicationFee (no second fee formula)"
  - "Deposit exceeding the total is clamped to the total — never charge more than the grandTotal"
  - "Configured-deposit detection (deposit_type 'percent'|'amount') gates the new path; absence falls back to the legacy depositPct split for backward compatibility"
metrics:
  duration: "~3m"
  completed: "2026-06-25"
  tasks: 2
  files: 3
---

# Phase 132 Plan 03: Deposit → Stripe 1%-fee charge contract Summary

DEP-02 threads the server-computed deposit (Plan 132-01's `estimates.deposit_type`/`deposit_value`)
into the Stripe payment contract: a pure `resolveChargeAmount` helper is the single authority for the
charged amount (deposit when configured, else grandTotal), and the existing `computeApplicationFee`
computes the 1% platform fee ON THE AMOUNT ACTUALLY CHARGED — no second fee formula introduced.

## What Was Built

- **`lib/billing/charge-amount.ts`** — pure module (no `server-only`, no DB). `resolveChargeAmount(estimate, currencyCode)` → `{ chargeAmountCents }`:
  - `percent` → `round(toMinorUnits(total) × value/100)`, clamped to total
  - `amount` → `toMinorUnits(min(value, total))`
  - `none`/null → full grandTotal
- **`tests/unit/billing/charge-amount.test.ts`** — 6 hand-computed goldens, each also asserting the 1% fee via `computeApplicationFee` to prove the contract:
  - percent (25% of $1000) → 25000 cents, fee 250
  - amount ($400) → 40000 cents, fee 400
  - none → 100000 cents, fee 1000 (1% of the full grandTotal)
  - deposit-over-total ($1500 vs $1000) → clamped 100000 cents, fee 1000
  - null type → full total; null total → 0
- **`lib/actions/invoice.ts`** — estimate select extended with `deposit_type, deposit_value`; the `deposit` kind sources `amountCents` from `resolveChargeAmount` when the estimate carries a configured deposit, falling back to the legacy `depositPct` split otherwise. `computeApplicationFee` call left UNCHANGED — the fee now lands on the deposit-aware charged amount.

## Verification

- `npx vitest run tests/unit/billing/charge-amount.test.ts` → 6 passed
- `npx vitest run tests/unit/billing` → 187 passed (25 files) — no regression in computeApplicationFee callers
- `grep -c resolveChargeAmount lib/actions/invoice.ts` → 3; `lib/billing/charge-amount.ts` → 1
- Secret scan (`sk_(live|test)_…`) on both files → 0; gitleaks clean on both commits
- `tsc --noEmit` → no type errors in touched files

## Deviations from Plan

None — plan executed exactly as written. TDD Task 1 RED test + GREEN impl were committed as a single
`feat` commit (the test and helper are tightly coupled and the RED state was verified before GREEN).

## Scope Notes

Charge-amount contract + wiring ONLY. No new Stripe checkout route, no UI. The deposit-SETTING UI is
deferred to Phase 133 (per plan scope fence). `lib/money/invoice-split.ts` / compute-totals.ts untouched.

## Commits

- `7acb201e` feat(132-03): pure resolveChargeAmount helper + 1%-on-charged-amount goldens
- `79a2223c` feat(132-03): wire configured deposit into generateInvoice's charged amount

## Self-Check: PASSED

- FOUND: lib/billing/charge-amount.ts
- FOUND: tests/unit/billing/charge-amount.test.ts
- FOUND: lib/actions/invoice.ts (modified)
- FOUND commit: 7acb201e
- FOUND commit: 79a2223c
