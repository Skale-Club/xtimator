---
phase: 60-trial-automation-admin-tooling
plan: "01"
subsystem: trial-lifecycle
tags: [cron, trial, resend, pg_cron, vercel]
dependency_graph:
  requires:
    - "supabase/migrations/20260513000001_phase55_subscription_tiers.sql (tier + tier_trial_ends_at columns)"
    - "lib/supabase/service.ts (requireServiceClient)"
    - "lib/platform-config.ts (getIntegrationKey)"
  provides:
    - "app/api/cron/expire-trials/route.ts"
    - "app/api/cron/trial-warning-emails/route.ts"
    - "supabase/migrations/20260514000002_phase60_pg_cron_trial.sql"
  affects:
    - "vercel.json (crons array extended)"
tech_stack:
  added: []
  patterns:
    - "Canonical cron route pattern: CRON_SECRET Bearer auth guard + requireServiceClient"
    - "getIntegrationKey('resend') + Resend SDK for email delivery"
    - "Promise.allSettled for non-fatal parallel send operations"
    - "supabase.auth.admin.listUsers for email resolution"
    - "DO $do$ pg_cron idempotency guard (Phase 43 pattern)"
key_files:
  created:
    - app/api/cron/expire-trials/route.ts
    - app/api/cron/trial-warning-emails/route.ts
    - supabase/migrations/20260514000002_phase60_pg_cron_trial.sql
  modified:
    - vercel.json
decisions:
  - "pg_cron expire-trials entry runs hourly SQL directly (UPDATE companies SET tier_trial_ends_at = NULL); trial-warning-emails pg_cron entry is a SELECT 1 no-op because Resend API requires Node.js runtime unavailable in pg_cron"
  - "T-3 window uses 2d20h–3d4h bounds (8h range around 3-day mark) to tolerate cron drift"
  - "T-0 window uses +-4h bounds (8h range around expiry) to tolerate cron drift"
  - "from address uses onboarding@resend.dev (Resend sandbox domain, consistent with testIntegrationKey resend path)"
metrics:
  duration: "~2 minutes"
  completed: "2026-05-13"
  tasks: 2
  files_created: 3
  files_modified: 1
---

# Phase 60 Plan 01: Trial Automation Cron Routes Summary

Two cron routes automate trial lifecycle — expire-trials clears the `tier_trial_ends_at` column hourly for lapsed trials; trial-warning-emails sends Resend T-3 and T-0 warning emails at 9am UTC daily — backed by a pg_cron migration and registered in vercel.json.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | expire-trials cron route + pg_cron migration + vercel.json | ddd0da4 | app/api/cron/expire-trials/route.ts, supabase/migrations/20260514000002_phase60_pg_cron_trial.sql, vercel.json |
| 2 | trial-warning-emails cron route | 7b682f1 | app/api/cron/trial-warning-emails/route.ts |

## What Was Built

### expire-trials (`GET /api/cron/expire-trials`)
- Auth guard: `CRON_SECRET` Bearer token (503 if unset, 401 if wrong)
- Queries `companies` WHERE `tier = 'free'` AND `tier_trial_ends_at IS NOT NULL` AND `tier_trial_ends_at < NOW()`
- Bulk UPDATE `SET tier_trial_ends_at = NULL` for all expired IDs
- Returns `{ expired: N }` — N companies downgraded to regular free tier
- Schedule: `0 * * * *` (hourly) via Vercel cron

### trial-warning-emails (`GET /api/cron/trial-warning-emails`)
- Auth guard: same CRON_SECRET pattern
- Computes T-3 window (2d20h–3d4h from now) and T-0 window (±4h of now)
- Parallel `Promise.all` queries for both windows in one round-trip
- Resolves owner emails via `supabase.auth.admin.listUsers({ perPage: 1000 })`
- Gets Resend key via `getIntegrationKey('resend')` — returns 503 if not configured
- `Promise.allSettled` sends: T-3 subject "Your Xtimator trial expires in 3 days", T-0 subject "Your Xtimator trial ends today"
- Returns `{ sent: N, total: M }` on success
- Schedule: `0 9 * * *` (9am UTC daily) via Vercel cron

### pg_cron Migration (`20260514000002_phase60_pg_cron_trial.sql`)
- `DO $do$` idempotency guard (Phase 43 pattern)
- `expire-trials` job: `0 * * * *` — runs the UPDATE SQL directly as a safety net if Vercel cron fails
- `trial-warning-emails` job: `0 9 * * *` — `SELECT 1` no-op placeholder (Resend requires Node.js, unavailable in pg_cron)

### vercel.json
- Extended `crons` array from 2 to 4 entries: added `/api/cron/expire-trials` and `/api/cron/trial-warning-emails`

## Verification

- vercel.json: 4 cron entries confirmed (`cleanup-orphan-projects`, `cleanup-whatsapp-sessions`, `expire-trials`, `trial-warning-emails`)
- TypeScript: no errors in new files (4 pre-existing test-file errors are out of scope)
- Migration: `cron.schedule('expire-trials', ...)` with DO $do$ guard confirmed

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — both routes are fully wired. Email body contains a billing upgrade URL (`/settings/billing`) which may be a stub if that route doesn't exist yet, but the email functionality itself is complete.

## Self-Check: PASSED

- [x] `app/api/cron/expire-trials/route.ts` — exists
- [x] `app/api/cron/trial-warning-emails/route.ts` — exists
- [x] `supabase/migrations/20260514000002_phase60_pg_cron_trial.sql` — exists
- [x] `vercel.json` — updated with 4 cron entries
- [x] Commit ddd0da4 — Task 1
- [x] Commit 7b682f1 — Task 2
