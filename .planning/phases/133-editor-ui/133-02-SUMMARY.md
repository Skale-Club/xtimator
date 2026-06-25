---
phase: 133-editor-ui
plan: 02
subsystem: editor-ui
tags: [editor, estimate, per-line, discount, taxable, mobile, reducer, guard-03]

# Dependency graph
requires:
  - phase: 133-editor-ui
    plan: 01
    provides: widened saveEstimate contract (per-item taxable/tax_category/discount/cost/markup_pct) routed through computeEstimateTotals
provides:
  - "EditorItem carries optional taxable/tax_category/discount/cost/markup_pct; UPDATE_ITEM handles 'discount'|'taxable'; recalculate subtracts line discount as a client preview"
  - "Desktop SortableDocumentItemRow exposes a per-line discount MoneyInput + a taxable Switch wired to UPDATE_ITEM"
  - "Mobile ItemCardMobile exposes a discount MoneyInput + taxable Switch, mobile-safe (44px target, numeric keypad, no 360px overflow)"
  - "stateToDocumentData + stateToSavePayload carry the five new per-item fields into the Wave-1 save payload"
affects: [133-03, editor-ui]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Per-line pricing controls dispatch UPDATE_ITEM with field 'discount'|'taxable' (coerced number / boolean in the reducer)"
    - "recalculate is an OPTIMISTIC client preview only (line total = round2(qty x unit_price) - discount); server (computeEstimateTotals) stays authoritative on save/reload (GUARD-03)"
    - "No-op defaults (taxable ?? true, discount ?? 0) at every read/render/save boundary keep an unedited item byte-identical"

key-files:
  created: []
  modified:
    - components/workspace/estimate/use-estimate-reducer.ts
    - components/workspace/estimate/estimate-editor.tsx
    - components/workspace/estimate/estimate-document.tsx
    - components/workspace/estimate/item-card-mobile.tsx

key-decisions:
  - "Edited the WIRED editor row SortableDocumentItemRow (inside estimate-document.tsx) + ItemCardMobile, NOT the legacy item-row.tsx (used only by the unrendered section-card path) — per the plan's discovery note"
  - "MoneyInput already sets inputMode='numeric' (calculator-style) which triggers the mobile numeric keypad; it does not expose an inputMode prop, so the discount field reuses MoneyInput rather than a raw decimal input for currency-consistent entry"
  - "Used the shadcn Switch (radix) for the taxable toggle on both surfaces; 44px tap target wrapper on mobile, aria-label = localized L.taxable on desktop"

patterns-established:
  - "Optimistic per-line preview math lives in the reducer; the action layer (Plan 01) remains the single GUARD-03 authority"

requirements-completed: [PUI-01]

# Metrics
duration: 4min
completed: 2026-06-25
---

# Phase 133 Plan 02: Editor per-line controls (Wave 2) Summary

**Per-line discount input + taxable toggle added to the desktop estimate row and the mobile card, threaded through the reducer, the optimistic preview recompute, and the save payload that reaches the Wave-1 server action.**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-06-25T13:30:05Z
- **Completed:** 2026-06-25T13:34:14Z
- **Tasks:** 3
- **Files modified:** 4

## Accomplishments
- `EditorItem` widened with optional `taxable`/`tax_category`/`discount`/`cost`/`markup_pct`; the `UPDATE_ITEM` field union + handler now accept `'discount'` (coerced to a number, default 0) and `'taxable'` (coerced to boolean). `isManuallyEdited` stays flipped only on `unit_price` — discount/taxable are not price-source overrides.
- `recalculate` line total becomes `round2(qty x unit_price) - (discount ?? 0)`, mirroring the engine's `lineNet`, with an explicit comment that it is a client preview only and the server corrects non-taxable lines on save/reload (GUARD-03).
- `initState` reads the five fields off the server row with no-op defaults (cast like the existing `estimate_date` pattern); `ADD_ITEM`/`ADD_SECTION`/`APPLY_REFINEMENT` seed `taxable: true, discount: 0`; `APPLY_PRICE_BOOK_ITEM` preserves existing values via its leading `...i` spread.
- Desktop `SortableDocumentItemRow` gained a discount `MoneyInput` cell + a taxable `Switch` cell between unit-price and total, with matching `<th>` headers and `lineDiscount`/`taxable` labels in en/pt/es.
- Mobile `ItemCardMobile` gained a 2-column discount + taxable row below the qty/unit/price grid, mobile-safe (numeric keypad via MoneyInput, 44px tap target on the toggle, `grid gap-2` so it does not overflow at 360px).
- Both converters (`stateToDocumentData` + `stateToSavePayload`) carry all five fields so nothing is dropped on save/refine/price-book paths.

## Task Commits

1. **Task 1: Widen reducer + converters** - `89773722` (feat)
2. **Task 2: Desktop row discount + taxable** - `5e61141a` (feat)
3. **Task 3: Mobile card discount + taxable** - `614fac4a` (feat)

**Plan metadata:** committed separately with SUMMARY/STATE/ROADMAP/REQUIREMENTS.

## Files Created/Modified
- `components/workspace/estimate/use-estimate-reducer.ts` - EditorItem fields, UPDATE_ITEM union + coercion handler, recalculate line-discount subtraction, initState defaults, ADD/REFINEMENT seeding.
- `components/workspace/estimate/estimate-editor.tsx` - stateToDocumentData + stateToSavePayload carry the five new per-item fields.
- `components/workspace/estimate/estimate-document.tsx` - DocumentItem widened; SortableDocumentItemRow discount MoneyInput + taxable Switch cells; editable header columns; DocLabels + DOC_LABELS (en/pt/es) lineDiscount/taxable.
- `components/workspace/estimate/item-card-mobile.tsx` - onUpdate union widened; discount + taxable row added with mobile-safe inputs.

## Decisions Made
- Edited the genuinely-wired editor row (`SortableDocumentItemRow` in estimate-document.tsx) and `ItemCardMobile`, not the legacy `item-row.tsx`, per the plan's discovery note. The legacy section-card path is not rendered by the editor.
- Reused `MoneyInput` for the discount field on both surfaces for currency-consistent entry; it already emits a numeric inputMode for the mobile keypad (it does not expose an inputMode prop to override to "decimal").
- Used the shadcn `Switch` for the taxable toggle; desktop carries a localized `aria-label`, mobile wraps it in a `min-h-[44px]` flex container for the tap target.

## Deviations from Plan

None - plan executed exactly as written (including its documented target-file correction to SortableDocumentItemRow + ItemCardMobile).

## Issues Encountered
None. tsc clean on all four touched files; the full `tests/unit/estimate` suite (31 files / 197 tests) stayed green after each task.

## Manual UI Verification Note
This was a headless run; live browser/mobile-viewport verification (iOS Safari + Android Chrome, 360px width, 44px tap targets) was NOT performed here. The controls follow the surrounding shadcn/Tailwind idiom exactly (same `min-h-[44px]` rule as the existing remove button, same `grid gap-2` layout, MoneyInput numeric keypad), and the reducer/converter wiring is covered by the existing estimate test suite + tsc. A quick manual pass on a 360px mobile viewport is recommended before shipping to confirm the second row does not wrap awkwardly.

## Self-Check: PASSED

- FOUND: components/workspace/estimate/use-estimate-reducer.ts
- FOUND: components/workspace/estimate/estimate-editor.tsx
- FOUND: components/workspace/estimate/estimate-document.tsx
- FOUND: components/workspace/estimate/item-card-mobile.tsx
- FOUND commit: 89773722 (feat)
- FOUND commit: 5e61141a (feat)
- FOUND commit: 614fac4a (feat)

---
*Phase: 133-editor-ui*
*Completed: 2026-06-25*
