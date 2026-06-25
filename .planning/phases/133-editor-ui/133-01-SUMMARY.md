---
phase: 133-editor-ui
plan: 01
subsystem: api
tags: [server-action, estimate, pricing, tax, discount, deposit, markup, vitest, guard-03]

# Dependency graph
requires:
  - phase: 129-schema-foundation
    provides: advanced-pricing columns (estimate_items.taxable/tax_category/discount/cost/markup_pct, estimates.deposit_type/deposit_value/balance_due) + computeEstimateTotals retrocompat lock
  - phase: 130-per-item-taxability
    provides: per-category tax in computeEstimateTotals
  - phase: 131-discounts
    provides: line + global discount in computeEstimateTotals
  - phase: 132-deposit-markup
    provides: deposit/balance_due + cost/markup unit_price derivation in computeEstimateTotals
provides:
  - "Widened saveEstimate server-action contract accepting per-item taxable/tax_category/discount/cost/markup_pct and estimate deposit_type/deposit_value"
  - "saveEstimate routed through the SHARED computeEstimateTotals engine (single GUARD-03 math authority)"
  - "Persistence of new per-item columns + estimate deposit/balance_due columns"
affects: [133-02, 133-03, editor-ui, item-row, item-card-mobile]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Server action delegates ALL totals math to lib/estimate/compute-totals (no inline math) — never-trust-client"
    - "Editor 'percentage'|'fixed' discount_type mapped to engine 'percent'|'amount'|'none' at the action boundary"
    - "New pricing fields optional with no-op defaults (taxable->true, discount->0, deposit->none) for byte-identical retrocompat"

key-files:
  created:
    - tests/unit/actions/estimate-save-pricing-fields.test.ts
  modified:
    - lib/actions/estimate.ts

key-decisions:
  - "Left taxConfig undefined in the saveEstimate engine call (flat retrocompat branch) — the editor does not surface per-category tax config this phase"
  - "Re-attach engine-resolved unit_price/total back onto the original item shape so persistence keeps id/sort_order/price_source/isManuallyEdited intact"

patterns-established:
  - "Action-layer GUARD-03: a wrong client-sent total is discarded; persisted totals come solely from computeEstimateTotals"

requirements-completed: [PUI-01]

# Metrics
duration: 4min
completed: 2026-06-25
---

# Phase 133 Plan 01: Editor server-action contract (Wave 1) Summary

**saveEstimate widened to accept + persist the v4.11 advanced-pricing fields and routed through the shared computeEstimateTotals engine so the server is the single math authority (GUARD-03).**

## Performance

- **Duration:** 4 min
- **Started:** 2026-06-25T13:23:24Z
- **Completed:** 2026-06-25T13:27:04Z
- **Tasks:** 3
- **Files modified:** 2 (1 created, 1 modified)

## Accomplishments
- `SaveItemInput` now carries optional `taxable`/`tax_category`/`discount`/`cost`/`markup_pct`; `SaveEstimateInput` carries optional `deposit_type`/`deposit_value`.
- The hand-rolled inline subtotal/discount/tax/total math (old L88-115) is replaced by a single `computeEstimateTotals` call — the editor's `'percentage'|'fixed'` discount_type is mapped to the engine's `'percent'|'amount'|'none'`.
- All three per-item write paths (new-section insert, new-item insert, existing-item update) persist the five new columns; the estimate `.update` persists `deposit_type`/`deposit_value`/`balance_due`.
- Behavioral test locks GUARD-03 (wrong client total ignored), new-field acceptance/persistence, and byte-identical retrocompat.

## Task Commits

1. **Task 1: RED — GUARD-03 + retrocompat test** - `6c99b3e9` (test)
2. **Task 2: GREEN — widen + route through engine + persist** - `5e34b31a` (feat)
3. **Task 3: Regression + type-check** - no code change (verification-only; Task 2's edit already satisfied it)

**Plan metadata:** committed separately with SUMMARY/STATE/ROADMAP/REQUIREMENTS.

## Files Created/Modified
- `tests/unit/actions/estimate-save-pricing-fields.test.ts` - Behavioral test: GUARD-03 + new-field accept/persist + retrocompat, mocking the supabase client chain.
- `lib/actions/estimate.ts` - Widened input types, replaced inline math with `computeEstimateTotals`, persisted the new per-item + deposit columns.

## Decisions Made
- `taxConfig` left undefined in the action's engine call (flat retrocompat branch) — per-category tax config is not surfaced by the editor this phase, matching today's flat behavior.
- Engine-resolved `unit_price`/`total` are re-attached onto the original item objects so the persistence paths keep `id`/`sort_order`/`price_source`/`isManuallyEdited` byte-unchanged.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None. Case A of the RED test passed immediately (the old inline math already produced the correct 1000/87.5/1087.5 golden); the RED state came correctly from the new-field/balance_due assertions, which is the intended Nyquist signal for the widening.

## User Setup Required
None - no external service configuration required. (The advanced-pricing columns were landed by the Phase 129 migration; deployment remains CI->GHCR->Coolify.)

## Next Phase Readiness
- The server contract Wave-2 editor UI (133-02 / 133-03) saves into is ready: the action accepts per-line discount/taxable + global discount + deposit inputs and returns server-authoritative totals.
- No UI files were touched (Wave 2 owns `item-row.tsx` / `item-card-mobile.tsx`).

## Self-Check: PASSED

- FOUND: tests/unit/actions/estimate-save-pricing-fields.test.ts
- FOUND: lib/actions/estimate.ts
- FOUND: .planning/phases/133-editor-ui/133-01-SUMMARY.md
- FOUND commit: 6c99b3e9 (test)
- FOUND commit: 5e34b31a (feat)

---
*Phase: 133-editor-ui*
*Completed: 2026-06-25*
