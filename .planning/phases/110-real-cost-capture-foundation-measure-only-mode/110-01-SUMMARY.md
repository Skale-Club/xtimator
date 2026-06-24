---
phase: 110-real-cost-capture-foundation-measure-only-mode
plan: 01
subsystem: billing
tags: [supabase, postgres, rls, cost-capture, never-throw, measure-only, vitest]

# Dependency graph
requires:
  - phase: 92-pipeline-event-persistence
    provides: requireServiceClient never-throw helper pattern + service-role-only RLS posture (pipeline_events)
provides:
  - "Append-only ai_cost_events table (attempt_id + operation_type keyed), service-role writes only, super-admin SELECT"
  - "Never-throw recordAICost(ev: AICostInput): Promise<void> helper that writes one cost row and swallows DB failures"
  - "AICostInput interface — the exact contract Plans 110-02 (OpenRouter cost) and 110-03 (Whisper cost) import and call"
  - "Static measure-only invariant guard + migration static-contract test"
affects: [110-02, 110-03, 112-credit-ledger, 116-calibration]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Never-throw cost-capture side effect (mirrors recordPipelineEvent): try -> requireServiceClient -> insert -> catch -> console.warn -> void"
    - "Measure-only static guard: a readFileSync regex test fails if credit/debit/ledger/balance/markup reappear in the production cost module"
    - "null vs 0 discipline: unknown cost persisted as NULL, never coerced to 0, so calibration can exclude unknowns from the mean"

key-files:
  created:
    - supabase/migrations/20260624000003_phase110_ai_cost_events.sql
    - lib/billing/record-ai-cost.ts
    - tests/unit/billing/record-ai-cost.test.ts
    - tests/unit/billing/ai-cost-events-migration.test.ts
    - tests/unit/billing/measure-only-invariant.test.ts
  modified: []

key-decisions:
  - "ai_cost_events is a SEPARATE table from the future credit ledger (Phase 112) — measure-only carries no charging columns"
  - "real_cost_usd is NULLABLE NUMERIC(12,6); NULL = provider returned no cost (Gemini/whisper-unknown), never 0"
  - "Migration authored only — NOT applied to remote; deploy is CI->GHCR->Coolify (consistent with phases 106/108)"
  - "recordAICost returns void deliberately — no value a caller could consume to charge a tenant"

patterns-established:
  - "Never-throw cost capture as a fire-and-forget side effect (void recordAICost(...) on the hot path)"
  - "Static source guard locks the measure-only invariant for the whole phase"

requirements-completed: [COST-03, CALIB-01]

# Metrics
duration: 5min
completed: 2026-06-24
---

# Phase 110 Plan 01: Real Cost Capture Foundation + Measure-Only Mode Summary

**Append-only `ai_cost_events` table + never-throw `recordAICost()` helper that persists real USD cost per AI op (NULL when unknown, never 0), with a static guard proving zero charging code.**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-06-24T14:52:16Z
- **Completed:** 2026-06-24T14:56:45Z
- **Tasks:** 3
- **Files modified:** 5 created

## Accomplishments
- Idempotent `ai_cost_events` migration: append-only, keyed by `attempt_id` + `operation_type`, service-role writes only, single super-admin SELECT policy (mirrors `pipeline_events`), three correlation/rollup indexes, NULLABLE `real_cost_usd`.
- `recordAICost(ev: AICostInput): Promise<void>` — never-throw cost capture mirroring `recordPipelineEvent`; maps camelCase to the snake_case row, passes `realCostUsd` null THROUGH, swallows DB failures with `console.warn`.
- The `AICostInput` contract Plans 110-02 and 110-03 will import verbatim.
- Three Wave-0 static tests: migration contract (COST-03), helper behavior (TDD), and the measure-only invariant guard (CALIB-01). Full billing suite green (12 files / 64 tests).

## Task Commits

Each task was committed atomically:

1. **Task 1: ai_cost_events migration + contract test** - `8a78828b` (feat)
2. **Task 2: recordAICost helper (TDD)** - `12d317c3` (test, RED) -> `1e12a4d1` (feat, GREEN)
3. **Task 3: measure-only invariant guard** - `539dae90` (test)

**Plan metadata:** (docs commit — STATE/ROADMAP/SUMMARY)

## Files Created/Modified
- `supabase/migrations/20260624000003_phase110_ai_cost_events.sql` - Append-only ai_cost_events table, deny-all client RLS + super-admin SELECT, NULLABLE real_cost_usd, 6-value operation_type + 4-value provider CHECK, three indexes. Idempotent, NOT applied to remote.
- `lib/billing/record-ai-cost.ts` - Never-throw `recordAICost()` + `AICostInput` interface. Only import is `requireServiceClient`. Zero charging code.
- `tests/unit/billing/record-ai-cost.test.ts` - Helper behavior: snake_case insert, null-vs-0, never-throw, absent-optional-to-null.
- `tests/unit/billing/ai-cost-events-migration.test.ts` - Static SQL contract for the migration.
- `tests/unit/billing/measure-only-invariant.test.ts` - Static guard: no credit/debit/ledger/balance/markup in the cost module; only requireServiceClient imported; no `?? 0` on cost.

## Decisions Made
- ai_cost_events kept structurally separate from the future credit ledger; nothing in this plan can charge.
- `real_cost_usd` NULLABLE so unknown provider cost survives as NULL (calibration excludes it from the mean rather than biasing toward zero).
- Migration authored only; remote application deferred to the CI->GHCR->Coolify pipeline.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Forbidden charging tokens in the migration `COMMENT ON TABLE` literal**
- **Found during:** Task 1 (migration contract test)
- **Issue:** The measure-only column assertion strips `--` line comments but not SQL string literals; the `COMMENT ON TABLE` text "no credit/ledger/debit columns" tripped the guard.
- **Fix:** Reworded the COMMENT to "(no charging columns)" — still conveys measure-only intent without the forbidden tokens.
- **Files modified:** supabase/migrations/20260624000003_phase110_ai_cost_events.sql
- **Verification:** `npx vitest run tests/unit/billing/ai-cost-events-migration.test.ts` -> 9/9 green.
- **Committed in:** 8a78828b (Task 1 commit)

**2. [Rule 1 - Bug] Forbidden charging tokens in the helper's doc comment**
- **Found during:** Task 3 (measure-only invariant guard)
- **Issue:** The guard scans the whole production file (including prose). The helper's doc comment explaining what it does NOT do mentioned markup/balance/debit/credit ledger, tripping the guard.
- **Fix:** Reworded the doc comment to describe measure-only behavior without using any charging token; verified via grep that the module contains zero forbidden tokens.
- **Files modified:** lib/billing/record-ai-cost.ts
- **Verification:** `grep -ci "credit\|debit\|ledger\|balance\|markup"` -> 0; full billing suite 64/64 green.
- **Committed in:** 539dae90 (Task 3 commit)

---

**Total deviations:** 2 auto-fixed (2 bugs — both prose-token collisions caught by the intended-strict static guards).
**Impact on plan:** No scope change. The guards worked exactly as designed; rewording strengthens the measure-only contract (the production files now contain zero charging tokens even in comments).

## Issues Encountered
None beyond the two guard-caught prose collisions documented above.

## User Setup Required
None - no external service configuration required. Operational follow-up (deferred): apply migration `20260624000003` to remote via the CI->GHCR->Coolify pipeline (carries alongside the prior 106/108 migrations).

## Next Phase Readiness
- The COST-03 persistence contract is live: Plans 110-02 (OpenRouter cost) and 110-03 (Whisper cost) can now `import { recordAICost } from '@/lib/billing/record-ai-cost'` and call it as a fire-and-forget side effect.
- The CALIB-01 measure-only invariant is locked by an automated guard — any future reintroduction of charging code into the cost module fails CI.
- No blockers.

## Known Stubs
None — the helper is fully wired to the service client; the migration is complete DDL. No placeholder/empty-value stubs introduced.

## Self-Check: PASSED

All 5 created files exist on disk; all 4 task commits (8a78828b, 12d317c3, 1e12a4d1, 539dae90) present in git history.

---
*Phase: 110-real-cost-capture-foundation-measure-only-mode*
*Completed: 2026-06-24*
