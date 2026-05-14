---
phase: 43-confirmation-flow
plan: "02"
subsystem: whatsapp-pipeline
tags: [cron, pg-cron, session-cleanup, vercel]
note: executed-in-worktree
dependency_graph:
  requires: [43-01]
  provides: [cleanup-whatsapp-sessions-cron]
  affects: [app/api/cron/cleanup-whatsapp-sessions/route.ts, vercel.json]
key_files:
  created:
    - app/api/cron/cleanup-whatsapp-sessions/route.ts
  modified:
    - vercel.json
metrics:
  duration_minutes: 5
  tasks_completed: 3
  tasks_total: 3
  files_created: 1
  files_modified: 1
  completed_date: "2026-05-10"
---

# Phase 43 Plan 02: Session Cleanup Cron Summary

**One-liner:** `cleanup-whatsapp-sessions` cron route + pg_cron migration; purges expired sessions every 10 minutes.

## What Was Built

- `/api/cron/cleanup-whatsapp-sessions/route.ts` — deletes `whatsapp_sessions` rows older than TTL
- `vercel.json` cron entry: every 5 minutes (primary Vercel path)
- pg_cron migration: */10 safety net; `DO $do$ guard` for idempotency

## Decisions

- pg_cron primary, Vercel cron secondary — works with and without pg_cron extension
- */10 pg_cron (safety net) + */5 Vercel cron (primary with notifications)

## Self-Check: PASSED

- Executed via git worktree — artifacts merged to main
