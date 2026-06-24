---
phase: 105-price-source-researched-threading
plan: 02
subsystem: ui
tags: [react, typescript, lucide, vitest, estimate-editor, price-source]

# Dependency graph
requires:
  - phase: 105-price-source-researched-threading (Plan 01)
    provides: "DB CHECK constraint widened to price_book|ai_estimate|researched + lib/ai schema/types threading for 'researched'"
provides:
  - "Dormant 'Researched' price badge (third variant, Search icon) in the estimate editor — desktop ItemRow + mobile ItemCardMobile"
  - "Editor-layer price_source unions (EditorItem, RefinementPayload item shape, lib/actions/estimate.ts SaveItemInput) widened to accept 'researched'"
  - "price-badge test coverage for the researched variant + Edited-precedence-over-researched"
affects: [108-orchestrator-integration, researched-pricing-agent, estimate-editor]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Dormant UI shipping: render branch + type union widened ahead of any production write (Phase 108 will start tagging items 'researched')"

key-files:
  created: []
  modified:
    - components/workspace/estimate/item-row.tsx
    - components/workspace/estimate/item-card-mobile.tsx
    - components/workspace/estimate/use-estimate-reducer.ts
    - lib/actions/estimate.ts
    - tests/unit/estimate/price-badge.test.tsx

key-decisions:
  - "Chose lucide Search icon + variant='outline' for the 'Researched' badge (distinct from CheckCircle2/Zap), matching existing text-xs gap-1 badge conventions"
  - "Edited rule confirmed, not re-implemented: isManuallyEdited stays the FIRST ternary branch so an edited researched item still shows 'Edited'"

patterns-established:
  - "Dormant-badge pattern: third price-source variant rendered behind a value that no production code writes yet"

requirements-completed: [RPRICE-02, RPRICE-03]

# Metrics
duration: 6min
completed: 2026-06-24
---

# Phase 105 Plan 02: Researched Price Badge + Editor Union Threading Summary

**Shipped a dormant 'Researched' price badge (Search icon, third variant) in both the desktop ItemRow and mobile ItemCardMobile, and widened the editor-layer price_source type unions to accept 'researched' — with the editor unit suite green and nothing tagging items 'researched' in production.**

## Performance

- **Duration:** ~6 min
- **Started:** 2026-06-24T23:13Z
- **Completed:** 2026-06-24T23:15Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Widened three editor-layer `price_source` unions to include `'researched'`: `EditorItem.price_source` and the `RefinementPayload` item shape (`use-estimate-reducer.ts`), and `SaveItemInput.price_source` (`lib/actions/estimate.ts`) — with `| null` preserved everywhere.
- Added a distinct dormant "Researched" badge (lucide `Search`, `variant="outline"`, `text-xs gap-1`) as a third variant after the `ai_estimate` branch in both `ItemRow` and `ItemCardMobile`.
- Confirmed (not re-implemented) the Edited rule: `isManuallyEdited` remains the first branch in both ternaries, so an edited researched item shows "Edited"; the save rule `isManuallyEdited ? null : (item.price_source ?? null)` was left byte-identical (grep count unchanged at 3).
- Extended `price-badge.test.tsx` with a researched-renders case and an Edited-beats-researched precedence case; full file 8/8 green.

## Task Commits

Each task was committed atomically:

1. **Task 1: Widen the editor price_source unions** - `61ea041` (feat)
2. **Task 2: Add the dormant 'Researched' badge to ItemRow + ItemCardMobile, with a test** - `7ad6f2a` (feat)

## Files Created/Modified
- `components/workspace/estimate/use-estimate-reducer.ts` - `EditorItem.price_source` + `RefinementPayload` item `price_source` widened to include `'researched'`
- `lib/actions/estimate.ts` - `SaveItemInput.price_source` widened to include `'researched'`; save rule unchanged
- `components/workspace/estimate/item-row.tsx` - desktop "Researched" badge branch (Search icon) + import
- `components/workspace/estimate/item-card-mobile.tsx` - mobile "Researched" badge branch (Search icon) + import
- `tests/unit/estimate/price-badge.test.tsx` - widened `makeItem` param type + 2 new cases (researched render, Edited precedence)

## Decisions Made
- Icon/variant: lucide `Search` with `variant="outline"` + `text-xs gap-1`, imported in BOTH components, chosen to be visually distinct from `CheckCircle2` (Price book) and `Zap` (AI estimate) while matching existing badge conventions.
- Edited precedence confirmed by keeping `isManuallyEdited` first in both ternaries and leaving the save-rule null path untouched — covers researched items for free.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None. The verification grep `grep -rn "= 'researched'\|price_source: 'researched'"` returns the two new badge-branch comparisons (`=== 'researched'`, matched because `= 'researched'` is a substring of `== 'researched'`) plus the Plan 105-01 `lib/ai/schema.ts` preprocess that *preserves* (does not assign) a researched value. None of these tag an estimate item `'researched'` — the dormant invariant holds: no production code writes the value.

## Known Stubs
None introduced. The "Researched" badge is intentionally dormant per the phase boundary (CONTEXT.md): it renders only when `price_source === 'researched'`, and no production path produces that value until Phase 108. This is documented, intentional, and tracked — not a stub blocking the plan goal (the plan's goal IS the dormant threading).

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- The editor UI surface for `'researched'` is fully wired (badge + type unions). Phase 108 only needs to start *writing* `'researched'` onto items with no price-book match; the badge will then render automatically with zero further editor changes.
- Dormant invariant verified: editor unit suite green, no production write tags items `'researched'`.

## Self-Check: PASSED

All 5 modified files present; both task commits (`61ea041`, `7ad6f2a`) present in git history.

---
*Phase: 105-price-source-researched-threading*
*Completed: 2026-06-24*
