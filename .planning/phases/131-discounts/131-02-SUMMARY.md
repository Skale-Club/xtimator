---
phase: 131-discounts
plan: 02
subsystem: estimate-engine
tags: [discounts, tax, compute-totals, server-math, retrocompat]
requires:
  - lib/estimate/compute-totals.ts (TAX-03 per-category branch)
provides:
  - ComputeTotalsResult.discountAmount (disc_global) for persistence
  - ComputeTotalsOptions.discountType / discountValue (global discount inputs)
  - discount-before-tax proration into the per-category taxable base
affects:
  - lib/services/generate-estimate.ts (Plan 131-03 — persist estimates.discount_amount)
tech-stack:
  added: []
  patterns: [TDD red-green, Math.round(x*100)/100 byte-discipline, default-coalescing seams]
key-files:
  created:
    - tests/unit/estimate/discount-totals.test.ts
  modified:
    - lib/estimate/compute-totals.ts
decisions:
  - "Discount-before-tax is the default (US norm); after-tax branch left as a named follow-up (no per-company timing flag exists cheaply this phase)"
  - "Global percent expressed as a whole number (10 → 10%), converted internally via value/100"
  - "Proration distributes disc_global across each category's taxable base by its share of the taxable subtotal; /0 guarded when taxable subtotal is 0"
metrics:
  duration: ~5m
  completed: 2026-06-25
  tasks: 2
  files: 2
---

# Phase 131 Plan 02: Discounts — Server Math (DISC-02) Summary

DISC-02 activates the LOCKED calculation sequence in `computeEstimateTotals`: the line discount (already wired via `item.discount ?? 0`) plus the NEW global discount (amount or percent), applied BEFORE tax and PRORATED into the per-category taxable base. The helper now returns `discountAmount` so the engine call site (Plan 131-03) can persist `estimates.discount_amount`. The byte-identical retrocompat invariant holds: line discount 0 + no global discount collapses to Phase 130 output.

## What Was Built

- **Task 1 (RED, `08c4133`):** `tests/unit/estimate/discount-totals.test.ts` — four hand-computed goldens following the LOCKED sequence: line discount (1440), global percent prorated before tax (1890), global amount prorated before tax (1296), and retrocompat (936.09 + discountAmount 0). All four failed on missing `discountAmount` / discount handling.
- **Task 2 (GREEN, `db212cd`):** Extended `lib/estimate/compute-totals.ts` in place:
  - `ComputeTotalsOptions` gains `discountType?: 'amount' | 'percent' | 'none' | null` and `discountValue?: number | null` (whole-number percent).
  - `ComputeTotalsResult` gains `discountAmount: number`.
  - `discGlobal` computed after `subtotal`: amount → `round2(value)`, percent → `round2(subtotal × value/100)`, else 0.
  - Per-category branch: `taxableSubtotal = Σ categoryBase`; each category subtracts `round2(discGlobal × base/taxableSubtotal)` before multiplying by the resolved rate; `/0` guarded.
  - Flat branch: taxes `(subtotal − discGlobal) × taxRate` — byte-identical to the existing expression when `discGlobal === 0`.
  - `grandTotal = round2((subtotal − discGlobal) + taxAmount)`; returns `discountAmount: discGlobal`.

## Calculation Sequence (implemented, matches REQUIREMENTS.md LOCKED)

```
line_net          = round2(qty×unit_price) − line_discount
subtotal          = Σ line_net
disc_global       = discountType==='amount' ? round2(value) : round2(subtotal × pct)
prorated(cat)     = round2(disc_global × (category_base ÷ taxable_subtotal))
taxable_base(cat) = category_base − prorated(cat)
taxAmount         = Σ(taxable_base(cat) × rate_cat)
grandTotal        = (subtotal − disc_global) + taxAmount
```

## Verification

- `npx vitest run tests/unit/estimate/discount-totals.test.ts` — 4 passing (1440 / 1890 / 1296 / 936.09 + discountAmount 0).
- `npx vitest run tests/unit/estimate tests/unit/services` — 212 passing across 32 files. Includes:
  - per-category-tax golden 40/1540 STILL green.
  - pricing-retrocompat golden 850.99/85.1/936.09 BYTE-IDENTICAL (omitted + explicit-null).
  - totals-authority (GUARD-03 single authority) green.
- `npx tsc --noEmit` — no new errors in `compute-totals.ts` or `discount-totals.test.ts`.

## Deviations from Plan

None — plan executed exactly as written (TDD red-green, no refactor needed).

## Follow-Ups

- After-tax discount timing: only discount-before-tax (US norm) is implemented. A named follow-up comment in `compute-totals.ts` marks where the after-tax branch wires in once a `companies.*` timing flag is cheaply available.
- Plan 131-03 consumes `ComputeTotalsResult.discountAmount` + per-line `item.total` to persist `estimates.discount_amount` and line nets.

## Known Stubs

None. No placeholder data, empty returns, or unwired components introduced.

## Self-Check: PASSED

- FOUND: lib/estimate/compute-totals.ts (discountAmount present, grep -c = 2)
- FOUND: tests/unit/estimate/discount-totals.test.ts
- FOUND commit 08c4133 (RED), db212cd (GREEN)
