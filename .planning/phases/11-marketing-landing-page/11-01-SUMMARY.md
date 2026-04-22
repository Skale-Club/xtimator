---
phase: 11-marketing-landing-page
plan: 01
subsystem: middleware
tags: [routing, middleware, landing-page, public-routes, tdd]
dependency_graph:
  requires: []
  provides: [public-root-route, authenticated-root-redirect]
  affects: [lib/supabase/proxy.ts, tests/unit/middleware.test.ts]
tech_stack:
  added: []
  patterns: [isLandingRoot flag pattern, isAuthRoute/isPublicEstimate guard extension]
key_files:
  created: []
  modified:
    - lib/supabase/proxy.ts
    - tests/unit/middleware.test.ts
decisions:
  - "D-01: / is a public route — isLandingRoot = pathname === '/' exempts landing root from auth-redirect guard"
  - "D-02: Authenticated / → /dashboard redirect via claims && isLandingRoot check in middleware"
metrics:
  duration: 10min
  completed: 2026-04-22
  tasks: 2
  files: 2
requirements: [LAND-01, LAND-04]
---

# Phase 11 Plan 01: Middleware Public Root Route Summary

Middleware updated to make `/` publicly reachable for unauthenticated visitors (prerequisite gate for the marketing landing page) and redirect authenticated visitors to `/dashboard`. Four new unit tests cover both routing behaviors.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add middleware test cases for / routing | bdf4311 | tests/unit/middleware.test.ts |
| 2 | Update lib/supabase/proxy.ts to make / public and redirect authenticated users | 17e9660 | lib/supabase/proxy.ts |

## What Was Built

### lib/supabase/proxy.ts changes

Two targeted edits to `updateSession()`:

1. Added `isLandingRoot = pathname === '/'` declaration (D-01: `/` is public; D-02: authenticated `/` → `/dashboard`)
2. Extended unauthenticated guard: `!claims && !isAuthRoute && !isPublicEstimate && !isLandingRoot` — prevents unauthenticated visitors from being bounced to `/login`
3. New redirect block: `if (claims && isLandingRoot)` → `NextResponse.redirect('/dashboard')` with set-cookie header preservation

### tests/unit/middleware.test.ts changes

New `describe` block: `'Landing root (/) routing rules (D-01, D-02)'` with four `it()` cases:
- `/ is a public (landing root) route` — verifies `isLandingRoot` is true for `pathname === '/'`
- `unauthenticated GET / does NOT trigger the protected-route redirect` — verifies combined guard evaluates false
- `authenticated GET / triggers redirect to /dashboard` — verifies `!!claims && isLandingRoot` is true
- `authenticated GET /dashboard does NOT trigger the landing-root redirect` — verifies false for other paths

## Verification

- `npm test -- --run tests/unit/middleware.test.ts` exits 0 with 9 tests passing (5 existing + 4 new)
- All acceptance criteria strings confirmed present in both files
- Pre-existing failures in unrelated test files (server-only alias, integration env vars) are out of scope and unchanged

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — this plan modifies only routing logic; no UI components or data rendering involved.

## Self-Check: PASSED

- lib/supabase/proxy.ts: contains `isLandingRoot = pathname === '/'` at line 37
- lib/supabase/proxy.ts: contains `!isLandingRoot` at line 39
- lib/supabase/proxy.ts: contains `claims && isLandingRoot` at line 51
- lib/supabase/proxy.ts: contains `url.pathname = '/dashboard'` at line 53
- tests/unit/middleware.test.ts: contains `Landing root (/) routing rules` at line 37
- tests/unit/middleware.test.ts: contains `pathname === '/'` at lines 40, 49, 58, 66
- Commit bdf4311: exists (test task)
- Commit 17e9660: exists (feat task)
