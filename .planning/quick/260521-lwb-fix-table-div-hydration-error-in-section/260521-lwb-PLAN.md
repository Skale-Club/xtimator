---
phase: quick-260521-lwb
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - components/workspace/estimate/section-card.tsx
autonomous: true
requirements:
  - HYDRATION-FIX-01
must_haves:
  truths:
    - "Estimate editor page renders without React hydration errors about `<table>` containing a nested `<div>`"
    - "Drag-and-drop reordering of items within a section still works (PointerSensor desktop + TouchSensor mobile)"
    - "Section table structure (thead + tbody rows) renders identically to before"
  artifacts:
    - path: "components/workspace/estimate/section-card.tsx"
      provides: "SectionCard with DndContext + SortableContext lifted outside <table>"
      contains: "DndContext"
  key_links:
    - from: "SectionCard CardContent"
      to: "div.overflow-x-auto > table"
      via: "DndContext > SortableContext wrap the div, NOT inside the table"
      pattern: "DndContext[\\s\\S]*?<div className=\"overflow-x-auto\">[\\s\\S]*?<table"
---

<objective>
Fix the Next.js 16 / React hydration error `In HTML, <table> cannot contain a nested <div>` that fires at `components/workspace/estimate/section-card.tsx:148`.

Purpose: `<DndContext>` from `@dnd-kit/core` renders a hidden accessibility live-region `<div>` as a sibling of its children. With `<DndContext>` currently placed BETWEEN `<thead>` and the sortable `<tbody>` children INSIDE `<table>`, that live-region `<div>` lands directly inside `<table>` — invalid HTML, which React flags as a hydration mismatch.

Fix: Lift `<DndContext>` and `<SortableContext>` OUT of the `<table>` so they wrap the `<div className="overflow-x-auto">` instead. `SortableContext` renders no DOM (pure provider), and `DndContext`'s injected `<div>` becomes a valid sibling outside the table. The React context still reaches `<SortableItemRow>` through normal React context propagation.

Output: A single edit to `components/workspace/estimate/section-card.tsx` (function `SectionCard`, JSX in `CardContent`, lines ~146–181). No other file changes, no API/type changes, no behavior changes.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@components/workspace/estimate/section-card.tsx

<interfaces>
<!-- Key shape the executor needs. Already imported at the top of the file. -->

From `@dnd-kit/core`:
- `DndContext` — renders a hidden `<div>` (live region) as a child for accessibility announcements. MUST NOT live inside `<table>`.
- `closestCenter`, `DragEndEvent`, `PointerSensor`, `TouchSensor`, `useSensor`, `useSensors`

From `@dnd-kit/sortable`:
- `SortableContext` — pure React context provider, renders no DOM. Safe anywhere structurally, but moved alongside DndContext for consistency.
- `verticalListSortingStrategy`, `useSortable`, `arrayMove`

Existing component:
- `SortableItemRow` — renders `<tbody ref={setNodeRef} ...><ItemRow ... /></tbody>`. `<tbody>` is a valid child of `<table>`, so leaving these as direct children of `<table>` is correct.
</interfaces>
</context>

<tasks>

<task type="auto" tdd="false">
  <name>Task 1: Lift DndContext + SortableContext out of the table element</name>
  <files>components/workspace/estimate/section-card.tsx</files>
  <action>
Edit the `SectionCard` component's `return` JSX (current lines ~146–182). Move the `<DndContext>` and `<SortableContext>` wrappers from INSIDE the `<table>` element (currently between `<thead>` and the `{section.items.map(...)}` block) to OUTSIDE the `<table>`, so they wrap the `<div className="overflow-x-auto">` instead.

Replace the existing `<CardContent>` body block (currently):

```jsx
<CardContent className="px-3 pb-3">
  <div className="overflow-x-auto">
    <table className="w-full">
      <thead>
        <tr className="text-xs text-muted-foreground border-b">
          <th className="py-2 px-1 w-8" />
          <th className="py-2 px-1 text-left font-medium">Description</th>
          <th className="py-2 px-1 w-20 text-right font-medium">Qty</th>
          <th className="py-2 px-1 w-20 text-left font-medium">Unit</th>
          <th className="py-2 px-1 w-28 text-right font-medium">Unit Price</th>
          <th className="py-2 px-1 w-28" />
          <th className="py-2 px-1 w-28 text-right font-medium">Total</th>
          <th className="py-2 px-1 w-10" />
        </tr>
      </thead>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={section.items.map((i) => i.id)}
          strategy={verticalListSortingStrategy}
        >
          {section.items.map((item) => (
            <SortableItemRow
              key={item.id}
              item={item}
              sectionId={section.id}
              dispatch={dispatch}
              isReadOnly={isReadOnly}
            />
          ))}
        </SortableContext>
      </DndContext>
    </table>
  </div>

  <div className="flex items-center justify-between mt-3">
    ...
  </div>
</CardContent>
```

with this new structure (DndContext + SortableContext lifted OUT of `<table>`, now wrapping the `overflow-x-auto` `<div>`):

```jsx
<CardContent className="px-3 pb-3">
  <DndContext
    sensors={sensors}
    collisionDetection={closestCenter}
    onDragEnd={handleDragEnd}
  >
    <SortableContext
      items={section.items.map((i) => i.id)}
      strategy={verticalListSortingStrategy}
    >
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="text-xs text-muted-foreground border-b">
              <th className="py-2 px-1 w-8" />
              <th className="py-2 px-1 text-left font-medium">Description</th>
              <th className="py-2 px-1 w-20 text-right font-medium">Qty</th>
              <th className="py-2 px-1 w-20 text-left font-medium">Unit</th>
              <th className="py-2 px-1 w-28 text-right font-medium">Unit Price</th>
              <th className="py-2 px-1 w-28" />
              <th className="py-2 px-1 w-28 text-right font-medium">Total</th>
              <th className="py-2 px-1 w-10" />
            </tr>
          </thead>
          {section.items.map((item) => (
            <SortableItemRow
              key={item.id}
              item={item}
              sectionId={section.id}
              dispatch={dispatch}
              isReadOnly={isReadOnly}
            />
          ))}
        </table>
      </div>
  </SortableContext>
</DndContext>

  <div className="flex items-center justify-between mt-3">
    ...
  </div>
</CardContent>
```

Constraints (do NOT change):
- Keep the existing trailing `<div className="flex items-center justify-between mt-3">...</div>` block (Add Item button + Section Total) exactly as-is — it stays OUTSIDE the DndContext/SortableContext wrappers, as a sibling under `<CardContent>`.
- Do NOT modify `SortableItemRow` — it already renders `<tbody>` which is a valid direct child of `<table>`.
- Do NOT change imports, types, props, `handleDragEnd`, `sensors`, or any other logic in the file.
- Do NOT touch any other file.
- Preserve indentation and the existing `className` strings verbatim.

Why this works:
- `DndContext` injects a hidden `<div>` live-region as a sibling of its children. With it now wrapping the outer `<div className="overflow-x-auto">`, that injected `<div>` is a sibling of another `<div>` — valid HTML, hydration passes.
- `SortableContext` is a pure React context provider and renders no DOM. It still reaches `<SortableItemRow>` (which calls `useSortable(...)`) via normal React context, so drag-and-drop continues to work.
- `{section.items.map(...)}` rendering `<SortableItemRow>` (which renders `<tbody>`) remains a direct child of `<table>`, which is structurally valid.
  </action>
  <verify>
    <automated>node -e "const fs=require('fs');const s=fs.readFileSync('components/workspace/estimate/section-card.tsx','utf8');const tableOpen=s.indexOf('<table');const tableClose=s.indexOf('</table>');if(tableOpen===-1||tableClose===-1){console.error('FAIL: table tags not found');process.exit(1)}const between=s.slice(tableOpen,tableClose);if(/<DndContext\b/.test(between)){console.error('FAIL: <DndContext> still inside <table>');process.exit(1)}if(/<SortableContext\b/.test(between)){console.error('FAIL: <SortableContext> still inside <table>');process.exit(1)}const dndIdx=s.indexOf('<DndContext');const sortIdx=s.indexOf('<SortableContext');const overflowIdx=s.indexOf('overflow-x-auto');if(dndIdx===-1||sortIdx===-1||overflowIdx===-1){console.error('FAIL: required wrappers missing');process.exit(1)}if(!(dndIdx<sortIdx&&sortIdx<overflowIdx&&overflowIdx<tableOpen)){console.error('FAIL: ordering must be DndContext -> SortableContext -> overflow-x-auto div -> table');process.exit(1)}console.log('OK: DndContext+SortableContext lifted outside table and wrap overflow-x-auto div')"</automated>
  </verify>
  <done>
- `components/workspace/estimate/section-card.tsx` contains exactly one `<DndContext>` and exactly one `<SortableContext>`.
- Neither `<DndContext>` nor `<SortableContext>` JSX appears anywhere between `<table` and `</table>` in the file.
- The order of opening tags in the file is: `<DndContext>` then `<SortableContext>` then `<div className="overflow-x-auto">` then `<table>`.
- `<table>` contains only `<thead>` and the `{section.items.map(...)}` block (which renders `<tbody>` via `<SortableItemRow>`) as direct children — no other JSX wrappers in between.
- The trailing `<div className="flex items-center justify-between mt-3">...</div>` block (Add Item + Section Total) is unchanged and still a sibling under `<CardContent>` AFTER the DndContext closes.
- `npx tsc --noEmit` (if run by the executor as a sanity check) produces no new errors attributable to this file.
- Manual smoke (out of scope for this plan's automated verify but desired by user): opening the estimate editor in the browser no longer logs the `<table> cannot contain a nested <div>` hydration error in the console; drag-to-reorder still works.
  </done>
</task>

</tasks>

<verification>
The single automated check above is the sufficient gate: it parses the source file and proves three things atomically:
1. `<DndContext>` is not nested inside `<table>...</table>` (the actual bug).
2. `<SortableContext>` is not nested inside `<table>...</table>` (consistency).
3. The new wrapper order (`DndContext` → `SortableContext` → `overflow-x-auto` div → `table`) matches the target structure.

If any condition fails, the script exits non-zero and the task is not done.
</verification>

<success_criteria>
- Hydration error `<table> cannot contain a nested <div>` from `section-card.tsx:148` no longer fires on the estimate editor page.
- Drag-and-drop item reordering inside a section continues to work on desktop (PointerSensor) and mobile (TouchSensor).
- No other behavior, layout, or styling changes.
- Verification script in Task 1 exits with status 0.
</success_criteria>

<output>
After completion, create `.planning/quick/260521-lwb-fix-table-div-hydration-error-in-section/260521-lwb-SUMMARY.md` summarizing the JSX restructure (one task, one file, ~20 line diff).
</output>
