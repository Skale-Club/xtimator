# Phase 71 — Deferred Items (out-of-scope discoveries)

## Pre-existing unit test failures (NOT caused by Plan 71-02)

Running `bun run test` reports 43 failures across:
- `tests/unit/inngest/*` (7 files) — Inngest job + client tests; env/service config required
- `tests/unit/storage/s3-provider.test.ts` — S3 provider env
- `tests/unit/admin-actions.test.ts`, `tests/unit/admin-dashboard.test.ts`, `tests/unit/admin-gate.test.ts`, `tests/unit/admin-test-button.test.ts`, `tests/unit/queries/auth.test.ts` — `requireServiceClient()` throws when no SUPABASE_SERVICE_ROLE_KEY in test env

These pre-date Plan 71-02 (none touch UI primitives or design tokens). Logged here per executor `SCOPE BOUNDARY` rule. To resolve: ensure `tests/setup/load-env.ts` is producing a service-role key for local test runs, or mock `requireServiceClient` in the affected test suites.

**Verification this is pre-existing:** all failing files are in `tests/unit/{inngest,storage,admin*,queries}` paths with no overlap to `tests/unit/components/` (which is 65/65 passing post-71-02).
