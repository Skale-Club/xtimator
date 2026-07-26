---
phase: 180-isolated-demo-session-read-only-foundation
plan: 08
subsystem: billing-security
tags: [stripe, stripe-connect, nextjs, read-only, security, vitest, tdd]

# Dependency graph
requires:
  - phase: 180-02
    provides: "Canonical OR-based demo principal/company classifier and demoGuardResponse route contract"
provides:
  - "Canonical demo 403 denial across subscription, top-up, portal, auto-top-up, and Stripe Connect entry points"
  - "Guard-before-effect regression coverage for Stripe clients, service-role clients, OAuth state, cookies, and persistence"
affects: [180-09, 180-10, 180-11, 180-12, 180-14, phase-181]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Authenticate first, then call demoGuardResponse before constructing provider or service-role clients"
    - "One table-driven boundary suite covers demo-user, demo-company, unauthenticated, and normal-tenant paths"

key-files:
  created:
    - tests/unit/demo/billing-route-boundaries.test.ts
  modified:
    - app/api/stripe/connect/initiate/route.ts
    - app/api/stripe/connect/disconnect/route.ts

key-decisions:
  - "Stripe Connect initiation now returns the canonical demo_readonly 403 instead of a route-specific redirect."
  - "Ambient demo classification runs only after trusted authentication and before any service-role, OAuth, Stripe, cookie, or persistence effect."
  - "The four billing session routes already satisfied the canonical guard order and required regression coverage but no production edit."

patterns-established:
  - "Billing and Connect browser routes share demoGuardResponse as their route-level denial contract."
  - "Boundary tests prove both denied side-effect absence and preserved normal control paths."

requirements-completed: [SAFE-01, SAFE-02]

# Metrics
duration: 4 min
completed: 2026-07-26
---

# Phase 180 Plan 08: Billing and Stripe Connect Demo Boundaries Summary

**Canonical pre-provider demo denial now protects all six billing and Stripe Connect browser entry points, backed by 24 effect-order and compatibility tests.**

## Performance

- **Duration:** 4 min
- **Started:** 2026-07-26T18:02:01Z
- **Completed:** 2026-07-26T18:06:14Z
- **Tasks:** 2 completed
- **Files modified:** 3

## Accomplishments

- Added a table-driven route boundary suite covering subscription checkout, credit top-up, billing portal, auto-top-up setup, Stripe Connect initiation, and Stripe Connect disconnect.
- Proved dedicated demo-user and deterministic demo-company denial returns the shared 403 before Stripe construction, service-role access, OAuth state/cookie creation, deauthorization, persistence, or cache revalidation.
- Normalized both Connect routes to `demoGuardResponse()` immediately after authentication while preserving their unauthenticated and normal-tenant paths.
- Audited the four existing billing routes and locked their already-correct guard order against regression.

## Task Commits

Each TDD gate was committed atomically:

1. **Task 1: RED — test every billing and Connect entry** — `adce322c` (`test`)
2. **Task 2: GREEN — guard billing and Connect effects** — `24a57b1b` (`feat`)

## Files Created/Modified

- `tests/unit/demo/billing-route-boundaries.test.ts` — 24 route-level demo denial, effect absence, authentication, and normal-tenant cases.
- `app/api/stripe/connect/initiate/route.ts` — uses the canonical demo route guard before service-role and OAuth work.
- `app/api/stripe/connect/disconnect/route.ts` — denies demo callers before Stripe deauthorization or company persistence.

## Decisions Made

- Used the shared JSON 403 response for Connect initiation rather than preserving its route-specific demo redirect, keeping every browser mutation endpoint on the same D-10 contract.
- Kept ambient demo resolution at the route boundary because `demoGuardResponse()` already combines verified Auth claims with membership-validated active-company state.
- Left the four billing session routes unchanged after tests confirmed they already authenticate and deny before body/config/company/Stripe effects.

## TDD Gate Compliance

- **RED:** `adce322c` added 24 cases; 18 passed for the already-protected billing and control paths, while six failed because Connect initiation used the legacy boolean guard and disconnect had no guard.
- **GREEN:** `24a57b1b` made the minimum two-route implementation change; all 24 focused cases passed.
- **REFACTOR:** Not needed.

## Verification

- `npx vitest run tests/unit/demo/billing-route-boundaries.test.ts` — passed (24 tests).
- `npx vitest run tests/unit/demo/billing-route-boundaries.test.ts tests/unit/billing/checkout.test.ts tests/unit/billing/topup-checkout.test.ts tests/unit/billing/autotopup-setup-session.test.ts tests/unit/settings/payments-page.test.tsx` — passed (45 tests across 5 files).
- `npx tsc --noEmit -p tsconfig.ci.json` — passed.
- TDD history check confirmed `adce322c` precedes `24a57b1b`.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## Authentication Gates

None.

## User Setup Required

None - no external service configuration or real Stripe call was required.

## Known Stubs

None.

## Next Phase Readiness

All public billing and Connect browser entry points now share the canonical deny-before-provider boundary. Later service-domain plans can independently enforce trusted demo-company denial after signed webhook verification without changing these browser route contracts.

## Self-Check: PASSED

Verified all three implementation/test artifacts exist, RED commit `adce322c` and GREEN commit `24a57b1b` exist in history, focused regressions and CI typecheck pass, no unplanned threat surface or goal-blocking stub was introduced, and `app/globals.css` remains unstaged and untouched.

---
*Phase: 180-isolated-demo-session-read-only-foundation*
*Completed: 2026-07-26*
