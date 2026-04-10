---
phase: 06-ai-estimate-generation-editor
plan: 03
subsystem: estimate-editor-ui
tags: [estimate, editor, dnd, auto-save, reducer, ui]
dependency_graph:
  requires: [06-01, 06-02]
  provides: [estimate-tab, estimate-editor, estimate-reducer]
  affects: [project-workspace, project-page]
tech_stack:
  added: []
  patterns: [useReducer-for-complex-state, dnd-kit-sortable, debounced-auto-save]
key_files:
  created:
    - components/workspace/estimate/use-estimate-reducer.ts
    - components/workspace/estimate/generation-progress.tsx
    - components/workspace/estimate/item-row.tsx
    - components/workspace/estimate/section-card.tsx
    - components/workspace/estimate/estimate-totals.tsx
    - components/workspace/estimate/estimate-header.tsx
    - components/workspace/estimate/estimate-editor.tsx
    - components/workspace/estimate/estimate-tab.tsx
  modified:
    - components/workspace/project-workspace.tsx
    - app/(app)/projects/[id]/page.tsx
    - lib/actions/estimate.ts
decisions:
  - useReducer with 13 discriminated-union actions for all estimate state mutations with instant recalculation
  - Server action getEstimateByIdAction for client-side version switching instead of API route
  - Auto-save via useEffect watching isDirty with 2000ms debounce timeout
  - SortableContext with verticalListSortingStrategy for both section and item reorder
  - Tax rate stored as decimal (0.08) but displayed as percentage (8%) in UI
metrics:
  completed: "2026-04-10"
  tasks_completed: 2
  tasks_total: 2
  files_created: 8
  files_modified: 3
---

# Phase 6 Plan 3: Estimate Editor UI Summary

Full inline estimate editor with useReducer state management, @dnd-kit drag-and-drop for sections and items, real-time math recalculation, discount/tax controls, auto-save with 2s debounce, version switching, and generation progress flow.

## What Was Built

### Task 1: Core Editor Components (7 files)

**use-estimate-reducer.ts** -- Central state management with 13 action types (INIT, UPDATE_FIELD, UPDATE_SECTION_TITLE, UPDATE_ITEM, ADD_ITEM, REMOVE_ITEM, ADD_SECTION, REMOVE_SECTION, REORDER_ITEMS, REORDER_SECTIONS, UPDATE_DISCOUNT, UPDATE_TAX_RATE, MARK_SAVED). Every mutation that affects numbers calls recalculate() which recomputes item totals, section subtotals, discount amount, tax amount, and grand total using cent-precision rounding.

**generation-progress.tsx** -- 4-step vertical stepper (Analyzing photos, Generating estimate, Saving, Done) with check/spinner/circle icons for complete/active/pending states.

**item-row.tsx** -- Table row with drag handle, inline inputs for description/qty/unit/unit_price, formatted read-only total, and delete button with 44px min touch target.

**section-card.tsx** -- Card wrapping a section title (editable input), items table with @dnd-kit/sortable for item reorder within section, Add Item button, and section subtotal.

**estimate-totals.tsx** -- Right-aligned financial summary: subtotal (read-only), discount (None/Percentage/Fixed Amount select + value input), tax (editable percentage, converts to/from decimal rate), and bold grand total. All values formatted with toLocaleString.

**estimate-header.tsx** -- Version selector dropdown, Regenerate button, read-only badge for non-current versions, and editable fields for summary, notes, timeline, payment terms, warranty terms.

**estimate-editor.tsx** -- Orchestrator component: useEstimateReducer for state, auto-save with 2000ms useEffect debounce, manual Save button, save status indicator (Saving.../Saved/Unsaved changes/Save failed), section-level DndContext for reorder, version switching via getEstimateByIdAction, regenerate handler calling both API routes sequentially with GenerationProgress display, Add Section button.

### Task 2: EstimateTab + Workspace Wiring

**estimate-tab.tsx** -- Top-level tab with two states: (a) No estimate: centered card with Sparkles icon, Generate Estimate button (disabled with tooltip when no transcripts/photos), Create Blank Estimate link. (b) Has estimate: renders EstimateEditor. Generation flow calls /api/analyze-photos then /api/generate-estimate with step-by-step progress.

**project-workspace.tsx** -- Added currentEstimate and allVersions props, replaced PlaceholderTab with EstimateTab passing all required data.

**page.tsx** -- Added getCurrentEstimate and getProjectEstimates to Promise.all, passes to ProjectWorkspace.

**lib/actions/estimate.ts** -- Added getEstimateByIdAction server action wrapping getEstimateById with auth check for version switching.

## Decisions Made

1. **useReducer over useState** -- Complex interdependent state (13 action types, math recalculation on multiple actions) makes useReducer the clear choice over scattered useState calls.
2. **Server action for version loading** -- getEstimateByIdAction as server action rather than a new API route, keeping the pattern consistent with existing estimate actions.
3. **Debounced auto-save in useEffect** -- Watches isDirty plus all state fields that trigger saves. 2000ms debounce with cleanup on unmount or re-trigger prevents rapid save storms.
4. **Tax as decimal internally, percentage in UI** -- Stored as 0.08 (matching server action), displayed and edited as 8% in the totals component.

## Deviations from Plan

### Auto-added Missing Functionality

**1. [Rule 2] Added getEstimateByIdAction server action**
- **Found during:** Task 1 (estimate-editor.tsx needs to load versions client-side)
- **Issue:** Plan recommended creating this action but listed it under Task 2. Created it during Task 1 since the editor component imports it.
- **Fix:** Added to lib/actions/estimate.ts with auth check wrapping getEstimateById query.
- **Files modified:** lib/actions/estimate.ts

## Known Stubs

None -- all components are fully wired to real data sources and server actions.

## Verification

- `npx tsc --noEmit` passes with zero errors in all new/modified files (only pre-existing test file errors remain)
- AI Estimate tab replaces PlaceholderTab in workspace
- EstimateTab shows generation CTA when no estimate, editor when estimate exists
- Generate button disabled with tooltip when no transcripts or photos
- All 13 reducer actions implemented with instant math recalculation
- Auto-save with 2s debounce + manual Save button
- Drag-and-drop for both sections and items
- Discount (percentage/fixed) and tax rate editable with real-time recalculation
- Version selector with read-only mode for non-current versions
