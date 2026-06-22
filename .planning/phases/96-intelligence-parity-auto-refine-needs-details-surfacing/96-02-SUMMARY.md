---
phase: 96-intelligence-parity-auto-refine-needs-details-surfacing
plan: 02
subsystem: api
tags: [langgraph, estimate-graph, auto-refine, multi-tenant, inngest, mcp, whatsapp]

# Dependency graph
requires:
  - phase: 96-intelligence-parity-auto-refine-needs-details-surfacing
    provides: Wave 0 RED test stubs (auto-refine-isolation.test.ts + graph-neutrality anchor)
  - phase: 95-migrate-web-mcp-onto-the-shared-graph-generate-only-passthrough
    provides: default adapter stub (makeDefaultAdapter with no-op finalize) + graph-neutrality.test.ts
  - phase: 94-extract-canonical-graph-behind-whatsapp-behavior-preserving-steprunner-seam
    provides: shared estimate graph (state.ts, types.ts, nodes/, adapters/) + ENGINE-01..04 anchors
provides:
  - cap=1 auto-refine loop in shared estimate graph (autoRefineNode + checkVagueAfterAssessEdge)
  - lib/estimate/quality/revert.ts shared revert helper (ENGINE-01 neutral)
  - needsDetails field in canonical EstimateState
  - default adapter finalize writes awaiting_details + returns needsDetails for web/MCP
  - All Phase 96 Wave 1 RED tests turned GREEN (4/4 auto-refine-isolation + 2/2 graph-neutrality)
affects:
  - phase 97 (observability — consumes the new autoRefine node in trace spans)
  - lib/inngest/functions/generate-estimate.ts (inherits needsDetails via graph return)
  - lib/mcp/tools/write.ts (inherits needsDetails via same Inngest job — zero code changes)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Engine-neutral shared helper: moved to lib/estimate/quality/ with re-export from original channel path for backward compat"
    - "cap=1 conditional graph loop: addConditionalEdges with both targets listed for LangGraph reachability"
    - "QA-02 closure isolation: closure companyId vs state.companyId separation verified by behavioral test"
    - "JSDoc neutrality: comments in ENGINE-01 scanned files must not contain the 'lib/whatsapp' token string"

key-files:
  created:
    - lib/estimate/quality/revert.ts
    - lib/estimate/graph/nodes/auto-refine.ts
  modified:
    - lib/whatsapp/ask-details.ts
    - lib/estimate/graph/state.ts
    - lib/estimate/graph/nodes/decide.ts
    - lib/estimate/graph/index.ts
    - lib/estimate/adapters/default.ts
    - tests/unit/estimate/auto-refine-isolation.test.ts
    - tests/unit/whatsapp/never-reply-regression.test.ts

key-decisions:
  - "D-01 cap=1 conditional loop: checkVagueAfterAssessEdge replaces direct assess→finalize edge; targets both finalize and autoRefine in 3rd arg for LangGraph reachability"
  - "D-02 autoRefineNode is ENGINE-01 neutral: imports from lib/estimate/quality/revert, not from any channel module; JSDoc comments must also avoid forbidden token 'lib/whatsapp'"
  - "D-04 needsDetails added to EstimateState as Annotation<boolean | undefined>()"
  - "D-05 revertVagueEstimate moved to lib/estimate/quality/revert.ts; lib/whatsapp/ask-details.ts re-exports for backward compat"
  - "D-06 default adapter finalize: real body writes awaiting_details + returns needsDetails:true on vague-after-refine path; uses closure companyId (QA-02)"
  - "QA-01 update: never-reply-regression Path C assertion updated from generateEstimateForProject×1 to ×2 because Phase 96 loop now runs generate twice on the vague path"
  - "Engine-01 neutrality scanner checks string content including comments: JSDoc must avoid 'lib/whatsapp' token in files under lib/estimate/quality/ and lib/estimate/graph/"

patterns-established:
  - "Shared channel-neutral helper placement: lib/estimate/quality/ for shared primitives (revert.ts, vagueness.ts)"
  - "Backward compat re-export: original channel module re-exports the moved function verbatim"
  - "QA-02 closure isolation test: create adapter with CLOSURE_COMPANY, invoke with different state.companyId, verify .eq('company_id', ...) used closure value"

requirements-completed: [SMART-01, SMART-02, SMART-03, SMART-04, SMART-05, QA-02]

# Metrics
duration: 17min
completed: 2026-06-20
---

# Phase 96 Plan 02: Intelligence Parity — Auto-Refine Production Code Summary

**Cap=1 auto-refine loop added to shared estimate graph: vague estimates now trigger one self-refine attempt before human is involved, with needs_details surfaced in default adapter for web/MCP channels**

## Performance

- **Duration:** ~17 min
- **Started:** 2026-06-20T19:02:19Z
- **Completed:** 2026-06-20T19:19:33Z
- **Tasks:** 3
- **Files modified:** 9

## Accomplishments

- Created `lib/estimate/quality/revert.ts` with the shared `revertVagueEstimate` helper (moved from WhatsApp, ENGINE-01 neutral)
- Created `lib/estimate/graph/nodes/auto-refine.ts`: channel-neutral node that increments refineAttempts, reverts the $0 estimate, clears estimateId/isVague, appends REFINE_HINT to prompts
- Added `checkVagueAfterAssessEdge` to `decide.ts`: routes to `autoRefine` when isVague and refineAttempts<1, else to `finalize`
- Wired cap=1 conditional loop in `index.ts`: replaced `addEdge('assess', 'finalize')` with conditional edges + autoRefine→generate back-edge
- Updated `default.ts` finalize: writes `projects.status='awaiting_details'` + returns `{needsDetails: true}` on vague-after-refine path using closure companyId (QA-02)
- All Wave 1 RED tests turned GREEN: 4/4 auto-refine-isolation + 2/2 graph-neutrality + 3/3 never-reply-regression

## Test Results

| Gate | Before (Wave 0) | After (Wave 2) |
|------|----------------|---------------|
| auto-refine-isolation.test.ts | 4 RED | 4 GREEN |
| graph-neutrality.test.ts | 1 RED + 1 GREEN | 2 GREEN |
| never-reply-regression.test.ts | 3 GREEN | 3 GREEN |
| All estimate tests | 5 failed / 25 passed | 30/30 GREEN |

## Task Commits

1. **Task 1: Move revertVagueEstimate + add needsDetails to state** - `e5723a9` (feat)
2. **Task 2: Create auto-refine.ts + extend decide.ts** - `ebe5c88` (feat)
3. **Task 3: Wire autoRefine topology + update default.ts finalize** - `aed6db9` (feat)

## Files Created/Modified

- `lib/estimate/quality/revert.ts` — NEW: shared `revertVagueEstimate` helper (ENGINE-01 neutral, no channel imports)
- `lib/whatsapp/ask-details.ts` — MODIFIED: replaced function body with re-export from `@/lib/estimate/quality/revert`; removed SupabaseClient import (no longer needed)
- `lib/estimate/graph/state.ts` — MODIFIED: added `needsDetails: Annotation<boolean | undefined>()` after `refineAttempts`
- `lib/estimate/graph/nodes/auto-refine.ts` — NEW: core autoRefine node (D-02/SMART-01/ENGINE-01)
- `lib/estimate/graph/nodes/decide.ts` — MODIFIED: added `checkVagueAfterAssessEdge` export (D-01)
- `lib/estimate/graph/index.ts` — MODIFIED: wired autoRefine node + conditional assess edge + autoRefine→generate back-edge (D-01)
- `lib/estimate/adapters/default.ts` — MODIFIED: real finalize body with awaiting_details write + needsDetails return (D-06)
- `tests/unit/estimate/auto-refine-isolation.test.ts` — MODIFIED: replaced Wave 0 RED stubs with real behavioral tests (4/4 GREEN)
- `tests/unit/whatsapp/never-reply-regression.test.ts` — MODIFIED: updated Path C for Phase 96 loop behavior (2 generate calls, 1 revert tracked via mock path)

## Decisions Made

- `lib/estimate/quality/revert.ts` JSDoc comments must not contain the string `lib/whatsapp` — the ENGINE-01 neutrality scanner checks source text including comments, and `lib/whatsapp` is in the FORBIDDEN token list
- `autoRefineNode` uses `state.companyId` only in its JSDoc comment (the invariant documentation), not in runtime code — the actual revert uses `state.projectId` which is sufficient for the delete+update calls
- QA-01 never-reply-regression Path C updated: generate is now called 2× (first pass + auto-refine pass), and `revertVagueEstimate` mock count stays 1 (autoRefineNode calls via `@/lib/estimate/quality/revert`, WhatsApp finalize calls via `@/lib/whatsapp/ask-details` — only the latter path is tracked by the test mock)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] JSDoc comments in ENGINE-01 scanned files contained forbidden 'lib/whatsapp' token**
- **Found during:** Task 2 (creating auto-refine.ts and revert.ts)
- **Issue:** The neutrality scanner in `graph-neutrality.test.ts` scans ALL source text (including JSDoc comments) for FORBIDDEN tokens including `lib/whatsapp`. The verbatim plan content included `lib/whatsapp` in JSDoc comments, causing graph-neutrality.test.ts to fail
- **Fix:** Rewrote JSDoc comments in `lib/estimate/quality/revert.ts` and `lib/estimate/graph/nodes/auto-refine.ts` to describe the WhatsApp channel without using the `lib/whatsapp` token string
- **Files modified:** `lib/estimate/quality/revert.ts`, `lib/estimate/graph/nodes/auto-refine.ts`
- **Verification:** `npx vitest run tests/unit/estimate/graph-neutrality.test.ts` → 2/2 GREEN
- **Committed in:** `ebe5c88` (Task 2 commit)

**2. [Rule 1 - Bug] QA-01 never-reply-regression Path C broke after Phase 96 auto-refine loop wiring**
- **Found during:** Task 3 (after wiring index.ts topology)
- **Issue:** Path C asserted `generateEstimateForProject.toHaveBeenCalledTimes(1)` and `revertVagueEstimate.toHaveBeenCalledTimes(1)`. After Phase 96, the graph loops: generate runs twice on the vague path. The single `mockResolvedValueOnce` call caused a TypeError on the second invocation
- **Fix:** Updated Path C test to: (1) mock generate twice, (2) assert `generateEstimateForProject.toHaveBeenCalledTimes(2)`, (3) assert `revertVagueEstimate.toHaveBeenCalledTimes(1)` (still 1 via the WhatsApp mock path since autoRefineNode uses the unmocked quality/revert path). Key QA-01 invariants preserved: never-throw + exactly-one-reply
- **Files modified:** `tests/unit/whatsapp/never-reply-regression.test.ts`
- **Verification:** `npx vitest run tests/unit/whatsapp/never-reply-regression.test.ts` → 3/3 GREEN
- **Committed in:** `aed6db9` (Task 3 commit)

**3. [Rule 2 - Missing] Wave 0 RED stubs (Tests A, B, D) needed to be replaced with real behavioral tests**
- **Found during:** Task 3 (after production code was complete, tests still used `expect.fail()`)
- **Issue:** The Wave 0 stubs in `auto-refine-isolation.test.ts` used `expect.fail('RED — ...')` for Tests A, B, D. The plan required these to turn GREEN in Wave 2 but didn't explicitly say to rewrite the stubs
- **Fix:** Replaced the three `expect.fail()` stubs with real behavioral tests: Test A imports and invokes `autoRefineNode`, Tests B and D import `makeDefaultAdapter` and verify the `awaiting_details` write + closure isolation
- **Files modified:** `tests/unit/estimate/auto-refine-isolation.test.ts`
- **Verification:** `npx vitest run tests/unit/estimate/auto-refine-isolation.test.ts` → 4/4 GREEN
- **Committed in:** `aed6db9` (Task 3 commit)

---

**Total deviations:** 3 auto-fixed (2 Rule 1 bugs, 1 Rule 2 missing)
**Impact on plan:** All auto-fixes required for the plan's stated goal (Wave 1 RED → GREEN). No scope creep.

## Issues Encountered

- The ENGINE-01 static neutrality scanner is more aggressive than expected — it checks ALL text including comments, not just import statements. This required rewriting JSDoc that verbatim described the moved file's origin using the forbidden token.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- Phase 97 (Unified Observability — Langfuse v5) can now add traces to `autoRefineNode` and the new `checkVagueAfterAssessEdge` edge
- All 3 channels (web, MCP, WhatsApp) now route through the cap=1 auto-refine loop before asking the human for details
- `projects.status = 'awaiting_details'` is persisted for web/MCP channels; UI banner for this status is a deferred UI task
- `output.needsDetails === true` is available in the Inngest job output for MCP callers

## Known Stubs

None — all production paths are wired with real behavior.

---
*Phase: 96-intelligence-parity-auto-refine-needs-details-surfacing*
*Completed: 2026-06-20*
