---
phase: 25-plain-text-tab-copy-ui
plan: "01"
subsystem: estimate-template-utils
tags: [tdd, utility, plain-text, estimate]
dependency_graph:
  requires: [Phase 24 — resolveTemplate utility already in estimate-template.ts]
  provides: [buildItemsBreakdown exported from lib/utils/estimate-template.ts]
  affects: [Plan 25-02 — PlainTextCard will import buildItemsBreakdown]
tech_stack:
  added: []
  patterns: [TDD RED-GREEN, pure utility function, formatCurrency reuse]
key_files:
  created: []
  modified:
    - lib/utils/estimate-template.ts
    - tests/unit/utils/estimate-template.test.ts
decisions:
  - buildItemsBreakdown placed at bottom of estimate-template.ts alongside resolveTemplate — single cohesive module for all plain-text template logic
  - Sections with zero items filtered via .filter() before .map() — clean functional chain
  - join('\n\n') produces blank line between section blocks matching SEED-004 reference format
metrics:
  duration: 3min
  completed: "2026-05-08"
  tasks: 2
  files: 2
---

# Phase 25 Plan 01: buildItemsBreakdown Utility (TDD) Summary

**One-liner:** `buildItemsBreakdown(EstimateWithSections): string` — pure formatter producing `[Section Title]\nitem: $price` blocks joined by blank lines, tested RED-GREEN with 5 new unit tests.

## What Was Built

Added `buildItemsBreakdown` to `lib/utils/estimate-template.ts`. The function:

- Filters sections with zero items
- Formats each section as `[Title]\ndesc: $price` per item
- Joins section blocks with `\n\n` (blank line separator)
- Returns `''` for estimates with no sections

This is the function Plan 02 (PlainTextCard) will call to populate `items_breakdown` before passing to `resolveTemplate()`.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 (RED) | Add failing buildItemsBreakdown tests | 8ebe7d8 | tests/unit/utils/estimate-template.test.ts |
| 2 (GREEN) | Implement buildItemsBreakdown | 4398713 | lib/utils/estimate-template.ts |

## Verification

- `npx vitest run tests/unit/utils/estimate-template.test.ts` — 11/11 passed (6 existing + 5 new)
- `npx vitest run` — 408 tests passed across 73 files, 0 failures
- `npx tsc --noEmit` — no errors

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — `buildItemsBreakdown` is fully implemented and all tests pass with real data.

## Self-Check: PASSED

- [x] `lib/utils/estimate-template.ts` exists and exports `buildItemsBreakdown` — FOUND
- [x] `tests/unit/utils/estimate-template.test.ts` contains `describe('buildItemsBreakdown'` — FOUND
- [x] Commit 8ebe7d8 (RED) exists — FOUND
- [x] Commit 4398713 (GREEN) exists — FOUND
- [x] All 11 tests pass — CONFIRMED
- [x] Full suite 408 tests pass — CONFIRMED
- [x] TypeScript compiles clean — CONFIRMED
