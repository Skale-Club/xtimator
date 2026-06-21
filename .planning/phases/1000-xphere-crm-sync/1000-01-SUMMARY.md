---
phase: 1000-xphere-crm-sync
plan: 01
subsystem: integrations
tags: [xphere, crm, mapping, migration, supabase, vitest, tdd]

# Dependency graph
requires:
  - phase: 1000-xphere-crm-sync
    provides: 1000-CONTEXT.md FIXED webhook contract + stage-name literals
provides:
  - companies migration with 5 xphere_* sync-state columns (3 entity ids + synced_at + sync_error)
  - pure buildSyncPayload(company, event) mapping with centralized XPHERE_STAGES / XPHERE_PIPELINE_NAME literals
  - shared types (XphereSyncEvent, XphereCompanyInput, XphereSyncPayload, XphereSyncResponse) — single import source for the client + Inngest job
affects: [xphere-client, xphere-inngest-job, lifecycle-hooks, backfill]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pure unit-testable mapping layer: all tier->stage/tags/custom_fields/note logic in mapping.ts; job stays thin"
    - "Stage/pipeline name literals centralized in ONE const (XPHERE_STAGES) with em dash U+2014 verbatim"
    - "Additive nullable company columns via ADD COLUMN IF NOT EXISTS, no DEFAULT (Phase 24/38 pattern)"

key-files:
  created:
    - supabase/migrations/20260620000002_companies_xphere_sync.sql
    - lib/integrations/xphere/types.ts
    - lib/integrations/xphere/mapping.ts
    - tests/unit/xphere-mapping.test.ts
  modified: []

key-decisions:
  - "Stage literals copied byte-for-byte from CONTEXT incl. em dash U+2014: 'Active — Pro', 'Active — Business', 'Trial', 'Churned'"
  - "trial.expired event forces {Churned, lost} regardless of stored tier"
  - "opportunity.value hardcoded 0 — pure mapping has no Stripe lookup (CONTEXT: plan value if readily available else 0)"
  - "types.ts + mapping.ts committed together as the single GREEN implementation (mapping imports types)"

patterns-established:
  - "Pattern 1: Pure transform with no fetch/supabase/createClient refs — verified by grep in acceptance criteria"
  - "Pattern 2: Per-event timeline note via NOTE_BY_EVENT Record; null = no note (company.updated)"

requirements-completed: [XPHERE-B1, XPHERE-B3-MAP]

# Metrics
duration: 3min
completed: 2026-06-21
---

# Phase 1000 Plan 01: Xphere Sync Foundations Summary

**companies sync-state migration (5 xphere_* columns) + a pure, unit-locked buildSyncPayload mapping with em-dash stage literals and shared types — the zero-dependency base for the Xphere CRM mirror.**

## Performance

- **Duration:** 3 min
- **Started:** 2026-06-21T03:17:29Z
- **Completed:** 2026-06-21T03:20:31Z
- **Tasks:** 2
- **Files modified:** 4 (all created)

## Accomplishments
- Migration adds `xphere_account_id`, `xphere_contact_id`, `xphere_opportunity_id` (text), `xphere_synced_at` (timestamptz), `xphere_sync_error` (text) — all nullable, `IF NOT EXISTS`.
- Pure `buildSyncPayload(company, event)` produces the FIXED Xphere webhook body; stage names match Xphere verbatim incl. em dash U+2014.
- Shared `types.ts` is the single import source for the later client + Inngest job.
- 11/11 unit tests green (TDD RED→GREEN); `tsc --noEmit` clean for the new files.

## Task Commits

Each task was committed atomically:

1. **Task 1: Migration — xphere_* sync-state columns** - `e0d95f6` (feat)
2. **Task 2 (TDD RED): failing buildSyncPayload tests** - `b13daf0` (test)
3. **Task 2 (TDD GREEN): pure mapping + shared types** - `32de80b` (feat)

**Plan metadata:** see final docs commit.

_TDD task produced two commits (test → feat); no refactor commit needed — implementation was clean on first GREEN._

## Files Created/Modified
- `supabase/migrations/20260620000002_companies_xphere_sync.sql` - 5 nullable xphere_* columns on companies.
- `lib/integrations/xphere/types.ts` - XPHERE_SYNC_EVENTS union + XphereCompanyInput / XphereSyncPayload / XphereSyncResponse.
- `lib/integrations/xphere/mapping.ts` - XPHERE_PIPELINE_NAME, XPHERE_STAGES, pure buildSyncPayload.
- `tests/unit/xphere-mapping.test.ts` - 11 cases locking stages, tags, custom_fields, notes, opportunity title.

## Decisions Made
- Stage/pipeline literals centralized in `XPHERE_STAGES` / `XPHERE_PIPELINE_NAME` so the em-dash strings have a single source of truth.
- `trial.expired` overrides tier→stage to `{Churned, lost}` inside the builder.
- `opportunity.value = 0` (pure layer has no Stripe lookup); the Inngest job may enrich later.
- Migration NOT applied here — apply happens at execute time via the team's `bunx supabase db push --db-url $DATABASE_URL` flow (CONTEXT/Phase 24/38 convention). database.types.ts not regenerated (Docker unavailable on Windows; manual extension when a later task needs typed access).

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## Known Stubs
None — both deliverables are fully implemented. (No data-bound UI in this plan; mapping is pure and migration is complete.)

## User Setup Required
None in this plan. Xphere-side deploy (apply migration, run pipeline seed, issue the `xph_…` API key) is deferred and tracked in CONTEXT `<deferred>`; the API key lives only in `platform_integrations`/env (never in git).

## Next Phase Readiness
- `types.ts` + `mapping.ts` ready for consumption by the Xphere client, Inngest sync job, and lifecycle hooks (later plans/waves).
- Migration file present and verified; awaits `db push` at execute time.
- No blockers.

## Self-Check: PASSED

All 5 created files present on disk; all 3 task commits (e0d95f6, b13daf0, 32de80b) found in git history.

---
*Phase: 1000-xphere-crm-sync*
*Completed: 2026-06-21*
