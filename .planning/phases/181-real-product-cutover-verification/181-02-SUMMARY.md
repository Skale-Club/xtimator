---
phase: 181-real-product-cutover-verification
plan: 02
subsystem: ui
tags: [settings, demo, react, fieldset, static-source-guard, vitest]

# Dependency graph
requires:
  - phase: 181 (Plan 01, parallel sibling)
    provides: SettingsNav/SettingsLayoutClient un-hidden for demo sessions and filtered to 3 tabs (Company/Team/Notifications) — this plan's read-only wiring is only reachable once those tabs render for a demo session
provides:
  - "NotificationsForm readOnly prop (fieldset-disabled cascade + read-only footer note), matching CompanyInfoForm's proven pattern"
  - "Company tab wires readOnly={isDemoCompany(company.id)} into CompanyInfoForm's existing readOnly prop"
  - "Team tab forces canManage off for the demo company, reusing TeamSection's existing canManage gate and role-label-pill fallback verbatim"
  - "Static-source-guard test (tests/unit/settings/demo-readonly-forms.test.ts) proving all 3 wiring points"
affects: [181-04 (live-browser verification of read-only rendering), any future settings tab exposed to demo sessions]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Demo read-only forms use a native <fieldset disabled={readOnly}> wrapper around every field/control, with a conditional muted footer paragraph replacing (or supplementing) the primary action button — the one pattern from CompanyInfoForm, now also used by NotificationsForm"
    - "Read-only demo gating for role-based UI reuses the existing role-derived boolean (canManage) rather than introducing a parallel demo-specific prop — team/page.tsx ANDs isDemoCompany into the same canManage expression TeamSection already consumes"

key-files:
  created:
    - tests/unit/settings/demo-readonly-forms.test.ts
  modified:
    - components/settings/notifications-form.tsx
    - "app/(app)/settings/(tabs)/notifications/page.tsx"
    - "app/(app)/settings/(tabs)/company/page.tsx"
    - "app/(app)/settings/(tabs)/team/page.tsx"

key-decisions:
  - "NotificationsForm's root return became a React Fragment (<>...</>) wrapping the new <fieldset> plus the conditional footer <p>, since the component previously had a single root <div> and now needs two siblings (fieldset + read-only note) — an unavoidable, minimal structural change not spelled out verbatim in the plan's action steps but required to satisfy them literally."
  - "Team tab's canManage line changed to !isDemoCompany(companyId) && (role === 'owner' || role === 'admin') exactly as specified — zero changes to TeamSection itself, since its canManage gate and role-pill fallback already existed."

patterns-established:
  - "Read-only demo footer note copy is per-surface (Company: '...edit your profile.', Notifications: '...manage your notification settings.') — not a shared generic string — to keep each note specific to what the surface controls."

requirements-completed: [PARITY-02, PARITY-03]

# Metrics
duration: ~12min
completed: 2026-07-27
---

# Phase 181 Plan 02: Demo Read-Only Settings Forms Summary

**Wired demo-aware read-only rendering into Company/Team/Notifications settings tabs — CompanyInfoForm and TeamSection reused their existing `readOnly`/`canManage` props verbatim, and NotificationsForm gained one new `readOnly` prop cascading through a native `<fieldset disabled>` wrapper.**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-07-27T00:38:00-04:00 (approx, local)
- **Completed:** 2026-07-27T00:45:00-04:00 (approx, local)
- **Tasks:** 2
- **Files modified:** 4 (+ 1 test file created)

## Accomplishments
- `NotificationsForm` accepts a new `readOnly?: boolean` prop; every `Switch` and both action `Button`s (`Save preferences`, `Enable/Disable browser notifications`) disable via a single `<fieldset disabled={readOnly}>` cascade, and a muted footer note ("This is a read-only demo. Create a free account to manage your notification settings.") renders when true.
- Notifications tab page passes `readOnly={isDemoCompany(companyId)}` — no extra Supabase round trip, reusing the already-resolved `companyId`.
- Company tab page passes `readOnly={isDemoCompany(company.id)}` into `CompanyInfoForm`'s pre-existing `readOnly` prop — zero component changes.
- Team tab page forces `canManage = !isDemoCompany(companyId) && (role === 'owner' || role === 'admin')` — zero component changes to `TeamSection`, which already renders a plain role-label pill in place of manage controls when `canManage` is false (the same treatment a real non-manager member sees today).
- New static-source-guard test `tests/unit/settings/demo-readonly-forms.test.ts` (7 assertions) proves all 3 wiring points by reading the actual source files — no DB, no mocks, no live rendering, mirroring the existing `team-section-no-hardcode.test.ts` idiom.
- Confirmed zero regressions: existing `tests/unit/notifications/preferences-form.test.tsx` (8 tests, exercises `NotificationsForm`'s default/non-readOnly behavior) and `tests/unit/settings/team-page-seat-cost.test.ts` / `team-section-no-hardcode.test.ts` all still pass unchanged.

## Task Commits

Each task was committed atomically (TDD RED → GREEN for Task 1; single commit for Task 2):

1. **Task 1 RED: failing test for notifications readOnly wiring** - `adea1dbc` (test)
2. **Task 1 GREEN: implement notifications readOnly wiring** - `80f0cd2b` (feat) — see Deviations: this commit's diff was widened by a shared-index race with the concurrent sibling plan 181-01 agent (no worktree isolation on this machine); the intended 181-02 changes within it are correct and complete.
3. **Task 2: wire readOnly/canManage into Company and Team tabs** - `abb0bc2d` (feat)

**Plan metadata:** (this commit, following this SUMMARY)

## Files Created/Modified
- `components/settings/notifications-form.tsx` - added `readOnly?: boolean` prop; root wrapper changed from `<div>` to `<fieldset disabled={readOnly}>` + conditional footer `<p>` inside a `<>` Fragment
- `app/(app)/settings/(tabs)/notifications/page.tsx` - imports `isDemoCompany`, passes `readOnly={isDemoCompany(companyId)}`
- `app/(app)/settings/(tabs)/company/page.tsx` - imports `isDemoCompany`, passes `readOnly={isDemoCompany(company.id)}`
- `app/(app)/settings/(tabs)/team/page.tsx` - imports `isDemoCompany`, `canManage` now ANDs in `!isDemoCompany(companyId)`
- `tests/unit/settings/demo-readonly-forms.test.ts` - new static-source-guard test, 7 assertions across all 4 modified files

## Decisions Made
- Wrapped `NotificationsForm`'s return in a React `<>` Fragment to accommodate the new sibling footer `<p>` alongside the `<fieldset>` — the plan's action steps describe the fieldset wrap and the footer note as sequential JSX but the component previously returned a single root element; a Fragment is the minimal correct fix (documented above as `key-decisions`, not treated as a Rule 4 architectural change — it's a same-file, same-behavior structural adjustment required to satisfy the plan literally).
- Followed the plan's literal two-step TDD scope for Task 1 (notifications-only RED test) then extended the same test file with Task 2's two additional assertions per its action step 3, rather than writing all 7 assertions upfront — keeps the RED/GREEN cycle meaningful for Task 1's `tdd="true"` flag.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed a cross-agent git index contamination on commit `80f0cd2b`**
- **Found during:** Task 1 GREEN commit
- **Issue:** This plan runs in parallel with sibling agents 181-01 and 181-03 in the same working directory (no git worktree isolation — a documented Windows MAX_PATH constraint). `git add <my files> && git commit` picked up files that sibling agent 181-01 had staged concurrently in the *shared* index (`app/(app)/settings/(tabs)/{account,appearance,defaults,delivery,estimates}/page.tsx`, `tests/unit/settings/demo-hidden-tab-guards.test.ts`), producing a `feat(181-02)`-labeled commit with a broader diff than intended.
- **Fix:** Attempted `git reset --soft HEAD~1` to split the commit, but the sibling agent had already committed on top (`890279ac`) before the reset could safely apply — rewriting further would have risked discarding the sibling's legitimate work, which the git-safety protocol forbids. Left `80f0cd2b` as-is (its content is correct, just over-scoped in attribution) and switched to a race-resistant commit pattern for all subsequent commits: `git commit --no-verify -m "..." -- <exact pathspec>` with no preceding `git add`, which stages and commits only the named paths regardless of what else is staged in the shared index. Task 2's commit (`abb0bc2d`) used this pattern and verified clean (exactly 3 files, all mine).
- **Files affected:** No content was lost or altered — `80f0cd2b`'s inclusion of sibling files matches what the sibling agent had already written to disk; git history attribution is just messier for that one commit.
- **Verification:** `git show --stat 80f0cd2b` and `git show --stat abb0bc2d` inspected directly; `git diff HEAD -- <my files>` confirmed no uncommitted drift after the incident.
- **Committed in:** `80f0cd2b` (unchanged), `abb0bc2d` (clean going forward)

---

**Total deviations:** 1 auto-fixed (1 blocking — git index race, no code/behavior impact)
**Impact on plan:** No functional impact — all intended file content for 181-02 is correct and verified. The orchestrator's post-execution hook validation pass (mentioned in the parallel-execution instructions) should additionally confirm sibling plan 181-01's own commits (`8ae8835e`, `890279ac`, and any later ones) are self-consistent, since `80f0cd2b` briefly held some of their in-flight content before their own commit landed.

## Issues Encountered
- See Deviations above — the git index race was the only issue, fully resolved without data loss.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Plan 04 (live-browser verification, depends on this plan) can now confirm visually: demo Company tab renders all fields disabled with the footer note, demo Team tab shows role pills with no Invite/manage controls, demo Notifications tab renders all switches/buttons disabled with its footer note.
- No blockers for sibling plans 181-01/181-03 introduced by this plan's changes (files_modified scope was respected in every commit except the one incident above, which caused no content loss).

## Known Stubs
None - all 3 forms wire live props (`isDemoCompany(...)`), no hardcoded/mocked read-only state.

---
*Phase: 181-real-product-cutover-verification*
*Completed: 2026-07-27*

## Self-Check: PASSED

All 6 created/modified files confirmed present on disk; all 3 commits (`adea1dbc`, `80f0cd2b`, `abb0bc2d`) confirmed in git history.
