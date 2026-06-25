---
phase: 131-discounts
plan: 01
subsystem: ai-schema
tags: [discounts, ai-input, schema, zod, guard-03]
requires: []
provides:
  - "Optional per-item line `discount` (amount) on the authoritative AI estimate output schema + LineItemOutput type"
affects:
  - lib/ai/schema.ts
  - lib/ai/types.ts
tech-stack:
  added: []
  patterns:
    - "Additive OPTIONAL zod field with NO .default — byte-identical omission (mirrors Phase 130 taxable/tax_category)"
key-files:
  created:
    - tests/unit/ai/discount-input-schema.test.ts
  modified:
    - lib/ai/schema.ts
    - lib/ai/types.ts
decisions:
  - "Line discount is an AI INPUT amount only; the server engine subtracts it via compute-totals.ts `item.discount ?? 0` (GUARD-03 single authority preserved)"
  - "No .default(0) so existing AI output keeps validating byte-identically (ENG-02 retrocompat posture)"
metrics:
  duration: "~3 min"
  completed: "2026-06-25"
  tasks: 2
  files: 3
---

# Phase 131 Plan 01: Optional Per-Item Line Discount AI Input Summary

DISC-01 (AI-input half): added an OPTIONAL per-item line `discount` amount to the authoritative `estimateOutputSchema` and its mirror `LineItemOutput` type, exactly mirroring how Phase 130 added `taxable`/`tax_category` — additive, no `.default`, byte-identical on omission, rejecting negatives.

## What Was Built

- `lib/ai/schema.ts` — `lineItemSchema` gains `discount: z.number().finite().nonnegative().optional()` immediately after `tax_category`. No `.default`, so omitted output validates byte-identically.
- `lib/ai/types.ts` — `LineItemOutput` gains `discount?: number` mirroring the schema. `EstimateOutput` remains the `z.infer` re-export (no drift).
- `tests/unit/ai/discount-input-schema.test.ts` — 4 cases: accepts `discount:50` (preserved), accepts omission (`undefined`, no default), rejects negative, plus a `LineItemOutput` compile check.

The arithmetic seam is untouched: `compute-totals.ts` already reads `item.discount ?? 0` (dormant default 0; activated in Plan 131-02). The AI provides a number; it never computes a subtotal/total.

## Verification

- `npx vitest run tests/unit/ai/discount-input-schema.test.ts` — passing (within full ai suite run).
- Full `tests/unit/ai` suite — 15 files, 86 tests passing, including the ENG-01 `no-ai-calculator.test.ts` fence (still green — the discount is an INPUT field, no arithmetic added to any AI surface).
- Regression — `tax-classification-schema.test.ts` + `pricing-retrocompat.test.ts` (ENG-02 golden) — 2 files, 10 tests passing.
- `tsc --noEmit` — no new errors in `lib/ai/schema.ts` or `lib/ai/types.ts`.

## Deviations from Plan

None — plan executed exactly as written. (Task 2's test file was authored before running Task 1's verify so each task's verify command would resolve; the file is committed under Task 2 per the plan's `<files>` assignment.)

## Commits

- `ce192a2`: feat(131-01): add optional per-item line discount AI input (schema + types)
- `43d3fb7`: test(131-01): acceptance/omission/reject test for line discount input

## Self-Check: PASSED

- FOUND: lib/ai/schema.ts (discount field present)
- FOUND: lib/ai/types.ts (discount? mirror present)
- FOUND: tests/unit/ai/discount-input-schema.test.ts
- FOUND commit: ce192a2
- FOUND commit: 43d3fb7
