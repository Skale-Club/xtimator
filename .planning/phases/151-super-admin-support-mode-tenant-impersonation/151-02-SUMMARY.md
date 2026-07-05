---
phase: 151-super-admin-support-mode-tenant-impersonation
plan: 02
subsystem: app-shell
tags: [layout, impersonation, banner, server-components]

# Dependency graph
requires:
  - phase: 151-01
    provides: "getSupportModeSession()/endSupportSession() from lib/auth/support-mode.ts"
provides:
  - "SupportModeBanner — fixed identity banner (ShieldCheck icon, admin+company copy, Exit CTA)"
  - "app/(app)/layout.tsx Support Mode branch — service-role company resolution + switcher suppression + banner-exclusivity, checked before getActiveCompany()"
affects: [151-03 (Companies-list entry point that mints the session this branch consumes)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Static-source contract tests (readFileSync + string-index ordering) for a Server Component branch, mirroring Phase 150's adminIdx<svcIdx precedent"
    - "Support Mode branch renders its own full JSX return early, before the normal flow's Promise.all — avoids threading a impersonation flag through every downstream variable"

key-files:
  created:
    - components/admin/support-mode-banner.tsx
    - tests/unit/support-mode-layout.test.ts
  modified:
    - "app/(app)/layout.tsx"
    - .planning/phases/151-super-admin-support-mode-tenant-impersonation/deferred-items.md

key-decisions:
  - "Support Mode Topbar renders percentUsed={0} (not the plan's stale creditBalance={0}) — Phase 152 (already on main) renamed Topbar's billing prop from creditBalance to percentUsed since this plan's snapshot was written; preserved the plan's intent (no real billing data leak into an admin's impersonated view) by hardcoding the new prop's zero-equivalent instead"
  - "isDemo hardcoded false and DemoBanner/TrialBanner entirely absent from the support-mode branch (Pitfall 2) — the branch never evaluates isDemoCompany() or the trial-days calculation against the impersonated company's data"
  - "On supportCompany resolution failure (e.g. company deleted mid-session), the branch falls through to the normal flow rather than erroring — matches CONTEXT.md's guidance and lets getActiveCompany() take over for the admin's own membership"

patterns-established:
  - "Server Component impersonation branches return their own full JSX tree early rather than injecting a conditional deep inside the normal render path — keeps the tenant's real render path byte-for-byte untouched"

requirements-completed: [SUPPORT-02, SUPPORT-04]

# Metrics
duration: 20min
completed: 2026-07-05
---

# Phase 151 Plan 02: Support Mode Banner + Layout Wiring Summary

**Support Mode branch inserted into `app/(app)/layout.tsx` ahead of `getActiveCompany()` — service-role company resolution, `memberships=[]` switcher suppression, and a fixed `SupportModeBanner` (mirroring `DemoBanner`'s exact structure) replacing any demo/trial banner while impersonating.**

## Performance

- **Duration:** 20 min
- **Started:** 2026-07-05T18:50:00Z
- **Completed:** 2026-07-05T19:10:00Z
- **Tasks:** 2
- **Files modified:** 3 (2 created, 1 modified) + 1 deferred-items append

## Accomplishments
- `SupportModeBanner` (`components/admin/support-mode-banner.tsx`) renders `ShieldCheck` icon, "Support Mode — viewing {companyName} as {adminEmail}." copy, and an inline `<form action={endSupportSession}>` Exit CTA — structurally identical to `DemoBanner` (SUPPORT-02)
- `app/(app)/layout.tsx` checks `getSupportModeSession()` immediately after the auth-claims gate, strictly before `getActiveCompany()` — a super admin with a valid session never touches the tenant's own active-company/RLS resolution path (SUPPORT-04, continued from Plan 01)
- On a valid session, the company is resolved via `requireServiceClient()` directly (never `getActiveCompanyId()`), `memberships={[]}` is passed to `Sidebar` (switcher suppressed — degrades gracefully per `CompanySelector`'s existing `?? companies[0] ?? null` fallback), and `isDemo`/trial-days are never evaluated against the impersonated company (Pitfall 2 — no `DemoBanner`/`TrialBanner` leak)
- On session-but-company-resolution-failure (e.g. deleted company), the branch falls through to the unchanged normal flow rather than erroring
- The single, unchanged `getActiveCompany()` call site in the normal flow is provably still present (`grep -n "getActiveCompany()"` shows exactly one real call site plus one comment mention)
- All 9 Wave 0 static-source tests green; full unit suite shows 7 pre-existing, unrelated failures (none touching this plan's 3 files) — confirmed via `git log --stat` on the relevant commits

## Task Commits

1. **Task 1 (RED): Write Wave 0 failing static-source tests** - `bcb7197d` (test)
1. **Task 1 (GREEN): Create SupportModeBanner** - `d490a87e` (feat)
2. **Task 2: Wire Support Mode branch into app/(app)/layout.tsx** - `8d4d54f6` (feat)

**Plan metadata:** (this commit, following)

## Files Created/Modified
- `components/admin/support-mode-banner.tsx` - fixed banner component, mirrors `DemoBanner`'s classes/structure, binds `endSupportSession` via a bare form action
- `tests/unit/support-mode-layout.test.ts` - Wave 0 static-source contract tests: branch ordering, switcher suppression, banner-exclusivity, banner-contract, exit-navigation
- `app/(app)/layout.tsx` - new Support Mode branch inserted before `getActiveCompany()`; normal flow below it left byte-for-byte unchanged
- `.planning/phases/151-super-admin-support-mode-tenant-impersonation/deferred-items.md` - appended the 7 pre-existing, unrelated full-suite failures found during this plan's verification pass

## Decisions Made
- Adapted the plan's `Topbar` prop from `creditBalance={0}` to `percentUsed={0}` — Phase 152 (already shipped to main before this plan ran) renamed that prop; the zero-value intent (no real billing data surfaced in the impersonation view, since this phase is read/view-only) is preserved exactly, just against the current prop name
- Reworded an inline comment near the new branch to avoid an accidental literal `getActiveCompany()` substring match, which was making the Wave 0 branch-ordering test's `indexOf` pick up the wrong (earlier) occurrence — a same-plan test-authoring correction, not a deviation from the plan's design

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Adapted layout snapshot to the real current file (Phase 152 prop rename)**
- **Found during:** Task 2
- **Issue:** The plan's `<interfaces>` snapshot of `app/(app)/layout.tsx` was captured before Phase 152 (already merged to `main`) renamed `Topbar`'s `creditBalance` prop to `percentUsed` and added a `cfg`/`getBillingConfig()` step to the normal flow's `Promise.all`. Following the plan's snapshot verbatim would have broken the build (unknown prop / stale interface).
- **Fix:** Read the real current file first (per this plan's `<caution>` instruction), confirmed `Topbar`'s actual prop is `percentUsed?: number`, and passed `percentUsed={0}` in the support-mode branch instead of the plan's literal `creditBalance={0}` — same "hide real billing data" intent, correct prop name. Left the normal flow's `cfg`/`getBillingConfig()`/`computeUsagePercent` wiring completely untouched, as required.
- **Files modified:** `app/(app)/layout.tsx`
- **Verification:** `npx tsc --noEmit` — zero new errors in `app/(app)/layout.tsx`; Wave 0 tests green
- **Committed in:** `8d4d54f6`

**2. [Rule 3 - Blocking] Fixed a false-positive substring collision in the branch-ordering test**
- **Found during:** Task 2 (GREEN pass)
- **Issue:** After wiring the branch, 2 of 9 Wave 0 tests still failed. Root cause: an inline comment I added near the top of the new branch (`"...never getActiveCompany()."`) contained the literal string `getActiveCompany()`, which `src.indexOf('getActiveCompany()')` matched BEFORE the real call site further down the file — collapsing the branch-ordering and branch-isolation assertions.
- **Fix:** Reworded the comment to avoid the literal substring (`"...never via the tenant's own active-company resolver."`) while preserving its explanatory intent.
- **Files modified:** `app/(app)/layout.tsx`
- **Verification:** `npx vitest run tests/unit/support-mode-layout.test.ts` — all 9 tests green after the reword
- **Committed in:** `8d4d54f6` (part of Task 2's single commit; the reword happened before the commit was made, so no separate fix-up commit was needed)

---

**Total deviations:** 2 auto-fixed (both Rule 3 — blocking issues caused by the plan's interface snapshot predating unrelated concurrent work, and a self-inflicted test-matching collision), both resolved before Task 2's commit
**Impact on plan:** No scope creep. Both fixes are internal to this plan's own file (`app/(app)/layout.tsx`) and preserve every must_have truth and key_link from the plan frontmatter.

## Issues Encountered
- Full `npm test` run showed 7 failing tests across 6 files (`blog-rls.test.ts`, `cleanup-route-auth.test.ts`, `company-action.test.ts`, `empty-output-guards.test.ts`, `transcribe-fallback.test.ts`, `landing-page.test.tsx`) — none reference this plan's 3 files, confirmed via `git log --stat` on the relevant commits (none touched these test files). Logged in `deferred-items.md`, not fixed, per the scope-boundary rule. Likely a mix of DB-dependent integration tests (blog RLS) and the known Windows parallel-import flakes already documented in project memory.
- `npx tsc --noEmit` reports the same pre-existing 42 lines of type errors documented in Plan 01's `deferred-items.md` — confirmed zero new errors in `app/(app)/layout.tsx` or `components/admin/support-mode-banner.tsx`.
- One unrelated, uncommitted concurrent change was observed mid-session (`lib/notifications/copy.ts`, `tests/unit/notifications/copy-tenant-neutrality.test.ts`, `152-VERIFICATION.md`) from what appears to be a parallel Phase 152 process — not touched, staged, or committed by this plan, per the explicit caution in this plan's instructions.

## User Setup Required

None — no external service configuration required. This plan only adds UI/routing wiring over Plan 01's already-configured session module.

## Next Phase Readiness
- Plan 03 (Companies-list entry point) can now mint a Support Mode session via `startSupportSession(companyId)` and expect the tenant app shell to render correctly under `SupportModeBanner` the moment the admin navigates into `/dashboard` or any tenant route.
- The switcher-suppression mechanism (`memberships={[]}`) and banner-exclusivity are both test-locked (Wave 0), so any future edit to `app/(app)/layout.tsx` that reintroduces `DemoBanner`/`TrialBanner` into the support-mode branch, or restores a populated `memberships` array there, will fail CI.
- No blockers.

---
*Phase: 151-super-admin-support-mode-tenant-impersonation*
*Completed: 2026-07-05*

## Self-Check: PASSED

- FOUND: components/admin/support-mode-banner.tsx
- FOUND: tests/unit/support-mode-layout.test.ts
- FOUND: app/(app)/layout.tsx (modified)
- FOUND: bcb7197d (test commit)
- FOUND: d490a87e (feat commit — banner)
- FOUND: 8d4d54f6 (feat commit — layout wiring)
