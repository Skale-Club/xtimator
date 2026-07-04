---
phase: quick-260704-pcv
plan: 01
subsystem: ui
tags: [tailwind, nextjs, sticky-positioning, layout, workspace]

# Dependency graph
requires: []
provides:
  - "main scroll container with no ancestor padding-bottom, decoupled from sticky descendants' containing block"
  - "project-workspace.tsx content column ending in a non-sticky clearance spacer that lives inside the same containing block the sticky rail and sticky floating action bar use"
affects: [project-workspace, estimate-floating-actions, bottom-nav, app-layout]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Sticky-element clearance space must live inside the same containing block as the sticky descendants it's meant to protect from fixed overlays — not on an ancestor of that containing block, or the extra ancestor scroll room causes a late-scroll detach/jump."

key-files:
  created: []
  modified:
    - "app/(app)/layout.tsx"
    - "components/workspace/project-workspace.tsx"

key-decisions:
  - "Placed the relocated clearance spacer as the last child inside project-workspace.tsx's content column (`min-w-0 flex-1` div), per the plan's preferred approach, avoiding any flex-row wrapping concerns that a flex-row-level spacer would have required."

patterns-established:
  - "Bottom clearance for elements above a fixed mobile BottomNav must be added as an in-flow spacer inside the actual containing block of any sticky descendants, not as padding on an ancestor scroll container."

requirements-completed: [BUGFIX-01]

# Metrics
duration: 5min
completed: 2026-07-04
---

# Quick Task 260704-pcv: Fix scroll-bottom layout shift in sub-sidebar/floating action bar Summary

**Relocated BottomNav/safe-area clearance padding from `main`'s ancestor scroll container into an in-flow spacer inside `project-workspace.tsx`'s content column, so both sticky elements (sub-sidebar rail, floating estimate action bar) stop moving exactly when true scrollable content ends.**

## Performance

- **Duration:** 5 min
- **Started:** 2026-07-04T22:15:00Z (approx)
- **Completed:** 2026-07-04T22:20:42Z
- **Tasks:** 1 of 1 auto tasks (checkpoint:human-verify deferred to orchestrator)
- **Files modified:** 2

## Accomplishments
- Removed `pb-[calc(5rem_+_env(safe-area-inset-bottom,_0px))] md:pb-6` from `<main>` in `app/(app)/layout.tsx`, eliminating the ancestor padding that lived outside the sticky elements' containing block.
- Added a matching-height, non-sticky `aria-hidden` spacer div as the last child of the content column in `components/workspace/project-workspace.tsx`, placing the clearance space inside the same containing block the sticky rail and sticky floating action bar use.
- Verified via grep proxy checks: no `pb-[calc(5rem` remains in `layout.tsx`; the new spacer with matching height calc is present in `project-workspace.tsx`.

## Task Commits

Each task was committed atomically:

1. **Task 1: Move BottomNav/safe-area clearance padding from main into the workspace's flex-row containing block** - `2b911e4c` (fix)

**Plan metadata:** (this commit, docs: complete plan)

## Files Created/Modified
- `app/(app)/layout.tsx` - `<main>` className simplified to `flex-1 overflow-y-auto` (padding-bottom classes removed)
- `components/workspace/project-workspace.tsx` - Added bottom clearance spacer (`h-[calc(5rem_+_env(safe-area-inset-bottom,_0px))] md:h-6`) as the last child inside the content column, after the tab content div

## Decisions Made
- Used the plan's preferred placement (spacer inside the content column's `flex-1` div, after tab content) rather than the alternative flex-row-level placement, since it requires no `flex-wrap` changes and keeps the two-column layout intact with zero risk of the spacer wrapping onto its own row.

## Deviations from Plan

None - plan executed exactly as written. Task 1 matched the plan's exact diff guidance; no bugs, missing functionality, or blocking issues were encountered.

## Issues Encountered

None.

## Checkpoint Handling

The plan's second task (`checkpoint:human-verify`) — manual browser verification across desktop/mobile viewports and Overview/Client/Photos tabs — was **not executed by this agent**, per explicit orchestrator instruction. The orchestrator (main session) will perform that browser verification itself using its own preview tooling immediately after this summary. This is not a deviation; it is the intended division of labor for this run.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Structural fix is in place and committed. Awaiting orchestrator's browser-based verification (desktop + mobile viewports, Overview/Client/Photos tabs, BottomNav overlap check) to confirm the end-of-scroll shift is fully eliminated per the plan's success criteria.
- Note from the plan (Task 1, step 1): other direct children of `main` in the `(app)` route group were not audited for reliance on the removed padding-bottom for BottomNav clearance — this quick task's scope was limited to the project-workspace page per the bug report. If other pages under `(app)` render content that sits flush against the fixed BottomNav on mobile after this change, they would need their own local clearance spacer added the same way. Flagged here as a possible follow-up, not fixed in this task (out of scope).

## Self-Check: PASSED

- FOUND: `.planning/quick/260704-pcv-fix-scroll-bottom-layout-shift-sub-sideb/260704-pcv-01-SUMMARY.md`
- FOUND: commit `2b911e4c`

---
*Phase: quick-260704-pcv*
*Completed: 2026-07-04*
