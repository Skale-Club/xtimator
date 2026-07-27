# Supabase Migration Drift Audit — 2026-07-27

**Target:** production (`prmqgcrnpuvpzruyzvuv`, Xtimator)
**Trigger:** operator request ("revise as migrações e arrume toda a bagunça") after a
production outage traced to an unapplied migration during Phase 181.
**Method:** parse the DDL out of every local-only migration file, then check each
declared object against the live catalog — schema truth, not migration bookkeeping.

---

## Headline

**Production's schema is essentially complete. The "40+ migrations behind" appearance is
almost entirely bookkeeping noise, not missing schema.** Exactly **one** real gap was
found (below), plus one already fixed earlier the same day.

The bookkeeping looks alarming because migrations applied via the Supabase MCP/dashboard
are recorded under a **fresh auto-generated timestamp** that does not match the local
file's name. The same change therefore shows up as *both* a "local-only" and a
"remote-only" row. Proof: the two migrations applied via MCP earlier today
(`20260723000001`, `20260726000001`) still appear as `local-only` in
`supabase migration list --linked` minutes after being verifiably applied.

| Bookkeeping (`migration list --linked`) | Count |
|---|---|
| in sync | 58 |
| local-only | 68 |
| remote-only | 62 |

---

## What was actually verified against the live catalog

Every object declared by the 68 local-only migrations (71 files, incl. duplicate-timestamp pairs):

| Category | Declared | Present in prod | Missing |
|---|---|---|---|
| Tables | 21 | 21 | **0** |
| Functions | 9 | 9 | **0** |
| Columns | 50 | 47 | 3 — all on `company_whatsapp`, a table **deliberately dropped** by `20260716150302_drop_legacy_company_whatsapp`. Expected. |
| Indexes | 86 | 82 | 4 — 3 on the same dropped table; **1 real** (see gap below) |
| RLS policies (public + storage) | 55 | 55 | **0** — the one flagged (`estimate_photos_anon_select_by_share_token`) was **deliberately dropped** by `20260706000007_rls_hardening_indexes_grants` ("drop dead anon policies") |
| Triggers | 1 | 1 | **0** |

Non-DDL effects spot-checked and confirmed applied: `notification_templates` seeded (17 rows),
`platform_notification_preferences` seeded (10 rows), `estimate_items.cost`/`markup_pct` present,
`company_members.display_name` present, `save_estimate_atomic` + `apply_credit_ledger_entry`
RPCs present, `demo_config.company_id` is `NOT NULL` (Phase 180's constraint).

---

## Gaps found

### 1. RESOLVED — `company_price_book.image_position` / `photos.position`
Migration `20260723000001_image_position_metadata.sql`. Unapplied while
`lib/queries/price-book.ts` already selected `image_position`, so **every** authenticated
read failed with Postgres `42703` — **Price Book was broken for every tenant in
production**, silently, for days. Found incidentally by a Phase 181 browser test.
**Applied and verified 2026-07-27.**

### 2. OPEN — `ai_cost_events_attempt_op_unique` (needs operator approval)
Migration `20260717000002_phase167_ai_cost_events_dedup.sql`. The partial UNIQUE index that
makes duplicate AI-cost rows structurally impossible for `audio_minutes`/`estimate` was never
applied. **3 duplicate rows exist in production right now** (all `operation_type='estimate'`,
each logged 20-30s after its sibling — the retry double-log the migration was written to stop).

Customer billing is **not** affected — credit debits are idempotent via a separate RPC key;
only the internal real-cost log is inflated (~$0.04 total across the 3 rows).

**Why it is still open:** the migration must `DELETE` the 3 duplicate rows before the unique
index can be created (otherwise the index fails against existing violators). An automated
`DELETE` against production was **blocked by the environment's safety classifier**, correctly.
It needs an explicit operator go-ahead. The exact rows were previewed and confirmed to be
duplicates before this was attempted.

---

## Recommendation: do NOT blanket-repair the bookkeeping

`supabase migration repair --status applied <version>` would make the 68 local-only rows
disappear, and `supabase db push` would then look clean. **This was deliberately not done.**

Reasons:
1. It would mark migrations "applied" based on a DDL-existence check that **cannot verify**
   data backfills, grants, constraint definitions, or column types — 26 of the 68 carry such
   effects. Marking them applied converts "unknown" into "verified" without evidence.
2. 62 remote-only rows have no local file at all, so repair alone does not reach a clean 1:1
   state anyway.
3. Duplicate local timestamps (`20260619000001`, `20260620000002`, `20260627000001`,
   `20260707000001`, `20260709000001`, `20260710000001`, `20260718000001`) make
   version-keyed repair ambiguous.

**Better fix, implemented:** `scripts/audit-migration-drift.mjs` — re-runnable, checks schema
truth rather than bookkeeping, and prints the subset of migrations whose effects it cannot
verify instead of pretending they are covered.

```bash
node scripts/audit-migration-drift.mjs           # needs DATABASE_URL
node scripts/audit-migration-drift.mjs --sql-only # paste into Supabase SQL editor / MCP
```

Worth considering next (not done here — each is its own decision):
- Wire that script into CI as a **non-blocking** advisory step (blocking would let a false
  positive red-lock every deploy, per the project's existing Test→Build gating).
- Or move migration application into the deploy pipeline so the manual step disappears.

---

## Standing caveat

The audit verifies **existence**, not **definition**. A column present with the wrong type or
default still passes. For anything security- or money-adjacent, read the migration.
