---
phase: 134-pdf-text-totals
verified: 2026-06-25T10:15:00Z
status: passed
score: 5/5 must-haves verified
---

# Phase 134: PDF + Plain-Text Totals Verification Report

**Phase Goal:** Render the v4.11 totals structure (Subtotal → Discount → Tax → Total → Deposit → Balance Due) across all 3 output channels (PDF, public share view, plain-text/WhatsApp/MCP), reading PERSISTED server values through one shared seam (GUARD-03 — no recompute), with legacy estimates byte-identical. (PUI-02)
**Verified:** 2026-06-25T10:15:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| #   | Truth | Status | Evidence |
| --- | ----- | ------ | -------- |
| 1   | A single shared seam (`deriveDepositDisplay`) reads PERSISTED balance_due/deposit_type/total and returns {showDeposit, depositAmount, balanceDue}, never recomputing (GUARD-03) | ✓ VERIFIED | `lib/estimate/deposit-display.ts:28-41` — `depositAmount = round2(total − balance_due)`, trusts `row.balance_due`. Test 5 locks no-recompute. Estimate type widened in `lib/queries/estimate.ts:34-36`. |
| 2   | PDF surface renders the ordered block via the shared helper, reading persisted totals | ✓ VERIFIED | `components/pdf/estimate-pdf.tsx:460` calls `deriveDepositDisplay(estimate)`; rows at L686 (Subtotal) → L693 (Discount if >0) → L707 (Tax if >0) → L718 (Total) → L733 (Deposit, gated `dep.showDeposit`) → L740 (Balance Due). |
| 3   | Public share VIEW branch renders the ordered block via the helper; phase-133 edit UI untouched (fence) | ✓ VERIFIED | `estimate-document.tsx:959` computes `dep`; VIEW branch L1177-1183 uses `dep.showDeposit`/`dep.depositAmount`, Balance Due L1186-1193 uses `dep.balanceDue`. Edit branch gated `isEditable && dispatch` (L1110), unchanged. Test 4 locks the fence (combobox present). |
| 4   | Plain-text formatter emits Deposit + Balance Due via the helper; caller selects carry the deposit columns | ✓ VERIFIED | `lib/whatsapp/formatter.ts:180-190` calls `deriveDepositDisplay`, emits lines gated `dep.showDeposit`. `send-estimate.ts:49` and `confirm-actions.ts:45,94` selects include `deposit_type, deposit_value, balance_due`. L94 estimateResult feeds `formatEstimateForWhatsApp` (L194). |
| 5   | i18n Deposit / Balance Due labels in en/pt/es across all 3 surfaces; legacy renders byte-identical (retrocompat) | ✓ VERIFIED | PDF L66-122, share view L81-171, formatter L76-108 all carry en `Deposit`/`Balance Due`, pt `Entrada`/`Saldo Devedor`, es `Depósito`/`Saldo Pendiente`. Retrocompat short-circuit (`deposit_type none/null OR balance_due null → showDeposit:false`) verified in each surface's tests. |

**Score:** 5/5 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `lib/estimate/deposit-display.ts` | Shared read seam | ✓ VERIFIED | 41 lines, exports `deriveDepositDisplay` + interfaces; reads persisted, no recompute |
| `lib/queries/estimate.ts` | deposit fields on Estimate type | ✓ VERIFIED | `deposit_type`/`deposit_value`/`balance_due` at L34-36; queries use `select('*')` so values flow |
| `components/pdf/estimate-pdf.tsx` | PDF deposit/balance rows | ✓ VERIFIED | Imports helper L15, calls L460, ordered rows L733/L740 |
| `components/workspace/estimate/estimate-document.tsx` | View-mode deposit rows | ✓ VERIFIED | Imports L48, computes L959, VIEW rows L1177/L1186; edit fence intact |
| `lib/whatsapp/formatter.ts` | Plain-text deposit lines | ✓ VERIFIED | Imports L13, helper L180, lines L187-188 |
| `lib/whatsapp/send-estimate.ts` | deposit columns in select | ✓ VERIFIED | L49 select adds the three columns |
| `lib/whatsapp/confirm-actions.ts` | deposit columns in formatter select | ✓ VERIFIED | L94 estimateResult (load-bearing) + L45 (parity) carry the columns |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | -- | --- | ------ | ------- |
| deposit-display.ts | estimate.ts (Estimate type) | reads deposit_type/balance_due | ✓ WIRED | Helper input matches widened type fields |
| estimate-pdf.tsx | deriveDepositDisplay | `dep = deriveDepositDisplay(estimate)` | ✓ WIRED | Called, both rows render from `dep` |
| estimate-document.tsx (VIEW) | deriveDepositDisplay | `dep` from persisted total/balance_due | ✓ WIRED | VIEW branch reads `dep.*`; edit branch untouched |
| formatter.ts | deriveDepositDisplay | persisted balance_due → lines | ✓ WIRED | Lines gated on `dep.showDeposit` |
| confirm-actions.ts | formatter | estimateResult select → FormatterEstimate | ✓ WIRED | L94 select feeds `formatEstimateForWhatsApp` L194 |
| send-estimate.ts | formatter | select → FormatterEstimate | ✓ WIRED | L49 select carries deposit columns |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| -------- | ------------- | ------ | ------------------ | ------ |
| PDF / share / formatter | `dep` (showDeposit/depositAmount/balanceDue) | persisted `estimates.balance_due`/`deposit_type`/`total` (phase-129 columns, phase-132 DEP-01 server compute) | Yes — read via `select('*')` / explicit selects with deposit columns | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| Helper retrocompat + active + no-recompute | vitest deposit-display.test.ts | 5 passed | ✓ PASS |
| PDF ordered totals (legacy + deposit + persisted-mismatch) | vitest estimate-pdf-totals.test.tsx | 3 passed | ✓ PASS |
| Share VIEW totals + edit-mode fence | vitest document-totals-view.test.tsx | 4 passed | ✓ PASS |
| Formatter deposit lines + 14 legacy tests green | vitest formatter.test.ts | 19 passed (14 legacy + 5 new) | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ----------- | ----------- | ------ | -------- |
| PUI-02 | 134-01/02/03/04 | PDF + plain-text render the new totals structure across all 3 channels | ✓ SATISFIED | All 3 surfaces render the ordered block via the shared seam; 31 targeted tests green |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| estimate-document.tsx | 98-99 etc. | "placeholder" string | ℹ️ Info | Legitimate i18n input-placeholder labels, unrelated to deposit work — not a stub |

No blocker or warning anti-patterns in the phase code.

### Full Suite Result

`npx vitest run` → **1 failed | 2429 passed | 2 skipped | 33 todo (2465 tests, 356 files)**.

The single failure is `tests/unit/mcp-route-contract.test.ts > GET returns 405` — the KNOWN non-blocking parallel-only flake (timeout at 5000ms under parallel load). Confirmed passing in isolation (8/8). Per the verification contract, since it is the ONLY failure, the suite is treated as GREEN. No other failures.

### Human Verification Required

None. All checks verified programmatically (code inspection + tests). Visual PDF rendering and live share-link appearance are covered structurally by element-tree-walk tests.

### Gaps Summary

No gaps. The shared `deriveDepositDisplay` seam reads persisted server values (GUARD-03 honored, Test 5 locks no-recompute) and is consumed by all three surfaces in the locked order Subtotal → Discount (if >0) → Tax (if >0) → Total → Deposit (if set) → Balance Due (if set). i18n labels present in en/pt/es across all surfaces. Retrocompat short-circuit yields byte-identical legacy renders, and the 14 existing formatter tests remain green. The phase-133 edit-mode UI is fenced and untouched. Caller selects (send-estimate L49, confirm-actions L94/L45) carry the deposit columns so the formatter receives real persisted data.

---

_Verified: 2026-06-25T10:15:00Z_
_Verifier: Claude (gsd-verifier)_
