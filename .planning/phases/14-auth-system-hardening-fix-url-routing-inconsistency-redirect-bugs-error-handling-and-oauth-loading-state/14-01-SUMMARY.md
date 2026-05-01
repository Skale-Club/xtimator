---
phase: 14-auth-system-hardening-fix-url-routing-inconsistency-redirect-bugs-error-handling-and-oauth-loading-state
plan: 01
subsystem: auth
tags: [nextjs, app-router, supabase, redirects, middleware]
requires:
  - phase: 13-visual-identity-polish-robust-favicon-and-app-icons-across-all-surfaces
    provides: public metadata-route handling preserved while auth routes are corrected
provides:
  - corrected public auth route detection for silent App Router route groups
  - production redirects and links that target /login, /signup, /reset-password, and /callback
affects: [auth-pages, proxy, onboarding, landing, callback]
tech-stack:
  added: []
  patterns: [silent route-group URLs must never appear with their parenthetical folder names]
key-files:
  created: []
  modified:
    - lib/supabase/proxy.ts
    - lib/actions/auth.ts
    - lib/actions/settings.ts
    - app/onboarding/page.tsx
    - app/(app)/layout.tsx
    - app/(app)/dashboard/page.tsx
    - app/(app)/settings/page.tsx
    - app/(app)/projects/new/page.tsx
    - app/(app)/clients/page.tsx
    - app/(app)/clients/[id]/page.tsx
    - app/(auth)/callback/route.ts
    - app/(auth)/signup/signup-form.tsx
    - app/(auth)/reset-password/reset-password-form.tsx
    - components/landing/landing-nav.tsx
    - components/settings/account-section.tsx
key-decisions:
  - "Auth route references use the live /login, /signup, /reset-password, and /callback paths, never /auth/*"
patterns-established:
  - "Silent route-group URL pattern: app/(auth)/... resolves without the /auth prefix"
requirements-completed: []
duration: 12min
completed: 2026-05-01
---

# Phase 14 Plan 01: Route Fix Summary

**Production auth navigation now resolves through the live /login, /signup, /reset-password, and /callback URLs instead of dead /auth/* paths.**

## Performance

- **Duration:** 12 min
- **Started:** 2026-05-01T21:32:00Z
- **Completed:** 2026-05-01T21:44:16Z
- **Tasks:** 2
- **Files modified:** 15

## Accomplishments
- Updated `lib/supabase/proxy.ts` so middleware recognizes the real public auth routes and redirects anonymous users to `/login`
- Repointed production redirects, callback targets, and UI links across auth, app-shell, onboarding, and landing files
- Removed broken `/auth/*` targets from production source so auth flows no longer lead to 404 pages

## Task Commits

Each task was committed atomically:

1. **Task 1: Fix isPublicRoute and redirect target in lib/supabase/proxy.ts** - `ecbf990` (fix)
2. **Task 2: Fix all /auth/* redirect and href references in server actions and layout/page files** - `84d5d1f` (fix)

**Plan metadata:** pending final phase docs commit

## Files Created/Modified
- `lib/supabase/proxy.ts` - Public-route detection and anonymous redirect target
- `lib/actions/auth.ts` - Sign-in and sign-out fallback redirects
- `lib/actions/settings.ts` - Delete-account redirect response
- `app/(auth)/callback/route.ts` - Recovery and fallback callback redirects
- `components/landing/landing-nav.tsx` - Marketing entry links to sign-in and signup

## Decisions Made
- Silent App Router route-group folders are treated as implementation detail only; all runtime URLs use the flattened path.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- `npx vitest run tests/unit/middleware.test.ts` remained expected to fail before Plan 03 because the test file still referenced `/auth/*` URLs at this point.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Password-reset, callback, OAuth, and proxy hardening can build on the corrected route contract.
- Phase 13 remains separately pending later human smoke approval; this plan does not change that checkpoint state.

## Self-Check: PASSED

---
*Phase: 14-auth-system-hardening-fix-url-routing-inconsistency-redirect-bugs-error-handling-and-oauth-loading-state*
*Completed: 2026-05-01*
