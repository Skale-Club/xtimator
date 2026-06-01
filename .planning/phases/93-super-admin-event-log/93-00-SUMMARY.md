---
phase: 93-super-admin-event-log
plan: "00"
subsystem: testing
tags: [vitest, tdd, wave-0, admin, observability, pipeline-events]

# Dependency graph
requires:
  - phase: 92-pipeline-event-persistence
    provides: pipeline_events table + recordPipelineEvent() helper that Phase 93 reads and displays
provides:
  - "6 Wave 0 RED test files in tests/unit/admin/ covering all ADMINLOG-01..05 requirements"
  - "Nyquist validation contract: behavioral specifications encoded as failing tests"
  - "Static-source assertion pattern for requireAdmin gate, SQL DDL, and router.refresh()"
affects:
  - 93-01 (migration DDL — pipeline-attempts-view.test.ts will turn GREEN)
  - 93-02 (events-query.ts + events-controls.tsx — pipeline-attempts-query.test.ts + events-controls.test.ts)
  - 93-03 (events/page.tsx + [attemptId]/page.tsx — route-gate + detail + query tests)
  - 93-04 (EventStepTimeline — event-step-timeline.test.ts)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Wave 0 RED test pattern: expect.fail('Wave 0: <module> not yet written') for pure-function tests; readFileSync try/catch with expect.fail in catch for static-source tests"
    - "Static source-read test pattern: readFileSync(resolve(process.cwd(), path)) + expect(src).toMatch(/regex/) for structural assertions without importing implementation"
    - "Two-tier Wave 0 guard: pure-fn tests use bare expect.fail(); file-existence tests use try/catch so collection never aborts on missing files"

key-files:
  created:
    - tests/unit/admin/pipeline-attempts-query.test.ts
    - tests/unit/admin/pipeline-attempts-view.test.ts
    - tests/unit/admin/event-step-timeline.test.ts
    - tests/unit/admin/events-detail.test.ts
    - tests/unit/admin/events-route-gate.test.ts
    - tests/unit/admin/events-controls.test.ts
  modified: []

key-decisions:
  - "Wave 0 RED tests use expect.fail() for pure-function tests (no try/catch needed — module doesn't exist yet, so no import) and try/catch+expect.fail in catch for readFileSync tests (file may or may not exist at collection time)"
  - "All test files use explicit named imports from vitest (import { describe, it, expect } from 'vitest') — no globals, consistent with STATE.md Phase 22 decision"
  - "pipeline-attempts-view.test.ts uses a findViewMigration() helper that scans supabase/migrations for *phase93*.sql to avoid hardcoding a timestamp-based filename"
  - "events-route-gate.test.ts asserts ordering (adminIdx < svcIdx) not just presence — ensures requireAdmin() is actually before the service client call, not just somewhere in the file"

patterns-established:
  - "findViewMigration() pattern: readdirSync supabase/migrations + .find(n => n.includes('phase93')) for timestamp-agnostic migration lookup"
  - "readDetailPage() helper: try/catch returning empty string, callers guard with if (!src) expect.fail() — single file read with graceful empty-string fallback"

requirements-completed:
  - ADMINLOG-01
  - ADMINLOG-02
  - ADMINLOG-03
  - ADMINLOG-04
  - ADMINLOG-05

# Metrics
duration: 3min
completed: 2026-05-30
---

# Phase 93 Plan 00: Super Admin Event Log — Wave 0 Test Scaffold Summary

**6 Wave 0 RED vitest test files encoding the full ADMINLOG behavioral specification as failing assertions with expect.fail() and static-source readFileSync guards**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-05-30T02:28:19Z
- **Completed:** 2026-05-30T02:31:06Z
- **Tasks:** 2
- **Files modified:** 6 created

## Accomplishments

- Created all 6 Nyquist-contract test files in `tests/unit/admin/` — zero previously existed
- All 41 new test assertions fail RED via `expect.fail()` or `readFileSync` try/catch (no import errors, no collection aborts)
- Pre-existing 3 admin test files (og-image-uploader, save-seo, seo-editor) remain GREEN (21 passing) — no regression
- `npm test -- tests/unit/admin/` exits non-zero: 6 failed files, 41 failed tests as expected

## Task Commits

1. **Task 1: pipeline-attempts-query.test.ts + pipeline-attempts-view.test.ts (RED)** - `169486d` (test)
2. **Task 2: event-step-timeline.test.ts + events-detail.test.ts + events-route-gate.test.ts + events-controls.test.ts (RED)** - `d2dfd0c` (test)

## Files Created/Modified

- `tests/unit/admin/pipeline-attempts-query.test.ts` — ADMINLOG-01/02/03: buildSearchOr, filter→.eq, .range pagination, count queries, email-lookup branch (14 tests)
- `tests/unit/admin/pipeline-attempts-view.test.ts` — ADMINLOG-01: DDL static contract for migration SQL (security_invoker, GROUP BY, derived cols) (7 tests)
- `tests/unit/admin/event-step-timeline.test.ts` — ADMINLOG-04/05: terminalStatus precedence, formatDuration, SAFE_EVENT_COLUMNS whitelist guard (8 tests)
- `tests/unit/admin/events-detail.test.ts` — ADMINLOG-04/05: ASC order, notFound(), await params, safe select list (5 tests)
- `tests/unit/admin/events-route-gate.test.ts` — cross-cutting: requireAdmin before requireServiceClient on both routes, force-dynamic (5 tests)
- `tests/unit/admin/events-controls.test.ts` — ADMINLOG-03: router.refresh() + "use client" in refresh control (2 tests)

## Decisions Made

- Wave 0 pure-function tests (buildSearchOr, terminalStatus, formatDuration) use bare `expect.fail()` with no try/catch — the function modules don't exist yet so there's nothing to import, and the description explains what's missing.
- Static-source tests (page.tsx, events-controls.tsx, migration SQL) use `try { readFileSync } catch { expect.fail() }` — the file may or may not exist, catching the ENOENT converts it to a clean failing assertion.
- `findViewMigration()` in the view DDL test scans by `n.includes('phase93')` rather than hardcoding a timestamp — the migration filename includes a timestamp set at creation time, which is unknown at test-write time.
- `events-route-gate.test.ts` asserts `adminIdx < svcIdx` (ordering) not just `adminIdx > -1` (presence) — this enforces the load-bearing security constraint that requireAdmin must precede requireServiceClient.

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None — all 6 files collected cleanly, all 41 tests fail RED as required.

## User Setup Required

None - no external service configuration required.

## Known Stubs

None — this plan creates only test files (Wave 0 RED scaffold). The stubs are intentional: every `expect.fail()` is the stub that a later implementation wave will make GREEN.

## Next Phase Readiness

- Wave 0 contract is in place: all 6 test files exist and fail RED
- Plan 93-01 (migration DDL) will turn `pipeline-attempts-view.test.ts` GREEN
- Plan 93-02 (events-query.ts + controls) will turn `pipeline-attempts-query.test.ts` + `events-controls.test.ts` GREEN
- Plan 93-03 (route files) will turn `events-route-gate.test.ts` + `events-detail.test.ts` + partial query tests GREEN
- Plan 93-04 (EventStepTimeline) will turn `event-step-timeline.test.ts` GREEN

---
*Phase: 93-super-admin-event-log*
*Completed: 2026-05-30*
