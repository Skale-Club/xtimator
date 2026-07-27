---
created: 2026-07-27T07:15:00.000Z
title: Audit and reconcile the full Supabase migration drift backlog
area: database
priority: high
files:
  - supabase/migrations/
  - .planning/phases/181-real-product-cutover-verification/deferred-items.md
---

## Problem

`supabase migration list --linked` against production (`prmqgcrnpuvpzruyzvuv`) shows
**large, messy two-way drift** between `supabase/migrations/*.sql` and the remote
`schema_migrations` table. This is not a simple "N migrations behind" — it is genuinely
tangled, which is why it was NOT bulk-applied during Phase 181 and needs a dedicated pass.

**Operator authorized a full cleanup pass (2026-07-27): "revise as migracoes e arrume toda
a bagunca" — to be done AFTER milestone v4.22 (phases 180-181) completes.**

### What the drift actually looks like

Three distinct problem classes, all visible in `migration list --linked` output:

1. **Local-only entries** (`local: <ts>, remote: ""`) — roughly 40 files from 2026-05-29
   through 2026-07-26 with no matching remote row. SOME of these are genuinely unapplied;
   others are almost certainly already applied to prod under a *different* timestamp (see 2).
2. **Remote-only entries** (`local: "", remote: <ts>`) — e.g. `20260620220640`,
   `20260624115017/029/041`, the whole `20260629002439..002943` block, `20260704011325`,
   `20260705172750`, `20260707103329`, `20260710151717..224757`, `20260718010112..132454`,
   `20260722110052..121203`. These were applied directly to prod (via MCP `apply_migration`
   or the dashboard) and got auto-generated timestamps that don't match any local filename.
   The *schema changes exist in prod*; only the bookkeeping name differs.
3. **Duplicate local timestamps** — e.g. two `20260529000001`, two `20260530000001`, two
   `20260619000001`, two `20260620000001`, two `20260620000002`, two `20260627000001`, two
   `20260707000001`, two `20260709000001`, two `20260710000001`, two `20260718000001`.
   Different files, same version string.

**Why a blind `supabase db push` is dangerous here:** it would try to run every local-only
entry in order, including ones whose DDL is already live under a remote-only alias from
class (2). Most are `IF NOT EXISTS`-guarded and would no-op, but the ones that aren't
(e.g. `CREATE POLICY`, `ALTER ... SET NOT NULL`, data backfills) could error mid-run or,
worse, partially apply and leave prod inconsistent. The duplicate timestamps in class (3)
also make ordering ambiguous.

## Suggested approach (do NOT skip the diff step)

1. **Schema-diff first, migration-list second.** The authoritative question is not "which
   files ran" but "does prod's actual schema match what the code expects." Use
   `supabase db diff --linked` (needs Docker — see blocker below) or a manual
   `information_schema` comparison per table against `types/database.types.ts`.
2. **Classify every local-only file** into: (a) already-live-under-a-different-name →
   just needs a `schema_migrations` bookkeeping insert (`supabase migration repair
   --status applied <version>`), (b) genuinely unapplied → apply it, (c) obsolete/superseded
   → mark reverted or delete the file.
3. **Resolve duplicate timestamps** by renaming the later file to a free timestamp before
   any push.
4. **Apply the genuinely-missing ones individually**, verifying schema after each — the
   established project pattern (this is how Phase 180's RLS migration and Phase 181's
   `20260723000001_image_position_metadata.sql` were both applied, via Supabase MCP
   `apply_migration`).
5. **Then** get `migration list --linked` to a clean 1:1 state so future drift is visible.

## Known real damage from this drift (already fixed, proves the risk is not theoretical)

`20260723000001_image_position_metadata.sql` (adds `company_price_book.image_position` +
`photos.position`) sat unapplied while `lib/queries/price-book.ts` already selected
`image_position`. Result: **`/price-book` was broken in production for every tenant** with
Postgres `42703 column does not exist` — silently, for days. Discovered incidentally by
Phase 181's E2E work, not by any monitoring. Applied 2026-07-27 and verified.
That is exactly the failure mode this whole backlog can reproduce, one column at a time.

## Blockers / notes

- **Docker Desktop is broken on this machine** (persistent stale AF_UNIX socket reparse
  points that recreate on every launch — see the 2026-05-17 todo, same root cause, still
  unfixed). This blocks `supabase db diff --linked` and `supabase db push`, both of which
  spawn containers. Workarounds: use Supabase MCP `apply_migration` / `execute_sql`
  (already proven to work for exactly this), or repair Docker via "Reset to factory
  defaults" first.
- The Supabase CLI must be run with the `SUPABASE_ACCESS_TOKEN` from `.env.local` — the
  machine's *global* `supabase login` session is a different account that cannot even see
  the Xtimator project.
- Existing project memory says "migrations are applied manually — the deploy ships code
  only, never runs migrations." The end state of this cleanup should either keep that but
  make drift *visible* (a CI check comparing local files to remote `schema_migrations`),
  or move to applying migrations in the deploy pipeline. Worth deciding as part of this.
