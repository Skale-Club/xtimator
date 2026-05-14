---
phase: 56-usage-tracking
plan: "01"
subsystem: monetization
tags: [quota, checkQuota, recordUsage, idempotency]
note: executed-in-worktree
dependency_graph:
  requires: [55-01, 55-02]
  provides: [lib/quota.ts]
  affects: [lib/quota.ts]
key_files:
  created:
    - lib/quota.ts
metrics:
  duration_minutes: 6
  tasks_completed: 3
  tasks_total: 3
  files_created: 1
  files_modified: 0
  completed_date: "2026-05-13"
---

# Phase 56 Plan 01: Usage Tracking Helpers Summary

**One-liner:** `lib/quota.ts` with `checkQuota()` and `recordUsage()` — pure library functions used by all enforcement points.

## What Was Built

### `lib/quota.ts`
- `checkQuota(supabase, companyId, quotaType)` — queries `companies` by id directly (not via getCompanyTier), returns `{ allowed, remaining }`
- `recordUsage(supabase, companyId, eventType, units, idempotencyKey)` — upsert with ON CONFLICT DO NOTHING on idempotency_key
- `photo_batch` and `audio_minutes` quotas return `{ allowed: true, remaining: null }` in this phase — per-estimate enforcement wired in Phase 57

## Decisions

- `checkQuota` queries companies by id directly (not via getCompanyTier) — avoids userId lookup in pure library layer
- `recordUsage` upsert ON CONFLICT DO NOTHING — idempotent dedup for WhatsApp webhook retries
- WhatsApp idempotency key = `message_id`; web routes = `crypto.randomUUID()` per request

## Self-Check: PASSED

- Executed via git worktree — artifacts merged to main
