# Quick Task 260529-jh7 — Summary

**Description:** Add unique constraint on `company_id` to `company_whatsapp` (fix ON CONFLICT error)
**Date:** 2026-05-29
**Status:** Complete — verified against live Xtimator DB

## Problem

`lib/actions/whatsapp-settings.ts` upserts on `{ onConflict: 'company_id' }` at two call sites
(`requestWhatsAppVerification` ~line 80 and `connectWhatsApp` ~line 205), but `company_whatsapp`
(created in `supabase/migrations/20260510000002_phase40_whatsapp.sql`) only had UNIQUE constraints
on `id` (PK) and `phone_number`. Postgres rejected `ON CONFLICT (company_id)` with:

> there is no unique or exclusion constraint matching the ON CONFLICT specification

This broke the entire WhatsApp connect/verification flow — every call threw before saving anything.

## Diagnosis

Cross-checked all `onConflict` targets in the codebase against the live DB's unique indexes.
Every other upsert (`translations`, `platform_integrations`, `usage_events`,
`notification_preferences`) had a matching unique index. Only `company_whatsapp` did not.
The table was empty (0 rows, verified), so adding the constraint carried no dedup/backfill risk.

## Fix

New migration `supabase/migrations/20260529000001_whatsapp_company_id_unique.sql` adds an
idempotent (DO-block guarded) constraint:

```sql
ALTER TABLE public.company_whatsapp
  ADD CONSTRAINT company_whatsapp_company_id_key UNIQUE (company_id);
```

Design intent: one WhatsApp config per company — exactly what `onConflict: 'company_id'` assumes.

## Tasks

| Task | Outcome |
|------|---------|
| 1. Create migration file | Done — committed `c44f6ac` |
| 2. Apply to live Xtimator DB | Done — `apply_migration` (Xtimator project) returned `success: true` |
| 3. Verify | Done — see below |

## Verification (live Xtimator DB)

```
conname                            | def
-----------------------------------+----------------------
company_whatsapp_company_id_key    | UNIQUE (company_id)
company_whatsapp_phone_number_key  | UNIQUE (phone_number)
```

Local consistency check: `lib/actions/whatsapp-settings.ts` has 2 `onConflict: 'company_id'`
usages, both now backed by the matching constraint.

## Notes

- Executor created/committed the migration file on `main` but could not reach the Supabase MCP
  tools from its sandbox; the orchestrator applied + verified the migration directly.
- Ran without worktree isolation to avoid this repo's known worktree-cleanup hazard.
- Migration is idempotent — safe to re-run via `bunx supabase db push` for local/CI parity.
