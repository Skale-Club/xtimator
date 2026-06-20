---
phase: 95-migrate-web-mcp-onto-the-shared-graph-generate-only-passthrough
plan: "02"
subsystem: estimate-engine
tags:
  - inngest
  - estimate-graph
  - channel-adapter
  - web
  - mcp
dependency_graph:
  requires:
    - 95-01 (anchor tests for buildEstimateGraph + makeDefaultAdapter + orchestrate-estimate)
  provides:
    - web Inngest job routes through shared estimate graph
    - MCP inherits via EVENT_ESTIMATE_GENERATE dispatch (zero code changes)
    - onError re-throw triggers Inngest retry + onFailure on generation failure
  affects:
    - lib/inngest/functions/generate-estimate.ts
    - lib/estimate/adapters/default.ts
tech_stack:
  added: []
  patterns:
    - "whole-graph-in-one-step.run (DURABLE-02)"
    - "ChannelAdapter closure-factory (makeDefaultAdapter)"
    - "failure-as-state → adapter re-throw → Inngest onFailure"
key_files:
  created: []
  modified:
    - lib/estimate/adapters/default.ts
    - lib/inngest/functions/generate-estimate.ts
decisions:
  - "D-02: web/MCP adapter onError re-throws; Inngest handles retry + onFailure"
  - "D-01: whole graph.invoke in one step.run('orchestrate-estimate') per DURABLE-02"
  - "D-07: estimateLanguage (not language) is the graph state field name for the language preference"
  - "D-04: MCP inherits automatically via EVENT_ESTIMATE_GENERATE — zero code changes to lib/mcp/tools/write.ts"
metrics:
  duration: "6m 32s"
  completed: "2026-06-20"
  tasks_completed: 3
  files_changed: 2
---

# Phase 95 Plan 02: Wire Shared Graph into Web Inngest Job — Summary

**One-liner:** Surgical two-file change routes the web `generate-estimate` Inngest job through `buildEstimateGraph(makeDefaultAdapter({companyId,supabase})).invoke(...)` inside `step.run('orchestrate-estimate', ...)`, and updates the default adapter `onError` to re-throw so Inngest retry + `onFailure` fires on generation failure.

---

## What Was Built

### Task 1 — `lib/estimate/adapters/default.ts`: onError re-throw (D-02)

Changed the Phase 94 no-op stub to re-throw:

```typescript
// Before (Phase 94 stub):
async onError(_state: EstimateStateType): Promise<Partial<EstimateStateType>> {
  return {}
}

// After (Phase 95 D-02):
async onError(state: EstimateStateType): Promise<Partial<EstimateStateType>> {
  throw new Error(state.failure?.reason ?? 'generation_failed')
}
```

Parameter renamed `_state` → `state` (underscore convention is for unused parameters; this method now uses the parameter). `ingest` and `finalize` stubs remain unchanged (D-05, D-06). JSDoc updated to reflect D-02 decision.

**Commit:** `b082fa6`

### Task 2 — `lib/inngest/functions/generate-estimate.ts`: graph.invoke wiring (D-01, D-07)

**Imports added:**
```typescript
import { makeDefaultAdapter } from '@/lib/estimate/adapters/default'
import { buildEstimateGraph } from '@/lib/estimate/graph'
```

**Import removed:** `generateEstimateForProject` from `@/lib/services/generate-estimate` — no longer called directly in this file (the graph's `generate` node calls it internally).

**Step replaced:**
```typescript
// Before:
const result = await step.run('call-ai-provider', async () => {
  return await generateEstimateForProject(companyId, projectId, {
    language: language ?? undefined,
    prompts: prompts && prompts.length > 0 ? prompts : undefined,
  })
})

// After:
const result = await step.run('orchestrate-estimate', async () => {
  const supabase = requireServiceClient()
  const adapter = makeDefaultAdapter({ companyId, supabase })
  const graph = buildEstimateGraph(adapter)
  return graph.invoke({
    companyId,
    projectId,
    channel: 'web',
    prompts: prompts && prompts.length > 0 ? prompts : undefined,
    estimateLanguage: language ?? undefined,
  })
})
```

Key field mapping: event payload `language` → graph state `estimateLanguage` (Pitfall 3 from RESEARCH.md). All other code (`record-usage` step, `estimateId` extraction, `recordPipelineEvent` calls, notifications, `loadOwnerUserId`) is unchanged.

**Commit:** `5a4c486`

### Task 3 — Static Verification

- All targeted phase tests: 58/58 GREEN (17 test files)
- Full suite: 1530/1540 GREEN (same 10 pre-existing failures in `landing-actions`, `onboarding-survey`, `theme-toggle` — confirmed pre-existing by running against clean HEAD)
- `git diff lib/mcp/tools/write.ts` → zero output (CHAN-03)
- `git diff lib/whatsapp/` → zero output (CHAN-04)
- No `call-ai-provider` string in generate-estimate.ts or its test file

---

## Decisions Made

| Decision | Rationale |
|----------|-----------|
| D-02: onError re-throws | Web/MCP have no conversational reply target; the only way to signal terminal failure to Inngest is to throw from `step.run`. The never-throw invariant applies to CORE nodes only; adapter edge nodes are allowed to throw. |
| D-01: whole graph in one step.run | Mirrors whatsapp-process.ts (DURABLE-02); Inngest is the sole durability layer. `record-usage` stays a separate step for independent retry on DB failure. |
| D-07: estimateLanguage not language | Event payload field is `language`; graph state field is `estimateLanguage`. The mapping is explicit in the call-site. |
| D-04: MCP zero code changes | MCP already dispatches `EVENT_ESTIMATE_GENERATE` → same Inngest job. Once the job uses the shared graph, MCP inherits automatically. CHAN-03 satisfied with zero new MCP code. |

---

## Test Results

| Suite | Files | Tests | Status |
|-------|-------|-------|--------|
| `tests/unit/inngest/` | 8 | 29 | GREEN |
| `tests/unit/estimate/` | 7 | 21 | GREEN |
| `tests/unit/whatsapp/never-reply-regression.test.ts` | 1 | 8 (approx) | GREEN |
| Full suite | 220 | 1530 | GREEN (pre-existing 10 failures in unrelated component tests) |

Wave 1 anchor tests (previously RED) now GREEN:
- `generate-estimate-job.test.ts` → all assertions on `orchestrate-estimate`, `buildEstimateGraph`, `makeDefaultAdapter`, QA-03 behavioral test pass

---

## Deviations from Plan

None — plan executed exactly as written.

---

## Known Stubs

None — all stubs are intentional passthroughs documented in the plan (D-05: `ingest` returns `{}`, D-06: `finalize` returns `{}`). These are carry-forwards to Phase 96 where vagueness surfacing is added.

---

## Phase 95 Requirements Satisfied

| Req | Behavior | Status |
|-----|----------|--------|
| CHAN-02 | `generate-estimate` Inngest job invokes `buildEstimateGraph(makeDefaultAdapter(...))` via `step.run('orchestrate-estimate', ...)` | SATISFIED |
| CHAN-03 | MCP inherits via `EVENT_ESTIMATE_GENERATE` — zero `lib/mcp/tools/write.ts` changes | SATISFIED |
| CHAN-04 | All three channels produce equivalent output; no channel regresses; existing suites GREEN | SATISFIED |
| QA-03 | Non-vague web happy path: exactly 1 AI call, zero whatsapp rows, `graph.invoke` resolves | SATISFIED |

## Self-Check: PASSED

Files exist:
- `lib/estimate/adapters/default.ts` — FOUND
- `lib/inngest/functions/generate-estimate.ts` — FOUND
- `.planning/phases/95-migrate-web-mcp-onto-the-shared-graph-generate-only-passthrough/95-02-SUMMARY.md` — FOUND

Commits exist:
- `b082fa6` — fix(95-02): update default adapter onError to re-throw per D-02
- `5a4c486` — feat(95-02): wire generate-estimate Inngest job through shared graph (D-01, D-07)
