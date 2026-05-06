---
phase: 19-price-book-db-foundation
plan: 01
subsystem: database
tags: [supabase, postgresql, rls, migrations, integration-tests]

# Dependency graph
requires:
  - phase: 01-foundation-auth
    provides: RLS subquery pattern (company_id IN (SELECT id FROM companies WHERE user_id = auth.uid()))
  - phase: 09-system-wide-dark-mode-default
    provides: nullable TEXT + CHECK constraint pattern (theme_preference migration)
provides:
  - company_price_book DDL with UUID PK, RLS, and 4 policies using project-standard subquery
  - estimate_items.price_source nullable TEXT column with IS NULL OR IN check constraint
  - Wave 0 integration test stub for RLS smoke (SC-1, SC-2, SC-3)
affects: [19-02-price-book-db-foundation, price-book-ui, estimate-editor-price-source-badges]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Wave 0 test stub pattern: integration test written before migration applied; expected RED until Plan 02 runs db push"
    - "ENABLE ROW LEVEL SECURITY before CREATE POLICY (prevents policy-before-RLS pitfall)"
    - "company_price_book_update policy has both USING + WITH CHECK identical subqueries"
    - "price_source CHECK uses IS NULL OR IN (...) form to allow existing NULLs"

key-files:
  created:
    - supabase/migrations/20260506000001_phase19_price_book.sql
    - tests/integration/price-book-rls.test.ts
  modified: []

key-decisions:
  - "Wave 0 test stub covers 3 smoke criteria (SC-1/SC-2/SC-3); SC-1 and SC-3 are intentionally RED until migration applied in Plan 02"
  - "company_price_book uses TEXT + CHECK for status fields (no Postgres enums — consistent with D-07/D-08 decisions)"
  - "unit_price NUMERIC(12,2) matches estimate_items.unit_price precision exactly"
  - "price_source values are price_book and ai_estimate; NULL = pre-v1.3 row with no badge"

patterns-established:
  - "Integration test Wave 0 stubs for DB migrations: write test first (will RED), apply migration in next plan (goes GREEN)"

requirements-completed:
  - infrastructure-prereq-PB-01
  - infrastructure-prereq-AIPRICE-03
  - infrastructure-prereq-EDITPRICE-01

# Metrics
duration: 11min
completed: 2026-05-06
---

# Phase 19 Plan 01: Price Book DB Foundation Summary

**Supabase migration DDL for company_price_book with 4-policy RLS and estimate_items.price_source TEXT column, plus Wave 0 integration test stub**

## Performance

- **Duration:** 11 min
- **Started:** 2026-05-06T21:18:06Z
- **Completed:** 2026-05-06T21:29:10Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Created complete migration SQL with `company_price_book` table (UUID PK, company_id FK cascade, category, name, unit, unit_price NUMERIC(12,2), notes, created_at)
- Applied full 4-policy RLS using project-standard subquery pattern (`company_id IN (SELECT id FROM companies WHERE user_id = (SELECT auth.uid()))`)
- Added nullable `price_source TEXT` column to `estimate_items` with `IS NULL OR IN ('price_book', 'ai_estimate')` CHECK constraint and COMMENT
- Created Wave 0 integration test stub covering SC-1 (table exists), SC-2 (RLS anon isolation), SC-3 (column exists) — correctly RED until Plan 02 applies migration

## Task Commits

Each task was committed atomically:

1. **Task 1: Wave 0 integration stub for company_price_book RLS** - `cd7a41c` (test)
2. **Task 2: Migration SQL — company_price_book + price_source column** - `c44166c` (feat)

## Files Created/Modified

- `supabase/migrations/20260506000001_phase19_price_book.sql` - Full DDL: CREATE TABLE, ENABLE RLS, 4 CREATE POLICY, ALTER TABLE estimate_items ADD COLUMN price_source
- `tests/integration/price-book-rls.test.ts` - Wave 0 integration test stub with env-gated describe.skip pattern; SC-1/SC-2/SC-3 smoke tests

## Decisions Made

- Wave 0 pattern: test stub written before migration applied. SC-1 and SC-3 are intentionally RED (table/column don't exist in live DB) — correct behavior for Wave 0. GREEN after Plan 02 applies `bunx supabase db push`.
- `company_price_book_update` policy carries both `USING` and `WITH CHECK` with identical subquery — required for UPDATE to work correctly in Postgres RLS.
- `price_source IS NULL OR price_source IN (...)` form — allows existing rows to remain NULL without constraint violation; matches theme_preference pattern from Phase 09.
- No Postgres enum type — consistent with D-07/D-08 project decisions; TEXT + CHECK gives flexibility for future values.

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

**Pre-existing test failures discovered (out of scope):** `tests/unit/onboarding-schema.test.ts` has 2 failing tests asserting `brandPrimaryColor` defaults to `#0D9488` when the actual default is `#406EF1` (updated in Phase 10). These 12 pre-existing failures across 4 test files are unrelated to Phase 19 changes. Logged to `deferred-items.md`.

**Wave 0 expected RED:** When running the new integration test with live Supabase env vars, SC-1 and SC-3 correctly fail with "table/column does not exist" — this is the documented expected state before Plan 02 applies the migration.

## User Setup Required

None — no external service configuration required for this plan. Plan 02 will apply the migration to live DB via `bunx supabase db push`.

## Next Phase Readiness

- Migration SQL is complete and ready for `bunx supabase db push` in Plan 02
- Integration test stub is in place; will auto-pass once migration is applied
- Wave 0 complete — Nyquist-compliant test coverage exists for all schema changes before live DB apply

---
*Phase: 19-price-book-db-foundation*
*Completed: 2026-05-06*
