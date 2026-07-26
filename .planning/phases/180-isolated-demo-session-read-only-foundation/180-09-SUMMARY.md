---
phase: 180-isolated-demo-session-read-only-foundation
plan: 09
subsystem: oauth-security
tags: [oauth2, pkce, mcp, nextjs, read-only, security, vitest, tdd]

# Dependency graph
requires:
  - phase: 180-02
    provides: "Canonical OR-based demo principal/company classifier for ambient and explicit contexts"
provides:
  - "Demo-safe OAuth authorization and dynamic client registration boundaries"
  - "Explicit demo-company denial for authorization-code consumption, token minting, refresh rotation, and bearer resolution"
  - "Focused stale-capability and normal-flow OAuth regression coverage"
affects: [180-10, 180-11, 180-12, 180-14, phase-181, mcp]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "OAuth browser authorization carries verified email and membership-validated company context into the shared demo guard"
    - "Browserless code, refresh, and bearer paths classify the company persisted with the credential instead of consulting cookies"

key-files:
  created:
    - tests/unit/demo/oauth-boundaries.test.ts
  modified:
    - app/oauth/authorize/actions.ts
    - app/oauth/token/route.ts
    - app/oauth/register/route.ts
    - lib/oauth/codes.ts
    - lib/oauth/tokens.ts
    - lib/oauth/clients.ts

key-decisions:
  - "Demo authorization uses OAuth-compatible access_denied redirects, while stale code and refresh credentials remain indistinguishable from invalid grants."
  - "Dynamic registration validates normal RFC metadata first, then denies an ambient demo context before service-role client persistence."
  - "Stored company identity is the trusted authority for browserless code, refresh, revocation, and bearer checks; no OAuth capability check depends on a browser cookie."

patterns-established:
  - "Every OAuth credential write is guarded again in its persistence helper, not only at the route or action boundary."
  - "Stale demo-company bearer tokens resolve as invalid and never become MCP authorization context."

requirements-completed: [SAFE-01, SAFE-02]

# Metrics
duration: 7 min
completed: 2026-07-26
---

# Phase 180 Plan 09: OAuth Demo Capability Boundaries Summary

**OAuth authorization, registration, code exchange, refresh rotation, and bearer resolution now fail closed for the dedicated demo identity or deterministic demo tenant before credentials can be persisted or accepted.**

## Performance

- **Duration:** 7 min
- **Started:** 2026-07-26T18:09:52Z
- **Completed:** 2026-07-26T18:16:56Z
- **Tasks:** 2 completed
- **Files modified:** 7

## Accomplishments

- Added an integrated OAuth boundary suite covering authorization, dynamic registration, direct code/token issuance, code exchange, refresh rotation, refresh revocation, and stale bearer resolution.
- Propagated verified authorization identity and membership-validated company context into the canonical OR-based demo guard before authorization-code persistence.
- Guarded lower-level OAuth code, token, and client helpers so route bypass cannot mint, consume, rotate, revoke, persist, or accept demo capabilities.
- Preserved normal tenant flows and OAuth-compatible `access_denied` and `invalid_grant` response contracts.

## Task Commits

Each TDD gate was committed atomically:

1. **Task 1: RED — define OAuth denial and stale-capability tests** — `526447d4` (`test`)
2. **Task 2: GREEN — guard OAuth durable capability paths** — `350870c6` (`feat`)

## Files Created/Modified

- `tests/unit/demo/oauth-boundaries.test.ts` — integrated denial, no-effect, stale-token, and normal-flow coverage.
- `app/oauth/authorize/actions.ts` — denies trusted demo identity/company context with a standard OAuth callback error before code issue.
- `app/oauth/token/route.ts` — maps demo authorization-code denial to a non-disclosing `invalid_grant`.
- `app/oauth/register/route.ts` — maps guarded demo registration to HTTP 403 while preserving existing registration errors.
- `lib/oauth/codes.ts` — guards code issue and demo-company code consumption before persistence.
- `lib/oauth/tokens.ts` — guards token issue, refresh resolution/rotation/revocation, and stale bearer acceptance.
- `lib/oauth/clients.ts` — denies ambient demo registration before service-role client insertion.

## Decisions Made

- Returned `access_denied` through the already-verified client redirect for browser authorization, preserving OAuth semantics and state propagation.
- Returned generic `invalid_grant` for stale demo codes and refresh tokens so the token endpoint does not disclose demo classification.
- Used the company stored on authorization-code/access-token/refresh-token rows as the explicit authority in browserless paths; cookie state is neither required nor trusted.
- Kept RFC client metadata validation unchanged and guarded only the persistence boundary, so malformed normal requests retain their established error shapes.

## TDD Gate Compliance

- **RED:** `526447d4` added 11 focused cases; nine failed because demo authorization, registration, code exchange, refresh, direct credential issuance, and stale bearer use were still accepted, while both normal-flow controls passed.
- **GREEN:** `350870c6` added the minimum action/route/helper enforcement; all 11 focused cases and all related regressions passed.
- **REFACTOR:** Not needed.

## Verification

- `npx vitest run tests/unit/demo/oauth-boundaries.test.ts` — passed (11 tests).
- `npx vitest run tests/unit/demo/oauth-boundaries.test.ts tests/unit/oauth-token-issuance.test.ts tests/unit/oauth-register.test.ts tests/unit/oauth-pkce.test.ts tests/unit/mcp-auth.test.ts tests/unit/mcp-route-contract.test.ts` — passed (59 tests across 6 files).
- `npx vitest run tests/unit/demo` — passed (191 tests across 14 files).
- `npx tsc --noEmit -p tsconfig.ci.json` — passed.
- Git history confirms RED commit `526447d4` precedes GREEN commit `350870c6`.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## Authentication Gates

None.

## User Setup Required

None - no external service configuration is required.

## Known Stubs

None.

## Next Phase Readiness

OAuth and MCP credential authority now enforce the Phase 180 demo read-only contract without cookies. The remaining service/job and database plans can rely on the same explicit-company guard pattern.

## Self-Check: PASSED

Verified all seven implementation/test artifacts exist, RED commit `526447d4` and GREEN commit `350870c6` exist in history, all acceptance and plan verification checks pass, no unplanned threat surface or goal-blocking stub was introduced, and `app/globals.css` remains unstaged and untouched.

---
*Phase: 180-isolated-demo-session-read-only-foundation*
*Completed: 2026-07-26*
