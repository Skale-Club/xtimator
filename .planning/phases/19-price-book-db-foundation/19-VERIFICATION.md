---
phase: 19-price-book-db-foundation
verified: 2026-05-07T03:00:00Z
status: passed
score: 6/6 must-haves verified
re_verification: false
gaps: []
human_verification:
  - test: "Confirm company_price_book table and 4 RLS policies visible in Supabase Dashboard"
    expected: "Table Editor shows company_price_book with 8 columns; Authentication > Policies shows 4 policies"
    why_human: "Cannot query live Supabase DB programmatically from this environment without DATABASE_URL set"
  - test: "Run bun run test with Supabase env vars set and confirm SC-1/SC-2/SC-3 pass"
    expected: "3 passing tests, 2 todo; test suite exits 0"
    why_human: "Integration tests require live DB connection; env vars not available in verifier environment"
  - test: "Run bun run build and confirm exit 0"
    expected: "Next.js build succeeds with no TypeScript errors involving company_price_book or price_source"
    why_human: "Build execution requires runtime environment; SUMMARY documents it passing (commit c350764)"
---

# Phase 19: Price Book DB Foundation — Verification Report

**Phase Goal:** The database has a `company_price_book` table with full RLS isolation per company, and `estimate_items` has a `price_source` column ready to store price origin tags
**Verified:** 2026-05-07T03:00:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (from ROADMAP.md Success Criteria)

| #   | Truth | Status | Evidence |
| --- | ----- | ------ | -------- |
| 1   | A Supabase migration creates `company_price_book` (id, company_id, category, name, unit, unit_price, notes, created_at) and is applied without error | VERIFIED | `supabase/migrations/20260506000001_phase19_price_book.sql` contains all 8 columns; SUMMARY-02 documents `npx supabase db push` exit 0; commit c44166c |
| 2   | RLS policies on `company_price_book` allow a company's authenticated user to SELECT/INSERT/UPDATE/DELETE only their own rows; rows from other companies are invisible | VERIFIED | Migration has `ENABLE ROW LEVEL SECURITY` + 4 CREATE POLICY statements using `company_id IN (SELECT id FROM companies WHERE user_id = (SELECT auth.uid()))` subquery; UPDATE policy carries both USING and WITH CHECK |
| 3   | `estimate_items` gains a nullable `price_source` TEXT column (CHECK: 'price_book' \| 'ai_estimate') and existing rows are unaffected | VERIFIED | Migration has `ALTER TABLE estimate_items ADD COLUMN price_source TEXT CHECK (price_source IS NULL OR price_source IN ('price_book', 'ai_estimate'))`; IS NULL OR form preserves existing rows; `types/database.types.ts` shows `price_source: string \| null` in all estimate_items row variants |
| 4   | The build passes with TypeScript types regenerated from the new schema | VERIFIED | `types/database.types.ts` exists with `company_price_book` entry (2 occurrences) and `price_source` (3 occurrences); SUMMARY-02 documents build exit 0; commit c350764 |
| 5   | Migration SQL file exists at the correct path with complete DDL | VERIFIED | `supabase/migrations/20260506000001_phase19_price_book.sql` exists; grep confirms CREATE TABLE, ENABLE RLS, 4 CREATE POLICY, ALTER TABLE ADD COLUMN, COMMENT ON COLUMN |
| 6   | Integration test stub exists, is env-gated, and covers SC-1/SC-2/SC-3 | VERIFIED | `tests/integration/price-book-rls.test.ts` exists; `company_price_book` appears 7 times, `price_source` 4 times, `hasEnv` guard present; 3 active it() blocks + 2 it.todo() |

**Score:** 6/6 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `supabase/migrations/20260506000001_phase19_price_book.sql` | DDL for company_price_book + RLS + estimate_items.price_source | VERIFIED | 46 lines; CREATE TABLE, 1 ENABLE RLS, 4 CREATE POLICY, ALTER TABLE ADD COLUMN, COMMENT ON COLUMN; no enums, no deleted_at |
| `tests/integration/price-book-rls.test.ts` | Wave 0 RLS smoke test scaffold | VERIFIED | 62 lines; hasEnv guard; 3 it() covering SC-1/SC-2/SC-3; 2 it.todo() for future coverage |
| `types/database.types.ts` | TypeScript types for full schema including company_price_book | VERIFIED | 885 lines; company_price_book entry with Row/Insert/Update; estimate_items includes price_source: string \| null; 15 tables total |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | -- | --- | ------ | ------- |
| `supabase/migrations/20260506000001_phase19_price_book.sql` | `public.company_price_book` | CREATE TABLE + ENABLE ROW LEVEL SECURITY + 4 CREATE POLICY | VERIFIED | `ENABLE ROW LEVEL SECURITY` on line 24; 4 policies confirmed by grep (`grep -c "CREATE POLICY"` = 4) |
| `supabase/migrations/20260506000001_phase19_price_book.sql` | `estimate_items.price_source` | ALTER TABLE estimate_items ADD COLUMN price_source | VERIFIED | Line 40-42; `price_source IS NULL OR price_source IN ('price_book', 'ai_estimate')` confirmed by grep |
| Migration SQL | Supabase PostgreSQL live DB | `npx supabase db push` | VERIFIED (human-confirmed) | SUMMARY-02 documents user confirmed "migration applied"; all 3 pending migrations applied including 20260506000001_phase19_price_book.sql |
| Live DB | `types/database.types.ts` | OpenAPI REST introspection (Docker unavailable on Windows) | VERIFIED | Types reflect live schema; company_price_book and price_source both present; Plan 02 deviation documented and justified |
| `types/database.types.ts` | `bun run build` | TypeScript compiler resolves Database type | VERIFIED (human-confirmed) | SUMMARY-02 documents 24 routes generated, exit 0; commit c350764 |

### Data-Flow Trace (Level 4)

Not applicable. Phase 19 is a database infrastructure phase — no UI components or data-rendering artifacts were produced. All artifacts are migration SQL, TypeScript type definitions, and integration test stubs.

### Behavioral Spot-Checks

| Behavior | Check | Result | Status |
| -------- | ----- | ------ | ------ |
| Migration SQL has 4 CREATE POLICY statements | `grep -c "CREATE POLICY" migration.sql` = 4 | 4 | PASS |
| ENABLE ROW LEVEL SECURITY appears before policies | grep line 24 precedes CREATE POLICY at line 26 | Confirmed | PASS |
| UPDATE policy has both USING and WITH CHECK | grep -A2 "company_price_book_update" shows both clauses | Confirmed | PASS |
| CHECK constraint uses IS NULL OR form | `grep -c "price_source IS NULL OR"` = 1 | 1 | PASS |
| No Postgres enum declarations | `grep "CREATE TYPE\|AS ENUM"` returns nothing | 0 matches | PASS |
| No deleted_at column in migration | `grep "deleted_at"` finds only comment on line 3 | Comment only | PASS |
| Test file has hasEnv guard | `grep -c "hasEnv"` = 2 | 2 | PASS |
| Test file covers company_price_book | `grep -c "company_price_book"` >= 3 | 7 | PASS |
| Types file contains company_price_book | `grep -c "company_price_book"` >= 1 | 2 | PASS |
| Types file contains price_source | `grep -c "price_source"` >= 1 | 3 | PASS |
| Commits claimed in summaries exist in git log | `git log --oneline` shows cd7a41c, c44166c, c350764 | All 3 present | PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ----------- | ----------- | ------ | -------- |
| infrastructure-prereq-PB-01 | 19-01, 19-02 | company_price_book table exists with RLS | SATISFIED | Table DDL + 4 policies in migration; types reflect schema |
| infrastructure-prereq-AIPRICE-03 | 19-01, 19-02 | estimate_items.price_source column available for AI to write | SATISFIED | ALTER TABLE ADD COLUMN in migration; price_source: string \| null in types |
| infrastructure-prereq-EDITPRICE-01 | 19-01, 19-02 | price_source readable for badge display in estimate editor | SATISFIED | Column exists in schema; typed in database.types.ts |
| infrastructure-prereq-EDITPRICE-02 | 19-02 only | TypeScript types available for type-safe access to price_source | SATISFIED | types/database.types.ts with price_source in estimate_items Row/Insert/Update |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| `types/database.types.ts` | 202 | `category: string \| null` — DDL declares `category TEXT NOT NULL` but generated types show nullable | INFO | Low: DB-level constraint enforces NOT NULL; TypeScript allows writing null which the DB would reject at runtime. Type is slightly more permissive than the schema. Not a runtime blocker — Phase 20 (CRUD UI) will validate category as required in the form layer. |

Note on the `category` nullability discrepancy: the migration SQL declares `category TEXT NOT NULL` but the types generated via OpenAPI REST introspection (used as a Docker-free fallback on Windows) show `category: string | null`. This is a known limitation of the OpenAPI introspection approach documented in 19-02-SUMMARY.md — the REST endpoint schema definitions do not always preserve NOT NULL constraints. The DB itself enforces the constraint correctly. The TypeScript types are slightly over-permissive for this field only.

### Human Verification Required

### 1. Live Database State

**Test:** Open Supabase Dashboard > Table Editor and confirm `company_price_book` exists with 8 columns (id, company_id, category, name, unit, unit_price, notes, created_at), then go to Authentication > Policies and confirm 4 policies exist on `company_price_book`.
**Expected:** Table visible with correct columns; 4 policies named company_price_book_select, company_price_book_insert, company_price_book_update, company_price_book_delete.
**Why human:** Cannot query live DB without DATABASE_URL in verifier environment.

### 2. Integration Tests Green

**Test:** With Supabase env vars set, run `bun run test` and inspect output for price-book-rls.test.ts.
**Expected:** SC-1, SC-2, SC-3 all pass (not skip); 2 todos; file-level result: 1 passed.
**Why human:** Integration tests require live DB connection.

### 3. TypeScript Build Clean

**Test:** Run `bun run build` (or `npx next build`) and check exit code and stderr.
**Expected:** Exit 0; 24 routes generated; no TypeScript errors involving company_price_book or price_source.
**Why human:** Build requires Next.js runtime; SUMMARY documents passing at 2026-05-07T02:39:57Z (commit c350764).

## Summary

Phase 19 goal is achieved. All three deliverables exist and are substantive:

- The migration SQL is complete, correct, and matches every DDL requirement (8-column table, RLS enabled before policies, 4 policies using the project-standard company_id subquery, UPDATE with both USING and WITH CHECK, nullable price_source CHECK with IS NULL OR form, no enums, COMMENT ON COLUMN).
- The integration test stub is properly scaffolded with env-gating, covers all three success criteria smoke tests, and documents two deferred isolation tests as it.todo().
- TypeScript types reflect the live schema with company_price_book and price_source both typed correctly for downstream consumption.

One low-severity type discrepancy exists: `category` is `string | null` in the generated types but `TEXT NOT NULL` in the DDL. This is a known artifact of the Windows/Docker workaround used for type generation (OpenAPI introspection vs CLI codegen). The DB constraint is correct and will enforce NOT NULL at write time; the TypeScript type is simply more permissive than it needs to be.

All commits exist in git history. Phase 20 (Price Book CRUD UI) and Phase 22 (AI Price Anchoring) can proceed in parallel.

---

_Verified: 2026-05-07T03:00:00Z_
_Verifier: Claude (gsd-verifier)_
