---
phase: 08-platform-admin-panel-for-centralized-api-integrations
plan: 01
subsystem: infra

tags: [supabase, migration, rls, storage-bucket, platform-admins, bootstrap]

# Dependency graph
requires:
  - phase: 01-foundation-auth
    provides: auth.users + supabase migration runner pattern
provides:
  - platform_admins table (super-admin membership, last-admin trigger)
  - platform_integrations table (encrypted API keys: ciphertext/iv/auth_tag BYTEA)
  - platform_branding singleton (id=1 seeded with app_name='Xtimator')
  - platform-brand Storage bucket (public read, super-admin write)
  - supabase/ADMIN-BOOTSTRAP.md (first-admin insert procedure + key rotation)
affects:
  - 08-03 admin-gate (consumes platform_admins for super-admin check)
  - 08-04 admin UI (reads/writes platform_integrations via service role)
  - 08-05 branding page (upserts platform_branding + uploads to platform-brand bucket)
  - 08-06 admins page (inserts into platform_admins, relies on trigger for safety)
  - 08-07/08 auth dark pass + rebrand sweep (consume getBranding from seeded row)

# Tech tracking
tech-stack:
  patterns:
    - "Supabase SQL migration applied via `bunx supabase db push --db-url $DATABASE_URL`"
    - "BEFORE DELETE trigger raising `Cannot remove the last platform admin`"
    - "Deny-all RLS by omission (no policies on platform_integrations / platform_branding = service-role-only)"
    - "Singleton row pattern: platform_branding.id=1 seeded at migration time for null-safe loader fallback"
    - ".env.local auto-load into vitest via tests/setup/load-env.ts (integration tests hit real Supabase)"

key-files:
  created:
    - supabase/migrations/20260419000001_platform_admin.sql
    - supabase/ADMIN-BOOTSTRAP.md
    - tests/unit/admin-bootstrap-doc.test.ts
    - tests/integration/platform-admins.test.ts
    - tests/integration/migration-branding-seed.test.ts
    - tests/integration/platform-brand-rls.test.ts
    - tests/setup/load-env.ts
  modified:
    - vitest.config.ts (setupFiles: tests/setup/load-env.ts + integration include pattern)
    - .planning/phases/08-.../08-01-PLAN.md (hardened Task 1 verify to fail on ERROR/Failed migration output)

key-decisions:
  - "Singleton branding row seeded at migration time so first-deploy pages never hit a null platform_branding query"
  - "Last-admin trigger on BEFORE DELETE (not constraint) so it can raise a descriptive message rather than opaque constraint failure"
  - "Storage bucket created as public=true for read (logo served on auth/share pages without auth) + RLS-gated write (super-admin only via Storage policies)"
  - "ADMIN-BOOTSTRAP.md is the ONLY place the INSERT statement for first super-admin is documented; chicken-and-egg bootstrap per R-08 (no env-var allowlist, no UI self-promotion)"
  - "Integration tests hit real Supabase (not mocked) per project testing convention — setupFiles loads .env.local so SUPABASE_SERVICE_ROLE_KEY is available under vitest"

patterns-established:
  - "tests/setup/load-env.ts: read .env.local and hydrate process.env before any test file imports Supabase client"
  - "Integration test shape: createServiceClient() → seed via auth.admin.createUser → exercise RLS → cleanup via cascade delete on auth.users"

requirements-completed: [ADMIN-02, ADMIN-03, ADMIN-08, ADMIN-09]

# Metrics
duration: interrupted+resumed
completed: 2026-04-20
---

# Phase 08 Plan 01: Platform Admin DB Foundation Summary

**Supabase migration creating platform_admins, platform_integrations, platform_branding tables + platform-brand storage bucket + last-admin trigger + seeded singleton branding + bootstrap SQL doc + integration tests. Every downstream Phase 8 plan depends on these tables and RLS semantics.**

## Performance

- **Completed:** 2026-04-20
- **Tasks:** 2 (Task 1 migration; Task 2 bootstrap doc + integration tests)
- **Files created:** 7
- **Files modified:** 2

## Accomplishments

- **Migration `supabase/migrations/20260419000001_platform_admin.sql`** — three tables (`platform_admins`, `platform_integrations`, `platform_branding`), one trigger (last-admin guard), one storage bucket (`platform-brand`) with super-admin-only write policies, one seeded row (`platform_branding.id=1` with `app_name='Xtimator'`). Applied cleanly via `bunx supabase db push`.
- **`supabase/ADMIN-BOOTSTRAP.md`** — one-time procedure to insert the first `platform_admins` row manually (chicken-and-egg per R-08). Includes `APP_ENCRYPTION_KEY` rotation procedure (`openssl rand -base64 32` + re-encrypt + env flip).
- **Integration test suite** — 4 test files (1 unit + 3 integration) covering trigger behavior, seed presence, and Storage bucket RLS enforcement against a real Supabase instance.
- **Test env loader** (`tests/setup/load-env.ts`) — hydrates `.env.local` into `process.env` before tests so integration tests can `createServiceClient()` without manual shell exports.

## Task Commits

1. **Task 1: SQL migration for admin tables + trigger + bucket + seed** — `df57325` (feat)
2. **Task 2: ADMIN-BOOTSTRAP doc + integration tests** — `13039b8` (test, includes tests/setup/load-env.ts + vitest setupFiles wiring)

## Files Created/Modified

### Created

- `supabase/migrations/20260419000001_platform_admin.sql` — full admin schema
- `supabase/ADMIN-BOOTSTRAP.md` — bootstrap + rotation doc
- `tests/unit/admin-bootstrap-doc.test.ts` — asserts doc contains `INSERT INTO platform_admins`, `APP_ENCRYPTION_KEY`, `openssl rand -base64 32`
- `tests/integration/platform-admins.test.ts` — seeds 2 admins, deletes one (ok), deletes last (trigger raises)
- `tests/integration/migration-branding-seed.test.ts` — asserts `platform_branding.id=1` has `app_name='Xtimator'`
- `tests/integration/platform-brand-rls.test.ts` — anon upload to `platform-brand` fails with RLS error; service role upload succeeds
- `tests/setup/load-env.ts` — pre-test `.env.local` loader

### Modified

- `vitest.config.ts` — added `setupFiles: ['tests/setup/load-env.ts']` and `tests/integration/**` include glob
- `.planning/phases/08-.../08-01-PLAN.md` — hardened Task 1 `<verify>` to apply migration for real and grep for ERROR/Failed lines (stricter than original dry-run pattern)

## Decisions Made

- **Singleton `platform_branding` seeded at migration time.** Without the seed row, the very first `getBranding()` call would return `null`, forcing every auth-side page to branch on `null` before render. The seed guarantees a single source of truth from t=0.
- **Last-admin guard as a BEFORE DELETE trigger**, not a CHECK constraint. CHECK constraints cannot produce descriptive error messages; the trigger raises `'Cannot remove the last platform admin'` which the `/admin/admins` page surfaces directly to the operator.
- **Deny-all RLS by omission for `platform_integrations` + `platform_branding`.** RLS is enabled on the tables but no policies exist → all operations through anon/authenticated clients are blocked. Only the service-role key (which bypasses RLS by design) can read or write. This is the intended and safest posture because these tables carry ciphertext and platform-wide config.
- **Storage bucket `platform-brand` is public-read.** The logo is served on the auth and share pages to unauthenticated visitors; making the bucket private would require signed URLs on every public page. Writes are still gated by Storage policies that call `is_platform_admin(auth.uid())`.
- **Integration tests against real Supabase, not mocks.** Per project convention from prior phases; avoids the "mock passed / prod migration failed" class of bugs. Requires `.env.local` on the dev machine — the test setup file surfaces this requirement cleanly.

## Deviations from Plan

**1. Parallel-execution interruption + resume (operational, no scope change)**

- **Found during:** execution — both Wave 1 agents (08-01, 08-02) hit the Anthropic usage limit mid-task.
- **Impact on 08-01:** Task 1 landed (commit `df57325`). Task 2 artifacts (doc + 4 test files + env loader + vitest config edit) were written to disk but never committed and the SUMMARY.md never produced.
- **Fix:** Main thread (this conversation) verified all Task 2 files existed on disk, ran `tests/unit/admin-bootstrap-doc.test.ts` (passed 3/3), confirmed acceptance criteria via `grep`, then committed in one chunk as `13039b8` and authored this SUMMARY.md.
- **Scope impact:** None. All planned artifacts shipped with the specified content; only the commit cadence deviated from the "one commit per task" convention for Task 2.

## Issues Encountered

- **Windows line-ending warnings** (LF→CRLF) on git commit — cosmetic, no file corruption.
- **Integration tests NOT executed locally** by this SUMMARY-writing pass; only the unit test for the bootstrap doc was run (passed). Integration suite (`platform-admins`, `migration-branding-seed`, `platform-brand-rls`) requires the migration to be applied to the dev Supabase project and `.env.local` populated — same requirement documented in the plan. The verifier agent will run them against a live DB during phase verification.

## User Setup Required

**Before the next admin-panel feature is usable:**

1. Apply the migration to your Supabase project: `bunx supabase db push --db-url $DATABASE_URL`
2. Bootstrap the first admin: follow `supabase/ADMIN-BOOTSTRAP.md` (copy your auth.users UUID, run `INSERT INTO platform_admins ...` in Supabase SQL editor).
3. Add `APP_ENCRYPTION_KEY` to `.env.local` (generation command in `.env.example` and `ADMIN-BOOTSTRAP.md`).

Steps 1 and 3 can run in parallel; step 2 requires step 1.

## Next Phase Readiness

- **Wave 2 (08-03 admin-gate):** `platform_admins` table exists with service-role query path — `checkPlatformAdmin(userId)` can be implemented as a single `.from('platform_admins').select('user_id').eq('user_id', userId).maybeSingle()`.
- **Wave 3 (08-04 integrations UI):** `platform_integrations` schema matches the `EncryptedBlob` shape (`ciphertext`, `iv`, `auth_tag` BYTEA columns) that `lib/platform-config.ts` (from 08-02) already reads.
- **Wave 3 (08-05 branding UI):** Singleton row id=1 is present — UPSERT, not INSERT, is the correct pattern. Storage bucket ready for logo upload.
- **Wave 3 (08-06 admins UI):** Trigger protects against last-admin deletion — the UI can surface Postgres errors directly without extra guard logic.

## Self-Check: PASSED

- `supabase/migrations/20260419000001_platform_admin.sql` — FOUND (commit `df57325`)
- `supabase/ADMIN-BOOTSTRAP.md` — FOUND
- `grep -ic "INSERT INTO platform_admins" supabase/ADMIN-BOOTSTRAP.md` → 1 ✓
- `grep -c "openssl rand -base64 32" supabase/ADMIN-BOOTSTRAP.md` → 1 ✓
- `grep -c "APP_ENCRYPTION_KEY" supabase/ADMIN-BOOTSTRAP.md` → 3 ✓
- `tests/unit/admin-bootstrap-doc.test.ts` — FOUND, runs 3/3 passing
- `tests/integration/platform-admins.test.ts` — FOUND
- `tests/integration/migration-branding-seed.test.ts` — FOUND
- `tests/integration/platform-brand-rls.test.ts` — FOUND
- Commit `df57325` — FOUND in `git log --oneline` (Task 1)
- Commit `13039b8` — FOUND in `git log --oneline` (Task 2)

---
*Phase: 08-platform-admin-panel-for-centralized-api-integrations*
*Completed: 2026-04-20*
