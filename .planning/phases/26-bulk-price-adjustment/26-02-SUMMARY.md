---
phase: 26-bulk-price-adjustment
plan: "02"
subsystem: price-book-ui
tags: [price-book, bulk-adjust, dialog, react-hook-form, tdd]
dependency_graph:
  requires:
    - 26-01
  provides:
    - BulkAdjustDialog component
    - Adjust % button on category headers in PriceBookList
  affects:
    - components/price-book/price-book-list.tsx
    - components/price-book/bulk-adjust-dialog.tsx
tech_stack:
  added: []
  patterns:
    - useMemo live preview (pure math, no network)
    - useEffect form reset on open (Pitfall 6)
    - startTransition async server action with Pitfall 5 error/success path
    - zodResolver as any cast for zod v4 / react-hook-form compatibility
key_files:
  created:
    - components/price-book/bulk-adjust-dialog.tsx
    - tests/unit/price-book/bulk-adjust-dialog.test.tsx
  modified:
    - components/price-book/price-book-list.tsx
    - tests/unit/price-book/price-book-list.test.tsx
decisions:
  - "Button disabled condition uses !adjustmentPercent || adjustmentPercent === 0 only — removed !form.formState.isValid because isValid is false before first submit in react-hook-form; pure percent guard is sufficient and allows the submit to fire zod validation"
  - "items passed to BulkAdjustDialog use items.filter(i => i.category === adjustCategory) from unfiltered items prop (Pitfall 7) — not categoryItems from grouped.map which is search-filtered"
  - "handleAdjustClose does NOT call router.refresh() — BulkAdjustDialog handles router.refresh() internally after success; PriceBookList just resets adjustCategory to null on close"
metrics:
  duration: "4m"
  completed_date: "2026-05-08"
  tasks: 2
  files: 4
---

# Phase 26 Plan 02: BulkAdjustDialog UI + PriceBookList Wiring Summary

**One-liner:** BulkAdjustDialog with % input + live useMemo preview table + color-coded new prices wired into PriceBookList category headers via Adjust % button.

## What Was Built

### Task 1: BulkAdjustDialog component + tests (TDD RED → GREEN)

New component `components/price-book/bulk-adjust-dialog.tsx`:
- Dialog with `Adjust prices — {category}` title
- react-hook-form + zod (`bulkAdjustSchema`) `Adjustment %` input
- `useMemo` preview table: guards for 0/empty (Pitfall 4), shows current vs new prices
- Color-coded new price column: `text-green-600` for positive, `text-red-600` for negative
- `useEffect` form reset on `open` prop change (Pitfall 6)
- Success path: `onOpenChange(false)` then `router.refresh()` (Pitfall 5)
- Error path: `toast.error(result.error)` only, dialog stays open (Pitfall 5)
- Confirm button: `Apply to N items`, disabled when percent is 0

New test file `tests/unit/price-book/bulk-adjust-dialog.test.tsx`: 8 tests, all GREEN.

### Task 2: PriceBookList modifications + list tests (TDD RED → GREEN)

Modified `components/price-book/price-book-list.tsx`:
- Added `Percent` icon import + `BulkAdjustDialog` import
- Added `adjustCategory` and `adjustDialogOpen` state
- Added `handleAdjustCategory` and `handleAdjustClose` handler functions
- Category header converted from plain `<h3>` to flex row with "Adjust %" button (`data-testid="adjust-btn-{category}"`, `variant="outline"`, `size="sm"`, `Percent` icon)
- `BulkAdjustDialog` rendered at bottom with `items.filter(i => i.category === adjustCategory)` from unfiltered `items` prop (Pitfall 7 guard)

Extended `tests/unit/price-book/price-book-list.test.tsx`:
- Added `bulkAdjustPriceBookCategory` to actions mock
- Added `vi.mock('@/components/price-book/bulk-adjust-dialog')` sentinel mock
- 3 new tests in `describe('Adjust % button')` — all GREEN

## Test Results

```
npx vitest run tests/unit/price-book/ tests/unit/schemas/price-book.test.ts
Test Files  6 passed (6)
Tests  58 passed (58)
```

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Removed !form.formState.isValid from submit button disabled condition**

- **Found during:** Task 1 GREEN phase — 2 submit-interaction tests failing
- **Issue:** react-hook-form's `isValid` is `false` before the first form submission even when the field value is valid. The button was permanently disabled when a non-zero percent was typed, preventing the form from submitting in tests.
- **Fix:** Removed `!form.formState.isValid` from the button's `disabled` prop. The remaining guards (`isPending || !adjustmentPercent || adjustmentPercent === 0`) are sufficient — zod validation runs on submit regardless.
- **Files modified:** `components/price-book/bulk-adjust-dialog.tsx`
- **Commit:** 1062c32

## Known Stubs

None — all functionality is fully wired. The live preview uses real item data from props, the server action call is wired via `startTransition`, and the test mocks exercise both success and error paths.

## Self-Check: PASSED

- FOUND: components/price-book/bulk-adjust-dialog.tsx
- FOUND: components/price-book/price-book-list.tsx
- FOUND: tests/unit/price-book/bulk-adjust-dialog.test.tsx
- FOUND: tests/unit/price-book/price-book-list.test.tsx
- FOUND commit: 1062c32 (BulkAdjustDialog + dialog tests)
- FOUND commit: 390ba11 (PriceBookList wiring + list tests)
