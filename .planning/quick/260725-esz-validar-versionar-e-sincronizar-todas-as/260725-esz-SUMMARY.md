---
phase: quick
plan: 260725-esz
subsystem: observability
tags: [sentry, nextjs, vitest, typescript, ci]

requires:
  - phase: quick-260725-esz-planning
    provides: reviewed local inventory and prior full-suite/build evidence
provides:
  - transaction-and-message-scoped suppression for malformed root-page multipart probes
  - deterministic landing auth query-param transition coverage
  - committed incident investigation record
affects: [observability, landing-page-tests, ci, deployment-sync]

tech-stack:
  added: []
  patterns:
    - exact Sentry event filtering by transaction and exception message
    - contract-focused mocking for dynamically imported UI in state-transition tests

key-files:
  created:
    - .planning/debug/inbox-incident-sweep.md
  modified:
    - instrumentation.ts
    - lib/observability/sentry-filters.ts
    - tests/unit/observability/sentry-filters.test.ts
    - tests/unit/components/landing-page.test.tsx

key-decisions:
  - "Suppress malformed FormData scanner noise only when the transaction is POST /page and the exception matches one of two exact messages."
  - "Keep real API-route FormData errors reportable and mock only the AuthDialog contract in the focused landing transition test file."

patterns-established:
  - "Sentry noise filters must combine a narrow transaction match with exact exception messages and negative regression coverage."
  - "Large dynamic UI modules may be replaced with a minimal contract mock when the unit under test is the parent's state transition."

requirements-completed: []

duration: 3min
completed: 2026-07-25
---

# Quick Task 260725-esz: Validate and Version Local Incident Fixes Summary

**Exact root-page multipart scanner suppression, deterministic landing auth-transition coverage, and a committed inbox incident audit**

## Performance

- **Duration:** 3 min
- **Started:** 2026-07-25T14:45:39Z
- **Completed:** 2026-07-25T14:48:19Z
- **Tasks:** 2
- **Files modified:** 5 implementation/diagnostic files

## Accomplishments

- Revalidated the six-path pre-commit inventory after fetching `origin`; `main`, `dev`, `origin/main`, and `origin/dev` all started at `041820a88b19133c6f957050d6ea1396b8643619`, and all three ancestry gates passed.
- Confirmed the new Sentry filter is restricted to `POST /page` plus either exact malformed multipart message, while equivalent errors on application API routes remain reportable.
- Confirmed `instrumentation.ts` invokes the filter from the server `beforeSend` hook and the AuthDialog mock stays confined to the focused landing test file.
- Passed 15 focused tests, the production CI TypeScript configuration, and whitespace validation.
- Created three conventional atomic commits with hooks active and no tracked-file deletions.

## Task Commits

1. **Task 1/2: Root-page FormData scanner suppression and coverage** - `4a8cbe9c` (fix)
2. **Task 1/2: Stable landing auth query-param transition test** - `f8f35faf` (test)
3. **Task 2: Inbox incident sweep record** - `7e5bca87` (docs)

Plan and summary metadata remain intentionally uncommitted for the orchestrator's final GSD artifact commit.

## Files Created/Modified

- `instrumentation.ts` - Calls the root-page multipart probe filter from Sentry's server `beforeSend`.
- `lib/observability/sentry-filters.ts` - Matches only `POST /page` and the two exact malformed FormData messages.
- `tests/unit/observability/sentry-filters.test.ts` - Covers both accepted messages, API-route preservation, and unrelated root errors.
- `tests/unit/components/landing-page.test.tsx` - Replaces the heavy dynamic AuthDialog implementation with a contract mock for transition testing.
- `.planning/debug/inbox-incident-sweep.md` - Records CI, Sentry, production, and Stripe investigation evidence and the remaining authenticated Stripe check.

## Decisions Made

- Used exact string membership instead of substring or broad FormData matching to avoid hiding actionable application errors.
- Kept the landing test's asynchronous dynamic-import boundary while removing the heavy dialog dependency graph from the state-transition unit test.
- Did not repeat the full unit/eval suite or production build because two complete passes and a successful build were already preserved in the debug evidence, as directed by the plan.

## Deviations from Plan

None - delegated Tasks 1 and 2 were executed as specified. Per orchestrator ownership, the PLAN was excluded from the debug documentation commit and Task 3 branch/push operations were not attempted.

## Issues Encountered

None. Git emitted informational LF-to-CRLF working-copy warnings; `git diff --check` remained clean and no file content was rewritten.

## Known Stubs

None. Empty values found by the scan are intentional test doubles or existing nullable instrumentation state, not data wired to production UI.

## User Setup Required

None for this package. The authenticated Stripe Dashboard verification remains a separately deferred investigation item.

## Next Phase Readiness

- `main` is now three commits ahead of `dev`, `origin/main`, and `origin/dev`.
- The orchestrator can commit the PLAN/SUMMARY/STATE artifacts, then perform the reserved fast-forward, atomic push, workflow watch, and production health verification.

## Self-Check: PASSED

- All five implementation/diagnostic files exist in commits `4a8cbe9c`, `f8f35faf`, and `7e5bca87`.
- No commit deleted tracked files.
- No new endpoint, authentication path, file-access boundary, or schema surface was introduced.

---
*Quick task: 260725-esz*
*Completed: 2026-07-25*
