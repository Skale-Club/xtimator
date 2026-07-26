---
phase: 180-isolated-demo-session-read-only-foundation
plan: 03
subsystem: demo-authorization
tags: [nextjs, server-actions, supabase, read-only, vitest, tdd]
requires:
  - phase: 180-02
    provides: "Canonical OR-based demo user/company write guard"
provides:
  - "Guard-before-effect enforcement for all core project, estimate, team, and theme Server Action mutations"
  - "Static export classification that fails when a new core action is unclassified or a mutator is late/unguarded"
affects: [180-04, 180-05, 180-06, 180-07, 180-08, 180-09, 180-10, 180-11, 180-12, 180-14, 181-real-product-cutover-and-verification]
tech-stack:
  added: []
  patterns:
    - "Authenticate and resolve trusted company state before assertWritable, then deny before the first database or provider effect"
    - "Actions scoped by an explicit company check both ambient demo identity and the target company signal"
key-files:
  created:
    - tests/unit/demo/core-action-boundaries.test.ts
  modified:
    - lib/actions/project.ts
    - lib/actions/estimate.ts
    - lib/actions/team.ts
    - lib/actions/theme.ts
key-decisions:
  - "Core reads remain explicitly classified and unguarded; every export must be classified to prevent new mutation candidates from silently bypassing the contract."
  - "Team actions check both the ambient dedicated-demo-user signal and their explicitly authorized target company, so an alternate active-company cookie cannot weaken read-only enforcement."
patterns-established:
  - "Core Server Actions return the existing standardized demo denial before any mutation, storage write, provider dispatch, revalidation, or cookie effect."
requirements-completed: [SAFE-01, SAFE-02]
duration: 5 min
completed: 2026-07-26
---

# Phase 180 Plan 03: Core Server Action Read-Only Boundaries Summary

**Project, estimate, team, and theme mutations now stop at the canonical demo write guard before database changes or external side effects.**

## Performance

- **Duration:** 5 min
- **Started:** 2026-07-26T13:19:00-04:00
- **Completed:** 2026-07-26T13:24:00-04:00
- **Tasks:** 2 completed
- **Files modified:** 5

## Accomplishments

- Classified every exported action in the four core action modules as either a guarded mutator or an explicit read.
- Added `assertWritable()` before project and estimate write/effect paths while leaving declared reads unchanged.
- Applied both ambient user and explicit target-company checks to team mutations, and guarded the theme database/cookie write path.
- Added a focused mocked theme boundary test that proves demo denial blocks effects and normal tenants retain their write path.

## Task Commits

1. **Task 1: RED — test core Server Action coverage** — `c9dea4d0` (`test`)
2. **Task 2: GREEN — guard project, estimate, team, and theme writes** — `1d28358d` (`feat`)

## Files Created/Modified

- `tests/unit/demo/core-action-boundaries.test.ts` — export classification, guard-order contract, and mocked theme boundary coverage.
- `lib/actions/project.ts` — guards every project mutation after authentication/company resolution.
- `lib/actions/estimate.ts` — guards each estimate write and delivery log before effects.
- `lib/actions/team.ts` — denies either demo identity or explicit demo-company team mutations.
- `lib/actions/theme.ts` — blocks demo theme persistence and cookie writes.

## Decisions Made

- Reads are explicitly classified, not implicitly allowed, so future exports cannot introduce silent mutation coverage gaps.
- Team operations compose the existing canonical ambient and explicit-company guard functions instead of adding another authorization abstraction.

## TDD Gate Compliance

- **RED:** `c9dea4d0` added 30 contract checks; 26 failed because the required guards were absent.
- **GREEN:** `1d28358d` added the guards and expanded the focused suite to 31 passing checks.
- **REFACTOR:** Not needed.

## Verification

- `npx vitest run tests/unit/demo/core-action-boundaries.test.ts` — passed (31 tests).
- `npx tsc --noEmit -p tsconfig.ci.json` — passed.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Test contract] Corrected typed-action body extraction in the static suite**
- **Found during:** Task 2 (GREEN verification)
- **Issue:** The initial source helper treated object-shaped parameter and return-type braces as an action body, so it skipped team guard calls.
- **Fix:** Matched the complete parameter list and signature before locating the action body.
- **Files modified:** `tests/unit/demo/core-action-boundaries.test.ts`
- **Verification:** The complete focused suite now detects all core guard calls and passes.
- **Committed in:** `1d28358d`

**2. [Rule 2 - Missing Critical] Enforced both demo signals for explicit-company team mutations**
- **Found during:** Task 2 (GREEN implementation)
- **Issue:** A company-only guard could miss the dedicated demo user if an action target and ambient active company diverged.
- **Fix:** Team mutations now compose `assertWritable()` with `assertCompanyWritable(targetCompanyId)`, failing closed on either D-08 signal.
- **Files modified:** `lib/actions/team.ts`
- **Verification:** Focused static guard-order tests and CI TypeScript passed.
- **Committed in:** `1d28358d`

---

**Total deviations:** 2 auto-fixed (1 Rule 1 test contract, 1 Rule 2 critical authorization coverage).
**Impact on plan:** Both changes strengthen the planned SAFE-01/SAFE-02 boundary without expanding runtime scope.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Known Stubs

None.

## Next Phase Readiness

The core action boundary is ready for the remaining API, side-effect, worker, and browser-isolation plans. The static export classification should be extended whenever these modules gain an action export.

## Self-Check: PASSED

Verified the five action/test artifacts exist, both TDD commits are reachable, and the focused suite plus CI TypeScript check pass. Existing unrelated edits to `app/globals.css` and `next-env.d.ts` remain unstaged and untouched.

---
*Phase: 180-isolated-demo-session-read-only-foundation*
*Completed: 2026-07-26*
