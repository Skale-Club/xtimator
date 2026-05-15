---
phase: 61
slug: production-database-foundation
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-15
---

# Phase 61 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
>
> **Note:** This is a DEPLOYMENT/OPS phase — no application code is added. Validation consists of SQL queries, CLI output verification, and committed audit artifacts rather than unit tests.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | bash + psql + supabase CLI |
| **Config file** | none — uses `.env.production` (local, gitignored) for `PROD_DB_URL` |
| **Quick run command** | `psql "$PROD_DB_URL" -f supabase/audits/rls-audit.sql` |
| **Full suite command** | `bash supabase/audits/run-prod-readiness.sh` (composes all SQL audits + connectivity check) |
| **Estimated runtime** | ~10 seconds |

---

## Sampling Rate

- **After every task commit:** Run quick command (RLS audit must return zero FAIL rows)
- **After every plan wave:** Run full suite (RLS + migration count + super-admin presence + storage buckets)
- **Before `/gsd:verify-work`:** Full suite must pass — zero FAIL rows, all 21 migrations applied, super-admin present, all buckets exist
- **Max feedback latency:** 30 seconds (network round-trip to Supabase)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| Provision prod project | 01 | 1 | PROD-DB-01 | Manual + CLI | `supabase projects list` shows new project | `.env.production` (gitignored) | pending |
| Enable pg_cron extension | 01 | 1 | PROD-DB-02 (prereq) | SQL | `psql "$PROD_DB_URL" -c "SELECT extname FROM pg_extension WHERE extname='pg_cron'"` returns 1 row | n/a | pending |
| Apply all migrations | 02 | 2 | PROD-DB-02 | CLI | `bunx supabase migration list --db-url "$PROD_DB_URL"` shows zero pending | n/a | pending |
| Storage buckets created | 02 | 2 | PROD-DB-02 | SQL | `psql "$PROD_DB_URL" -c "SELECT id FROM storage.buckets"` returns 5 rows (logos, audio, photos, pdfs, platform_brand_assets) | n/a | pending |
| Super-admin bootstrap | 03 | 3 | PROD-DB-03 | SQL | `psql "$PROD_DB_URL" -c "SELECT email FROM platform_admins WHERE email='skale.club@gmail.com'"` returns 1 row | n/a | pending |
| Free-tier backups verified | 03 | 3 | PROD-DB-04 (deferred) | Dashboard | Supabase Dashboard → Database → Backups shows daily backup retention enabled | screenshot in runbook | pending |
| RLS audit query committed | 04 | 4 | PROD-DB-05 | File | `test -f supabase/audits/rls-audit.sql` | `supabase/audits/rls-audit.sql` | pending |
| RLS audit returns zero FAIL | 04 | 4 | PROD-DB-05 | SQL | `psql "$PROD_DB_URL" -f supabase/audits/rls-audit.sql \| grep -c FAIL` returns 0 | n/a | pending |
| RLS snapshot committed | 04 | 4 | PROD-DB-05 | File | snapshot file exists with PASS rows for all tenant tables | `.planning/phases/61-production-database-foundation/61-prod-rls-snapshot.txt` | pending |
| Bootstrap runbook | 04 | 4 | PROD-DB-03 | File | runbook covers invite + re-run seed + verification SQL | `supabase/PROD-BOOTSTRAP.md` | pending |

---

## Wave 0 (Test Scaffolding)

Wave 0 in this phase = preparing the audit infrastructure BEFORE touching production:

1. **Write `supabase/audits/rls-audit.sql`** with explicit PASS/FAIL output column
2. **Validate against DEV first** — run audit against `DATABASE_URL` (dev), confirm it returns expected posture (zero FAIL or only known-deferred FAIL rows)
3. **Document expected baseline** in `supabase/audits/EXPECTED-POSTURE.md` so prod audit has a comparison target

Only after Wave 0 passes against dev does Wave 1 (provision prod) begin.

---

## Goal-Backward Verification

**Phase Goal:** The production Supabase project exists with full schema, the first super-admin can sign in, point-in-time recovery is on (deferred), and RLS posture is verified.

For the phase to be DONE, ALL of the following observable behaviors must be true:

1. ✅ `psql "$PROD_DB_URL" -c "SELECT current_database()"` succeeds
2. ✅ `bunx supabase migration list --db-url "$PROD_DB_URL"` shows zero pending migrations
3. ✅ Storage buckets table contains 5 buckets matching dev
4. ✅ `SELECT email FROM platform_admins` returns at least 1 row matching `skale.club@gmail.com`
5. ✅ `supabase/audits/rls-audit.sql` returns zero `FAIL` rows when run against production
6. ✅ Snapshot output committed to `.planning/phases/61-production-database-foundation/61-prod-rls-snapshot.txt`
7. ⚠️ PITR enablement deferred — `supabase/PROD-BOOTSTRAP.md` documents upgrade path
8. ✅ `.env.production` exists locally (NEVER committed) with all required keys

---

## Failure Modes & Recovery

| Failure | Detection | Recovery |
|---------|-----------|----------|
| Migration fails midway | `db push` exits non-zero | Investigate error, fix migration file or DB state, re-run from failed migration |
| pg_cron not enabled | 3 specific migrations error on `cron.schedule(...)` | Enable extension via Dashboard, re-run from failed migration |
| Super-admin seed inserts 0 rows | `platform_admins` empty after seed | Dashboard invite first → re-run seed migration |
| RLS audit returns FAIL rows | grep FAIL output non-zero | Investigate the table — likely missing policy or wrong scope. Fix migration, re-run on dev first, then prod. |
| Storage bucket missing | bucket count != 5 | Re-run the migration that creates buckets, or create via dashboard |
