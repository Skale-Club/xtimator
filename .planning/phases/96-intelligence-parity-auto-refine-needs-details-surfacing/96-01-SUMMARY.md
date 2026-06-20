---
phase: 96-intelligence-parity-auto-refine-needs-details-surfacing
plan: 01
subsystem: testing
tags: [vitest, tdd, langgraph, estimate-graph, multi-tenant, isolation]

# Dependency graph
requires:
  - phase: 94-extract-canonical-graph-behind-whatsapp-behavior-preserving-steprunner-seam
    provides: shared estimate graph (state.ts, types.ts, nodes/, adapters/) + ENGINE-01..04 anchors
  - phase: 95-migrate-web-mcp-onto-the-shared-graph-generate-only-passthrough
    provides: default adapter stub (makeDefaultAdapter with no-op finalize) and graph-neutrality.test.ts
provides:
  - Wave 0 RED test stubs for SMART-01/03/04 and QA-02 in auto-refine-isolation.test.ts
  - ENGINE-01 neutrality anchor extended to cover auto-refine.ts in graph-neutrality.test.ts
affects:
  - 96-02 (Wave 2 production implementation — these RED tests are the GREEN target)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Wave 0 RED stub pattern: expect.fail('RED — ...') with file existence guards for source-text anchors"
    - "Source-text anchor: readFileSync + existsSync pattern for static source analysis in vitest"

key-files:
  created:
    - tests/unit/estimate/auto-refine-isolation.test.ts
  modified:
    - tests/unit/estimate/graph-neutrality.test.ts

key-decisions:
  - "Wave 0 stubs use expect.fail() for behavioral tests (A/B/D) that target not-yet-existing production code; Test C uses existsSync guard so it self-describes the RED condition clearly"
  - "REQUIRED_CORE_FILES extended with auto-refine.ts so Wave 2's file creation automatically satisfies the ENGINE-01 neutrality anchor without any test change"

patterns-established:
  - "QA-02 multi-tenant isolation test pattern: source-text anchor (state.companyId not a param) + behavioral closure verification"

requirements-completed: [SMART-01, SMART-02, SMART-03, SMART-04, QA-02]

# Metrics
duration: 3min
completed: 2026-06-20
---

# Phase 96 Plan 01: Auto-Refine Isolation RED Test Stubs Summary

**Wave 0 RED test scaffolding for SMART-01/03/04 and QA-02 isolation — 4 failing stubs and ENGINE-01 neutrality anchor extended to cover auto-refine.ts**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-06-20T19:02:19Z
- **Completed:** 2026-06-20T19:04:24Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Created `tests/unit/estimate/auto-refine-isolation.test.ts` with 4 RED `it()` blocks covering SMART-01 (autoRefine increments refineAttempts), SMART-03/04 (finalize writes awaiting_details + returns needsDetails), and QA-02 (source-text + closure isolation anchors)
- Extended `tests/unit/estimate/graph-neutrality.test.ts` REQUIRED_CORE_FILES to include `lib/estimate/graph/nodes/auto-refine.ts` — the "core files exist" test is now RED until Wave 2 creates the file
- No regressions: 25 previously-green tests across 6 test files remain GREEN; QA-01 never-reply-regression guard stays GREEN

## RED Tests List

| Test | Requirement | Target Production File | RED Reason |
|------|-------------|------------------------|------------|
| Test A (SMART-01): autoRefineNode increments refineAttempts/resets state | SMART-01 | lib/estimate/graph/nodes/auto-refine.ts | File does not exist yet |
| Test B (SMART-03/04): finalize writes awaiting_details + returns needsDetails | SMART-03, SMART-04 | lib/estimate/adapters/default.ts | finalize is still a no-op |
| Test C (QA-02 source anchor): auto-refine.ts reads state.companyId | QA-02 | lib/estimate/graph/nodes/auto-refine.ts | File does not exist yet |
| Test D (QA-02 closure isolation): finalize .eq() uses closure companyId | QA-02 | lib/estimate/adapters/default.ts | finalize is still a no-op |
| graph-neutrality "core files exist" | ENGINE-01 | lib/estimate/graph/nodes/auto-refine.ts | File does not exist yet |

## Task Commits

1. **Task 1: Write auto-refine-isolation.test.ts (RED stubs)** - `e0cad50` (test)
2. **Task 2: Extend graph-neutrality.test.ts to include auto-refine.ts** - `ee24d4b` (test)

## Verification Output

```
npx vitest run tests/unit/estimate/

 Test Files  2 failed | 6 passed (8)
      Tests  5 failed | 25 passed (30)
   Start at  15:03:50
   Duration  5.01s

# Failures are all expected RED (Wave 0):
# - auto-refine-isolation.test.ts: 4 RED (all tests)
# - graph-neutrality.test.ts: 1 RED ("core files exist" — auto-refine.ts missing)
# QA-01 guard: 3 passed (GREEN, no regression)
```

## Files Created/Modified

- `tests/unit/estimate/auto-refine-isolation.test.ts` — New: 4 RED Wave 0 stubs for SMART-01/03/04 and QA-02 (source-text anchor + closure isolation)
- `tests/unit/estimate/graph-neutrality.test.ts` — Modified: added `'lib/estimate/graph/nodes/auto-refine.ts'` to REQUIRED_CORE_FILES (1-line change)

## Decisions Made

- Used `expect.fail('RED — ...')` for behavioral tests A, B, D where production targets do not exist yet — clear RED signal with self-documenting message
- Used `existsSync(path)` guard in Test C (source-text anchor) so when the file is absent the error message is explicit rather than a confusing `readFileSync` ENOENT crash
- No other changes to the neutrality test — the existing `collectTsFiles(CORE_DIRS)` already recursively scans `lib/estimate/graph/nodes/` so the auto-refine source will be included in the neutrality scan automatically once created

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- Wave 0 RED stubs complete; Wave 2 (plan 96-02) can target these tests as the GREEN gate
- The 5 RED failures define the exact acceptance contracts for:
  - `lib/estimate/graph/nodes/auto-refine.ts` (new file)
  - `lib/estimate/adapters/default.ts` (finalize body update)
  - `lib/estimate/graph/state.ts` (needsDetails annotation, D-04)
  - `lib/estimate/graph/index.ts` (topology rewiring, D-01)

---
*Phase: 96-intelligence-parity-auto-refine-needs-details-surfacing*
*Completed: 2026-06-20*
