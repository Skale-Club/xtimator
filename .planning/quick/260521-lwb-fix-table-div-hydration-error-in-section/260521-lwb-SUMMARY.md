---
phase: quick-260521-lwb
plan: 01
status: complete
date: 2026-05-21
commit: 3dd3e57
files_modified:
  - components/workspace/estimate/section-card.tsx
---

# Quick Task 260521-lwb — SUMMARY

## Objective

Fix the Next.js 16 / React hydration error `In HTML, <table> cannot contain a nested <div>` that fired from `components/workspace/estimate/section-card.tsx:148`.

## Root cause

`<DndContext>` from `@dnd-kit/core` renders a hidden accessibility live-region `<div>` as a sibling of its children. It was placed between `<thead>` and the sortable `<tbody>` children INSIDE `<table>`, so that live-region `<div>` became a direct child of `<table>` — invalid HTML, flagged by React's hydration check.

## Change

Single-file JSX restructure in `SectionCard` ([components/workspace/estimate/section-card.tsx:146-181](components/workspace/estimate/section-card.tsx#L146-L181)):

- Moved `<DndContext>` and `<SortableContext>` OUT of the `<table>` so they wrap the outer `<div className="overflow-x-auto">` instead.
- `<table>` now contains only `<thead>` and the `{section.items.map(...)}` block (each item rendering as `<tbody>` via `<SortableItemRow>`) — all valid table children.
- `SortableContext` is a pure context provider and still reaches `<SortableItemRow>` via React context, so drag-and-drop reorder behavior is unchanged.
- No changes to imports, types, props, `handleDragEnd`, `sensors`, or `SortableItemRow`.
- The trailing Add Item / Section Total `<div>` remains as a sibling under `<CardContent>` (outside the DndContext wrapper).

Diff size: 27 insertions / 27 deletions (1 file).

## Verification

Automated check from the plan passed:
```
OK: DndContext+SortableContext lifted outside table and wrap overflow-x-auto div
```
Asserts (a) no `<DndContext>` between `<table>...</table>`, (b) no `<SortableContext>` between them, (c) outer order is `DndContext` → `SortableContext` → `overflow-x-auto` div → `table`.

`npx tsc --noEmit` produced no errors attributable to the change (run inside the executor worktree).

## Manual smoke (out of scope for automated verify)

Pending in-browser confirmation by the user:
- Open an estimate editor page — console should no longer log `<table> cannot contain a nested <div>`.
- Drag-and-drop an item within a section — reorder should still work on desktop (PointerSensor) and mobile (TouchSensor).

## Commits

- `3dd3e57` — fix(quick-260521-lwb): lift DndContext outside table to fix hydration error

## Files

- `components/workspace/estimate/section-card.tsx` — JSX restructure only
