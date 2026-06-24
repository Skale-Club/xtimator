---
phase: 112-credit-ledger-consumption-metering
plan: 01
subsystem: billing
tags: [credit-ledger, migration, rls, idempotency, schema]
requires:
  - "companies table (Phase 55+)"
  - "company_members join table (Phase 79)"
  - "Phase 82 tenant-RLS invariant (no companies.user_id in policies)"
provides:
  - "public.credit_ledger append-only table (tenant-readable, idempotent debits)"
  - "companies.credit_balance fast-read column (CREDIT-03)"
  - "partial-unique idempotency index (no double-debit on retry)"
  - "static SQL-contract test locking the migration shape"
affects:
  - "All downstream Phase 112+ plans that write/read credit movements"
  - "Phase 115 owner credit widget (reads credit_ledger + credit_balance via tenant RLS)"
tech-stack:
  added: []
  patterns:
    - "Tenant-readable financial table RLS mirroring phase94 invoices (company_members SELECT, no DELETE)"
    - "Append-only ledger + cached balance column for O(1) reads"
    - "Partial-unique (company_id, idempotency_key) WHERE NOT NULL for retry-safe debits"
    - "Static SQL-contract test (readFileSync, no DB, no secrets)"
key-files:
  created:
    - "supabase/migrations/20260624000004_phase112_credit_ledger.sql"
    - "tests/unit/billing/credit-ledger-migration.test.ts"
  modified: []
decisions:
  - "credit_ledger RLS is TENANT-READABLE (company_members SELECT) — mirrors phase94 invoices, NOT service-role-only like ai_cost_events, so Phase 115's owner widget can read it."
  - "operation_type lists exactly the four chargeable user-facing ops; vision/translation are sub-calls rolled into photo_batch/estimate and excluded."
  - "companies.credit_balance is a cached fast-read (CREDIT-03); the ledger remains the source of truth."
  - "Migration authored only — NOT applied to remote (deploy is CI->GHCR->Coolify per CLAUDE.md)."
metrics:
  duration: "~2 min"
  completed: "2026-06-24"
  tasks: 2
  files: 2
  commits: 2
---

# Phase 112 Plan 01: Credit Ledger Schema Foundation Summary

Append-only `credit_ledger` table (tenant-readable via `company_members`, retry-safe via a partial-unique idempotency index) plus the cached `companies.credit_balance` fast-read column — the durable, tenant-isolated, idempotent storage every other Phase 112 plan writes against (CREDIT-01, CREDIT-03).

## What Was Built

**Task 1 — `20260624000004_phase112_credit_ledger.sql`** (commit `5be40f8b`)
- `public.credit_ledger`: `id`, `company_id` (FK ON DELETE CASCADE), `delta_credits` (INTEGER NOT NULL), `reason` (CHECK grant/debit/topup/adjust), nullable `operation_type` (CHECK estimate/photo_batch/audio_minutes/price_research), `ref_id`, nullable provenance `real_cost_usd` NUMERIC(12,6) + `markup` NUMERIC(6,3), `balance_after` (INTEGER NOT NULL), `idempotency_key`, `created_at`.
- `companies.credit_balance INTEGER NOT NULL DEFAULT 0` — atomic backfill of every existing company to a 0 balance.
- Indexes: `idx_credit_ledger_company_created` (history, DESC) and `idx_credit_ledger_idempotency` (UNIQUE partial, `WHERE idempotency_key IS NOT NULL`).
- RLS: `ENABLE ROW LEVEL SECURITY` + a single `credit_ledger_select` policy `FOR SELECT TO authenticated` gating by `company_members.company_id`. No INSERT/UPDATE/DELETE policy (append-only; service role bypasses RLS for writes).
- Idempotent DDL (`CREATE TABLE/INDEX IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`); authored only, NOT applied to remote.

**Task 2 — `tests/unit/billing/credit-ledger-migration.test.ts`** (commit `2b45fcb8`)
- 13 static-read assertions (mirrors `ai-cost-events-migration.test.ts`): pure `readFileSync`, no DB, no secrets.
- Locks: idempotent table create; 4-value `reason` enum; exactly-four `operation_type` ops with ABSENCE of `'vision'`/`'translation'`; INTEGER NOT NULL on `delta_credits`/`balance_after`; nullable `real_cost_usd`/`markup`; `credit_balance` column; RLS enabled; tenant-readable `company_members` SELECT policy; ABSENCE of `companies.user_id` anywhere; no INSERT/UPDATE/DELETE policy; partial-unique idempotency index; history index.

## Verification

- `npx vitest run tests/unit/billing/credit-ledger-migration.test.ts` — 13/13 GREEN.
- `npx vitest run tests/unit/billing` — 15 files / 99 tests GREEN, no regressions.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Migration header comment tripped the Phase 82 `companies.user_id` invariant**
- **Found during:** Task 2 (test run RED on the ABSENCE-of-`companies.user_id` assertion)
- **Issue:** The migration's explanatory RLS comment literally contained the string `companies.user_id` ("NOT companies.user_id"), which the whole-file Phase 82 invariant assertion (required by the plan) correctly flagged as a violation.
- **Fix:** Rephrased the comment to "NEVER the legacy companies owner column" — preserving the documented intent without emitting the forbidden token. Kept the strict whole-file assertion (the plan explicitly requires asserting ABSENCE of `companies.user_id`).
- **Files modified:** supabase/migrations/20260624000004_phase112_credit_ledger.sql
- **Commit:** `5be40f8b` (fixed before the migration commit)

## Known Stubs

None — this is a schema/migration plan with a contract test; no UI data sources or placeholders.

## Self-Check: PASSED

- FOUND: supabase/migrations/20260624000004_phase112_credit_ledger.sql
- FOUND: tests/unit/billing/credit-ledger-migration.test.ts
- FOUND commit: 5be40f8b (feat — migration)
- FOUND commit: 2b45fcb8 (test — contract)
