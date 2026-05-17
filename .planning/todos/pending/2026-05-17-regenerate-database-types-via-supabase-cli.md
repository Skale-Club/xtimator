---
created: 2026-05-17T14:06:13.817Z
title: Regenerate database types via supabase CLI
area: tooling
files:
  - types/database.types.ts
  - .planning/phases/70-stripe-connect-customer-payments/70-01-SUMMARY.md
---

## Problem

`types/database.types.ts` is currently **hand-edited** (Plan 70-01 added the 10 new Phase 70 columns manually). Functional and tested, but it's not the canonical output of `supabase gen types`. On the next schema change we should regen from scratch instead of hand-editing again.

Two blockers prevent regen today:

1. **Docker Desktop crashes on launch** with an inference manager error:
   ```
   starting services: initializing Inference manager: listening on
   unix://C:\Users\Vanildo\AppData\Local\Docker\run\dockerInference:
   remove C:\...\dockerInference: The file cannot be accessed by the system.
   ```
   Fix: click "Reset to factory defaults" in the Docker Desktop error dialog (or full reinstall). Required by `supabase gen types typescript --db-url` because the CLI spawns a `postgres-meta` container internally.

2. **Supabase CLI not authenticated.** Falling back to `supabase gen types typescript --project-id ...` (which doesn't need Docker) requires a Personal Access Token, which we don't have stored locally. Owner needs to grab one from https://supabase.com/dashboard/account/tokens.

## Solution

**Preferred (no Docker needed):**
1. Owner generates a PAT at https://supabase.com/dashboard/account/tokens
2. Run:
   ```bash
   supabase login --token <PAT>
   supabase gen types typescript --project-id prmqgcrnpuvpzruyzvuv --schema public > types/database.types.ts
   git add types/database.types.ts
   git commit -m "chore: regenerate database types from live schema (canonical)"
   ```
3. Verify diff against hand-edited file — should be cosmetic only (Phase 70 columns identical).

**Alternative (Docker path):**
1. Fix Docker Desktop (Reset to factory defaults, may require uninstall + reinstall)
2. Run `supabase gen types typescript --db-url "$DATABASE_URL" --schema public > types/database.types.ts`

**No urgency.** The hand-edited file works (33/33 tests passing, TypeScript baseline unchanged). Only matters next time schema changes.
