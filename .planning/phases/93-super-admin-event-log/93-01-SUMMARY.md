---
phase: 93
plan: "01"
subsystem: observability
tags: [pipeline-attempts-view, postgres-view, database-types, migration-applier]
requires:
  - "92-01: pipeline_events table (append-only, one row per step)"
provides:
  - "public.pipeline_attempts Postgres view (attempt-grouped, security_invoker=on)"
  - "scripts/apply-migration-93-00.mjs one-off pg applier"
  - "types/database.types.ts Views.pipeline_attempts.Row TypeScript type"
affects:
  - "93-02 and later plans: .from('pipeline_attempts') is now typed and resolves cleanly"
tech-stack:
  added: []
  patterns:
    - "CREATE OR REPLACE VIEW with security_invoker=on (first view in supabase/migrations/ — no prior precedent)"
    - "One-off pg applier mirrors apply-migration-92-00.mjs; self-verifies via to_regclass()"
    - "Manual database.types.ts Views section extension (established since Phase 19/24/38, Docker unavailable)"
key-files:
  created:
    - "supabase/migrations/20260530000001_phase93_pipeline_attempts_view.sql"
    - "scripts/apply-migration-93-00.mjs"
  modified:
    - "types/database.types.ts"
decisions:
  - "View uses security_invoker=on so pipeline_events RLS enforces through it (relevant for non-service-role reads)"
  - "terminal_status precedence implemented with BOOL_OR in CASE: failed > started > succeeded"
  - "step_reached uses ARRAY_AGG ORDER BY created_at DESC [1] — latest step for the attempt"
  - "UUID lineage columns aggregated via MAX(col::text)::uuid to pick non-null value across attempt rows"
  - "Views:[_ in never] replaced (not augmented) with pipeline_attempts.Row — was a placeholder, safe to replace"
metrics:
  duration: "~5m"
  completed: "2026-05-30"
  tasks: 2
  files: 3
---

# Phase 93 Plan 01: pipeline_attempts View + Types Summary

`pipeline_attempts` Postgres view (security_invoker=on, GROUP BY attempt_id) applied to remote DB via one-off pg applier; `types/database.types.ts` extended with Views.pipeline_attempts.Row so `.from('pipeline_attempts')` is fully typed.

## What Shipped

- **`supabase/migrations/20260530000001_phase93_pipeline_attempts_view.sql`** — `CREATE OR REPLACE VIEW public.pipeline_attempts WITH (security_invoker = on)` grouping `pipeline_events` by `attempt_id`. Exposes all D-01 derived columns: `first_at`, `last_at`, UUID lineage (`user_id`, `company_id`, `project_id`, `estimate_id`), `input_type`, `step_reached` (latest step by `created_at DESC`), `terminal_status` (BOOL_OR precedence: failed > started > succeeded), `total_duration_ms` (SUM of COALESCE), `has_retry`, `max_retry_count`, `event_count`. First `CREATE VIEW` + `security_invoker` artifact in the entire migrations directory.

- **`scripts/apply-migration-93-00.mjs`** — Mirrors `apply-migration-92-00.mjs` exactly. Loads `DATABASE_URL` from `.env.local`, forces session-mode pooler (port 5432), checks `supabase_migrations.schema_migrations` for idempotency, applies in a transaction, self-verifies via `SELECT to_regclass('public.pipeline_attempts')`. Exits non-zero if view absent after apply. RLS/policy/index verifications from 92's script removed (view-specific only).

- **`types/database.types.ts`** — Replaced `Views: { [_ in never]: never }` placeholder with `pipeline_attempts: { Row: { ... } Relationships: [] }` containing all 14 derived columns from D-01. `npx tsc --noEmit` exits 0.

## Verification

- `grep security_invoker supabase/migrations/20260530000001_phase93_pipeline_attempts_view.sql` — matches `security_invoker = on` (3 occurrences: comment, DDL, COMMENT ON)
- `node scripts/apply-migration-93-00.mjs` — first run: "Migration applied and recorded. Verified: public.pipeline_attempts view exists." Second run: "already recorded — skipping apply. Verified: public.pipeline_attempts view exists."
- `npx tsc --noEmit` — exits 0 (clean)
- `npm test -- tests/unit/admin/pipeline-attempts-view.test.ts` — 7/7 GREEN

## Commits

- `b0ae4b7` feat(93-01): create pipeline_attempts view SQL migration
- `39fa452` feat(93-01): add apply-migration-93-00.mjs and extend database types

## Deviations from Plan

None — plan executed exactly as written. The `Views: { [_ in never]: never }` block was a generated placeholder, safe to replace directly (not augmented) — same effect, cleaner.

## Known Stubs

None. The view is live on the remote database. The TypeScript type is wired. No placeholder data.

## Self-Check: PASSED

- FOUND: supabase/migrations/20260530000001_phase93_pipeline_attempts_view.sql
- FOUND: scripts/apply-migration-93-00.mjs
- FOUND: types/database.types.ts (pipeline_attempts entry at line 1465)
- FOUND commits: b0ae4b7, 39fa452
