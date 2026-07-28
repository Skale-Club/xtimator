---
phase: 185-paginated-editable-editor-mode
plan: 02
subsystem: ui
tags: [react, lucide-react, radix-ui, tooltip, workspace-header, view-mode-toggle]

# Dependency graph
requires:
  - phase: 185-paginated-editable-editor-mode (Plan 01)
    provides: isomorphic pagination line-packer + browser-safe fontkit measurement (file-disjoint, no direct code dependency this plan)
provides:
  - ViewModeToggle component (components/workspace/view-mode-toggle.tsx) — the single header page-view control
  - VersionSlot.viewMode / VersionSlot.onViewModeChange optional bridge fields, typed via the shared EstimateViewMode union
  - estimate-floating-actions.tsx fully retired from viewMode awareness (props, destructure, button block, icon imports all removed)
affects: [185-03 (paginated canvas — mounts on viewMode === 'page', reads the same VersionSlot/EstimateEditor state, no new plumbing needed)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Editor owns view-mode state, publishes to VersionSlot via context (same pattern as saveStatus/projectName) — header renders the control, editor renders the document"
    - "VersionSlot fields added incrementally as OPTIONAL, matching the interface's existing slot?.field read convention at every call site"

key-files:
  created:
    - components/workspace/view-mode-toggle.tsx
    - tests/unit/components/view-mode-toggle.test.tsx
  modified:
    - components/workspace/estimate-version-context.tsx
    - components/workspace/project-header.tsx
    - components/workspace/estimate/estimate-editor.tsx
    - components/workspace/estimate/estimate-floating-actions.tsx
    - tests/unit/components/estimate-floating-actions.test.tsx

key-decisions:
  - "Toggle test verifies tooltip content via keyboard focus + waitFor instead of hover simulation — Radix Tooltip content only mounts in the DOM once open; fireEvent.focus opens immediately (no hover delayDuration), giving a reliable RTL assertion path for the Copywriting Contract"

patterns-established:
  - "Session-only UI state (no persistence) documented inline with a plain comment describing the default and lifecycle, replacing a stale comment describing removed localStorage behavior"

requirements-completed: [PGMODE-01, PGMODE-04]

# Metrics
duration: 20min
completed: 2026-07-28
---

# Phase 185 Plan 02: Header ViewModeToggle + Legacy Toggle Retirement Summary

**New segmented-pill `ViewModeToggle` (StretchHorizontal/FileStack icons) mounted in the project header, bridged via optional `VersionSlot.viewMode`/`onViewModeChange`; the legacy floating-pill "Full page"/"Full width" button and its `localStorage` persistence are fully removed from `estimate-floating-actions.tsx` and `estimate-editor.tsx`.**

## Performance

- **Duration:** 20 min
- **Tasks:** 2 completed
- **Files modified:** 7 (2 created, 5 modified)

## Accomplishments
- Built `ViewModeToggle` exactly per 185-UI-SPEC.md section 1 — a self-contained `TooltipProvider`-wrapped segmented pill with `role="group"`, `aria-pressed` state per button, and the exact Copywriting Contract tooltip/aria-label text
- Extended `VersionSlot` with two new OPTIONAL fields (`viewMode?`, `onViewModeChange?`), typed via the single shared `EstimateViewMode` export from `estimate-floating-actions.tsx` (no second union declared)
- Mounted `ViewModeToggle` in `project-header.tsx` between the autosave-status span and `EditEstimateHeaderButton`, reading state exclusively through `slot?.viewMode` / `slot?.onViewModeChange`
- Retired the legacy floating-pill toggle entirely: removed `viewMode`/`onViewModeChange` props, the destructured values, the conditional "Full page"/"Full width" button block, and the now-unused `File`/`StretchHorizontal` icon imports from `estimate-floating-actions.tsx`
- Removed `VIEW_MODE_KEY` and all `localStorage` read/write from `estimate-editor.tsx` (DEFER-04 — session-only state); rewrote the stale doc comment that described the removed persistence mechanism; `viewMode`/`handleViewModeChange` now publish into the `setSlot({...})` effect instead of being passed to `EstimateFloatingActions`

## Task Commits

Each task was committed atomically:

1. **Task 1: Extend VersionSlot, build ViewModeToggle, mount in project-header.tsx** - `49971e0f` (feat)
2. **Task 2: Retire the legacy floating-pill toggle and publish estimate-editor.tsx's viewMode into the new slot fields** - `b414273b` (fix)

_Note: no TDD RED/GREEN split was required beyond the standard tdd="true" flow on Task 1 — tests were written alongside the component implementation and iterated to green before commit._

## Files Created/Modified
- `components/workspace/view-mode-toggle.tsx` - New `ViewModeToggle` component (segmented pill, two icon buttons, self-contained `TooltipProvider`)
- `tests/unit/components/view-mode-toggle.test.tsx` - RTL test suite covering aria-pressed states, click callbacks, tooltip copy, and null render when `mode` is undefined
- `components/workspace/estimate-version-context.tsx` - `VersionSlot` gains `viewMode?: EstimateViewMode` / `onViewModeChange?: (mode: EstimateViewMode) => void`, importing the type from `./estimate/estimate-floating-actions`
- `components/workspace/project-header.tsx` - Mounts `<ViewModeToggle mode={slot?.viewMode} onModeChange={slot?.onViewModeChange} />` between the autosave-status span and `EditEstimateHeaderButton`
- `components/workspace/estimate/estimate-editor.tsx` - Removed `VIEW_MODE_KEY` + localStorage effect/write; rewrote the session-only-state doc comment; `viewMode`/`onViewModeChange: handleViewModeChange` now flow into the `setSlot({...})` effect (dependency array updated); removed `viewMode`/`onViewModeChange` props from the `<EstimateFloatingActions>` call site
- `components/workspace/estimate/estimate-floating-actions.tsx` - Removed `viewMode`/`onViewModeChange` from props interface, destructure, and the entire conditional button block; removed unused `File`/`StretchHorizontal` icon imports; the exported `EstimateViewMode` type is unchanged (still the single canonical source)
- `tests/unit/components/estimate-floating-actions.test.tsx` - Removed the retired `'EstimateFloatingActions view mode toggle (quick-260718-m2q)'` describe block (5 tests); no other describe blocks referenced `viewMode`/`onViewModeChange`, so nothing else needed stripping

## Decisions Made
- Tooltip-copy assertions use `fireEvent.focus()` (not hover) plus `vi.waitFor` on `getAllByText(...).length > 0` — Radix `TooltipContent` renders the label twice in the DOM (visible content + visually-hidden `role="tooltip"` span) once open, so `getByText` (singular) throws on ambiguous matches; `getAllByText` sidesteps that without weakening the assertion. Focus opens the tooltip without waiting on the 300ms hover `delayDuration`, keeping the test fast and deterministic.

## Deviations from Plan

None - plan executed exactly as written. The `<interfaces>` block's exact JSX/type shapes were reproduced verbatim; the only implementation-level choice was the test-authoring technique for tooltip-content assertions (documented above as a decision, not a deviation — the plan's `<behavior>` bullet required verifying tooltip copy but did not prescribe how).

## Issues Encountered
- Initial test draft used `toBeEmptyDOMElement()` (jest-dom matcher) and a plain `getByText()` hover-copy assertion; neither works in this repo (no jest-dom setup registered in `vitest.config.ts`, and Radix Tooltip content isn't in the DOM without an open interaction). Both were fixed before the Task 1 commit — see Decisions Made above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- `viewMode === 'page'` is the single source of truth for view mode, now flowing: `EstimateEditor` state → `VersionSlot.viewMode` → `ViewModeToggle` (display) and back via `onViewModeChange` → `handleViewModeChange` → `setViewMode`. Plan 185-03 can mount the paginated canvas keyed directly on this existing `viewMode` state with zero new plumbing.
- Exactly one page-view control exists in the product; the legacy floating-pill toggle, its icon imports, its props, and its `localStorage` persistence are fully gone from the codebase.
- No blockers for 185-03.

---
*Phase: 185-paginated-editable-editor-mode*
*Completed: 2026-07-28*

## Self-Check: PASSED

All created/modified files verified present on disk; both task commits (`49971e0f`, `b414273b`) verified present in git log.
