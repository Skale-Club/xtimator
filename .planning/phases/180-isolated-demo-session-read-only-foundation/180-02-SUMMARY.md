---
phase: 180-isolated-demo-session-read-only-foundation
plan: 02
subsystem: demo-authorization
tags: [nextjs, supabase-auth, read-only, security, vitest, tdd]
requires:
  - phase: 180-01
    provides: "Validated isolated demo and apex origin contracts"
provides:
  - "Shared demo-principal OR deterministic-company write classifier for ambient and explicit contexts"
  - "Guard-before-effect enforcement for authenticated password, email, profile, and account mutations"
  - "Local-only demo logout with validated absolute apex signup handoff"
affects: [180-03, 180-04, 180-05, 180-06, 180-07, 180-08, 180-09, 180-10, 180-11, 180-12, 180-13, 180-14]
tech-stack:
  added: []
  patterns:
    - "Membership-validated ambient company resolution paired with verified Auth claims"
    - "Explicit trusted company contexts reuse the same deny classifier without cookie access"
key-files:
  created:
    - tests/unit/demo/guard.test.ts
    - tests/unit/demo/auth-action-boundaries.test.ts
    - tests/unit/demo/exit-action-boundaries.test.ts
  modified:
    - lib/demo/guard.ts
    - lib/actions/auth.ts
    - lib/actions/settings.ts
    - lib/demo/actions.ts
key-decisions:
  - "Demo identity and deterministic demo company are independent OR signals; role, owner, provider, support, and canonical-principal metadata never exempt a write."
  - "Anonymous sign-in, sign-up, and reset-request initiation remain outside the authenticated mutation guard."
  - "Demo exit validates the dedicated apex origin before any Auth effect and signs out only the caller's local session."
patterns-established:
  - "assertWritable() resolves verified ambient identity/company state; assertCompanyWritable() handles trusted non-cookie company contexts."
  - "Auth and service-role guards execute before the first credential, storage, or admin mutation."
requirements-completed: [SAFE-01, SAFE-02]
duration: 7 min
completed: 2026-07-26
---

# Phase 180 Plan 02: Shared Demo Read-Only Authority Summary

**An OR-based demo principal/company classifier now blocks authenticated account effects before Supabase Auth, storage, or service-role work while preserving anonymous entry and local-only demo exit.**

## Performance

- **Duration:** 7 min
- **Started:** 2026-07-26T16:48:49Z
- **Completed:** 2026-07-26T16:56:07Z
- **Tasks:** 2 completed
- **Files modified:** 7

## Accomplishments

- Strengthened the canonical guard so either verified demo email or membership-validated deterministic demo company denies writes, including explicit non-cookie company contexts.
- Guarded password recovery/update, password change, email change, profile/avatar change, and account deletion before their first Auth, storage, or service-role effect.
- Replaced shared-account global logout and relative navigation with local-only logout followed by a validated absolute production/local apex signup URL.
- Added focused source-order and mocked-effect tests while proving anonymous sign-in, sign-up, and reset initiation retain their existing behavior.

## Task Commits

1. **Task 1: RED — define shared guard and Auth-effect denial tests** — `14e0c5a3` (`test`)
2. **Task 2: GREEN — strengthen the canonical guard and Auth actions** — `a7a60422` (`feat`)

## Files Created/Modified

- `lib/demo/guard.ts` — canonical ambient/explicit OR classifier and shared action/route/company denial helpers.
- `lib/actions/auth.ts` — authenticated recovery password updates now stop before Auth mutation.
- `lib/actions/settings.ts` — password, email, profile/avatar, and account deletion paths guard before effects.
- `lib/demo/actions.ts` — validates the dedicated apex origin, signs out locally, and redirects absolutely.
- `tests/unit/demo/guard.test.ts` — truth table, privileged-metadata rejection, ambient resolution, explicit context, and 403 shape coverage.
- `tests/unit/demo/auth-action-boundaries.test.ts` — source-order, effect-spy, and anonymous-flow compatibility coverage.
- `tests/unit/demo/exit-action-boundaries.test.ts` — local logout scope, call ordering, absolute destination, and hostile-origin coverage.

## Decisions Made

- The shared classifier accepts `userId` for trusted context propagation but classifies the configured demo principal by verified email and the tenant by deterministic company ID; no role-derived authority enters the decision.
- Explicit contexts do not read ambient cookies or Auth state, which keeps workers and service-role funnels deterministic while sharing the same policy.
- Production exit accepts only `https://xtimator.com`; local development accepts only an HTTP `localhost` apex. Demo hosts, header-derived origins, credentials, paths, queries, fragments, and lookalike domains fail before logout.

## TDD Gate Compliance

- **RED:** `14e0c5a3` added 36 focused tests; 32 failed for the missing OR classifier, missing guard ordering, global logout, and relative/unsafe exit while four anonymous compatibility checks already passed.
- **GREEN:** `a7a60422` implemented the minimum shared guard and Auth/exit changes; all 36 focused tests passed.
- **REFACTOR:** Not needed.

## Verification

- `npx vitest run tests/unit/demo/guard.test.ts tests/unit/demo/auth-action-boundaries.test.ts tests/unit/demo/exit-action-boundaries.test.ts` — passed (36 tests).
- `npx vitest run tests/unit/demo tests/unit/middleware.test.ts` — passed (83 tests).
- `npx tsc --noEmit -p tsconfig.ci.json` — passed.
- Static and mocked acceptance checks prove there is no owner/admin/provider/support exemption, every classified effect is downstream of the guard, anonymous entry remains available, and demo exit uses only local logout.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required in this plan.

## Known Stubs

None.

## Next Phase Readiness

The canonical guard is ready for the remaining Phase 180 server-action, API, side-effect, worker, and database enforcement plans. Plan 180-03 can reuse `assertCompanyWritable()` for explicit trusted-company boundaries.

## Self-Check: PASSED

Verified all seven implementation/test artifacts exist, RED commit `14e0c5a3` and GREEN commit `a7a60422` exist in history, all acceptance checks pass, and `app/globals.css` remains unstaged and untouched.

---
*Phase: 180-isolated-demo-session-read-only-foundation*
*Completed: 2026-07-26*
