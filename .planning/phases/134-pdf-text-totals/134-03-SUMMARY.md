---
phase: 134-pdf-text-totals
plan: 03
subsystem: estimate-share-view
tags: [pui-02, deposit, balance-due, view-mode, deriveDepositDisplay]
requires: ["134-01"]
provides:
  - "View-mode (public share) Deposit row + persisted-read Balance Due in DocumentTotals"
affects:
  - components/workspace/estimate/estimate-document.tsx
tech_stack:
  added: []
  patterns:
    - "Renderer reads persisted server totals via deriveDepositDisplay() — no recompute (GUARD-03)"
key_files:
  created:
    - tests/unit/estimate/document-totals-view.test.tsx
  modified:
    - components/workspace/estimate/estimate-document.tsx
decisions:
  - "View-mode Balance Due gate switched from data.balance_due !== data.total to dep.showDeposit, value from dep.balanceDue (persisted read); edit-mode branch kept byte-identical."
  - "Edit-mode deposit Select / discount / balance-due UI untouched — a test (Test 4) locks the fence via getAllByRole('combobox')."
metrics:
  duration: "~10m"
  completed: "2026-06-25"
  tasks: 1
  files: 2
---

# Phase 134 Plan 03: Public share view totals (Deposit + Balance Due) Summary

Surfaced the v4.11 Deposit + Balance Due rows in the PUBLIC share VIEW mode of `DocumentTotals` (estimate-document.tsx), reading PERSISTED server totals through the Wave-1 `deriveDepositDisplay()` seam — presentation only, no recompute (GUARD-03). The view-mode Deposit row was entirely missing before (deposit rendered in edit mode only).

## What changed

- Imported `deriveDepositDisplay` from `@/lib/estimate/deposit-display`; computed `dep` once in `DocumentTotals` near `fmt` (reads `total`, `deposit_type`, `deposit_value`, `balance_due`).
- Replaced the edit-only deposit block's `: null` view fallback with a VIEW-mode Deposit row gated on `dep.showDeposit`, rendering `-{fmt(dep.depositAmount)}`.
- Balance Due view gate changed from `data.balance_due !== data.total` to `dep.showDeposit`; view-mode value now `fmt(dep.balanceDue)`. Edit-mode gate (`depositTypeVal !== 'none'`) and value (`data.balance_due`) kept exactly as before.
- Locked order preserved: Subtotal → Discount (if >0) → Tax → Total → Deposit (if set) → Balance Due (if set).

## Fence held

The editor (edit-mode) deposit Select, discount controls and Balance Due (phase 133) are byte-identical — only the `!isEditable` branch changed. Test 4 asserts the edit-mode deposit control (combobox) is still present.

## Retrocompat

A legacy estimate (deposit_type 'none', balance_due === total) renders Subtotal → Total only — no Deposit row, no Balance Due row — byte-identical to today. Verified by Test 1.

## Tests

`tests/unit/estimate/document-totals-view.test.tsx` (4 tests, all green):
1. Legacy — no Deposit/Balance Due rows.
2. With deposit (percent) — Deposit -$300.00, Balance Due $700.00.
3. Persisted read — deposit_value 250 ignored; Deposit -$240.00 (1000−760) and Balance Due $760.00 from `deriveDepositDisplay`.
4. Edit-mode fence — deposit Select combobox still present.

Regression: `tests/unit/share-query.test.ts` + `tests/unit/estimates/share-link.test.ts` (12) green; `tests/unit/estimate/deposit-display.test.ts` (5) green.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Test assertion] `getByText('Total')` was ambiguous**
- **Found during:** Task 1 (GREEN phase)
- **Issue:** The line-items table column header also renders `L.total` ('Total'), so `getByText('Total')` matched multiple elements.
- **Fix:** Switched the total assertions to `getAllByText('Total').length > 0`. No implementation change — the totals panel renders the grand Total exactly once.
- **Files modified:** tests/unit/estimate/document-totals-view.test.tsx
- **Commit:** ac9c2442

## Deferred Issues (out of scope)

`npx tsc --noEmit` reports pre-existing errors in unrelated files (tests/unit/whatsapp/*, tests/unit/estimate/observability.test.ts, step-runner.test.ts, generate-estimate-job.test.ts, and a compute-totals item-shape error). None reference estimate-document.tsx or document-totals-view.test.tsx — confirmed zero tsc errors in this plan's files. Logged, not fixed (scope boundary).

## Known Stubs

None.

## Self-Check: PASSED
- FOUND: components/workspace/estimate/estimate-document.tsx (deriveDepositDisplay imported L48, called L959)
- FOUND: tests/unit/estimate/document-totals-view.test.tsx
- FOUND commit 877cab0c (test/RED), ac9c2442 (feat/GREEN)
