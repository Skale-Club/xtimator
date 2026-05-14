---
phase: 60-trial-automation-admin-tooling
plan: "01"
subsystem: monetization
tags: [trial, cron, admin, billing, mrr, force-tier, bonus-credits]
note: executed-in-worktree
dependency_graph:
  requires: [55-01, 58-01]
  provides: [expire-trials-cron, trial-warning-emails-cron, admin-billing-page]
  affects: [app/api/cron/, app/admin/billing/]
key_files:
  created:
    - app/api/cron/expire-trials/route.ts
    - app/api/cron/trial-warning-emails/route.ts
    - app/admin/billing/page.tsx
    - app/admin/billing/billing-table.tsx
    - app/admin/billing/actions.ts
metrics:
  duration_minutes: 2
  tasks_completed: 2
  tasks_total: 2
  files_created: 5
  files_modified: 0
  completed_date: "2026-05-14"
---

# Phase 60 Plan 01: Trial Automation + Admin Tooling Summary

**One-liner:** Hourly trial expiry cron + daily T-3/T-0 warning emails + admin `/admin/billing` with MRR, force-tier, and bonus credits.

## What Was Built

### `/api/cron/expire-trials/route.ts`
- Hourly: clears `tier_trial_ends_at` on expired `trial` companies, downgrades tier to `free`
- Also has pg_cron SQL implementation

### `/api/cron/trial-warning-emails/route.ts`
- Daily 9am UTC: queries companies with trial expiring in 0-3 days
- Sends Resend emails at T-3 and T-0
- pg_cron entry is `SELECT 1` no-op — Resend API requires Node.js runtime unavailable in pg_cron

### `app/admin/billing/actions.ts`
- `forceTier(companyId, tier)` — admin can force any tier with `requireAdmin()`
- `grantBonusCredits(companyId, count)` — inserts `usage_events` row with negative units and `event_type='estimate_generated'` (bonus_credits not in CHECK constraint)

### `app/admin/billing/page.tsx` + `billing-table.tsx`
- MRR stat (count of pro/business companies × price)
- Company list with current tier, force-tier form, grant-credits form

## Decisions

- pg_cron trial-warning-emails entry is SELECT 1 no-op — Resend requires Node.js runtime
- bonus credits use `event_type='estimate_generated'` with negative units — CHECK constraint didn't include 'bonus_credits'
- Admin granularity is hybrid: force tier (coarse) + bonus credits (fine)

## Self-Check: PASSED

- Executed via git worktree — artifacts merged to main
