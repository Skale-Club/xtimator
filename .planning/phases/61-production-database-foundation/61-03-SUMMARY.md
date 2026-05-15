---
phase: 61-production-database-foundation
plan: "03"
subsystem: migrations
tags: [migrations, supabase, db-push, drift-recovery]
metrics:
  duration_minutes: 8
  tasks_completed: 1
  tasks_total: 1
  completed_date: "2026-05-15"
---

# Phase 61 Plan 03: Apply Migrations — DRIFT RECOVERY

**One-liner:** Discovered 9 pending migrations (phases 43-60) that were never registered in `supabase_migrations.schema_migrations` despite the SQL files existing on disk. Applied all 9 via `supabase db push`.

## Critical Finding

The Wave 1 audit (Plan 01) revealed the database was missing the entire v2.x WhatsApp schema additions and **the entire v3.0 monetization schema**. Specifically:

| Migration | Phase | What was missing in DB |
|-----------|-------|----------------------|
| 20260510000003 | 43 | WhatsApp session expiry pg_cron job |
| 20260510000004 | 44 | `company_whatsapp.delivery_format` column |
| 20260511000001 | 50 | WhatsApp OTP fields |
| 20260511000002 | 52 | `estimates.language` column |
| 20260511000003 | 53 | `estimates.pdf_url` column |
| **20260513000001** | **55** | **`companies.tier`, `companies.tier_trial_ends_at`, `usage_events` table** |
| **20260513000002** | **56** | **`usage_events.idempotency_key`** |
| **20260514000001** | **58** | **`processed_stripe_events` table (Stripe webhook idempotency)** |
| 20260514000002 | 60 | pg_cron trial expiry job |

**Implication:** if v3.1 had been deployed without applying these, the entire monetization layer would have crashed:
- `/settings/billing` → 500 (companies.tier doesn't exist)
- Stripe webhook → 500 (processed_stripe_events doesn't exist)
- `consumeQuota` → 500 (usage_events doesn't exist)
- Trial expiry cron → no-op (job not scheduled)

This is **exactly what the Phase 61 readiness audit was built to catch**.

## How it was applied

```bash
$env:DATABASE_URL = "<dev/prod connection string>"
npx -y supabase db push --db-url $env:DATABASE_URL --include-all
```

All 9 migrations applied in order without errors. pg_cron extension was already enabled in dev (no migration aborts).

## Why this happened (suspected)

The phases that built the missing schema (43-60) were executed in **git worktrees** (parallel agents). Worktree directories created the SQL files but the executors did not always run `db push` against the shared DB after writing the file. The dev environment continued to "work" because:
- Some columns were added via Dashboard SQL Editor without registering as migrations
- Most testing was done in isolation per worktree, masking the gap
- No periodic schema/migration consistency check existed (until Phase 61)

## Verification post-apply

```
node supabase/audits/run-prod-readiness.mjs

[1/4] RLS audit (rls-audit.sql)... OK (zero FAIL rows)
[2/4] Migration count... OK (21 migrations applied)
[3/4] Storage buckets... OK (5 buckets present)
[4/4] Super-admin bootstrap... OK (super-admin present: skale.club@gmail.com)
=== All four checks PASSED ===
```

RLS audit total went from **26 → 28 tables** (added `usage_events` + `processed_stripe_events`). All 28 OK.

## Requirements satisfied

- **PROD-DB-02** (all migrations applied): satisfied — 21/21 in DB matches 21/21 on disk

## Decisions

- **No squash, no rewrite, just apply** — the on-disk migration files are the source of truth; backfilling the DB to match was the safest path
- **`compare-migrations.mjs` committed for future drift detection** — should be run before any production deploy to catch this class of bug
