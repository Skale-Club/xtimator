---
phase: 181-real-product-cutover-verification
plan: 01
subsystem: ui
tags: [nav, settings, demo, react, next-app-router]

# Dependency graph
requires:
  - phase: 180-isolated-demo-session-read-only-foundation
    provides: "lib/demo/guard.ts's isDemoSession() classification and the demo-session/company deny-write foundation"
provides:
  - "SettingsNav demoHidden-flag-plus-filter shape (identical idiom to components/app-shell/nav-items.ts)"
  - "app/(app)/settings/layout.tsx unconditionally renders the real SettingsLayoutClient tree for every session"
  - "Settings entry point reachable for demo sessions in both the desktop Sidebar and MobileAccountMenu account menus"
affects: [181-02-real-product-cutover-verification, 181-03-real-product-cutover-verification, 181-04-real-product-cutover-verification]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "demoHidden?: boolean flag + ITEMS.filter((item) => !(isDemo && item.demoHidden)) — same idiom now used in both components/app-shell/nav-items.ts and components/settings/settings-nav.tsx"
    - "Static-source-guard tests (readFileSync + string/regex assertions, no RTL rendering, no mocks) for nav-filter and layout-branch contracts"

key-files:
  created:
    - tests/unit/settings/demo-tab-visibility.test.ts
  modified:
    - "app/(app)/settings/layout.tsx"
    - components/settings/settings-layout-client.tsx
    - components/settings/settings-nav.tsx
    - components/app-shell/sidebar.tsx
    - components/app-shell/mobile-account-menu.tsx

key-decisions:
  - "Split the TDD test file into two incremental commits (Task 1: nav-filter + layout-branch assertions; Task 2: adds the 2 account-menu-guard assertions) to keep each task's own <verify> command green at time of that task's commit, per the plan's per-task action breakdown."

patterns-established:
  - "SettingsNav's ITEMS array follows the identical demoHidden-flag-plus-filter shape as the primary app nav (components/app-shell/nav-items.ts) — any future settings tab addition should default to demoHidden: true unless explicitly exposed to demo."

requirements-completed: [PARITY-01, PARITY-02]

# Metrics
duration: ~20min
completed: 2026-07-27
---

# Phase 181 Plan 01: Real Settings Shell & Nav Exposure for Demo Sessions Summary

**Replaced the demo-only bespoke `CompanyInfoForm`-only settings view with the real `SettingsLayoutClient`/`SettingsNav` rail (filtered to Company/Team/Notifications for demo via a `demoHidden` flag) and un-hid the Settings entry point in both account-menu surfaces.**

## Performance

- **Duration:** ~20 min
- **Completed:** 2026-07-27T04:42Z
- **Tasks:** 2/2 completed
- **Files modified:** 5 (+ 1 test file created)

## Accomplishments
- `app/(app)/settings/layout.tsx` no longer branches on `isDemoSession()` to render a bespoke collapsed view — every request (demo or real) renders the same `<SettingsLayoutClient isDemo={isDemo}>` tree, making PARITY-01 ("same layout, navigation, components, styling") true with zero demo-specific visual variant left in the settings shell.
- `SettingsNav` gained a `demoHidden?: boolean` flag on 6 of its 9 items (Account, Estimates, Plans, Message Template, Knowledge, Integrations) and filters via `ITEMS.filter((item) => !(isDemo && item.demoHidden))` — the identical idiom already proven in `components/app-shell/nav-items.ts`. Company/Team/Notifications stay unflagged and always visible.
- Settings is now reachable from the desktop `Sidebar`'s account-menu dropdown and `MobileAccountMenu` for demo sessions; the Trash entry in both remains hidden (`{!isDemo && (...)}` guard untouched, exactly 1 occurrence left in each file).

## Task Commits

Each task was committed atomically:

1. **Task 1: Filter SettingsNav for demo and render the real layout unconditionally** - `8ae8835e` (feat)
2. **Task 2: Un-hide the Settings entry point for demo sessions** - `890279ac` (feat)

_Note: Task 1 is `tdd="true"` — the RED test (all 12 planned assertions) was written first, then the file was trimmed to its Task-1-scoped subset (10 assertions) so Task 1's own `<verify>` command was GREEN at commit time; the 2 account-menu-guard assertions were re-added and made GREEN in Task 2's commit, per the plan's own "extend the test file in Task 2" instruction._

## Files Created/Modified
- `app/(app)/settings/layout.tsx` - Dropped the `isDemoSession()` branch + its now-unused imports (`createClient`, `getAuthClaims`, `getCompanySettings`, `CompanyInfoForm`); always renders `<SettingsLayoutClient isDemo={isDemo}>`
- `components/settings/settings-layout-client.tsx` - Accepts `isDemo?: boolean`, threads it to `<SettingsNav collapsed={collapsed} isDemo={isDemo} />`
- `components/settings/settings-nav.tsx` - `ITEMS` gains `demoHidden?: boolean`; component accepts `isDemo` and filters before computing `activeValue`
- `components/app-shell/sidebar.tsx` - Removed the `{!isDemo && (...)}` wrapper around the Settings `DropdownMenuItem`/`Link`; Trash's own guard untouched
- `components/app-shell/mobile-account-menu.tsx` - Same un-wrap as sidebar.tsx; Trash's own guard untouched
- `tests/unit/settings/demo-tab-visibility.test.ts` - New static-source-guard test (12 assertions) proving the nav filter, the layout's single unconditional `isDemoSession()` call, `isDemo` prop threading, and exactly one remaining `{!isDemo && (` guard (Trash) in each account-menu file

## Decisions Made
- Split the single planned test file into two incremental TDD passes (Task 1 commit: nav-filter + layout-branch assertions only; Task 2 commit: adds the 2 account-menu-guard assertions) rather than writing all 12 assertions upfront — this keeps each task's own `<verify>` command (`npx vitest run tests/unit/settings/demo-tab-visibility.test.ts`) actually GREEN at the moment of that task's commit, matching the plan's task-by-task `<action>` breakdown (Task 2's action step 4 explicitly says "Extend ... with 2 more assertions").

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None. Ran as a parallel executor alongside sibling plans 181-02/181-03 in the same working directory (no worktree isolation, per the documented Windows MAX_PATH constraint) — confirmed via `git status`/`git diff` before every `git add` that only this plan's `files_modified` were staged, since siblings were concurrently modifying other settings-tab files (`(tabs)/account`, `appearance`, `defaults`, `delivery`, `estimates`, `notifications`, `billing`, `custom-domain`, `estimate-templates`, `integrations/*`, `knowledge/*`, `payments`, `components/settings/notifications-form.tsx`, `app/globals.css`) and had created their own untracked test file (`tests/unit/settings/demo-hidden-tab-guards.test.ts`). Neither of those was touched by this plan.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- The real settings shell + filtered nav is now the load-bearing foundation Plan 02/03 build on (wiring `readOnly`/`canManage` into the now-reachable Company/Team/Notifications tab pages) and Plan 04 (browser e2e verification of the filtered nav + reachable Settings entry point).
- `npx vitest run tests/unit/settings/` (13 files, 92 tests) and `tests/unit/app-shell/` (5 tests) both green post-change — no regression in existing settings/nav coverage.
- No blockers.

---
*Phase: 181-real-product-cutover-verification*
*Completed: 2026-07-27*

## Self-Check: PASSED

All 5 modified files, the new test file, and both task commit hashes (`8ae8835e`, `890279ac`) were verified present.
