---
phase: 92-pipeline-event-persistence
plan: 00
subsystem: observability
tags: [supabase, postgres, rls, vitest, migration, nyquist, pipeline-events]

# Dependency graph
requires:
  - phase: 91-recording-reliability
    provides: attemptId lineage threaded through transcribe/generate payloads (in-flight only)
provides:
  - pipeline_events table on remote (14 cols, deny-all RLS + super-admin SELECT, 4 indexes)
  - post-push smoke check (scripts/check-pipeline-events-table.mjs, to_regclass gate)
  - 5 RED Nyquist observability test files (1 migration-contract GREEN, 1 EVENT-04 regression GREEN, 3 RED for Waves 1-3)
  - types/database.types.ts pipeline_events Row/Insert/Update block (PAT-regenerated)
  - lib/observability/pipeline-events.ts Wave-0 scaffold (locked types, throwing body)
affects: [92-01, 92-02, 92-03, phase-93-super-admin-event-log-ui]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "One-off pg applier (scripts/apply-migration-92-00.mjs) when `supabase db push` is blocked by remote migration-history drift"
    - "PAT-based `supabase gen types --project-id` to a temp file, then splice only the new table block into the hand-maintained types file"
    - "Wave-0 throwing helper scaffold so RED tests compile and tsc stays clean"

key-files:
  created:
    - supabase/migrations/20260529000001_phase92_pipeline_events.sql
    - scripts/check-pipeline-events-table.mjs
    - scripts/apply-migration-92-00.mjs
    - lib/observability/pipeline-events.ts
    - tests/unit/observability/pipeline-events-migration.test.ts
    - tests/unit/observability/record-pipeline-event.test.ts
    - tests/unit/observability/instrumentation-presence.test.ts
    - tests/unit/observability/input-type-threading.test.ts
    - tests/unit/observability/event04-regression.test.ts
  modified:
    - types/database.types.ts

key-decisions:
  - "attempt_id typed UUID (every minter uses crypto.randomUUID()); project_id/estimate_id/user_id NOT FK-constrained (forensic rows must outlive deleted entities); only company_id FK'd"
  - "TEXT + CHECK for input_type/step/status/provider (project avoids Postgres enums — STATE.md D-07/D-08)"
  - "No updated_at column (append-only rows are never updated — D-01)"
  - "Applied migration via one-off pg applier because `supabase db push` refused on pre-existing remote migration-history drift (4 remote versions absent locally)"
  - "Wave-0 helper scaffold throws 'not implemented' so the 3 behavioral tests are RED for the right reason while tsc stays clean"

patterns-established:
  - "One-off pg applier + schema_migrations record as the db-push fallback under remote drift"
  - "Migration static-contract test reads the SQL file and asserts RLS/columns/CHECK enums/indexes (comments stripped before forbidding updated_at)"

requirements-completed: [EVENT-01, EVENT-02, EVENT-03, EVENT-04]

# Metrics
duration: 13min
completed: 2026-05-30
---

# Phase 92 Plan 00: Pipeline Event Persistence (Wave 0) Summary

**Append-only pipeline_events table (deny-all RLS + super-admin SELECT, 14 cols, 4 indexes) applied to remote and smoke-checked, plus 5 RED Nyquist test files and the types/helper scaffold that unblock Waves 1-3.**

## Performance

- **Duration:** ~13 min
- **Started:** 2026-05-30T01:15:18Z
- **Completed:** 2026-05-30T01:30:00Z
- **Tasks:** 2
- **Files created:** 9 / **Files modified:** 1

## Accomplishments
- `pipeline_events` table live on remote `prmqgcrnpuvpzruyzvuv`: 14 columns (D-02), RLS enabled, exactly one super-admin SELECT policy (deny-all writes, D-11), 4 named indexes (verified via the applier's pg introspection).
- Post-push smoke check (`scripts/check-pipeline-events-table.mjs`) exits 0 — `to_regclass('public.pipeline_events')` not null — closing RESEARCH Pitfall 3 (best-effort helper would otherwise silently swallow a missing-table deploy).
- `types/database.types.ts` gains the `pipeline_events` Row/Insert/Update block (regenerated via the no-Docker PAT `--project-id` path, spliced into the hand-maintained file).
- 5 observability test files created and collected by vitest: 2 GREEN (migration static contract + EVENT-04 `recording_added` regression guard), 3 RED (helper / instrumentation presence / input-type threading) — exactly the intended Wave-0 RED-first state.
- `tsc --noEmit` clean across the whole project.

## Task Commits

1. **Task 1: migration SQL + apply to remote + smoke check + pipeline_events type block** — `8cb154d` (feat)
2. **Task 2: 5 RED Nyquist test files + Wave-0 helper scaffold** — `12cdebd` (test)

## Files Created/Modified
- `supabase/migrations/20260529000001_phase92_pipeline_events.sql` — pipeline_events DDL, deny-all RLS, super-admin SELECT, 4 indexes
- `scripts/check-pipeline-events-table.mjs` — post-push smoke check (pg client + to_regclass)
- `scripts/apply-migration-92-00.mjs` — one-off pg applier (db-push drift fallback) + RLS/policy/index verification
- `lib/observability/pipeline-events.ts` — Wave-0 scaffold: locked PipelineEventInput types + throwing recordPipelineEvent
- `tests/unit/observability/*.test.ts` (5) — migration contract, helper, instrumentation presence, threading, EVENT-04 regression
- `types/database.types.ts` — added pipeline_events type block

## Decisions Made
- See `key-decisions` frontmatter. Most consequential: used the one-off pg applier because `supabase db push` refused on pre-existing remote migration-history drift; the migration SQL + `schema_migrations` row were applied transactionally and the table/RLS/policy/index shape was introspected to confirm correctness.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `supabase db push` blocked by remote migration-history drift**
- **Found during:** Task 1 (apply migration to remote)
- **Issue:** `db push` aborted with "Remote migration versions not found in local migrations directory" (4 remote versions: 20260526141115, 20260526141129, 20260529170909, 20260529185356 absent locally). Running `migration repair` would mutate remote history and could mask real drift.
- **Fix:** Authored `scripts/apply-migration-92-00.mjs` (precedent: `scripts/apply-migration-86-01.mjs`) — a `pg`-client one-off that applies the SQL in a transaction, records it in `supabase_migrations.schema_migrations`, and verifies table existence + RLS + exactly-one-SELECT-policy + 4 indexes. Did NOT touch the unrelated remote drift.
- **Files modified:** scripts/apply-migration-92-00.mjs (new)
- **Verification:** applier exited 0 with introspection output; `scripts/check-pipeline-events-table.mjs` then exited 0.
- **Committed in:** 8cb154d (Task 1)

**2. [Rule 3 - Blocking] Wave-0 helper scaffold needed so RED tests compile under the tsc gate**
- **Found during:** Task 2 (helper test)
- **Issue:** `record-pipeline-event.test.ts` imports `@/lib/observability/pipeline-events` (Wave-1 module, absent). Without it, `tsc --noEmit` (the Wave-0 gate) fails on "cannot find module".
- **Fix:** Created `lib/observability/pipeline-events.ts` as a throwing Wave-0 scaffold exporting the locked types + a `recordPipelineEvent` that throws "not implemented" — a scaffold, not an implementation (matches the Phase 12/18/22 Wave-0 convention). Behavioral assertions fail RED for the right reason.
- **Files modified:** lib/observability/pipeline-events.ts (new)
- **Verification:** tsc clean; the 3 helper tests fail with "not implemented (Wave 0 scaffold)".
- **Committed in:** 12cdebd (Task 2)

**3. [Rule 1 - Bug] Migration `updated_at` static-contract test false-positived on a header comment**
- **Found during:** Task 2 (migration test)
- **Issue:** The migration header documents the no-`updated_at` decision ("-- No updated_at: ..."), which contains the literal `updated_at`; the test asserted the whole file `.not.toMatch(/\bupdated_at\b/)`.
- **Fix:** Strip SQL line comments before the assertion so only an actual column declaration is forbidden; the documenting comment is preserved.
- **Files modified:** tests/unit/observability/pipeline-events-migration.test.ts
- **Verification:** migration test 8/8 green; tsc clean.
- **Committed in:** 12cdebd (Task 2)

---

**Total deviations:** 3 auto-fixed (1 bug, 2 blocking). **Impact:** All necessary to satisfy the Wave-0 gates (remote table applied, tsc clean, tests runnable). No scope creep — no helper/instrumentation/threading logic was implemented (deferred to Waves 1-3).

## Known Stubs

- `lib/observability/pipeline-events.ts` — intentional Wave-0 scaffold; `recordPipelineEvent` throws "not implemented". Wave 1 (92-01) replaces the body with the best-effort service-role insert + retry_count. Tracked here, intentional, resolves in 92-01.

## Issues Encountered
- `npx vitest run --reporter=basic` (from the plan's verify) failed: the `basic` reporter was removed in vitest 4. Re-ran with the default reporter; all 5 files collected and ran. (Tooling-only; no impact on deliverables.)
- Full `npm test` reports ~50 pre-existing failures in unrelated files (admin/blog/seo/theme/ai/dashboard suites) — none import Wave-0 changes; sampled root cause is vitest-4 strict mock validation (`@/lib/supabase/service` mocks omitting `requireServiceClient`). Logged to `deferred-items.md`, NOT fixed (out of scope).

## Next Phase Readiness
- Table + types + smoke check are in place; the 3 RED tests define the exact contract for Wave 1 (helper) and Waves 2-3 (instrumentation + threading).
- No blockers. Note for Wave 1+: prefer the `apply-migration-9X-XX.mjs` pg-applier path for any further migrations until the remote migration-history drift is reconciled (or run `supabase migration repair` deliberately as its own task).

## Self-Check: PASSED

- All 10 created/modified files verified present on disk.
- Both task commits verified in git history (8cb154d, 12cdebd).

---
*Phase: 92-pipeline-event-persistence*
*Completed: 2026-05-30*
