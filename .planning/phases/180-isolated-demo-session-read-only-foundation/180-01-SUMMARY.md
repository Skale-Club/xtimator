---
phase: 180-isolated-demo-session-read-only-foundation
plan: 01
subsystem: demo-authentication
tags: [nextjs, supabase-ssr, session-isolation, security, vitest, playwright]
requires: []
provides:
  - "Fixed-origin apex-to-demo entry handoff with no apex Auth work"
  - "Host-only dedicated demo session repair with verified membership and platform-admin rejection"
  - "Focused regression coverage for origin validation, session repair, and proxy ordering"
affects: [180-02, 180-03, 180-14, 181-real-product-cutover-and-verification]
tech-stack:
  added: []
  patterns:
    - "Response-bound Supabase SSR cookie writes on redirect responses"
    - "Configured-origin-only routing with terminal failures for invalid demo session state"
key-files:
  created:
    - lib/demo/session.ts
    - app/demo/entry/route.ts
    - tests/unit/demo/config.test.ts
    - tests/unit/demo/host-routing.test.ts
    - tests/unit/demo/session-route.test.ts
  modified:
    - lib/demo/config.ts
    - proxy.ts
    - playwright.config.ts
key-decisions:
  - "Only https://demo.xtimator.com and http://demo.localhost are accepted demo origins; HTTP is local-only."
  - "The exact demo route owns session creation while proxy bypasses Auth work for the apex handoff."
  - "A verified demo principal with any platform_admins row fails closed before dashboard access."
patterns-established:
  - "Demo redirects use parsed configured origins and fixed paths, never request headers or query input."
  - "Demo auth repair signs out locally, clears observed host cookies, and has no failure redirect."
requirements-completed: [ENTRY-01, ENTRY-02, ENTRY-03, ENTRY-04]
duration: 7 min
completed: 2026-07-26
---

# Phase 180 Plan 01: Isolated Demo Entry Foundation Summary

**A fixed-host, host-only Supabase demo-session entry safely transfers apex visitors into the real dashboard without touching apex authentication.**

## Performance

- **Duration:** 7 min
- **Started:** 2026-07-26T12:40:04-04:00
- **Completed:** 2026-07-26T12:47:00-04:00
- **Tasks:** 3 completed
- **Files modified:** 8

## Accomplishments

- Added server-only validation for the fixed demo origin, allowing HTTPS production and the explicit local `demo.localhost` host only.
- Implemented response-bound, idempotent demo session reuse/repair with host-only cookies, local sign-out, verified membership, and platform-admin rejection.
- Ordered proxy routing so apex `/demo/entry` has no Supabase/Auth work, while distinct Playwright origins prepare later cross-host browser verification.

## Task Commits

1. **Task 1: RED — specify the fixed host and session state machine** — `a8b9f9f9` (`test`)
2. **Task 2: GREEN — implement host-only idempotent entry** — `55de7343` (`feat`)
3. **Task 3: GREEN — order proxy routing around the additive entry** — `b4f5d2ef` (`feat`)
4. **Security coverage completion** — `6fbf8092` (`test`)

## Files Created/Modified

- `lib/demo/config.ts` — validates the trusted demo origin without exposing credentials.
- `lib/demo/session.ts` — classifies hosts and establishes or repairs host-only demo auth state.
- `app/demo/entry/route.ts` — provides the additive apex and demo-host entry endpoint.
- `proxy.ts` — handles the apex handoff before any Supabase client is created.
- `playwright.config.ts` — exposes separate apex and demo origins for later browser isolation evidence.
- `tests/unit/demo/*.test.ts` — covers origin validation, hostile routing input, cookie isolation, repair, and terminal failure.

## Decisions Made

- Production origin is fixed to `https://demo.xtimator.com`; only `http://demo.localhost` may use HTTP for local development.
- The route's final redirect response owns all Supabase cookie writes so authentication cookies are not lost in transit.
- Platform authority is checked by verified immutable user ID, never mutable role metadata.

## TDD Gate Compliance

- **RED:** `a8b9f9f9` created tests that failed because the host/session contract was absent.
- **GREEN:** `55de7343` and `b4f5d2ef` implemented the contract and made all focused suites pass.
- **REFACTOR:** Not needed.

## Verification

- `npx vitest run tests/unit/demo/config.test.ts tests/unit/demo/host-routing.test.ts tests/unit/demo/session-route.test.ts tests/unit/middleware.test.ts` — passed (47 tests).
- `npx tsc --noEmit -p tsconfig.ci.json` — passed.
- `git diff --name-only a8b9f9f9^..HEAD -- app/demo` — only `app/demo/entry/route.ts`; legacy demo pages remain unchanged.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Test double] Corrected the Supabase sign-in test response shape**
- **Found during:** Task 2
- **Issue:** The RED test double returned `user` at the top level instead of the real `signInWithPassword` `data.user` shape, masking the intended repair-success assertion.
- **Fix:** Aligned the mock with Supabase's documented response envelope and asserted the coalesced deterministic active-company cookie after repair.
- **Files modified:** `tests/unit/demo/session-route.test.ts`
- **Verification:** Focused config and session suite passed.
- **Committed in:** `55de7343`

---

**Total deviations:** 1 auto-fixed (Rule 1).
**Impact on plan:** The fix strengthened the intended security regression coverage without expanding runtime scope.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required in this plan.

## Next Phase Readiness

The isolated entry/session foundation is ready for the subsequent Phase 180 read-only boundary plans. Cross-host Playwright evidence remains intentionally scheduled for Plan 14.

## Self-Check: PASSED

Verified all five implementation/test artifacts and all four task commits exist in the repository.

---
*Phase: 180-isolated-demo-session-read-only-foundation*
*Completed: 2026-07-26*
