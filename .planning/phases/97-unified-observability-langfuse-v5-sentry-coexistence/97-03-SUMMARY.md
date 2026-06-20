---
phase: 97
plan: 03
subsystem: observability
tags: [langfuse, langchain-callback, tracing, estimate-graph, whatsapp, inngest]
dependency_graph:
  requires: [97-02]
  provides: [OBS-01-web, OBS-01-whatsapp, OBS-03-web, OBS-03-whatsapp]
  affects: [lib/inngest/functions/generate-estimate.ts, lib/whatsapp/estimate-graph.ts, lib/inngest/functions/whatsapp-process.ts, lib/inngest/events.ts, lib/mcp/tools/write.ts]
tech_stack:
  added: ["@langfuse/langchain CallbackHandler"]
  patterns: ["callbacks: [handler] passed as second arg to graph.invoke", "langfuseProcessor?.forceFlush() inside step.run before return"]
key_files:
  created: []
  modified:
    - lib/inngest/functions/generate-estimate.ts
    - lib/whatsapp/estimate-graph.ts
    - lib/inngest/functions/whatsapp-process.ts
    - lib/inngest/events.ts
    - lib/mcp/tools/write.ts
decisions:
  - "CallbackHandler from @langfuse/langchain attached as second arg (callbacks array) to all graph.invoke call sites"
  - "forceFlush() called inside step.run before returning to prevent span loss on serverless suspension (OBS-03 / Pitfall 3)"
  - "Safe-metadata rule v4.2 enforced: only project/company IDs in handler metadata — no sensitive tokens"
metrics:
  duration_minutes: 25
  completed_date: "2026-06-20"
  tasks_completed: 4
  files_modified: 5
---

# Phase 97 Plan 03: CallbackHandler at All graph.invoke Sites Summary

Wave 3 of Phase 97 attaches `CallbackHandler` from `@langfuse/langchain` at every `graph.invoke` call site across all channels (web, MCP, WhatsApp), and calls `langfuseProcessor?.forceFlush()` inside each `step.run` before returning. This ensures full Langfuse observability coverage with zero span loss in serverless environments.

## What Was Built

### Task 1 (committed d19a2bb — prior session)
- Added `channel?: 'web' | 'mcp' | 'whatsapp'` field to `EstimateGeneratePayload` in `lib/inngest/events.ts`
- Added `channel: data.channel ?? 'web'` dispatch in `lib/mcp/tools/write.ts` so MCP calls carry their channel discriminator

### Task 2 (committed fe8465d + 4a4fce0)
- Added `CallbackHandler` import from `@langfuse/langchain` and `langfuseProcessor` from `@/instrumentation` to `lib/inngest/functions/generate-estimate.ts`
- Instantiated `CallbackHandler` with safe metadata (`langfuseSessionId: "${channel}:${projectId}"`, `langfuseUserId: companyId`) and tags `[traceChannel, 'estimate-engine']`
- Passed `{ callbacks: [handler] }` as second arg to `graph.invoke` inside `step.run('orchestrate-estimate')`
- Called `langfuseProcessor?.forceFlush()` after invoke and before returning from `step.run`
- Deviation fix (4a4fce0): rewrote a comment that contained the word "transcript" adjacent to `langfuseSessionId`, which caused the OBS-03 dotAll regex test to false-positive across lines

### Task 3 (committed b89cb2f)
- Added `CallbackHandler` import to `lib/whatsapp/estimate-graph.ts`
- Instantiated handler with `langfuseSessionId: "whatsapp:${projectId}"`, `langfuseUserId: companyId`, tags `['whatsapp', 'estimate-engine']`
- Passed `{ callbacks: [handler] }` as second arg to inner `graph.invoke` (the call to `buildSharedEstimateGraph(adapter).invoke(...)`)

### Task 4 (committed d9afae8)
- Added `langfuseProcessor` import to `lib/inngest/functions/whatsapp-process.ts`
- Captured `graph.invoke(...)` result before flush
- Called `langfuseProcessor?.forceFlush()` inside `step.run('orchestrate-estimate')` after invoke and before returning

## Commit History

| Task | Commit  | Message |
|------|---------|---------|
| T1   | d19a2bb | feat(phase-97-w3): add channel field to EstimateGeneratePayload + MCP dispatch |
| T2   | fe8465d | feat(phase-97-w3): attach CallbackHandler at web/MCP graph.invoke + forceFlush |
| T2fx | 4a4fce0 | fix(phase-97-w3): reword safe-metadata comment to avoid regex false-positive (OBS-03) |
| T3   | b89cb2f | feat(phase-97-w3): attach CallbackHandler at WhatsApp graph.invoke (OBS-01) |
| T4   | d9afae8 | feat(phase-97-w3): wire forceFlush in whatsapp-process.ts (OBS-03 WhatsApp channel) |

## Test Results

Final run: `npx vitest run tests/unit/estimate/observability.test.ts tests/unit/inngest/generate-estimate-job.test.ts`

```
Test Files  2 passed (2)
     Tests  12 passed (12)
```

- OBS-01 web (generate-estimate.ts imports/instantiates CallbackHandler + passes callbacks): GREEN
- OBS-01 web (channel discriminator in handler metadata): GREEN
- OBS-01 whatsapp (estimate-graph.ts imports/instantiates CallbackHandler): GREEN
- OBS-01 whatsapp (passes callbacks to graph.invoke): GREEN
- OBS-03 (generate-estimate.ts no forbidden tokens): GREEN
- OBS-03 (estimate-graph.ts no forbidden tokens): GREEN
- OBS-03 (projectId and companyId as only identifiers): GREEN
- QA-03 generate-estimate-job tests: GREEN (5/5)

## Security Confirmation

Safe-metadata rule v4.2 enforced across all three handler construction sites:
- Only `projectId` and `companyId` appear in `metadata` and `tags`
- No transcript content, audio data, raw_content, apiKey, or session tokens present
- Verified by OBS-03 source-text anchor tests (all passing)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] OBS-03 regex false-positive from comment wording**
- **Found during:** Task 2 test run
- **Issue:** Comment "no transcript/audio/key tokens" placed 4 lines above `langfuseSessionId` in generate-estimate.ts. The OBS-03 test uses `/transcript.*langfuseSessionId/s` (dotAll mode), which matches across lines — the word "transcript" in the comment + `langfuseSessionId` on line 117 triggered a false failure.
- **Fix:** Rewrote comment to "only project/company IDs allowed — no sensitive data" — removes the word "transcript" from proximity to the property name.
- **Files modified:** `lib/inngest/functions/generate-estimate.ts`
- **Commit:** 4a4fce0

## Known Stubs

None — all handler wiring is fully functional with live Langfuse credentials from environment variables.

## Self-Check: PASSED

- `lib/inngest/functions/generate-estimate.ts`: FOUND (verified contents)
- `lib/whatsapp/estimate-graph.ts`: FOUND (verified contents)
- `lib/inngest/functions/whatsapp-process.ts`: FOUND (verified contents)
- Commit d19a2bb: FOUND
- Commit fe8465d: FOUND
- Commit 4a4fce0: FOUND
- Commit b89cb2f: FOUND
- Commit d9afae8: FOUND
- All 12 tests passing
