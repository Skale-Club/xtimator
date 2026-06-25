---
phase: 134-pdf-text-totals
plan: 04
subsystem: whatsapp / plain-text estimate render
tags: [deposit, balance-due, formatter, i18n, PUI-02, v4.11]
requires:
  - "134-01: deriveDepositDisplay() shared read seam"
provides:
  - "Deposit + Balance Due lines in the channel-neutral plain-text estimate formatter (WhatsApp + MCP + in-app Send tab)"
  - "deposit_type/deposit_value/balance_due on FormatterEstimate + en/pt/es labels"
  - "deposit columns on the selects that feed the formatter (send-estimate.ts, confirm-actions.ts)"
affects:
  - "lib/whatsapp/formatter.ts"
  - "lib/whatsapp/send-estimate.ts"
  - "lib/whatsapp/confirm-actions.ts"
tech-stack:
  added: []
  patterns:
    - "Single shared read seam (deriveDepositDisplay) — no recompute (GUARD-03)"
    - "Conditional totals block: lines emit only when a deposit is set; legacy rows byte-identical"
key-files:
  created: []
  modified:
    - "lib/whatsapp/formatter.ts"
    - "lib/whatsapp/send-estimate.ts"
    - "lib/whatsapp/confirm-actions.ts"
    - "tests/unit/whatsapp/formatter.test.ts"
decisions:
  - "confirm-actions.ts: the formatter is fed by the estimateResult select (L89), not the EstimateContext select (L42 named in the plan) — added deposit columns to BOTH (L89 load-bearing, L42 for parity)"
metrics:
  duration: "~10 min"
  completed: "2026-06-25"
  tasks: 2
  files: 4
---

# Phase 134 Plan 04: Plain-text / WhatsApp / MCP Deposit Totals Summary

Append v4.11 Deposit + Balance Due lines to the channel-neutral plain-text estimate formatter, reading persisted server fields via `deriveDepositDisplay()` (no recompute), with en/pt/es labels and the deposit columns wired into the two callers' explicit selects.

## What Was Built

- **Formatter (`lib/whatsapp/formatter.ts`):**
  - Added `deposit_type?`, `deposit_value?`, `balance_due?` to `FormatterEstimate`.
  - Added `deposit` + `balanceDue` to `FormatterLabels`, filled for all three locales: en `Deposit`/`Balance Due`, pt `Entrada`/`Saldo Devedor`, es `Depósito`/`Saldo Pendiente` (mirrors EstimateDocument DOC_LABELS, phase 133).
  - Imported `deriveDepositDisplay` and appended, after the Total line, a conditional block emitting `Deposit: -<amount>` and `Balance Due: <amount>` only when `dep.showDeposit`. Locked order: Subtotal → Discount → Tax → Total → Deposit → Balance Due.
  - Reads PERSISTED `balance_due` (derives deposit = total − balance_due via the helper) — never recomputes from `deposit_value` (GUARD-03).

- **Selects feeding the formatter:**
  - `send-estimate.ts`: added `deposit_type, deposit_value, balance_due` to the estimate select (L47) that builds the FormatterEstimate.
  - `confirm-actions.ts`: added the three columns to the formatter select (`estimateResult`, L89) — the actual feed for `formatEstimateForWhatsApp`; also added them to the lighter `EstimateContext` select (L42) and its type for parity.

## Tests

- `tests/unit/whatsapp/formatter.test.ts`: 5 new cases (percent deposit, amount deposit reading persisted balance_due, pt labels, es labels, `none` → no lines). 14 existing cases unchanged and green.
- Result: 19/19 formatter tests pass. Full whatsapp suite: 219 passed, 28 todo, 0 failed.
- `npx tsc --noEmit`: no errors in any plan-owned file.

## Retrocompat

A legacy estimate (`deposit_type` `none`/null or `balance_due` null) → `deriveDepositDisplay` returns `showDeposit:false` → no extra lines → text byte-identical to pre-v4.11. Verified by the two no-deposit assertions plus the unchanged classic Subtotal/Tax/Total cases.

## Deviations from Plan

### [Rule 1 - Plan pointed at the wrong select in confirm-actions.ts]
- **Found during:** Task 2.
- **Issue:** The plan instructed adding the deposit columns to the `.select('total, currency_code, ...')` at L42 of `confirm-actions.ts`, describing it as the formatter feed. That select actually feeds `EstimateContext` (a lighter, agent-prompt summary render that does NOT call `formatEstimateForWhatsApp`). The real formatter input is the `estimateResult` select at L89 (`.select(\`id, share_token, total, subtotal, ...\`)`).
- **Fix:** Added `deposit_type, deposit_value, balance_due` to the L89 formatter select (load-bearing — without this the formatter would have received `undefined` and never rendered the lines). Also added the columns to the L42 select and widened the `EstimateContext` type, satisfying the plan's literal intent and the `balance_due` grep check, with no behavior change to the lighter render.
- **Files modified:** `lib/whatsapp/confirm-actions.ts`
- **Commit:** 83e52846

## Known Stubs

None. The deposit columns exist on the `estimates` table (added in 134-01) and the persisted `balance_due` drives the render end-to-end.

## Commits

- `a6f8d479` feat(134-04): emit Deposit + Balance Due in plain-text estimate formatter
- `83e52846` feat(134-04): add deposit columns to selects feeding the formatter

## Self-Check: PASSED

All modified files exist; both task commits present in git history.
