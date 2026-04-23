---
phase: 11-marketing-landing-page
plan: 01
subsystem: ui
tags: [nextjs, proxy, playwright, vitest, landing-page, supabase]
requires:
  - phase: 10-global-brand-tokens
    provides: global brand primary token and semantic dark-theme utilities
provides:
  - public root route that serves a marketing landing page for anonymous visitors
  - proxy-layer fast path redirect from / to /dashboard for authenticated users
  - baseline automated coverage for landing hero, story sections, and root-route behavior
affects: [phase-11-plan-02, marketing-site, auth-routing]
tech-stack:
  added: []
  patterns:
    - shallow landing-page composition under components/landing
    - shared isPublicRoute helper for proxy route classification and unit assertions
key-files:
  created:
    - components/landing/landing-page.tsx
    - components/landing/hero-section.tsx
    - components/landing/how-it-works-section.tsx
    - components/landing/features-section.tsx
    - components/landing/final-cta-section.tsx
    - components/landing/landing-footer.tsx
    - tests/e2e/landing-page.spec.ts
  modified:
    - app/page.tsx
    - proxy.ts
    - lib/supabase/proxy.ts
    - tests/unit/middleware.test.ts
key-decisions:
  - Keep authenticated-root redirects in proxy.ts so the root page stays a pure server render for public traffic.
  - Split the landing page into a shallow section set to keep phase-11 copy and styling isolated from the app shell.
patterns-established:
  - "Public-root routing: treat / as public in isPublicRoute, then short-circuit authenticated traffic to /dashboard in proxy.ts."
  - "Landing baseline tests: use Playwright route assertions plus env-gated live-login coverage for authenticated positive-path checks."
requirements-completed: [LAND-01, LAND-02, LAND-03]
duration: 9min
completed: 2026-04-23
---

# Phase 11 Plan 01: Marketing Landing Baseline Summary

**Public root-page marketing flow with proxy-level authenticated fast-path routing and a five-section dark landing page for field-service quoting.**

## Performance

- **Duration:** 9 min
- **Started:** 2026-04-23T12:39:20Z
- **Completed:** 2026-04-23T12:49:20Z
- **Tasks:** 2
- **Files modified:** 11

## Accomplishments
- Opened `/` for anonymous visitors while preserving the authenticated redirect to `/dashboard` in `proxy.ts`.
- Shipped the landing-page baseline with hero, how-it-works, features, final CTA, and footer sections.
- Added route-level unit coverage and Playwright coverage for hero visibility, section presence, and root behavior.

## Task Commits

Each task was committed atomically:

1. **Task 1: Open the root route and add routing safety coverage** - `763f4bd` (feat)
2. **Task 2: Build the public landing page sections** - `cb21767` (feat)

**Plan metadata:** pending docs commit

## Files Created/Modified
- `proxy.ts` - redirects authenticated root visits to `/dashboard` while preserving refreshed cookies.
- `lib/supabase/proxy.ts` - centralizes public-route classification for `/`, auth pages, and public estimate links.
- `tests/unit/middleware.test.ts` - locks the public-root and protected-route classification rules.
- `tests/e2e/landing-page.spec.ts` - covers hero, how-it-works, features, anonymous root behavior, and env-gated authenticated redirect behavior.
- `app/page.tsx` - renders the public landing page instead of redirecting visitors to login.
- `components/landing/*` - composes the production landing-page baseline into shallow, phase-scoped sections.

## Decisions Made
- Kept the authenticated `/` redirect in `proxy.ts` instead of page logic so signed-in users still fast-path before any landing UI work executes.
- Reused the existing live-login Playwright pattern for the authenticated positive-path test and gated it behind credentials instead of inventing a fake session harness.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added a temporary hero-only landing composition so Task 1 verification could run before the remaining sections shipped**
- **Found during:** Task 1 (Open the root route and add routing safety coverage)
- **Issue:** The task required a passing hero smoke test at `/`, but the full section stack belonged to Task 2.
- **Fix:** Committed a minimal landing composition for Task 1, then expanded it to the full five-section layout in Task 2.
- **Files modified:** `app/page.tsx`, `components/landing/landing-page.tsx`, `components/landing/hero-section.tsx`, `tests/e2e/landing-page.spec.ts`
- **Verification:** `npm run test:e2e -- tests/e2e/landing-page.spec.ts -g hero`
- **Committed in:** `763f4bd`

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** The deviation kept Task 1 verifiable without changing the final scope; Task 2 completed the intended landing composition immediately afterward.

## Auth Gates

None.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Known Stubs

None.

## Next Phase Readiness
- Plan 11-02 can focus on mobile-specific assertions, polish, and visual refinement instead of first-pass routing or content structure.
- Deferred local changes are tracked in `deferred-items.md` for follow-up scoping.

## Self-Check: PASSED

- Verified summary and all shipped landing files exist on disk.
- Verified task commits `763f4bd` and `cb21767` exist in git history.
