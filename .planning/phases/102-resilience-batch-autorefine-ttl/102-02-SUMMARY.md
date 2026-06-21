---
phase: 102-resilience-batch-autorefine-ttl
plan: 02
subsystem: api
tags: [langgraph, estimate-graph, auto-refine, config, env]

# Dependency graph
requires:
  - phase: 102-00
    provides: "RED scaffold tests/unit/estimate/auto-refine-cap.test.ts (env-stubbed AUTO_REFINE_MAX_ATTEMPTS=2 case failing by design)"
  - phase: 96
    provides: "checkVagueAfterAssessEdge + autoRefineNode (cap=1 auto-refine loop in the shared estimate graph)"
provides:
  - "AUTO_REFINE_MAX_ATTEMPTS module constant in decide.ts (default 1, optional non-secret env override)"
  - "checkVagueAfterAssessEdge reads the configurable cap instead of a hard-coded literal"
affects: [102-04, 103, auto-refine, recourse]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Module-load config constant with Number guard + safe default (mirrors SESSION_TTL_MINUTES) for non-secret ops tuning knobs"

key-files:
  created: []
  modified:
    - lib/estimate/graph/nodes/decide.ts
    - lib/estimate/graph/nodes/auto-refine.ts

key-decisions:
  - "Cap read once at module load via an IIFE with Number.isFinite + raw >= 0 guard; malformed/negative env falls back to default 1"
  - "Comparison operator kept exactly `<` so default 1 is byte-identical to the prior `(state.refineAttempts ?? 0) < 1`"
  - "auto-refine.ts change is documentation-only — no runtime behavior touched (increment logic unchanged)"

patterns-established:
  - "Configurable channel-neutral cap: read process.env synchronously on a hot edge (no DB, no async, no channel import) so graph-neutrality stays green"

requirements-completed: []  # HARD-06 cap portion only; HARD-06 stays open (recourse UI half owned by Plan 04)

# Metrics
duration: 2min
completed: 2026-06-21
---

# Phase 102 Plan 02: Configurable Auto-Refine Cap Summary

**Replaced the hard-coded `refineAttempts < 1` literal in the assess→refine edge with a single `AUTO_REFINE_MAX_ATTEMPTS` module constant (default 1, optional non-secret env override with a Number guard), making the auto-refine cap an ops tuning knob with zero default behavior change.**

## Performance

- **Duration:** 2 min
- **Started:** 2026-06-21T19:53:41Z
- **Completed:** 2026-06-21T19:55:49Z
- **Tasks:** 1
- **Files modified:** 2

## Accomplishments
- `AUTO_REFINE_MAX_ATTEMPTS` module constant added to `decide.ts`, read once at module load from `process.env.AUTO_REFINE_MAX_ATTEMPTS`, defaulting to 1 with a `Number.isFinite(raw) && raw >= 0` guard against malformed/negative values.
- `checkVagueAfterAssessEdge` now compares against the constant (`< AUTO_REFINE_MAX_ATTEMPTS`); the active hard-coded literal is gone. Operator kept exactly `<` so default behavior is byte-identical.
- `auto-refine.ts` doc comment updated to reference the configurable cap (documentation-only; no runtime change).
- Turned `tests/unit/estimate/auto-refine-cap.test.ts` fully GREEN (default=1 AND cap=2 override cases); `auto-refine-isolation` + `graph-neutrality` stay GREEN; `never-reply-regression` Path C still loops exactly once at the default.

## Task Commits

Each task was committed atomically:

1. **Task 1: Introduce AUTO_REFINE_MAX_ATTEMPTS constant + read it from the edge; update auto-refine.ts doc** - `02a41f2` (feat)

_Note: this is the GREEN implementation; the RED test (`auto-refine-cap.test.ts`) was authored in Plan 102-00, so no separate test commit was needed in this plan._

## Files Created/Modified
- `lib/estimate/graph/nodes/decide.ts` - Added `AUTO_REFINE_MAX_ATTEMPTS` config constant; `checkVagueAfterAssessEdge` reads it.
- `lib/estimate/graph/nodes/auto-refine.ts` - Doc comment now references the configurable cap (no behavior change).

## Decisions Made
- Cap read once at module load via an IIFE; `Number.isFinite(raw) && raw >= 0 ? raw : 1` guards malformed/negative env values back to the default.
- Comparison operator kept exactly `<` (not `<=`) — flipping it would change loop count (Research Pitfall 1).
- No env VALUE committed anywhere — only the variable NAME appears in code/docs (CLAUDE.md secret-handling rule, even though this knob is non-secret).

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None. Pre-existing `npx tsc --noEmit` errors (test-config es2018 regex flag, prior-phase test fixtures, the Plan-04-owned `@/components/workspace/needs-details-banner` module, and out-of-scope xphere) are unrelated to this task and were not introduced here — the two changed files compile clean.

## Verification
- `npx vitest run tests/unit/estimate/auto-refine-cap.test.ts tests/unit/estimate/auto-refine-isolation.test.ts tests/unit/estimate/graph-neutrality.test.ts` → 3 files / 12 tests passed.
- `npx vitest run tests/unit/whatsapp/never-reply-regression.test.ts` → 3 passed (default cap loops exactly once).
- `grep` confirms `AUTO_REFINE_MAX_ATTEMPTS` constant + its use in the edge; the only `< 1` match remaining is inside the doc comment describing the prior behavior (no active literal cap).

## Known Stubs
None - the change is a complete, behavior-preserving config refactor.

## Requirement Status
- **HARD-06 (cap portion):** satisfied — the auto-refine cap is now a single configurable constant defaulting to 1.
- **HARD-06 remains OPEN:** the web recourse UI half (NeedsDetailsBanner in OverviewTab) is owned by Plan 102-04. HARD-06 is NOT marked complete by this plan.
- **Other Phase 102 RED scaffolds still RED (owned elsewhere):** `replay-safe-ttl.test.ts` (HARD-07 → Plan 102-01), `batch-reporting.test.ts` (HARD-05 → Plan 102-03), `needs-details-banner.test.tsx` (HARD-06 recourse UI → Plan 102-04).

## Next Phase Readiness
- The cap is now ops-tunable via the non-secret `AUTO_REFINE_MAX_ATTEMPTS` env var (absent ⇒ 1). No setup required to ship; absence is the intended baseline.
- Plan 102-04 (recourse UI) can proceed independently — it surfaces the still-vague outcome the cap drives.

## Self-Check: PASSED
- FOUND: `.planning/phases/102-resilience-batch-autorefine-ttl/102-02-SUMMARY.md`
- FOUND: `lib/estimate/graph/nodes/decide.ts`
- FOUND: `lib/estimate/graph/nodes/auto-refine.ts`
- FOUND: commit `02a41f2`

---
*Phase: 102-resilience-batch-autorefine-ttl*
*Completed: 2026-06-21*
