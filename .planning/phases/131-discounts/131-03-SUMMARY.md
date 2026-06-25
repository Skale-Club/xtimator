---
phase: 131-discounts
plan: 03
subsystem: estimate-engine
tags: [discounts, persistence, engine-wiring, guard-03, retrocompat]
requires:
  - "131-02: computeEstimateTotals returns discountAmount (disc_global)"
provides:
  - "estimates.discount_type/discount_value/discount_amount persisted from computed values"
  - "estimate_items.discount persisted from AI line-discount input"
affects:
  - "Phase 133 editor (reads persisted discount_*)"
  - "Phase 134 PDF (surfaces persisted discount_*)"
tech-stack:
  added: []
  patterns:
    - "GUARD-03 assertFinitePositive coercion extended to discountAmount"
    - "...item spread seam carries line discount AI→anchor→research→compute→persist"
key-files:
  created:
    - "tests/unit/services/discount-persistence.test.ts"
  modified:
    - "lib/services/generate-estimate.ts"
decisions:
  - "Reuse EXISTING estimates.discount_* columns (no new columns) — persist computed discountAmount"
  - "discount_type stays null when discount is 0 → no-discount row byte-identical to before"
  - "At generation no global discount is passed → discountAmount 0 → null/0/0 retrocompat preserved"
metrics:
  duration: "~5m"
  completed: "2026-06-25"
  tasks: 2
  files: 2
---

# Phase 131 Plan 03: Discount Persistence + Engine Wiring Summary

DISC-01 (line-discount persistence) + DISC-02 (global-discount wiring): the dormant discount persistence in `lib/services/generate-estimate.ts` is now ACTIVE — the engine threads `discountAmount` out of `computeEstimateTotals`, persists the per-line `discount` to `estimate_items.discount`, and replaces the hardcoded `discount_type: null, discount_value: 0, discount_amount: 0` with the REAL computed values, reusing the existing `estimates.discount_*` columns.

## What Changed

- **Threading:** Destructured `discountAmount` from the GUARD-03 `computeEstimateTotals(...)` call (returned by Plan 131-02). No global discount is passed at generation, so `discountAmount` is 0 here.
- **GUARD-03 coercion:** Added `const safeDiscountAmount = assertFinitePositive(discountAmount)`, mirroring `safeSubtotal`/`safeTaxAmount`/`safeGrandTotal` — never-throw discipline.
- **estimates insert:** Replaced the three hardcoded discount literals with `discount_type: safeDiscountAmount > 0 ? 'amount' : null`, `discount_value: safeDiscountAmount`, `discount_amount: safeDiscountAmount`.
- **estimate_items insert:** Added `discount: (item.discount as number | undefined) ?? 0` after `tax_category`, riding the existing `...item` spread seam (Phase 130 precedent for `taxable`/`tax_category`).
- **Test:** New `tests/unit/services/discount-persistence.test.ts` — a pure `readFileSync` static-source gate (no DB/mocks/secrets) with 4 cases including a negative guard that the hardcoded `discount_amount: 0` stub is gone.

## Retrocompat / Byte-Identity

At generation there is no owner-set global discount and the AI proposes none, so `discountAmount` is 0 → `discount_type: null, discount_value: 0, discount_amount: 0` persists byte-identical to before. Line `discount` defaults to 0 for items the AI does not discount. All standing goldens stay green:

- pricing-retrocompat: 850.99 / 85.1 / 936.09
- per-category-tax: 40 / 1540
- discount-totals: 1440 / 1890 / 1296

## Deviations from Plan

None — plan executed exactly as written.

## Deferred Issues

- Pre-existing tsc error `tests/unit/inngest/generate-estimate-job.test.ts(150,66)` TS2348 (vitest Mock callable typing). Verified pre-existing on clean tree via `git stash` + `tsc --noEmit`. Out of scope (different file, unrelated to discount wiring). Logged in `.planning/phases/131-discounts/deferred-items.md`.

## Verification

- `npx vitest run tests/unit/services/discount-persistence.test.ts` — 4 passing
- `npx vitest run tests/unit/services/pricing-retrocompat.test.ts tests/unit/estimate/discount-totals.test.ts` — 9 passing
- Full regression: `npx vitest run tests/unit/services tests/unit/estimate tests/unit/ai` — 302 passing (48 files)
- `grep -c "discount_amount: safeDiscountAmount"` === 1; `grep -c "discount: (item.discount"` === 1; hardcoded `discount_amount: 0` / `discount_value: 0` literals gone (count 0)
- `tsc --noEmit` — no errors in `lib/services/generate-estimate.ts`

## Commits

- `de4972fb` feat(131-03): wire discount persistence in generate-estimate engine
- `5eea8334` test(131-03): static-source gate for discount persistence wiring

## Self-Check: PASSED

- FOUND: lib/services/generate-estimate.ts (modified)
- FOUND: tests/unit/services/discount-persistence.test.ts (created)
- FOUND commit: de4972fb
- FOUND commit: 5eea8334
