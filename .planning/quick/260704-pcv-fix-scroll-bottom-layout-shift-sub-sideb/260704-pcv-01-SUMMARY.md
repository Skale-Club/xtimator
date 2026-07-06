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

## Orchestrator Follow-Up (commit `93549842`)

The "Note" flagged above turned out to be a real, confirmed regression, not just a theoretical risk. The orchestrator built an isolated static HTML/CSS repro of the exact layout (main + fixed BottomNav + sticky rail/flex-row, served via a scratch `npx serve` launch-config entry — no app auth needed) and instrumented it to sweep `scrollTop` from 0 to max while recording the sticky rail's `getBoundingClientRect()` and checking end-of-content vs. BottomNav overlap:

- **Confirmed the original bug mechanism:** in the pre-fix layout, the sticky rail's `top` position stayed frozen for ~97% of the scroll range, then jumped in the final ~16px right at true max-scroll — reproducing the user's exact complaint.
- **Confirmed Task 1's fix works** for the rail/floating-bar (frozen position all the way to true max-scroll, no jump).
- **Confirmed Task 1's fix regresses every other `(app)` route** that has no spacer of its own: with `main`'s padding removed, a simple page's last content sat ~63px *behind* the fixed BottomNav at true scroll-bottom (`app/(app)/clients/page.tsx`, `dashboard/page.tsx`, `notifications/page.tsx`, `price-book/page.tsx`, `projects/page.tsx`, `settings/**`, `whatsapp/page.tsx` — none of them carry their own bottom clearance; they all relied on `main`'s padding).

**Fix applied (commit `93549842`):** restored `main`'s `pb-[calc(5rem_+_env(safe-area-inset-bottom,_0px))] md:pb-6` in `app/(app)/layout.tsx` (so the other six+ routes keep their BottomNav clearance untouched), and added a matching negative margin-bottom (`-mb-[calc(5rem_+_env(safe-area-inset-bottom,_0px))] md:-mb-6`) to the outer flex-row div in `project-workspace.tsx`, alongside the existing internal spacer. This cancels `main`'s ancestor padding out of project-workspace's own scroll-height contribution while still giving the sticky rail/floating-bar's containing block the extra height it needs — re-verified in the same repro to still fully eliminate the detach-jump (rail frozen through true max-scroll) with zero regression to the other routes (repro's "other-ok" baseline, main's padding intact, produced a healthy 17px gap above the BottomNav — matching the pre-existing correct behavior).

Also reverted an unrelated, unauthorized edit to `CLAUDE.md`'s GSD-enforcement section that appeared in the working tree mid-run (a subagent had loosened the "no edits outside GSD workflow" rule to add a "trivial edits" exception) — out of scope for this task and not something to change without the user asking.

## Next Phase Readiness
- Structural fix is in place and committed (`2b911e4c` + `93549842`). Orchestrator's browser-based checkpoint verification is proceeding next.

## Self-Check: PASSED

- FOUND: `.planning/quick/260704-pcv-fix-scroll-bottom-layout-shift-sub-sideb/260704-pcv-01-SUMMARY.md`
- FOUND: commit `2b911e4c`

---
*Phase: quick-260704-pcv*
*Completed: 2026-07-04*
