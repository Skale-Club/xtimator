---
phase: 55-schema-tier-definitions
plan: "01"
subsystem: monetization
tags: [subscription, tiers, schema, migration, entitlements]
note: executed-in-worktree
dependency_graph:
  requires: []
  provides: [lib/entitlements.ts, subscription-schema]
  affects: [lib/entitlements.ts, types/database.types.ts, supabase/migrations/]
key_files:
  created:
    - lib/entitlements.ts
    - supabase/migrations/20260513000001_phase55_subscription_tiers.sql
  modified:
    - types/database.types.ts
metrics:
  duration_minutes: 3
  tasks_completed: 3
  tasks_total: 3
  files_created: 2
  files_modified: 1
  completed_date: "2026-05-13"
---

# Phase 55 Plan 01: Schema + Tier Definitions Summary

**One-liner:** 6 subscription columns on `companies` + `usage_events` table + `lib/entitlements.ts` with Free/Trial/Pro/Business tiers.

## What Was Built

### Migration (`20260513000001_phase55_subscription_tiers.sql`)
- `companies.tier` TEXT NOT NULL DEFAULT 'free' CHECK IN ('free','trial','pro','business')
- `companies.tier_trial_ends_at` TIMESTAMPTZ
- `companies.stripe_customer_id`, `stripe_subscription_id`, `tier_renews_at`, `tier_cancelled_at`
- `usage_events` table: id, company_id, event_type CHECK, units, idempotency_key, metadata, created_at
- Deny-all RLS on `usage_events` — service role writes only

### `lib/entitlements.ts`
- `TierName`, `Entitlements` types
- `tiers` record with 4 entries: `number | null` for unlimited (Infinity silently serializes to null in JSON)
- `getEntitlements(tier)` helper

### `types/database.types.ts`
- Manually extended with 6 tier columns + usage_events table types (Docker unavailable on Windows)

## Decisions

- `number | null` for unlimited — JSON.stringify(Infinity) === null silently
- TEXT + CHECK for companies.tier (no Postgres enum — D-07/D-08 pattern)
- Deny-all RLS on usage_events — service role writes only
- 14-day trial started in INSERT branch only — not UPDATE

## Self-Check: PASSED

- Executed via git worktree — artifacts merged to main
