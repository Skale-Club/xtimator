---
phase: 180-isolated-demo-session-read-only-foundation
plan: 13
subsystem: database-security
tags: [postgresql, supabase, rls, storage, security, vitest]
requires:
  - phase: 180-01
    provides: "Dedicated host-only demo identity and deterministic company session"
  - phase: 180-02
    provides: "Canonical demo-principal OR demo-company authorization contract"
provides:
  - "Atomic preflight and hardening of the single demo user/company registry mapping"
  - "Restrictive authenticated write-deny triplets across every current public RLS table"
  - "Deterministic demo-company row and Storage-path denial without normal-tenant policy replacement"
  - "Static and opt-in live direct-Supabase authorization contracts"
affects: [180-14, 181-real-product-cutover-and-verification, future-rls-tables]
tech-stack:
  added: []
  patterns:
    - "Catalog-driven restrictive policy sweeps with terminal pg_policies assertions"
    - "Fail-closed Storage UUID parsing that accepts deterministic Xtimator UUIDs"
key-files:
  created:
    - supabase/migrations/20260726000001_demo_readonly_foundation.sql
    - tests/unit/demo/rls-migration-contract.test.ts
    - tests/integration/demo-readonly-rls.test.ts
  modified: []
key-decisions:
  - "The migration requires exactly one registry row backed by auth.users, companies, and company_members before adding NOT NULL, foreign-key, and uniqueness hardening."
  - "Existing demo_block_* names are recreated per relation, while demo_company_block_* policies independently deny deterministic demo-company rows and paths."
  - "Live authorization evidence is an explicit disposable/local opt-in via RUN_DEMO_RLS_INTEGRATION=1; no linked or remote project is used implicitly."
patterns-established:
  - "Every current public RLS base table gets restrictive INSERT/UPDATE/DELETE principal policies; compatible UUID company_id tables also get row-company triplets."
  - "Storage first-folder casts are guarded by an 8-4-4-4-12 hexadecimal shape check, with malformed paths resolving to NULL instead of raising."
requirements-completed: [SAFE-03]
duration: 11 min
completed: 2026-07-26
---

# Phase 180 Plan 13: Direct Supabase Read-Only Foundation Summary

**Transactional restrictive RLS and Storage policies now deny the dedicated demo principal and deterministic demo-company writes while preserving normal tenant grants and service-role reset authority.**

## Performance

- **Duration:** 11 min
- **Started:** 2026-07-26T16:59:46Z
- **Completed:** 2026-07-26T17:10:32Z
- **Tasks:** 2 completed
- **Files modified:** 3

## Accomplishments

- Hardened `demo_config.company_id` only after a transactional, exact-one-row preflight proves a non-null mapping backed by Auth, company, and membership rows.
- Recreated restrictive authenticated principal write triplets on every current public RLS base table and added independent deterministic-company triplets for compatible UUID `company_id` tables plus `companies.id`.
- Added restrictive user/company Storage INSERT, UPDATE, and DELETE policies with safe first-folder UUID handling, preserving all existing permissive bucket/membership policies.
- Added terminal `pg_policies` assertions so incomplete public, companies, or Storage coverage aborts the migration atomically.
- Added an opt-in live suite that uses non-persistent clients and service-role-owned cleanup to exercise demo reads, denied table/Storage writes, normal-company writes, cross-principal demo-company denial, and service reset.

## Task Commits

1. **Task 1: RED — write RLS migration and live direct-write contracts** — `00be394e` (`test`)
2. **Task 2: GREEN — implement transactional restrictive policy coverage** — `8f04703b` (`feat`)

## Files Created/Modified

- `tests/unit/demo/rls-migration-contract.test.ts` — comment-stripped static contract for the transaction, mapping preflight, helpers, policy sweeps, safe Storage paths, and catalog assertions.
- `tests/integration/demo-readonly-rls.test.ts` — disposable/local opt-in authenticated PostgREST and Storage proof with test-owned fixtures and cleanup.
- `supabase/migrations/20260726000001_demo_readonly_foundation.sql` — rerunnable transaction implementing the final direct-client deny boundary.

## Decisions Made

- Kept normal permissive tenant and membership policies untouched; restrictive policy composition only removes authenticated access.
- Preserved the existing `demo_block_insert/update/delete` names so reruns replace the original user sweep instead of stacking duplicate principal policies.
- Required Auth user, company ownership, and membership agreement in the mapping preflight because a non-null UUID alone does not prove the dedicated user/company pair is coherent.
- Limited live integration execution to an explicit disposable/local opt-in, preventing a routine unit command from creating fixtures in a linked or production project.

## TDD Gate Compliance

- **RED:** `00be394e` collected both test files; all seven static assertions failed because the foundation migration was absent, and the six live cases were explicitly skipped without local/disposable integration configuration.
- **GREEN:** `8f04703b` added the restrictive migration and made all seven static contracts pass.
- **REFACTOR:** Not needed.

## Verification

- `npx vitest run tests/unit/demo/rls-migration-contract.test.ts tests/integration/demo-readonly-rls.test.ts` — 7 passed, 6 explicitly skipped because the local/disposable live opt-in was absent.
- `npx vitest run tests/unit/demo tests/unit/middleware.test.ts` — 90/90 passed.
- `npx tsc --noEmit -p tsconfig.ci.json` — passed with exit code 0.
- `supabase db lint` — not runnable in this environment: local Postgres at `127.0.0.1:54322` refused the connection because Docker/Supabase was stopped. No `--linked` or remote fallback was used.
- No migration was applied locally or remotely, and no production, DNS, deploy, or external service state was changed.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Accepted the deterministic demo UUID in Storage path validation**
- **Found during:** Task 2 (GREEN migration implementation)
- **Issue:** A conventional UUID version/variant regex would safely avoid invalid casts but reject Xtimator's deterministic `0000de00-0000-0000-0000-000000000001` company ID, leaving company-path denial ineffective.
- **Fix:** Used the full hexadecimal 8-4-4-4-12 UUID shape accepted by PostgreSQL and added a static regression assertion for the deterministic ID plus a malformed-path rejection.
- **Files modified:** `supabase/migrations/20260726000001_demo_readonly_foundation.sql`, `tests/unit/demo/rls-migration-contract.test.ts`
- **Verification:** Focused static suite passed 7/7.
- **Committed in:** `8f04703b`

**2. [Rule 2 - Missing Critical] Covered failure-path integration cleanup**
- **Found during:** Task 2 (GREEN verification)
- **Issue:** If a denial regression unexpectedly allowed a blocked project or Storage upload, the first RED fixture cleanup would not remove every attempted test-owned artifact.
- **Fix:** Named all attempted object paths and removed demo-company projects only by the unique test prefix, ensuring cleanup remains test-owned even when an assertion fails.
- **Files modified:** `tests/integration/demo-readonly-rls.test.ts`
- **Verification:** TypeScript and focused Vitest collection passed; cleanup predicates contain the per-run prefix/user/company identifiers.
- **Committed in:** `8f04703b`

---

**Total deviations:** 2 auto-fixed (1 Rule 1 bug, 1 Rule 2 missing critical test hygiene).
**Impact on plan:** Both fixes strengthen the intended SAFE-03 boundary and test isolation without expanding runtime scope.

## Issues Encountered

- Docker Desktop and the local Supabase Postgres endpoint were stopped, so `supabase db lint` could not connect.
- `RUN_DEMO_RLS_INTEGRATION=1` and a disposable/local live environment were not available, so the six live authorization cases were collected but explicitly skipped. Static policy coverage, focused unit coverage, and CI type checking are green; live RLS evidence remains for a configured local/disposable stack.

## Authentication Gates

None.

## User Setup Required

None - no external service configuration or remote schema application was performed by this plan.

## Known Stubs

None.

## Next Phase Readiness

The final direct authenticated write boundary and its live test harness are ready for Plan 180-14's cross-host/isolation verification. Before production cutover, run the opt-in live RLS suite and database lint against a configured local/disposable stack, then follow the later operator-controlled production migration process.

## Self-Check: PASSED

Verified all three plan artifacts and this summary exist, both RED/GREEN commits are reachable, and the TDD commit order is preserved.

---
*Phase: 180-isolated-demo-session-read-only-foundation*
*Completed: 2026-07-26*
