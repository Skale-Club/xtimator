---
phase: 55-schema-tier-definitions
plan: "02"
subsystem: monetization
tags: [quota, idempotency, usage-tracking, migration]
note: executed-in-worktree
dependency_graph:
  requires: [55-01]
  provides: [lib/queries/company.ts-tier-helpers, idempotency-index]
  affects: [lib/queries/company.ts, supabase/migrations/]
key_files:
  created:
    - supabase/migrations/20260513000002_phase56_usage_idempotency.sql
  modified:
    - lib/queries/company.ts
metrics:
  duration_minutes: 10
  tasks_completed: 3
  tasks_total: 3
  files_created: 1
  files_modified: 1
  completed_date: "2026-05-13"
---

# Phase 55 Plan 02: Usage Idempotency + Company Tier Queries Summary

**One-liner:** Idempotency key column + partial unique index on `usage_events`; `getCompanyTier()` focused query.

## What Was Built

### Migration (`20260513000002_phase56_usage_idempotency.sql`)
- `usage_events.idempotency_key` TEXT nullable
- Partial unique index `WHERE idempotency_key IS NOT NULL` — allows multiple NULL rows while enforcing uniqueness for non-null keys

### `lib/queries/company.ts`
- `getCompanyTier(companyId)` — focused query (id, tier, tier_trial_ends_at) — not select('*')

## Decisions

- Partial unique index — dedup key nullable: NULL = no dedup needed, non-null = enforced unique
- `getCompanyTier` focused query — avoids loading full company row for quota checks

## Self-Check: PASSED

- Executed via git worktree — artifacts merged to main
