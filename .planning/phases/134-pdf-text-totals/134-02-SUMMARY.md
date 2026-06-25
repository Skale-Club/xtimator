---
phase: 134-pdf-text-totals
plan: 02
subsystem: pdf
tags: [pdf, deposit, balance-due, i18n, totals, PUI-02]
requires:
  - "lib/estimate/deposit-display.ts (deriveDepositDisplay — plan 134-01)"
provides:
  - "Deposit + Balance Due rows in the branded PDF totals block"
  - "deposit/balanceDue PDF labels (en/pt/es)"
affects:
  - "components/pdf/estimate-pdf.tsx"
tech-stack:
  added: []
  patterns:
    - "Renderer READS persisted server values via deriveDepositDisplay (GUARD-03 — no recompute)"
    - "Headless react-pdf structural test by walking the function-component element tree"
key-files:
  created:
    - "tests/unit/pdf/estimate-pdf-totals.test.tsx"
  modified:
    - "components/pdf/estimate-pdf.tsx"
decisions:
  - "Headless PDF assertion via element-tree walk (react-test-renderer is React-19-incompatible / not installed)"
metrics:
  duration: "~4m"
  completed: "2026-06-25"
  tasks: 2
  files: 2
---

# Phase 134 Plan 02: PDF Deposit + Balance Due Totals Summary

Branded PDF totals block now renders v4.11 Deposit + Balance Due rows in the locked order, reading persisted server values via `deriveDepositDisplay` (GUARD-03 — no recompute); legacy estimates stay byte-identical.

## What Was Built

- **PDF labels (Task 1):** Extended `PdfLabels` with `deposit` + `balanceDue`; added to all three locales — en `Deposit`/`Balance Due`, pt `Entrada`/`Saldo Devedor`, es `Depósito`/`Saldo Pendiente` (mirrors phase-133 DOC_LABELS).
- **Totals rows (Task 2, TDD):** Imported `deriveDepositDisplay`, called it once at component head (`const dep = deriveDepositDisplay(estimate)`), and appended two conditional rows after `grandTotalRow` inside the same `totalsBlock`:
  - Deposit row: label `L.deposit`, value `-{fmt(dep.depositAmount)}`
  - Balance Due row: label `L.balanceDue`, value `{fmt(dep.balanceDue)}`
  - Both gated on `dep.showDeposit`, so legacy / `deposit_type 'none'` rows render no extra rows (byte-identical output).
- **Structural test:** `tests/unit/pdf/estimate-pdf-totals.test.tsx` walks the `EstimatePDF(...)` element tree collecting `<Text>` content in document order, asserting (1) legacy renders no Deposit/Balance Due, (2) with-deposit renders ordered Subtotal → Total → Deposit (`-$300.00`) → Balance Due (`$700.00`), (3) persisted `balance_due` 800 (mismatched vs deposit_value 30) yields Deposit `-$200.00` / Balance `$800.00` — proving trust-the-persisted (GUARD-03).

Locked source order verified: Subtotal (L687) → Discount (L693) → Tax (L707) → grandTotalRow (L718) → Deposit (L735) → Balance Due (L742).

## Deviations from Plan

None - plan executed exactly as written.

Note: The plan suggested `react-test-renderer` as a fallback renderer. It is not installed and is incompatible with React 19, so the headless assertion calls the function component directly and walks the returned React element tree for `<Text>` nodes. This satisfies the plan's stated intent ("walk the tree for the label + value strings") without adding a dependency.

## Verification

- `npx vitest run tests/unit/pdf/estimate-pdf-totals.test.tsx` → 3 passed (RED confirmed before GREEN)
- `npx vitest run tests/unit/whatsapp/pdf-delivery.test.ts` → 9 passed (existing PDF tests stay green)
- `npx tsc --noEmit` → no errors in touched files
- `grep -c "Balance Due\|Saldo Devedor\|Saldo Pendiente"` → 3

## Commits

- `2ceda7af` feat(134-02): add deposit + balanceDue PDF labels (en/pt/es)
- `1fa0038f` test(134-02): add failing test for PDF deposit + balance due rows (RED)
- `cdc85328` feat(134-02): render deposit + balance due rows in PDF totals block (GREEN)

## Known Stubs

None.

## Self-Check: PASSED
