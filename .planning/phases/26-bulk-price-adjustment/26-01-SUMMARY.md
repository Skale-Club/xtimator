---
phase: 26-bulk-price-adjustment
plan: "01"
subsystem: price-book
tags: [price-book, bulk-adjust, server-action, zod, tdd]
dependency_graph:
  requires:
    - lib/schemas/price-book.ts (priceBookItemSchema pattern)
    - lib/actions/price-book.ts (getAuthContext + importPriceBookItems pattern)
    - supabase/company_price_book table
  provides:
    - bulkAdjustSchema (zod schema with -100..+500 range, coercion, descriptive messages)
    - BulkAdjustFormValues (TypeScript type)
    - bulkAdjustPriceBookCategory (server action: fetch → compute → upsert atomically)
  affects:
    - tests/unit/schemas/price-book.test.ts
    - tests/unit/price-book/bulk-adjust-action.test.ts
tech_stack:
  added: []
  patterns:
    - TDD Wave 0/1 (RED stubs → GREEN implementation)
    - upsert atomicity (per-item computed prices, not shared value)
    - Math.round(price * (1 + percent/100) * 100) / 100 rounding
key_files:
  created:
    - tests/unit/price-book/bulk-adjust-action.test.ts
  modified:
    - lib/schemas/price-book.ts
    - lib/actions/price-book.ts
    - tests/unit/schemas/price-book.test.ts
decisions:
  - "bulkAdjustSchema uses z.coerce.number for HTML input string coercion (consistent with unit_price field)"
  - "upsert(adjustedItems) chosen over update().in() to ensure per-item computed prices — single PostgREST transaction"
  - "Math.round(...*100)/100 for NUMERIC(12,2) Postgres column compatibility"
metrics:
  duration: "2min"
  completed: "2026-05-08"
  tasks_completed: 2
  files_changed: 4
---

# Phase 26 Plan 01: Bulk Price Adjustment — Schema + Server Action Summary

**One-liner:** `bulkAdjustSchema` (-100..+500 with coercion) + `bulkAdjustPriceBookCategory` server action using upsert atomicity and 2dp rounding for per-category bulk price adjustment.

## What Was Built

Two artifacts extend the existing price-book module:

1. **`lib/schemas/price-book.ts`** — appended `bulkAdjustSchema` and `BulkAdjustFormValues`:
   - `z.coerce.number()` handles string inputs from HTML number fields
   - Range -100 to +500 with descriptive messages
   - `BulkAdjustFormValues` type exported for UI consumption (Plan 02)

2. **`lib/actions/price-book.ts`** — appended `bulkAdjustPriceBookCategory(category, adjustmentPercent)`:
   - Same `getAuthContext()` pattern as all other price-book actions
   - Fetches full item rows (id, company_id, category, name, unit, unit_price, notes)
   - Computes new price per item: `Math.round(price * (1 + percent/100) * 100) / 100`
   - Single `upsert(adjustedItems)` — atomic PostgREST transaction
   - Returns `{ data: { updated: N } }` on success, `{ error: string }` on failure
   - Calls `revalidatePath('/settings/price-book')` after success

## Test Results

- **Wave 0 (RED):** 11 new tests failing — `bulkAdjustSchema` (5) + `bulkAdjustPriceBookCategory` (6)
- **Wave 1 (GREEN):** All 17 tests passing
- **Regression check:** 47 total price-book tests passing (no regressions)

| Test file | Tests | Status |
|-----------|-------|--------|
| tests/unit/schemas/price-book.test.ts | 11 (6 existing + 5 new) | GREEN |
| tests/unit/price-book/bulk-adjust-action.test.ts | 6 | GREEN |
| tests/unit/price-book/import-action.test.ts | 9 | GREEN |
| tests/unit/price-book/price-book-list.test.tsx | (existing) | GREEN |
| tests/unit/price-book/price-book-import-dialog.test.tsx | (existing) | GREEN |

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| Task 1 (Wave 0 RED) | 72d20e1 | test(26-01): Wave 0 RED stubs for bulkAdjustSchema + bulkAdjustPriceBookCategory |
| Task 2 (Wave 1 GREEN) | ad22884 | feat(26-01): bulkAdjustSchema + bulkAdjustPriceBookCategory — Wave 1 GREEN |

## Deviations from Plan

None — plan executed exactly as written. The mock pattern in `bulk-adjust-action.test.ts` matches the specification verbatim.

## Known Stubs

None — all exports are fully implemented and tested.

## Self-Check: PASSED

- `lib/schemas/price-book.ts` — exists, exports `bulkAdjustSchema` and `BulkAdjustFormValues`
- `lib/actions/price-book.ts` — exists, exports `bulkAdjustPriceBookCategory`
- `tests/unit/price-book/bulk-adjust-action.test.ts` — exists, 6 tests GREEN
- Commits 72d20e1 and ad22884 verified in git log
