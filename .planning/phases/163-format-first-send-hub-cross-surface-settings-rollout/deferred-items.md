# Phase 163 -- Deferred Items

Out-of-scope discoveries logged during Phase 163 plan runs, per GSD SCOPE
BOUNDARY. Do NOT fix in this phase; refer to a follow-on plan.

## Discovered during 163-06 (deletion sweep)

### 1. Pre-existing full-suite ordering flake (4 unit test files)

- Files:
  - `tests/unit/cleanup-route-auth.test.ts`
  - `tests/unit/company-action.test.ts`
  - `tests/unit/ai/empty-output-guards.test.ts`
  - `tests/unit/ai/transcribe-fallback.test.ts`
- Symptom: FAILs when run as part of `npm test` (full 3300+ test suite).
- In isolation: PASSes on both current post-deletion state AND on the
  stashed pre-deletion state (verified by `git stash` + rerun).
- Verdict: pre-existing full-suite test-ordering / mock-leakage flake.
  NOT caused by 163-06's file deletion.
- Suggested follow-up: audit test setup for module cache / env-var / mock
  leakage between parallel test files; the interfering file is not yet
  identified.

### 2. Pre-existing Phase 160 integration test DB migration state (3 tests)

- File: `tests/integration/estimates-public-token-rls.test.ts`
- Symptom: 3 FAILs -- `column estimates.public_slug_token does not exist`
  on the anon/service selects (SC-2, SC-3, and one more assertion).
- Root cause: local Supabase does not have the Phase 160
  `public_slug_token` migration applied. The migration file exists in
  `supabase/migrations/` but has not been applied to the local dev DB.
- Verdict: pre-existing local-DB migration state issue. Verified by
  running the failing test file on the stashed pre-deletion state --
  same failure. NOT caused by 163-06.
- Suggested follow-up: run `supabase db reset` (or `supabase migration
  up`) locally to apply the pending Phase 160 migration. The CI/CD
  pipeline already has the migration applied.
