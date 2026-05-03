---
phase: 16-sidebar-projects-panel
plan: 03
subsystem: ui
tags: [next.js, revalidatePath, sidebar, navigation, active-state]

requires:
  - phase: 16-sidebar-projects-panel
    provides: "Plan 01 built sidebar project list with ProjectSummary queries; Plan 02 built SidebarProjectItem component with isActive prop"

provides:
  - "createProjectAction calls revalidatePath('/', 'layout') to bust layout cache after project creation"
  - "duplicateProjectAction calls revalidatePath('/', 'layout') after duplication"
  - "SidebarProjectItem active detection covers /projects/[id] and all /projects/[id]/* sub-routes"

affects: [sidebar, project-actions, navigation]

tech-stack:
  added: []
  patterns:
    - "revalidatePath('/', 'layout') pattern for busting full layout cache after mutating data visible in layout"
    - "startsWith pattern for active detection on nested route trees"

key-files:
  created: []
  modified:
    - lib/actions/project.ts
    - components/app-shell/sidebar.tsx

key-decisions:
  - "revalidatePath('/', 'layout') added to both create and duplicate actions; delete action intentionally excluded (out of scope)"
  - "isActive uses startsWith for sub-route coverage, preserving exact match for root project path"

patterns-established:
  - "Sidebar active state: exact match OR startsWith with trailing slash to avoid false positives"

requirements-completed: [PROJ-12]

duration: 2min
completed: 2026-05-03
---

# Phase 16 Plan 03: Sidebar Sync Summary

**revalidatePath('/', 'layout') wired into project create/duplicate actions so sidebar reflects new projects on next navigation, and isActive detection extended with startsWith to highlight project items on sub-routes**

## Performance

- **Duration:** 2 min
- **Started:** 2026-05-03T19:21:34Z
- **Completed:** 2026-05-03T19:23:31Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- createProjectAction and duplicateProjectAction both call revalidatePath('/', 'layout') after insert, instructing Next.js to re-run app/(app)/layout.tsx on next navigation so the new project appears at the top of the sidebar list
- SidebarProjectItem isActive check extended from exact pathname match to also cover sub-routes via pathname.startsWith, ensuring projects stay highlighted in /projects/[id]/recordings, /projects/[id]/estimates, etc.
- All existing revalidatePath('/dashboard') calls preserved — dashboard page continues to refresh independently

## Task Commits

1. **Task 1: Wire revalidatePath in createProjectAction to bust layout cache** - `1da960e` (feat)
2. **Task 2: Fix active state detection to cover project workspace sub-routes** - `11f08b7` (feat)

**Plan metadata:** (docs commit — see final_commit step)

## Files Created/Modified
- `lib/actions/project.ts` - Added revalidatePath('/', 'layout') to createProjectAction and duplicateProjectAction after the existing revalidatePath('/dashboard') calls
- `components/app-shell/sidebar.tsx` - Replaced single exact pathname === check with exact || startsWith expression for isActive prop

## Decisions Made
- deleteProjectAction intentionally excluded from revalidatePath('/', 'layout') as deletion sidebar sync is out of scope for this phase (per plan spec)
- Trailing slash in startsWith(`/projects/${project.id}/`) prevents a project with id "abc" from accidentally matching a project with id "abcdef"

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- Pre-existing test failures in language-toggle.test.tsx (5 failures, 281 passing) — unrelated to this plan's changes in project.ts and sidebar.tsx. These failures pre-date this plan.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 16 Plans 01-03 complete: sidebar project list built, SidebarProjectItem component created, cache revalidation and active state both wired
- Sidebar is fully functional: new projects appear without manual refresh, active project stays highlighted across sub-routes
- No blockers for next phase

---
*Phase: 16-sidebar-projects-panel*
*Completed: 2026-05-03*
