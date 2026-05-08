---
phase: 23-estimate-editor-price-badges
plan: "02"
subsystem: estimate-editor
tags: [badge-rendering, price-source, persistence, tdd, wave-1]
dependency_graph:
  requires: [23-01]
  provides: []
  affects:
    - components/workspace/estimate/item-row.tsx
    - components/workspace/estimate/section-card.tsx
    - components/workspace/estimate/estimate-editor.tsx
    - lib/actions/estimate.ts
    - tests/unit/estimate/price-badge.test.tsx
tech_stack:
  added: []
  patterns: [Badge component reuse, shadcn/ui variants, TDD Wave-1 GREEN, isManuallyEdited priority check]
key_files:
  created: []
  modified:
    - components/workspace/estimate/item-row.tsx
    - components/workspace/estimate/section-card.tsx
    - components/workspace/estimate/estimate-editor.tsx
    - lib/actions/estimate.ts
    - tests/unit/estimate/price-badge.test.tsx
decisions:
  - isManuallyEdited checked first in badge JSX — Edited displaces price_source badge regardless of value (D-10)
  - Badge variants: secondary for price_book (filled look), outline for ai_estimate and Edited (muted/neutral)
  - Icons via [&>svg]:size-3 in Badge cva — className h-3 w-3 on icons is belt-and-suspenders but harmless
  - stateToSavePayload passes price_source and isManuallyEdited through to server action; server action applies nullification rule
  - Static ES module imports used in test file (not require()) — vitest alias resolution requires top-level imports
metrics:
  duration: 12min
  completed_date: "2026-05-08"
  tasks_completed: 2
  files_modified: 5
---

# Phase 23 Plan 02: Badge Rendering + price_source Persistence Summary

**One-liner:** Price-origin badges rendered inline in ItemRow (Price book/AI estimate/Edited) with correct DB nullification on manual override — 6 RED stubs turned GREEN, closing Phase 23.

## What Was Built

### Task 1: Badge td in item-row.tsx + matching th in section-card.tsx

Added a new `<td className="py-1.5 px-1 w-28">` column to `ItemRow` between the unit_price td and total td. The badge JSX uses a priority chain:

1. `item.isManuallyEdited` → `<Badge variant="outline">Edited</Badge>` (no icon — signals user action, not origin)
2. `item.price_source === 'price_book'` → `<Badge variant="secondary"><CheckCircle2 />Price book</Badge>`
3. `item.price_source === 'ai_estimate'` → `<Badge variant="outline"><Zap />AI estimate</Badge>`
4. `null` → renders `null` (no badge, no error — pre-v1.3 estimates)

Added matching empty `<th className="py-2 px-1 w-28" />` in `section-card.tsx` thead after Unit Price th, bringing column count to 8.

Imports merged: `CheckCircle2` and `Zap` added to the existing lucide-react import. `Badge` imported from `@/components/ui/badge`.

### Task 2: price_source persistence + 6 stubs GREEN

**estimate-editor.tsx** — `stateToSavePayload` now maps `price_source: i.price_source ?? null` and `isManuallyEdited: i.isManuallyEdited` from each `EditorItem` into the save payload.

**lib/actions/estimate.ts** — `SaveItemInput` interface extended with `price_source` and `isManuallyEdited`. The rule `item.isManuallyEdited ? null : (item.price_source ?? null)` applied to all 3 DB write paths:
- Path A: `itemRows` array for new items in new sections
- Path B: `.insert({...})` for new items in existing sections
- Path C: `.update({...})` for existing items in existing sections

**tests/unit/estimate/price-badge.test.tsx** — All 6 stubs replaced with real implementations:
- 4 badge rendering tests using `@testing-library/react` render + `screen.getByText` / `queryByText`
- 1 reducer test using `renderHook` + `act` dispatching `UPDATE_ITEM` for `unit_price` field
- 1 save logic test verifying the `resolvePriceSource` rule (pure function mirror of DB write logic)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Static imports used instead of dynamic require() in test file**
- **Found during:** Task 2 (first test run)
- **Issue:** Plan suggested `const { ItemRow } = require('@/components/workspace/estimate/item-row')` inside `it()` bodies. Vitest's module alias resolution (`@/` path) only works at ES module import time, not with CommonJS `require()` inside function bodies.
- **Fix:** Switched to top-level static ES module imports: `import { ItemRow } from '@/components/workspace/estimate/item-row'` and `import { useEstimateReducer } from '@/components/workspace/estimate/use-estimate-reducer'`.
- **Files modified:** `tests/unit/estimate/price-badge.test.tsx`
- **Commit:** 510eaee

## Verification Results

- `npx vitest run tests/unit/estimate/price-badge.test.tsx` — 6/6 PASS
- `npx vitest run` (full suite) — 9 pre-existing failures in globals-brand-tokens, onboarding-schema, admin-gate; zero new failures; 386 tests pass (vs 380 before this plan — net +6 green)
- `npx tsc --noEmit` — zero errors (clean exit)
- Grep badge column: `isManuallyEdited` at line 82, `price_book` at 84, `ai_estimate` at 88 in item-row.tsx
- Grep save logic: 3 matches for `price_source: item.isManuallyEdited ? null : (item.price_source ?? null)` in estimate.ts lines 175, 214, 232
- Grep header column: 2 `w-28` matches in section-card.tsx thead (Unit Price + badge header)

## Known Stubs

None — all 6 Wave-0 RED stubs from Plan 23-01 are now GREEN. Phase 23 complete.

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1    | 52bea3b | feat(23-02): add price-origin badge td in item-row + matching th in section-card |
| 2    | 510eaee | feat(23-02): persist price_source in saveEstimate + turn 6 RED stubs GREEN |
