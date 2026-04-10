---
phase: 02-company-onboarding
plan: 03
subsystem: api
tags: [supabase, server-actions, storage, nextjs]

# Dependency graph
requires:
  - phase: 02-company-onboarding/02-01
    provides: "OnboardingValues type and Zod schema"
  - phase: 02-company-onboarding/02-02
    provides: "Onboarding wizard UI with stub server action"
  - phase: 01-foundation-auth
    provides: "getClaims() auth pattern, Supabase server client, companies table migration"
provides:
  - "createOrUpdateCompany server action for persisting company data"
  - "Logo upload to Supabase Storage logos bucket"
  - "Complete onboarding pipeline: form -> server action -> database -> redirect"
affects: [phase-03-dashboard, phase-07-settings]

# Tech tracking
tech-stack:
  added: []
  patterns: ["SELECT-then-INSERT/UPDATE for upsert without UNIQUE constraint", "Logo upload to Storage with user-scoped path"]

key-files:
  created: []
  modified:
    - lib/actions/company.ts
    - components/onboarding/onboarding-wizard.tsx

key-decisions:
  - "SELECT-then-INSERT/UPDATE pattern instead of upsert due to missing UNIQUE constraint on user_id"
  - "Logo stored at {user_id}/logo.{ext} path in logos bucket"
  - "Industry resolution: 'other' maps to customIndustry value"

patterns-established:
  - "Company persistence: getClaims() -> SELECT existing -> INSERT or UPDATE -> redirect"
  - "Storage upload: browser-side upload with user-scoped path prefix"

requirements-completed: [ONBOARD-04, ONBOARD-07, ONBOARD-08]

# Metrics
duration: 8min
completed: 2026-04-10
---

# Phase 2 Plan 3: Company Persistence Summary

**Server action replacing stub with full SELECT-then-INSERT/UPDATE company persistence, logo upload to Storage, and redirect to dashboard**

## Performance

- **Duration:** 8 min
- **Started:** 2026-04-10T11:00:00Z
- **Completed:** 2026-04-10T11:08:00Z
- **Tasks:** 2 (1 auto + 1 human-verify checkpoint)
- **Files modified:** 2

## Accomplishments
- Replaced createOrUpdateCompany stub with full server action mapping all OnboardingValues to companies table columns
- Implemented SELECT-then-INSERT/UPDATE pattern to handle missing UNIQUE constraint on user_id
- Wired logo upload in wizard handleComplete to Supabase Storage with user-scoped path
- Skip flow creates minimal company row with "My Company" default name
- Success path redirects to /dashboard per ONBOARD-07

## Task Commits

Each task was committed atomically:

1. **Task 1: Server action for company persistence** - `40017b3` (feat)
2. **Task 2: Verify full onboarding flow** - human-verify checkpoint (approved by user)

**Plan metadata:** (pending - this commit)

## Files Created/Modified
- `lib/actions/company.ts` - Full server action: auth via getClaims(), field mapping to DB columns, SELECT-then-INSERT/UPDATE, error handling, redirect
- `components/onboarding/onboarding-wizard.tsx` - Updated handleComplete to upload logo to Storage and pass logoUrl to server action

## Decisions Made
- Used SELECT-then-INSERT/UPDATE instead of upsert because user_id has no UNIQUE constraint (documented in 02-RESEARCH.md Pitfall 6)
- Logo stored at `{user_id}/logo.{ext}` path in the logos bucket for simple user-scoped access
- Industry field resolves "other" selection to the customIndustry free-text value

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Known Stubs
None - all stubs from Plan 02 have been replaced with real implementations.

## Next Phase Readiness
- Company onboarding pipeline is complete: form -> validation -> server action -> database -> redirect
- Phase 3 (Dashboard & Client Management) can proceed - authenticated users with company records can access /dashboard
- Settings page (Phase 7) will reuse createOrUpdateCompany for editing company info

## Self-Check: PASSED

- SUMMARY.md: FOUND
- Commit 40017b3: FOUND

---
*Phase: 02-company-onboarding*
*Completed: 2026-04-10*
