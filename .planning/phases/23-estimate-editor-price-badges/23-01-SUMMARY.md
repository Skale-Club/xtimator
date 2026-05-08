---
phase: 23-estimate-editor-price-badges
plan: "01"
subsystem: estimate-editor
tags: [type-extension, reducer, tdd, wave-0]
dependency_graph:
  requires: [22-03]
  provides: [23-02]
  affects: [components/workspace/estimate/use-estimate-reducer.ts, lib/queries/estimate.ts]
tech_stack:
  added: []
  patterns: [Wave-0 RED stubs, EditorItem interface extension, reducer side-effect on unit_price]
key_files:
  created:
    - tests/unit/estimate/price-badge.test.tsx
  modified:
    - components/workspace/estimate/use-estimate-reducer.ts
    - lib/queries/estimate.ts
decisions:
  - EditorItem.price_source typed as literal union 'price_book' | 'ai_estimate' | null (D-01)
  - isManuallyEdited is client-only flag, never sent to DB (D-01)
  - initState maps i.price_source ?? null per DB row; defaults isManuallyEdited to false (D-02)
  - UPDATE_ITEM sets isManuallyEdited true only for unit_price field changes (D-03)
  - EstimateItem in lib/queries/estimate.ts extended with price_source (Rule 2 auto-fix — missing field caused TS error)
metrics:
  duration: 3min
  completed_date: "2026-05-08"
  tasks_completed: 2
  files_modified: 3
---

# Phase 23 Plan 01: EditorItem Type Extension + Wave 0 RED Stubs Summary

**One-liner:** Extended EditorItem with price_source/isManuallyEdited fields + 6 RED test stubs defining badge acceptance surface for Plan 23-02.

## What Was Built

### Task 1: EditorItem type extension + reducer behavior

Extended `EditorItem` interface in `use-estimate-reducer.ts` with:
- `price_source: 'price_book' | 'ai_estimate' | null` — origin badge data (D-01)
- `isManuallyEdited?: boolean` — client-only override flag (D-01)

Updated all item initialization points:
- `initState`: maps `i.price_source ?? null` and sets `isManuallyEdited: false` per DB row
- `ADD_ITEM`: initializes new items with `price_source: null, isManuallyEdited: false`
- `ADD_SECTION`: initializes the first item of a new section with `price_source: null, isManuallyEdited: false`

Updated `UPDATE_ITEM` reducer case: when `action.field === 'unit_price'`, sets `updated.isManuallyEdited = true` (D-03). Other fields leave `isManuallyEdited` unchanged.

### Task 2: RED test stubs

Created `tests/unit/estimate/price-badge.test.tsx` with 6 named stubs using `expect.fail('not implemented')`:
- 4 stubs for badge rendering (price_book, ai_estimate, Edited, null/no-badge)
- 1 stub for UPDATE_ITEM unit_price reducer behavior
- 1 stub for saveEstimate price_source persistence

All 6 fail loudly in vitest — confirms Wave 0 RED state for Plan 23-02.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Field] Added price_source to EstimateItem interface in lib/queries/estimate.ts**
- **Found during:** Task 1 (TypeScript check)
- **Issue:** `initState` accesses `i.price_source` where `i` is typed as `EstimateItem` from `lib/queries/estimate.ts`. That interface lacked the `price_source` field, which would have caused a TS compile error.
- **Fix:** Added `price_source: 'price_book' | 'ai_estimate' | null` to the `EstimateItem` interface in `lib/queries/estimate.ts`. This field is already on the DB row (confirmed via `types/database.types.ts` line 304).
- **Files modified:** `lib/queries/estimate.ts`
- **Commit:** 5026fc5

## Verification Results

- `npx tsc --noEmit` — zero errors (clean)
- `npx vitest run tests/unit/estimate/price-badge.test.tsx` — 6 tests, all FAILING with "not implemented" (RED confirmed)
- Grep confirms: `price_source` appears at lines 18, 152, 221, 267; `isManuallyEdited` at lines 19, 153, 193, 222, 268 in `use-estimate-reducer.ts`

## Known Stubs

| File | Description |
|------|-------------|
| `tests/unit/estimate/price-badge.test.tsx:9` | renders Price book badge for price_book items |
| `tests/unit/estimate/price-badge.test.tsx:13` | renders AI estimate badge for ai_estimate items |
| `tests/unit/estimate/price-badge.test.tsx:17` | renders Edited badge when isManuallyEdited is true |
| `tests/unit/estimate/price-badge.test.tsx:21` | renders no badge for null price_source |
| `tests/unit/estimate/price-badge.test.tsx:25` | UPDATE_ITEM unit_price dispatch sets isManuallyEdited to true |
| `tests/unit/estimate/price-badge.test.tsx:31` | saveEstimate writes price_source: null for manually-edited items |

All stubs are intentional Wave 0 RED state — Plan 23-02 implements and turns them GREEN.

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1    | 5026fc5 | feat(23-01): extend EditorItem with price_source + isManuallyEdited fields |
| 2    | 8ee2487 | test(23-01): add 6 RED test stubs for price-badge badge rendering + reducer + save |
