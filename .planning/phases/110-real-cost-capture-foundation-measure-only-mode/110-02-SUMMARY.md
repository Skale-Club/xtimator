---
phase: 110-real-cost-capture-foundation-measure-only-mode
plan: 02
subsystem: ai-cost-capture
tags: [openrouter, cost-capture, never-throw, measure-only, langgraph, costContext, tdd, vitest]

# Dependency graph
requires:
  - phase: 110-real-cost-capture-foundation-measure-only-mode
    provides: never-throw recordAICost(ev: AICostInput) + AICostInput contract (Plan 110-01)
provides:
  - "Real USD cost capture at the OpenRouter estimate adapter (generate/refine) via json.usage.cost — null when absent, never 0"
  - "Cost capture at the vision + translation OpenRouter client call sites"
  - "Non-LLM costContext seam: EstimateInput.costContext threaded Inngest job → graph state (attemptId) → generate node → service → adapter"
affects: [112-credit-ledger, 116-calibration]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Cost capture as a fire-and-forget side effect (void recordAICost(...)) alongside the existing Langfuse gen.end block — return signature unchanged"
    - "Correlation context (attemptId/companyId/projectId) rides INSIDE EstimateInput.costContext — never derived from parsed LLM output, never widens AIProvider.generateEstimate"
    - "Channel-neutral attemptId graph annotation (carries no channel token; graph-neutrality gate stays green)"

key-files:
  created:
    - tests/unit/ai/openrouter-cost-capture.test.ts
  modified:
    - lib/ai/types.ts
    - lib/estimate/graph/state.ts
    - lib/estimate/graph/nodes/generate.ts
    - lib/services/generate-estimate.ts
    - lib/inngest/functions/generate-estimate.ts
    - lib/ai/providers/openrouter.ts
    - lib/ai/openrouter-client.ts

key-decisions:
  - "Read json.usage.cost inline (returned automatically) — NO usage:{include:true} flag, NO /api/v1/generation round-trip (both deprecated/redundant per RESEARCH Pitfall 1)"
  - "realCostUsd = json.usage?.cost ?? null — unknown cost is null, never 0 (preserves calibration's null-vs-0 discipline from Plan 01)"
  - "costContext threads via EstimateInput, not the AIProvider signature — vision/translation take an optional trailing costContext param instead"
  - "Refine path passes no costContext (generate is the COST-01 primary path); cost still captured with a randomUUID attemptId"
  - "Wiring real attemptId/companyId into the vision/translation callers DEFERRED — the optional param captures cost with null ids today; correlation degrades gracefully"

requirements-completed: [COST-01]

# Metrics
duration: 6min
completed: 2026-06-24
---

# Phase 110 Plan 02: OpenRouter Real Cost Capture + costContext Threading Summary

**Captures the real USD cost of every OpenRouter call by reading `json.usage.cost` (null when absent, never 0) at the estimate adapter + vision + translation sites, recorded via the never-throw `recordAICost()`, with a non-LLM `costContext` seam threaded Inngest job → graph state → service → `EstimateInput`.**

## Performance

- **Duration:** ~6 min
- **Tasks:** 3 (one TDD)
- **Files:** 1 created, 7 modified

## Accomplishments
- **Correlation seam (Task 1):** added optional `costContext` (attemptId/companyId/projectId) to `EstimateInput` and `GenerateEstimateOptions`; a channel-neutral `attemptId` annotation on the estimate graph state; threaded `attemptId` into `graph.invoke` from the Inngest job; built `costContext` from trusted state in the generate node (never any `parsed`/LLM value) and set it on `estimateInput`. Every field optional/additive — no existing caller breaks; `AIProvider.generateEstimate` signature unchanged.
- **Estimate cost capture (Task 2, TDD):** `OpenRouterChatResponse.usage` extended with `cost`/`cost_details`; `callTool` threads `costContext` from `generateEstimate`; `void recordAICost({ operationType:'estimate', realCostUsd: json.usage?.cost ?? null, … })` placed alongside the existing Langfuse `gen.end` block. RED → GREEN with 5 assertions (cost present → value, absent → null, usage entirely absent → null, no `usage`/`stream_options` flag + no `/api/v1/generation` fetch, correlation from `costContext` not parsed output).
- **Vision + translation cost capture (Task 3):** `analyzePhotoOR` (operationType `vision`) and `translateTextsOR` (operationType `translation`) each extend their inline `json` type with `usage.cost`, take an optional trailing `costContext` param, and `void recordAICost(... ?? null)` after the successful parse.

## Task Commits

1. **Task 1: costContext threading seam** — `22cc3d9b` (feat)
2. **Task 2: OpenRouter estimate cost capture (TDD)** — `3d3268de` (test, RED) → `704c9a27` (feat, GREEN)
3. **Task 3: vision + translation cost capture** — `fb709ba` (feat)

## Files Created/Modified
- `tests/unit/ai/openrouter-cost-capture.test.ts` — 5 assertions pinning estimate cost capture (value/null/null, no-flag + no-generation-call, costContext correlation not LLM output).
- `lib/ai/types.ts` — optional `costContext?` on `EstimateInput`.
- `lib/estimate/graph/state.ts` — channel-neutral `attemptId` annotation.
- `lib/estimate/graph/nodes/generate.ts` — build `costContext` from trusted state into `opts` (both branches).
- `lib/services/generate-estimate.ts` — `costContext?` on `GenerateEstimateOptions`; set on `estimateInput` from trusted params.
- `lib/inngest/functions/generate-estimate.ts` — pass `attemptId` into `graph.invoke` input.
- `lib/ai/providers/openrouter.ts` — `usage.cost` type, `costContext` through `callTool`, `void recordAICost` in the parse/Langfuse block.
- `lib/ai/openrouter-client.ts` — `usage.cost` types + `void recordAICost` for vision + translation; optional `CostContext` params.

## Decisions Made
- Inline `usage.cost` only — no `usage:{include:true}` flag, no `/api/v1/generation` lookup (both verified absent via grep).
- `?? null` everywhere on cost — never `?? 0`, preserving the calibration null-vs-0 discipline.
- `costContext` rides inside `EstimateInput`; the AIProvider interface and `EstimateOutput` return type are untouched.

## Deviations from Plan

None — plan executed exactly as written. The 3 tasks landed with their specified acceptance criteria; the only judgment calls (refine → null ids, vision/translation callers not yet threading real ids) were explicitly sanctioned by the plan's scope notes.

## Follow-up (documented, in-scope per the plan's Task 3 scope note)
- **Vision/translation caller wiring:** `analyzePhotoOR`/`translateTextsOR` now accept an optional `costContext`, but the `analyze-photos` Inngest job and the translation callers do NOT yet pass real `attemptId`/`companyId`. Cost is still captured today (with null ids + a `randomUUID` attemptId), so correlation degrades gracefully. Threading the real ids from `lib/inngest/functions/analyze-photos.ts` (which has them) is a cheap 1-line arg pass for a later plan — not expanded here to avoid the analyze-photos batch refactor the plan explicitly fenced off.

## Verification
- `npx vitest run tests/unit/ai tests/unit/estimate` → **38 files / 249 tests passed** (new cost test green; graph-neutrality gate intact).
- `npx tsc --noEmit` → clean across all 7 modified source files + the new test (the ~7 pre-existing repo-wide errors are long-standing tsconfig/es2018 + `price_research.set` AuditAction mismatches in unrelated files, logged previously; CI uses scoped `tsconfig.ci.json`).
- Grep `usage:\s*\{\s*include` across `openrouter.ts` + `openrouter-client.ts` → NOTHING (no deprecated flag).
- Grep `api/v1/generation` → NOTHING (no second-call cost lookup).
- Grep `cost \?\? 0` → NOTHING (null discipline preserved).

## Known Stubs
None. The optional `costContext` on the vision/translation sites is an intentional additive seam (cost captured today with null ids); it is a documented follow-up above, not a placeholder that blocks COST-01.

## Self-Check: PASSED

All commits present in git history; the created test file exists on disk and is green. See the explicit self-check block appended below.

---
*Phase: 110-real-cost-capture-foundation-measure-only-mode*
*Completed: 2026-06-24*
