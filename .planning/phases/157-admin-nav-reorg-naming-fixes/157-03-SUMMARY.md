---
phase: 157-admin-nav-reorg-naming-fixes
plan: 03
subsystem: testing
tags: [vitest, playwright, copy-rename, testing]

# Dependency graph
requires:
  - phase: 157-02
    provides: "Support Mode button/banner user-facing copy renamed to 'View as Company' / 'Viewing {company} as {admin}' / 'Exit view'"
provides:
  - "Unit test string assertions retargeted from retired 'Support Mode' copy to 'View as Company'/'Viewing'"
  - "e2e Playwright spec selectors/body-text assertions retargeted to 'View as Company'/'Viewing'/'Exit view'"
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns: []

key-files:
  created: []
  modified:
    - tests/unit/admin/companies-support-mode-button.test.ts
    - tests/unit/support-mode-layout.test.ts
    - tests/e2e/support-mode.spec.ts

key-decisions:
  - "Renamed e2e local variable supportModeLink -> viewAsCompanyLink for readability, consistent with the plan's optional suggestion"

patterns-established: []

requirements-completed: [NAV-03, NAMING-02]

# Metrics
duration: 3min
completed: 2026-07-06
---

# Phase 157 Plan 03: Support Mode Test Retargeting Summary

**Retargeted 3 test files' hard-coded "Support Mode" string assertions to the new "View as Company"/"Viewing"/"Exit view" copy landed in Plan 02, leaving every structural/internal-naming assertion (component names, imports, audit-log literals, redirect paths) byte-identical.**

## Performance

- **Duration:** 3 min
- **Started:** 2026-07-06T04:47:00Z
- **Completed:** 2026-07-06T04:50:25Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- `tests/unit/admin/companies-support-mode-button.test.ts`: button-label assertion now matches `/View as Company/` (was `/Support Mode/`); test name updated to `'label reads "View as Company →"'`.
- `tests/unit/support-mode-layout.test.ts`: banner-copy assertion now matches `/Viewing/` (was `/Support Mode/`); test name updated to `'contains the new "Viewing ... as ..." copy (View as Company rename)'`.
- `tests/e2e/support-mode.spec.ts`: all 3 copy-dependent Playwright assertions retargeted — button selector `/View as Company/`, banner body-text `/Viewing/`, exit button `/Exit view/`; local variable renamed `supportModeLink` -> `viewAsCompanyLink`.
- Confirmed via research (per plan) that NAV-03's own flagged test (grep for `/admin/legal` in `tests/`) was empty — no file changes needed for NAV-03; this plan is 100% NAMING-02 test updates.
- Zero regressions: `tests/unit/support-mode.test.ts` (audit-log literal assertions `company.support_mode_start`/`company.support_mode_end`) required no changes and still passes, proving the internal-naming boundary held.

## Task Commits

Each task was committed atomically:

1. **Task 1: Retarget unit test string assertions to "View as Company" / "Exit view"** - `5a23f65f` (test)
2. **Task 2: Retarget e2e Playwright spec to new copy** - `a0516606` (test)

**Plan metadata:** (this commit) `docs(157-03): complete plan`

## Files Created/Modified
- `tests/unit/admin/companies-support-mode-button.test.ts` - button-label regex `/Support Mode/` -> `/View as Company/`; test name string updated
- `tests/unit/support-mode-layout.test.ts` - banner-copy regex `/Support Mode/` -> `/Viewing/`; test name string updated
- `tests/e2e/support-mode.spec.ts` - 3 Playwright assertions retargeted (button selector, body-text match, exit-button selector); local variable renamed for clarity

## Decisions Made
- Read the actual current source of `support-mode-button.tsx` and `support-mode-banner.tsx` directly (rather than relying solely on the plan's `<interfaces>` snippet) to confirm the exact landed copy from Plan 02 before writing regex targets — confirmed byte-identical to what Plan 02's SUMMARY documented (`View as Company →`, `Viewing <strong>{companyName}</strong> as {adminEmail}.`, `Exit view`).
- Renamed the e2e local variable `supportModeLink` -> `viewAsCompanyLink` per the plan's optional suggestion, for consistency with the new copy.

## Deviations from Plan

None - plan executed exactly as written. Both unit test assertions and all 3 e2e assertions were changed exactly as specified in the plan's `<interfaces>` section; all structural/internal-naming assertions (`SupportModeButton`, `startSupportSessionAction`, `getSupportModeSession`, `endSupportSession`, navigation targets, env-gating) were left untouched.

## Issues Encountered
- A `git commit` for Task 2 initially reported "nothing added to commit" because the `git add` for `tests/e2e/support-mode.spec.ts` had not yet been reflected in the same shell invocation as the commit command (unrelated untracked files were present in the working tree from concurrent parallel-wave plans). Re-ran `git add tests/e2e/support-mode.spec.ts` followed by the commit in a separate step; verified via `git diff`/`grep` that the file content was correct and unstaged (not reverted) before re-committing. No content was lost; the task's actual file edit was correct throughout.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

All 27 unit tests across the 3 support-mode unit test files pass (`companies-support-mode-button.test.ts`, `support-mode-layout.test.ts`, `support-mode.test.ts`). The e2e spec (`tests/e2e/support-mode.spec.ts`) parses correctly and enumerates 3 tests via `npx playwright test --list` (env-gated, will skip in CI without `TEST_ADMIN_EMAIL`/`TEST_ADMIN_PASSWORD`, consistent with pre-existing gating). No blockers — Phase 157's wave 2 (this plan) is the last plan in the phase per the dependency graph (157-01 and 157-02 in wave 1, this plan in wave 2 depending on 157-02).

---
*Phase: 157-admin-nav-reorg-naming-fixes*
*Completed: 2026-07-06*

## Self-Check: PASSED

- FOUND: tests/unit/admin/companies-support-mode-button.test.ts
- FOUND: tests/unit/support-mode-layout.test.ts
- FOUND: tests/e2e/support-mode.spec.ts
- FOUND commit: 5a23f65f
- FOUND commit: a0516606
