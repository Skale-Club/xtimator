---
phase: 79-multi-company-support-allow-one-user-to-own-and-switch-betwe
plan: 01
subsystem: database
tags: [supabase, migrations, rls, multi-tenancy, types]

requires:
  - phase: 02-company-onboarding
    provides: companies table + companies.user_id FK to auth.users
  - phase: 55-schema-tier-definitions
    provides: companies.tier + companies.tier_trial_ends_at columns (preserved)
provides:
  - company_members(user_id, company_id, role, created_at) join table with composite PK
  - RLS SELECT-only policy on company_members gated by auth.uid()
  - Idempotent backfill: exactly one role='owner' row per existing companies row (3/3 in prod)
  - TypeScript Row/Insert/Update bindings for company_members in types/database.types.ts
  - Index company_members_user_id for D-07 fallback resolution ORDER BY companies.created_at DESC
affects: [79-02, 79-03, 79-04, 80-switcher-ui, 81-action-sweep, 82-rls-rewrite, 83-billing-per-company]

tech-stack:
  added: []
  patterns:
    - "TEXT + CHECK constraint for role (no Postgres enum — D-07/D-08 codebase convention)"
    - "Idempotent backfill via INSERT ... ON CONFLICT DO NOTHING"
    - "SELECT-only RLS + service-role writes (no INSERT/UPDATE/DELETE policies)"
    - "Manual database.types.ts extension (supabase gen types blocked on Windows — Phase 19/24/38 precedent)"
    - "Static SQL contract test (no live-DB harness in repo; runtime verification via Management API)"

key-files:
  created:
    - supabase/migrations/20260525000001_phase79_company_members.sql
    - tests/unit/company-members-migration.test.ts
  modified:
    - types/database.types.ts

key-decisions:
  - "[Phase 79-01]: Migration timestamp moved 20260521→20260525 to resolve four-pair collision with tour_events; live DB applied via Supabase dashboard SQL editor + schema_migrations repair (commit 11321b9)"
  - "[Phase 79-01]: Static SQL contract test instead of live-DB integration test — repo has no migration-against-DB harness; runtime backfill verified via Management API SELECT (3/3/3 in prod)"
  - "[Phase 79-01]: company_members exposed in database.types.ts via manual extension (Phase 19/24/38 pattern) — Docker unavailable in Windows dev env so supabase gen types is not viable"
  - "[Phase 79-01]: role column uses TEXT + CHECK (role IN ('owner')) — single-value constraint today, CHECK widened in later milestone if Admin/Member tiers ship"
  - "[Phase 79-01]: No INSERT/UPDATE/DELETE RLS policies on company_members — authenticated clients are blocked by default; service-role bypass used by createOrUpdateCompany in Plan 03"

patterns-established:
  - "Composite-PK join table for multi-tenancy with cascade refs to auth.users and parent"
  - "Idempotent backfill pattern: INSERT ... SELECT ... FROM parent ON CONFLICT DO NOTHING (safe to re-run)"

requirements-completed: [D-01, D-02, D-03, D-04, D-16]

duration: ~4h elapsed (work split across 2026-05-21 initial implementation + 2026-05-25 collision repair + 2026-05-26 test-path fix and types extension)
completed: 2026-05-26
---

# Phase 79 Plan 01: company_members Foundation Summary

**Multi-tenancy join table `company_members(user_id, company_id, role)` with composite PK, SELECT-only RLS, idempotent backfill (3/3 owner rows live in prod), and TypeScript bindings for Plans 02/03/04 to consume.**

## Performance

- **Duration:** ~4h elapsed across three sessions (initial migration → collision repair → test-path fix + types extension)
- **Started:** 2026-05-21 (initial DDL commit 58d5bc1)
- **Completed:** 2026-05-26T01:55:16Z
- **Tasks:** 3 of 3
- **Files modified:** 3 (migration, test, types)

## Accomplishments

- `public.company_members` table live in prod with composite PK (user_id, company_id) and ON DELETE CASCADE to both auth.users(id) and companies(id)
- Idempotent backfill seeded 3 rows for 3 pre-existing companies (companies_count == members_count == owner_role_count == 3)
- RLS enabled with SELECT-only policy gated by `user_id = (SELECT auth.uid())`; authenticated clients cannot mutate (writes via service role)
- `types/database.types.ts` extended with Row/Insert/Update/Relationships block for `company_members` between `companies` and `company_price_book` (alphabetical)
- Static contract test (11 assertions) guards migration DDL shape, RLS posture, idempotency clause, cascade refs, no-secret patterns, and the D-04 invariant that `companies.user_id` is NOT dropped

## Task Commits

1. **Task 1: Migration + RLS for company_members (initial impl)** — `58d5bc1` (feat)
2. **Task 1.b: Migration timestamp collision repair** — `11321b9` (fix, also applied DDL to prod via dashboard SQL editor and repaired schema_migrations)
3. **Task 1.c: Test path fix after rename** — `5e1cd16` (fix — points test at the renamed 20260525000001 path; all 11 assertions green)
4. **Task 2: Apply migration to live DB** — completed in `11321b9` body; re-verified 2026-05-26 via Management API SELECT (3/3/3, role='owner' on all rows)
5. **Task 3: Extend types/database.types.ts with company_members** — `e40facf` (feat — tsc --noEmit clean)

**Plan metadata commit:** _(this SUMMARY commit + STATE/ROADMAP/REQUIREMENTS update)_

## Files Created/Modified

- `supabase/migrations/20260525000001_phase79_company_members.sql` — DDL + RLS + idempotent backfill (created in 58d5bc1, renamed in 11321b9)
- `tests/unit/company-members-migration.test.ts` — 11 static contract assertions (created in 58d5bc1, path fixed in 5e1cd16)
- `types/database.types.ts` — added `company_members` Row/Insert/Update block (e40facf)

## Decisions Made

- **Timestamp collision strategy:** rather than synthesizing a new migration to ALTER an already-applied table, the collided file was renamed in-tree and `schema_migrations` was repaired to match prod. Trade-off: history shows the rename, but the prod DDL and the source file are byte-identical to the original. Documented in commit 11321b9.
- **Static SQL contract test vs runtime backfill test:** plan asked for a backfill correctness test; the repo has no live-DB harness for migrations (Phase 19/24/38 set this precedent). The 11-assertion static test prevents the file from drifting from CONTEXT.md D-01..D-04 invariants. Runtime verification (3/3/3 row counts + role='owner') is performed via Management API SELECT after each session, which is the same gate the plan's `<how-to-verify>` block describes.
- **Manual types extension over supabase gen types:** Docker is unavailable in the Windows dev env. Phase 19, 24, and 38 already established the manual-extension pattern in this file. Re-establishing it here keeps Plans 02/03/04 compiling against the shapes the live DB now exposes.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Test path drifted after timestamp-collision rename**
- **Found during:** Task 1 verification re-run on 2026-05-26
- **Issue:** Commit 11321b9 renamed the migration file from `20260521000001_phase79_company_members.sql` to `20260525000001_phase79_company_members.sql` (timestamp collision repair) but the static-contract test was not updated to match. `npx vitest run` failed with ENOENT before running any assertion.
- **Fix:** Updated `MIGRATION_PATH` constant in `tests/unit/company-members-migration.test.ts` to point at the renamed file.
- **Files modified:** tests/unit/company-members-migration.test.ts
- **Verification:** `npx vitest run tests/unit/company-members-migration.test.ts` → 11/11 pass
- **Committed in:** 5e1cd16

**2. [Rule 3 - Blocking] types/database.types.ts had not been extended**
- **Found during:** Task 3 read_first pass
- **Issue:** Plan 02/03/04 will import the company_members type, but the file had no entry for it. `npx tsc --noEmit` would have started failing the moment Plan 02 introduced a typed query.
- **Fix:** Added Row/Insert/Update/Relationships block in alphabetical order between `companies` and `company_price_book`, shape mirroring other zero-FK tables.
- **Files modified:** types/database.types.ts
- **Verification:** `npx tsc --noEmit` exit 0 (no new errors)
- **Committed in:** e40facf

**3. [Rule 3 - Blocking] Migration file path declared in PLAN.md frontmatter does not match the file on disk**
- **Found during:** initial reconciliation
- **Issue:** Plan frontmatter listed `supabase/migrations/20260521000001_phase79_company_members.sql` but on-disk path is `20260525000001_phase79_company_members.sql` after the collision repair in commit 11321b9.
- **Fix:** Treated the renamed file as the authoritative artifact. Tests and types now reference the renamed path. The plan's `files_modified` array is left as-is in this SUMMARY's `key-files.created` (correct path) — future verification should accept the renamed path.
- **Verification:** Both the static test and the Management API SELECT find the migration at the correct path.
- **Committed in:** (documented here; rename was 11321b9)

---

**Total deviations:** 3 auto-fixed (1 bug, 2 blocking). All deviations were direct consequences of work done in a prior session being only partially synced (migration applied + renamed in prod, but test path and types file left stale).
**Impact on plan:** No scope creep. All three fixes are mandatory for plan to be considered complete per its own acceptance criteria (test runs green; tsc green; types exposed).

## Issues Encountered

- **Initial confusion over duplicate artifacts:** the migration and test files already existed from a prior session. After reading git history (commits 58d5bc1 and 11321b9), the state was clear: the migration was already implemented and applied; only the test path and the types file needed reconciliation. Documented in deviations above.

## Authentication Gates

- **Supabase CLI 403 (carried over from prior session):** `supabase db push` and `supabase migration list --linked` return HTTP 403 from `cli_login_postgres` because the linked supabase CLI account lacks privileges on project `prmqgcrnpuvpzruyzvuv`. Worked around via the Supabase Management API using `SUPABASE_ACCESS_TOKEN` from `.env.local` (documented in critical_environment_notes of the spawning prompt; runtime verification in this session re-confirmed 3/3/3 row counts via that path).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `company_members` is live in prod with the correct shape, RLS posture, and TypeScript bindings.
- Plan 02 can now build `lib/queries/active-company.ts` (`getActiveCompanyId` + `getActiveCompany`) against the new table and its types.
- Plan 03 can extend `createOrUpdateCompany` with the `mode: 'first' | 'add'` parameter and write to `company_members` via the service-role path.
- Plan 04 can switch `app/(app)/layout.tsx` from `getCachedCompany(userId)` to `getActiveCompany()` once Plans 02 + 03 land.
- No blockers for downstream plans.

---
*Phase: 79-multi-company-support-allow-one-user-to-own-and-switch-betwe*
*Completed: 2026-05-26*

## Self-Check: PASSED

- Files: all 4 expected paths exist on disk
- Commits: 58d5bc1 (initial migration + test), 11321b9 (collision repair + prod apply), 5e1cd16 (test path fix), e40facf (types extension) — all present in git history
- Live DB: companies_count=3, members_count=3, owner_role_count=3 (re-verified 2026-05-26 via Management API)
- Tests: 11/11 assertions green in tests/unit/company-members-migration.test.ts
- Types: npx tsc --noEmit exit 0

