---
phase: 157-admin-nav-reorg-naming-fixes
plan: 02
subsystem: ui
tags: [nextjs, react, copy-rename, settings, admin]

# Dependency graph
requires: []
provides:
  - "Settings sidebar 'Message' label renamed to 'Message Template' (route/value/Icon unchanged)"
  - "estimate-templates page heading and browser tab title read 'Message Template'"
  - "Support Mode button/banner user-facing copy renamed to 'View as Company' / 'Viewing {company} as {admin}' / 'Exit view'"
affects: [157-03]

# Tech tracking
tech-stack:
  added: []
  patterns: []

key-files:
  created: []
  modified:
    - components/settings/settings-nav.tsx
    - "app/(app)/settings/estimate-templates/page.tsx"
    - "app/(app)/settings/estimate-templates/loading.tsx"
    - app/admin/companies/support-mode-button.tsx
    - components/admin/support-mode-banner.tsx

key-decisions:
  - "Also updated internal JSDoc comments in support-mode-button.tsx and support-mode-banner.tsx that referenced the old 'Support Mode' user-facing label, to keep documentation consistent with the new copy — internal function/component/file/cookie/audit-log names were NOT touched"

patterns-established: []

requirements-completed: [NAMING-01, NAMING-02]

# Metrics
duration: 6min
completed: 2026-07-06
---

# Phase 157 Plan 02: Message Template + View as Company Renames Summary

**Tenant Settings sidebar "Message" renamed to "Message Template"; super-admin "Support Mode" button/banner copy renamed to "View as Company" / "Exit view" — all internal function, component, file, cookie, and audit-log names left byte-identical.**

## Performance

- **Duration:** 6 min
- **Started:** 2026-07-06T04:32:00Z
- **Completed:** 2026-07-06T04:38:22Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Tenant Settings sidebar `templates` nav item now reads "Message Template" (was bare "Message"), matching what the page's own card title (`EstimateTemplateForm`) already called itself — `value: 'templates'` and `href: '/settings/estimate-templates'` untouched.
- `/settings/estimate-templates` page `<h1>` and `<title>` metadata both read "Message Template"; the route's `loading.tsx` skeleton title prop matches.
- Companies-list row action button (`SupportModeButton`) now renders "View as Company →" (was "Support Mode →"); both error-toast messages read "Couldn't view as this company[.]..." instead of "Couldn't start Support Mode...".
- Active-session banner (`SupportModeBanner`) drops the redundant "Support Mode —" prefix entirely, now reading "Viewing {companyName} as {adminEmail}."; the exit button reads "Exit view" (was "Exit Support Mode").
- Zero regressions to the underlying session flow: `startSupportSessionAction` import/call, `router.push('/dashboard')`, `endSupportSession` form action, and all internal function/component/interface/file names verified byte-identical to before.

## Task Commits

Each task was committed atomically:

1. **Task 1: Rename "Message" to "Message Template" across settings nav and page** - `8bf042bd` (feat)
2. **Task 2: Rename "Support Mode" to "View as Company" in button and banner copy** - `6eea4d27` (feat)

**Plan metadata:** (this commit) `docs(157-02): complete plan`

## Files Created/Modified
- `components/settings/settings-nav.tsx` - `templates` nav item label changed `'Message'` -> `'Message Template'`
- `app/(app)/settings/estimate-templates/page.tsx` - `metadata.title` and `<h1>` content changed to "Message Template"
- `app/(app)/settings/estimate-templates/loading.tsx` - `SettingsPageSkeleton` `title` prop changed to "Message Template"
- `app/admin/companies/support-mode-button.tsx` - button label + both toast error strings renamed to "View as Company" / "Couldn't view as this company..."; JSDoc comment updated to match
- `components/admin/support-mode-banner.tsx` - banner copy drops "Support Mode —" prefix, exit button renamed "Exit view"; JSDoc comment updated to match

## Decisions Made
- The plan's file list didn't explicitly call out the JSDoc comment blocks above each component, but they contained the exact old user-facing strings ("Support Mode session", `"Support Mode →" label`) as documentation. Updated them for consistency with the new copy while leaving every internal identifier (function names, prop interfaces, imports, file names, cookie name, audit-log literals) completely unchanged — this is documentation-accuracy housekeeping, not a scope change, and satisfies the plan's own acceptance criteria of `grep -c "Support Mode"` returning 0 in both files.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - doc consistency] Updated stale JSDoc comments referencing old "Support Mode" copy**
- **Found during:** Task 2 (Support Mode -> View as Company rename)
- **Issue:** The plan's acceptance criteria require `grep -c "Support Mode" <file>` to return exactly 0 for both `support-mode-button.tsx` and `support-mode-banner.tsx`. The JSDoc comments above `SupportModeButton` and `SupportModeBanner` referenced the old label text directly (`"Support Mode →" label`, `viewing a company via Support Mode`), which would have failed that literal grep check and left stale docs.
- **Fix:** Reworded the comment prose to describe the "View as Company" / view-as-company session, explicitly noting internal names are unchanged per 157-CONTEXT.md NAMING-02. No identifier, import, or file name was touched.
- **Files modified:** app/admin/companies/support-mode-button.tsx, components/admin/support-mode-banner.tsx
- **Verification:** `grep -c "Support Mode" <file>` returns 0 for both files; `grep -n "SupportModeButton\|SupportModeButtonProps\|startSupportSessionAction"` and `grep -n "SupportModeBanner\|SupportModeBannerProps\|endSupportSession"` still match, confirming internal names untouched.
- **Committed in:** 6eea4d27 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (doc consistency, Rule 2)
**Impact on plan:** No scope creep — comment-only change required to satisfy the plan's own literal grep acceptance criteria. No internal naming, routing, or wiring touched.

## Issues Encountered
- `npx tsc --noEmit` surfaces ~15 pre-existing type errors across unrelated test files (`tests/unit/billing/*`, `tests/unit/whatsapp/*`, `tests/unit/estimate/*`, etc. — missing `chatEnabled`/`includedSeats`/`subscriptionPriceAnnualCents` fields, regex flag targeting, mock typing). None reference `support-mode-button.tsx`, `support-mode-banner.tsx`, `settings-nav.tsx`, or the `estimate-templates` page/loading files touched by this plan — confirmed via targeted grep on the `tsc` output. Out of scope per the deviation rules' scope boundary (pre-existing, unrelated to this plan's changes); not fixed, not logged to a separate deferred-items file since they are a pre-existing repo-wide condition rather than something newly introduced or blocking this plan's tasks.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

**For 157-03 (wave 2, test updates for the Support Mode rename):** the FINAL locked copy to match in test assertions is:
- Button label: `View as Company →` (regex target: `/View as Company/`)
- Error toasts: `Couldn't view as this company. Please try again.` and the template-literal form `` Couldn't view as this company. ${reason} `` (regex target: `/Couldn't view as this company/` or similar)
- Banner text: `Viewing <strong>{companyName}</strong> as {adminEmail}.` — no "Support Mode —" prefix (regex target: `/Viewing/` combined with company/admin name checks, NOT `/Support Mode/`)
- Exit button: `Exit view` (regex target: `/Exit view/`)
- All internal identifiers referenced by structural test assertions (`SupportModeButton`, `SupportModeBannerProps`, `startSupportSessionAction`, `endSupportSession`, cookie `support_mode_session`, audit-log literals `company.support_mode_start`/`company.support_mode_end`) remain UNCHANGED — those existing assertions do not need updates.

No blockers. This plan's two files (`support-mode-button.tsx`, `support-mode-banner.tsx`) plus the three settings files are fully disjoint from 157-01's nav-reorg/Legal-Pages work, confirmed no git conflicts during concurrent execution (157-01 was actively moving `app/admin/legal/` -> `app/admin/pages/` and modifying `components/admin/admin-nav.tsx` at the same time this plan executed; neither executor staged the other's files).

---
*Phase: 157-admin-nav-reorg-naming-fixes*
*Completed: 2026-07-06*

## Self-Check: PASSED

- FOUND: components/settings/settings-nav.tsx
- FOUND: app/(app)/settings/estimate-templates/page.tsx
- FOUND: app/(app)/settings/estimate-templates/loading.tsx
- FOUND: app/admin/companies/support-mode-button.tsx
- FOUND: components/admin/support-mode-banner.tsx
- FOUND commit: 8bf042bd
- FOUND commit: 6eea4d27
