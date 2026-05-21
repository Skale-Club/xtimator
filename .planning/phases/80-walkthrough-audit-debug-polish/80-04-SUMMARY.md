---
phase: 80-walkthrough-audit-debug-polish
plan: "04"
subsystem: tour-telemetry
tags: [telemetry, playwright, migration, server-action, tdd]
dependency_graph:
  requires: [80-03]
  provides: [TOUR-QA-05]
  affects: [components/tour/tour-spotlight.tsx, components/tour/welcome-modal.tsx, lib/actions/tour.ts, playwright.config.ts]
tech_stack:
  added: [tour_events table (Supabase migration), logTourEvent server action]
  patterns: [inline-getAuthContext, fire-and-forget void server action, Playwright globalSetup storageState]
key_files:
  created:
    - supabase/migrations/20260521000001_tour_events.sql
    - lib/actions/tour.ts
    - tests/unit/tour/tour-telemetry.test.ts
    - tests/e2e/globalSetup.ts
  modified:
    - components/tour/tour-spotlight.tsx
    - components/tour/welcome-modal.tsx
    - playwright.config.ts
    - tests/e2e/tour-flow.spec.ts
decisions:
  - "logTourEvent is fire-and-forget (void call) — telemetry failure must never block tour UX"
  - "completedNaturallyRef used to distinguish Done (tour_finished) from X/ESC (tour_skipped) without adding a parameter to handleClose"
  - "globalSetup guards on TEST_USER_EMAIL/TEST_USER_PASSWORD — missing credentials exit cleanly; tour tests fall back to requireDashboard skip"
  - "tourEvents inserted via server action (not browser Supabase client) per CLAUDE.md security constraint"
metrics:
  duration: "8min"
  completed: "2026-05-21"
  tasks: 3
  files: 8
---

# Phase 80 Plan 04: Tour Telemetry + Playwright Auth Fixture Summary

Tour_events migration applied, logTourEvent server action wired at 4 call sites, Playwright globalSetup created with storageState auth fixture, 2 new TOUR-QA tests added.

## What Was Built

### Migration Applied: tour_events table + RLS policy

`supabase/migrations/20260521000001_tour_events.sql` creates the `tour_events` table with:
- `company_id NOT NULL` (RLS-scoped to company)
- `user_id REFERENCES auth.users` (nullable — set null on user delete)
- `event_type TEXT CHECK` limiting to 4 valid values
- `metadata JSONB` for step-level context
- RLS policy: `company_id IN (SELECT id FROM companies WHERE user_id = auth.uid())`

Migration was applied to the Supabase project via the Node/pg script pattern (Phase 76.2 pattern).

### 4 Event Types Wired

| Event | File | Function | Trigger |
|-------|------|----------|---------|
| `tour_started` | welcome-modal.tsx | handleShowMeAround | User clicks "Show me around" button |
| `tour_step_completed` | tour-spotlight.tsx | handleNext (non-last) | User clicks Next on any non-final step |
| `tour_finished` | tour-spotlight.tsx | handleNext (last step) | User clicks Done on final step |
| `tour_skipped` | tour-spotlight.tsx | handleClose (without completion) | User clicks X or presses ESC |

All calls use `void logTourEvent(...)` — fire-and-forget, no awaiting. A `completedNaturallyRef` ref distinguishes Done (tour_finished) from dismiss (tour_skipped) inside `handleClose`.

### Playwright Auth Fixture

`tests/e2e/globalSetup.ts` signs in with `TEST_USER_EMAIL` + `TEST_USER_PASSWORD`, saves `storageState` to `tests/e2e/fixtures/authenticated-state.json`.

`playwright.config.ts` now has:
- `globalSetup: './tests/e2e/globalSetup'`
- `use.storageState: 'tests/e2e/fixtures/authenticated-state.json'`

When credentials are NOT set, globalSetup exits cleanly with a warning and tests fall back to the existing `requireDashboard` skip guard.

### Tests

- Unit: 20/20 passing (3 test files — tour-state-machine, tooltip-persistence, tour-telemetry — all green)
- E2E: 7 tests in tour-flow.spec.ts (5 original + 2 new: TOUR-QA-03 inert attribute, TOUR-QA-04 rAF count). Pass when TEST_USER_EMAIL/TEST_USER_PASSWORD are set in .env.local; skip gracefully when not set.
- TypeScript: `npx tsc --noEmit` clean

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — all 4 event types are wired to real inserts via the server action. The authenticated-state.json fixture remains empty (`{}`) when TEST_USER_EMAIL/TEST_USER_PASSWORD are not set in .env.local (this is expected behavior, not a stub).

## Self-Check: PASSED

- FOUND: supabase/migrations/20260521000001_tour_events.sql
- FOUND: lib/actions/tour.ts
- FOUND: tests/unit/tour/tour-telemetry.test.ts
- FOUND: tests/e2e/globalSetup.ts
- FOUND: commit eeb0cb3 (Task 1)
- FOUND: commit f39873b (Task 2)
- FOUND: commit a726b93 (Task 3)
