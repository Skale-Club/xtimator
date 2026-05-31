---
phase: quick
plan: 260527-jid
subsystem: ui
tags: [next-router, app-router, navigation, dialog, react]

# Dependency graph
requires:
  - phase: 260525-gvb
    provides: single-page new-project flow that opens the capture popup via ?capture/?projectId URL params
provides:
  - "handleComplete() in estimate-creation-popup.tsx navigates via router.push without a racing router.replace"
affects: [estimate-creation-popup, new-project-flow, capture-recorder]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Avoid synchronous router.replace + router.push in the same tick (App Router drops the push when targets differ)"

key-files:
  created: []
  modified:
    - components/projects/estimate-creation-popup.tsx

key-decisions:
  - "Rely on router.push to a params-free URL to close the param-derived Dialog (isOpen flips false) instead of an explicit clearParams() call"

patterns-established:
  - "Param-derived Dialog isOpen: navigating to a URL without the trigger params closes the dialog on its own; no separate clear-params call needed"

requirements-completed: [QUICK-FIX-POPUP-NAV]

# Metrics
duration: 2min
completed: 2026-05-27
---

# Quick 260527-jid: Fix New-Project Recording Popup Not Navigating Summary

**Removed the redundant clearParams() (router.replace) call from handleComplete() so router.push to /projects/[id] no longer loses a same-tick navigation race — the new-project recording flow now lands on the created project page.**

## Performance

- **Duration:** 2 min
- **Started:** 2026-05-27T17:05:10Z
- **Completed:** 2026-05-27T17:07:04Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments
- Fixed the new-project recording flow: completing a recording now navigates to `/projects/[id]` instead of leaving the user stranded on the `/projects` list.
- Preserved the existing-project record behavior: `router.refresh()` still fires so the freshly-generated estimate shows on the same route.
- Popup still closes after completion because `router.push` produces a params-free URL, flipping the param-derived `isOpen` to `false`.
- Documented WHY `clearParams()` is intentionally omitted in `handleComplete()` via an in-code comment.

## Task Commits

Each task was committed atomically:

1. **Task 1: Remove redundant clearParams() from handleComplete() to fix the replace+push race** - `fd4dcc6` (fix)

## Files Created/Modified
- `components/projects/estimate-creation-popup.tsx` - Removed the `clearParams()` call from `handleComplete()`; replaced the comment with an explanation of the replace+push race. `clearParams()`, `handleCancel()`, the `useEffect`, the `Dialog`/`onOpenChange` close path, and all imports are unchanged.

## Decisions Made
- None beyond the plan: relied on the param-derived `isOpen` closing the Dialog when `router.push` produces a params-free URL, making the explicit `clearParams()` call redundant in the completion path.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- `npx tsc --noEmit` reports pre-existing errors in `app/api/mcp/*` and `lib/mcp/*` (the `@modelcontextprotocol/sdk` package is not installed in this worktree). These are unrelated to the edited file and out of scope per the SCOPE BOUNDARY rule. The edited file `components/projects/estimate-creation-popup.tsx` produces zero type errors.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- New-project recording flow navigation is fixed; no blockers.
- Manual verification (optional, not blocking): on `/projects`, start a NEW project recording and complete it to confirm landing on `/projects/[id]`; start an EXISTING-project recording and complete it to confirm it stays on `/projects/[id]` with the new estimate visible.

## Self-Check: PASSED

- FOUND: components/projects/estimate-creation-popup.tsx
- FOUND: .planning/quick/260527-jid-fix-new-project-recording-popup-not-open/260527-jid-SUMMARY.md
- FOUND: commit fd4dcc6

---
*Phase: quick-260527-jid*
*Completed: 2026-05-27*
