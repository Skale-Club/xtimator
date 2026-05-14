---
phase: 44-outbound-client-delivery
plan: "01"
subsystem: whatsapp-pipeline
tags: [whatsapp, delivery-format, formatter, share-link, text]
note: executed-in-worktree
dependency_graph:
  requires: [43-01]
  provides: [delivery-format-migration, lib/whatsapp/formatter.ts]
  affects: [lib/whatsapp/confirm.ts, lib/whatsapp/formatter.ts]
key_files:
  created:
    - lib/whatsapp/formatter.ts
  modified:
    - lib/whatsapp/confirm.ts
    - supabase/migrations/
metrics:
  duration_minutes: 8
  tasks_completed: 5
  tasks_total: 5
  files_created: 1
  files_modified: 2
  completed_date: "2026-05-10"
---

# Phase 44 Plan 01: Outbound Client Delivery Summary

**One-liner:** `delivery_format` column on `company_whatsapp` + `formatter.ts` for plain-text estimate formatting + `confirm.ts` delivery branching.

## What Was Built

### DB Migration
- `company_whatsapp.delivery_format` TEXT CHECK IN ('share_link', 'formatted_text') DEFAULT 'share_link'

### `lib/whatsapp/formatter.ts` — `formatEstimateForWhatsApp()`
- Renders estimate sections and items as WhatsApp-friendly plain text
- Used when `delivery_format = 'formatted_text'`

### `lib/whatsapp/confirm.ts` — delivery branching
- `delivery_format = 'share_link'` → sends share URL (existing)
- `delivery_format = 'formatted_text'` → sends `formatEstimateForWhatsApp()` output
- Loads `company_whatsapp.delivery_format` + `companies.name` in same `Promise.all` as estimate + project — single round-trip
- Defaults to `'share_link'` when row is missing or query fails — safe fallback

## Decisions

- `delivery_format` defaults to `'share_link'` — no regression for existing setups
- Both paths share the same estimate query (superset select)

## Self-Check: PASSED

- Executed via git worktree — artifacts merged to main
