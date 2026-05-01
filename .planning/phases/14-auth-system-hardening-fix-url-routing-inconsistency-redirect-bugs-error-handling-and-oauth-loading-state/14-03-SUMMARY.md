---
phase: 14-auth-system-hardening-fix-url-routing-inconsistency-redirect-bugs-error-handling-and-oauth-loading-state
plan: 03
subsystem: testing
tags: [vitest, playwright, auth, routing, jsdom]
requires:
  - phase: 14-auth-system-hardening-fix-url-routing-inconsistency-redirect-bugs-error-handling-and-oauth-loading-state
    provides: corrected production auth routes and hardened middleware behavior
provides:
  - unit coverage for live auth routes in middleware and landing components
  - e2e specs that navigate to the fixed auth URLs
  - jsdom-safe landing tests for framer-motion components
affects: [unit-tests, e2e-tests, landing, auth]
tech-stack:
  added: []
  patterns: [stub browser-only observers in unit tests when framer-motion viewport features run under jsdom]
key-files:
  created: []
  modified:
    - tests/unit/middleware.test.ts
    - tests/unit/components/landing-page.test.tsx
    - tests/e2e/auth.spec.ts
    - tests/e2e/auth-dark.spec.ts
    - tests/e2e/dark-mode.spec.ts
    - tests/e2e/landing-page.spec.ts
    - tests/e2e/onboarding-survey.spec.ts
    - tests/e2e/admin-branding.spec.ts
    - tests/e2e/admin-integrations.spec.ts
    - tests/e2e/admin-admins.spec.ts
    - tests/e2e/admin-gate.spec.ts
key-decisions:
  - "Landing component tests stub IntersectionObserver locally so framer-motion viewport features do not break jsdom"
  - "Pending Playwright placeholders use skipped empty tests instead of invalid test.todo typings"
patterns-established:
  - "When auth URLs change, unit assertions, Playwright navigation, waitForURL patterns, and fallback descriptions must all update together"
requirements-completed: []
duration: 14min
completed: 2026-05-01
---

# Phase 14 Plan 03: Test Alignment Summary

**Vitest and Playwright auth coverage now exercises the live /login, /signup, /reset-password, and /callback routes, with landing tests stabilized for framer-motion under jsdom.**

## Performance

- **Duration:** 14 min
- **Started:** 2026-05-01T21:30:00Z
- **Completed:** 2026-05-01T21:44:16Z
- **Tasks:** 2
- **Files modified:** 11

## Accomplishments
- Updated middleware and landing unit tests to assert the real public auth routes and hero CTA hrefs
- Repointed all relevant Playwright auth navigation, URL assertions, and login helpers to `/login`, `/signup`, and `/reset-password`
- Added a local `IntersectionObserver` stub so landing tests pass in jsdom with framer-motion viewport hooks enabled

## Task Commits

Each task was committed atomically:

1. **Task 1: Fix unit tests — isPublicRoute expectations and landing href assertions** - `a3aeade` (test)
2. **Task 2: Fix all Playwright E2E tests to use /login, /signup, /reset-password** - `05ace7f` (test)

**Plan metadata:** pending final phase docs commit

## Files Created/Modified
- `tests/unit/middleware.test.ts` - Public-route expectations for `/login`, `/signup`, `/reset-password`, and `/callback`
- `tests/unit/components/landing-page.test.tsx` - Hero href assertions plus jsdom `IntersectionObserver` stub
- `tests/e2e/auth.spec.ts` - Core auth navigation and redirect expectations
- `tests/e2e/dark-mode.spec.ts` - Public-route dark-mode coverage aligned to live auth URLs
- `tests/e2e/admin-gate.spec.ts` - Signup/login helper paths and post-auth wait regex

## Decisions Made
- Stubbed `IntersectionObserver` inside the landing component test file rather than changing the shared test harness because the viewport dependency only blocked this suite.
- Replaced invalid typed `test.todo(...)` placeholders with skipped no-op tests so TypeScript no longer fails inside `tests/e2e/auth.spec.ts`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Stabilized landing unit tests under jsdom**
- **Found during:** Task 1 (Fix unit tests — isPublicRoute expectations and landing href assertions)
- **Issue:** `npx vitest run tests/unit/` failed because framer-motion's viewport hooks required `IntersectionObserver` in jsdom.
- **Fix:** Added a local `IntersectionObserver` stub in `tests/unit/components/landing-page.test.tsx`.
- **Files modified:** `tests/unit/components/landing-page.test.tsx`
- **Verification:** `npx vitest run tests/unit/` passed with 39 files and 248 tests green.
- **Committed in:** `a3aeade` (part of task commit)

**2. [Rule 3 - Blocking] Removed invalid Playwright placeholder typing**
- **Found during:** Task 2 (Fix all Playwright E2E tests to use /login, /signup, /reset-password)
- **Issue:** `npx tsc --noEmit --project tsconfig.json` failed in `tests/e2e/auth.spec.ts` because the existing `test.todo(...)` overload was not valid for this setup.
- **Fix:** Switched the pending placeholders to skipped no-op tests while updating their route descriptions.
- **Files modified:** `tests/e2e/auth.spec.ts`
- **Verification:** `npx tsc --noEmit --project tsconfig.json` no longer reports `tests/e2e/auth.spec.ts` errors.
- **Committed in:** `05ace7f` (part of task commit)

---

**Total deviations:** 2 auto-fixed (2 blocking)
**Impact on plan:** Both fixes were necessary to complete the requested verification and keep the auth test suite aligned with the updated routes.

## Issues Encountered
- `npx tsc --noEmit --project tsconfig.json` still reports a pre-existing unrelated error in `tests/unit/env.test.ts`; this plan left that out of scope.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Auth regression coverage is aligned with production behavior and unit tests are green.
- Phase 13 still needs later human smoke approval; Phase 14 completion does not clear that deferred manual checkpoint.

## Self-Check: PASSED

---
*Phase: 14-auth-system-hardening-fix-url-routing-inconsistency-redirect-bugs-error-handling-and-oauth-loading-state*
*Completed: 2026-05-01*
