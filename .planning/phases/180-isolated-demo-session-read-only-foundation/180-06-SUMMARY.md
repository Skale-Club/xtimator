---
phase: 180-isolated-demo-session-read-only-foundation
plan: 06
subsystem: api-security
tags: [nextjs, demo, read-only, ai, estimates, vitest]
requires:
  - phase: 180-02
    provides: "Shared demo principal/company write classifier and standard 403 response"
provides:
  - "Guard-before-effect proof for AI and estimate API routes"
  - "Standard demo denial before chat, translation, refinement, and signature effects"
affects: [180-07, 180-08, 180-14, 181-real-product-cutover-and-verification]
tech-stack:
  added: []
  patterns:
    - "Resolve trusted identity/company context before rate limits, AI providers, or persistence."
    - "Use demoGuardResponse with a trusted target company for public estimate mutations."
key-files:
  created:
    - tests/unit/demo/ai-estimate-route-boundaries.test.ts
  modified:
    - lib/demo/guard.ts
    - app/api/chat/route.ts
    - app/api/translate/route.ts
    - app/api/estimates/[id]/refine/route.ts
    - app/api/estimates/[id]/sign/route.ts
key-decisions:
  - "demoGuardResponse accepts trusted explicit context so public and non-cookie routes retain the standard demo 403."
  - "Chat denies demo contexts before rate-limit consumption and service/model setup; tools receive only normal tenant contexts."
patterns-established:
  - "AI and estimate mutation routes must apply the shared guard before their first billable, persistent, or provider effect."
requirements-completed: [SAFE-01, SAFE-02]
duration: 10min
completed: 2026-07-26
---

# Phase 180 Plan 06: AI and Estimate API Boundaries Summary

**AI chat, translation, generation/dispatch, refinement, and signing routes now prove demo denial before rate limits, provider work, persistence, or signing effects.**

## Performance

- **Duration:** 10 min
- **Started:** 2026-07-26T17:43:00Z
- **Completed:** 2026-07-26T17:52:45Z
- **Tasks:** 2/2
- **Files modified:** 8

## Accomplishments

- Added focused mocked regression coverage for all seven AI and estimate route families, including standard demo denial, normal 401 behavior, and a normal-tenant path.
- Moved chat and translation demo checks before rate-limit, billing, model, cache, and provider effects.
- Extended the shared route guard for trusted explicit company contexts and applied it to refinement and public signing targets.

## Task Commits

1. **Task 1: RED — test AI and estimate-route effect ordering** — `c61ded0b` (`test`)
2. **Task 2: GREEN — guard AI and estimate API routes** — `5a4b1d34` (`feat`)

## Files Created/Modified

- `tests/unit/demo/ai-estimate-route-boundaries.test.ts` — mocked guard-order proof for the seven route families.
- `lib/demo/guard.ts` — supports trusted explicit route contexts in the standard 403 response helper.
- `app/api/chat/route.ts` — denies the demo before rate limiting, billing config, service/model setup, and chat persistence.
- `app/api/translate/route.ts` — denies the demo before rate-limit, cache, and OpenRouter work.
- `app/api/estimates/[id]/refine/route.ts` — applies a trusted estimate-company deny check before refinement effects.
- `app/api/estimates/[id]/sign/route.ts` — applies the standard target-company denial before signature settings, snapshot, and inserts.
- `tests/unit/translate-route.test.ts` — supplies the new trusted-company/guard dependencies to existing translation behavior tests.

## Decisions Made

- Retained `demoGuardResponse` as the single route-level 403 contract; adding an optional trusted context avoids a parallel public-route guard.
- Signing and refinement use the resolved estimate company, never a request-supplied company identifier.

## TDD Gate Compliance

- **RED:** `c61ded0b` added the focused suite, which failed for chat, translate, and sign before implementation.
- **GREEN:** `5a4b1d34` implemented the route guards and made the suite pass.
- **REFACTOR:** Not needed.

## Verification

- `npx vitest run tests/unit/demo/ai-estimate-route-boundaries.test.ts` — passed (9 tests).
- `npx vitest run tests/unit/demo/ai-estimate-route-boundaries.test.ts tests/unit/chat/route.test.ts tests/unit/translate-route.test.ts tests/unit/api/transcribe-dispatch.test.ts tests/unit/api/analyze-photos-dispatch.test.ts tests/unit/api/generate-estimate-dispatch.test.ts tests/unit/api/refine-route-contract.test.ts tests/unit/api/refine-credit-gate.test.ts tests/unit/api/refine-lock-guard.test.ts tests/unit/api/refine-error-surface.test.ts` — passed (64 tests).
- `npx tsc --noEmit -p tsconfig.ci.json` — passed.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Regression coverage] Updated the existing translate-route test mocks**
- **Found during:** Task 2 (GREEN verification)
- **Issue:** The route now correctly resolves the trusted active company and shared guard before rate limiting, but the existing translation tests did not provide those dependencies and returned their catch-path 401.
- **Fix:** Mocked the active-company resolver and allowed shared guard in the normal-tenant test setup.
- **Files modified:** `tests/unit/translate-route.test.ts`
- **Verification:** Existing translation tests pass alongside the new boundary suite.
- **Committed in:** `5a4b1d34`

---

**Total deviations:** 1 auto-fixed (Rule 1)
**Impact on plan:** Test-only compatibility coverage; no runtime scope expansion.

## Issues Encountered

None. The known unrelated full-suite missing-key UX mock failure was not run or changed.

## User Setup Required

None - no external services or production state were changed.

## Known Stubs

None.

## Next Phase Readiness

The shared route-level guard now has focused AI/estimate effect-order coverage for subsequent mutation-boundary and cross-host verification plans.

## Self-Check: PASSED

Verified the focused test artifact exists and both TDD commits are reachable in git history.

---
*Phase: 180-isolated-demo-session-read-only-foundation*
*Completed: 2026-07-26*
