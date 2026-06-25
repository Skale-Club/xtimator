---
phase: 133-editor-ui
verified: 2026-06-25T09:50:00Z
status: passed
score: 6/6 must-haves verified
human_verification:
  - test: "Open the estimate editor on a 360px mobile viewport (iOS Safari + Android Chrome)"
    expected: "Per-line discount input + taxable toggle render below the qty/unit/price grid without wrapping awkwardly; deposit Select + value input + Balance Due line fit inside the max-w-xs totals panel; tap targets feel >=44px; discount field opens a numeric keypad"
    why_human: "Headless run cannot render a real mobile browser; layout/tap-target/keyboard feel is visual + device-specific"
---

# Phase 133: Editor UI Verification Report

**Phase Goal:** A business owner can see and edit the new pricing fields directly in the estimate editor — per-line discount and taxable, plus global discount and deposit controls — on both desktop and mobile, with server actions accepting the new fields; the displayed totals reflect the server engine, never client-side arithmetic.
**Verified:** 2026-06-25T09:50:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (from ROADMAP Success Criteria + goal_backward_checks)

| #   | Truth                                                                                                          | Status     | Evidence                                                                                                                              |
| --- | ------------------------------------------------------------------------------------------------------------ | ---------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Server action `saveEstimate` ACCEPTS per-item taxable/tax_category/discount/cost/markup_pct + deposit fields | ✓ VERIFIED | `SaveItemInput` L54-59, `SaveEstimateInput` L82-84 in lib/actions/estimate.ts carry all optional fields                              |
| 2   | Server RECOMPUTES totals via computeEstimateTotals; wrong client total discarded (GUARD-03)                   | ✓ VERIFIED | L108-133: all totals derived from `engineResult`; estimate UPDATE (L151-174) writes engine values; test Case A asserts 999999 ignored |
| 3   | New columns persisted across all 3 per-item write paths + deposit columns on estimate                        | ✓ VERIFIED | Insert L225-230, new-item insert L271-275, update L295-299 all persist 5 cols; estimate update persists deposit_type/value/balance_due |
| 4   | Desktop row + mobile card gained per-line discount input + taxable toggle                                    | ✓ VERIFIED | estimate-document.tsx SortableDocumentItemRow L593-625 (MoneyInput + Switch); item-card-mobile.tsx L118-137 (MoneyInput + Switch)     |
| 5   | Totals panel gained deposit controls (none/percent/amount) + Balance Due line; global discount intact        | ✓ VERIFIED | estimate-document.tsx L955-1180: deposit Select + UPDATE_DEPOSIT dispatch + Balance Due line; global discount block unchanged         |
| 6   | i18n labels (en/pt/es) added; retrocompat no-op defaults; reducer preview optimistic-only                    | ✓ VERIFIED | DOC_LABELS lineDiscount/taxable/deposit*/balanceDue across 3 locales; `?? true`/`?? 0`/`?? 'none'` defaults; recalculate comment L121 |

**Score:** 6/6 truths verified

### Required Artifacts

| Artifact                                                        | Expected                                              | Status     | Details                                                                                  |
| -------------------------------------------------------------- | ----------------------------------------------------- | ---------- | ---------------------------------------------------------------------------------------- |
| `lib/actions/estimate.ts`                                       | Widened contract + engine recompute + persist columns | ✓ VERIFIED | Imports computeEstimateTotals (L11); all totals from engine; 5 per-item + 3 deposit cols  |
| `tests/unit/actions/estimate-save-pricing-fields.test.ts`      | GUARD-03 + accept/persist + retrocompat behavioral    | ✓ VERIFIED | 3 behavioral cases mocking supabase chain; capture + assert payloads; green              |
| `components/workspace/estimate/use-estimate-reducer.ts`        | EditorItem fields + UPDATE_ITEM/UPDATE_DEPOSIT + preview | ✓ VERIFIED | EditorItem L22-24, UPDATE_ITEM union L76, UPDATE_DEPOSIT L85, recalculate L116-154        |
| `components/workspace/estimate/estimate-document.tsx`          | Desktop row controls + totals panel deposit + labels  | ✓ VERIFIED | Row L593-625, deposit panel L955-1180, DOC_LABELS en/pt/es, header col L800              |
| `components/workspace/estimate/item-card-mobile.tsx`           | Mobile discount input + taxable toggle, mobile-safe   | ✓ VERIFIED | L118-137: MoneyInput + Switch in min-h-[44px] wrapper; onUpdate union widened L22         |
| `components/workspace/estimate/estimate-editor.tsx`            | Converters carry all fields into doc-data + save      | ✓ VERIFIED | stateToDocumentData L73-77 + L50-51; stateToSavePayload L100-101 + L120-124               |

### Key Link Verification

| From                                  | To                          | Via                                              | Status   | Details                                                            |
| ------------------------------------- | --------------------------- | ------------------------------------------------ | -------- | ----------------------------------------------------------------- |
| lib/actions/estimate.ts               | lib/estimate/compute-totals | `import { computeEstimateTotals }`               | ✓ WIRED  | L11 import; L108 call; all persisted totals from result           |
| Desktop SortableDocumentItemRow       | reducer UPDATE_ITEM         | dispatch field 'discount'/'taxable'              | ✓ WIRED  | L599-605, L615-621                                                 |
| Mobile ItemCardMobile                 | reducer UPDATE_ITEM         | onUpdate → dispatch UPDATE_ITEM                  | ✓ WIRED  | item-card L127/L136 → estimate-document L740-751 dispatch          |
| Totals panel                          | reducer UPDATE_DEPOSIT      | dispatch UPDATE_DEPOSIT                          | ✓ WIRED  | L1109-1150                                                         |
| estimate-editor stateToSavePayload    | saveEstimate (Plan 01)      | payload includes discount/taxable + deposit_*   | ✓ WIRED  | L100-101, L120-124 → consumed by SaveEstimateInput                 |

### Data-Flow Trace (Level 4)

| Artifact                | Data Variable             | Source                                  | Produces Real Data | Status     |
| ----------------------- | ------------------------- | --------------------------------------- | ------------------ | ---------- |
| saveEstimate persisted totals | subtotal/tax/total/balance_due | computeEstimateTotals(engineResult) | Yes (engine math)  | ✓ FLOWING  |
| editor totals panel     | data.deposit/balance_due  | reducer recalculate (optimistic preview) | Yes (preview)     | ✓ FLOWING  |
| per-item persisted cols | taxable/discount/cost/...  | save payload ← reducer EditorItem       | Yes                | ✓ FLOWING  |

Note: the reducer preview is intentionally optimistic (GUARD-03); the server recompute is the persisted authority. This is a design contract, not a disconnect.

### Behavioral Spot-Checks

| Behavior                                        | Command                                                              | Result                  | Status |
| ----------------------------------------------- | ------------------------------------------------------------------- | ----------------------- | ------ |
| GUARD-03 + persist + retrocompat (server)       | vitest run estimate-save-pricing-fields.test.ts (in full suite)     | 3/3 cases pass          | ✓ PASS |
| Estimate engine + editor suites no regression   | full `npx vitest run`                                               | 2411 passed             | ✓ PASS |
| Known flake passes isolated                     | vitest run mcp-route-contract.test.ts                              | 8/8 pass                | ✓ PASS |
| tsc-mentioned tests are real-pass               | vitest run refine-shared-prompt.test.ts markup-totals.test.ts      | 9/9 pass                | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan         | Description                                                                                              | Status      | Evidence                                                          |
| ----------- | ------------------- | ------------------------------------------------------------------------------------------------------- | ----------- | ----------------------------------------------------------------- |
| PUI-01      | 133-01/02/03        | Editor gains per-line discount/taxable + global discount + deposit controls; server actions accept fields | ✓ SATISFIED | All 6 truths + 6 artifacts + 5 key links verified; tests green    |

No orphaned requirements for Phase 133.

### Anti-Patterns Found

| File                  | Line | Pattern                                  | Severity | Impact                                                                       |
| --------------------- | ---- | ---------------------------------------- | -------- | ---------------------------------------------------------------------------- |
| use-estimate-reducer  | 116+ | Optimistic preview math vs server engine | ℹ️ Info  | Intentional GUARD-03 design — server recompute is authoritative on save/reload |

No blocker or warning anti-patterns. The `?? true`/`?? 0`/`?? 'none'` defaults are retrocompat no-ops, not stubs (server-fed values overwrite them on reload).

### Human Verification Required

#### 1. Mobile viewport rendering (360px, iOS Safari + Android Chrome)

**Test:** Open the estimate editor on a 360px-wide mobile browser and edit a line.
**Expected:** Per-line discount input + taxable toggle render below the qty/unit/price grid without awkward wrapping; deposit Select + value input + Balance Due line fit inside the max-w-xs totals panel; tap targets feel >=44px; the discount field opens a numeric keypad.
**Why human:** Headless run cannot render a real mobile browser; layout/tap-target/keyboard behavior is visual and device-specific. Both UI summaries explicitly flagged this as recommended pre-release. Code-level checks (min-h-[44px] wrappers, MoneyInput numeric inputMode, grid gap-2, max-w-xs) all pass.

### Test Suite Result

`npx vitest run`: **Test Files 1 failed | 349 passed | 3 skipped (353); Tests 1 failed | 2411 passed | 2 skipped | 33 todo (2447)**

- The single failure is `tests/unit/mcp-route-contract.test.ts > GET returns 405` — the KNOWN parallel-only flake (timeout under parallel load). Confirmed PASSING in isolation (8/8). Treated as green per phase instructions.
- The two summary-mentioned items (`refine-shared-prompt.test.ts`, `markup-totals.test.ts`) are **tsc-only** issues (es2018 regex flag target; ComputeTotalsSection shape mismatch in a test) — confirmed they PASS as tests (9/9 in isolation). They are pre-existing, not introduced by this phase, and are NOT runtime test failures.

### Gaps Summary

No gaps. All 6 observable truths are VERIFIED at the code level: the server action accepts and persists the new fields and recomputes all totals through the shared engine (GUARD-03 locked by a behavioral test); the desktop row and mobile card both expose per-line discount + taxable controls wired to the reducer; the totals panel exposes deposit controls (none/percent/amount) + a Balance Due line; converters thread everything into the save payload; i18n labels exist in en/pt/es; retrocompat no-op defaults are applied at every read/render/save boundary. The full suite is green modulo the documented parallel-only flake. One item (live mobile-viewport rendering) is routed to human verification because it cannot be confirmed headlessly — the code-level mobile checks all pass.

---

_Verified: 2026-06-25T09:50:00Z_
_Verifier: Claude (gsd-verifier)_
