---
phase: 95-migrate-web-mcp-onto-the-shared-graph-generate-only-passthrough
plan: "01"
subsystem: inngest-jobs/test
tags: [tdd, wave-0, inngest, generate-estimate, graph-migration, red-green]
dependency_graph:
  requires: []
  provides: [CHAN-02-test-anchor, QA-03-behavioral-test]
  affects: [tests/unit/inngest/generate-estimate-job.test.ts]
tech_stack:
  added: []
  patterns: [source-text-anchor-test, vi-mock-hoisting, tdd-red-green]
key_files:
  created: []
  modified:
    - tests/unit/inngest/generate-estimate-job.test.ts
decisions:
  - "Wave 0 RED state is intentional: anchor tests for orchestrate-estimate/buildEstimateGraph/makeDefaultAdapter fail until Plan 02 production changes land"
  - "QA-03 uses mock isolation (graph stub does not call through to generateEstimateForProject) so fromCalls array cleanly verifies no whatsapp_sessions writes"
  - "All vi.mock calls are top-level hoisted (Vitest requirement) before any dynamic imports"
metrics:
  duration: "~5 minutes"
  completed: "2026-06-20T18:20:07Z"
  tasks_completed: 1
  files_modified: 1
---

# Phase 95 Plan 01: Update generate-estimate-job Anchors + QA-03 Behavioral Test (Wave 0) Summary

**One-liner:** TDD Wave 0 scaffold — anchor tests updated from `call-ai-provider` to `orchestrate-estimate` and QA-03 behavioral isolation test added; 1/4 tests intentionally RED until Plan 02 production changes land.

## What Was Done

Rewrote `tests/unit/inngest/generate-estimate-job.test.ts` to serve as the executable specification for Plan 02 (Wave 2 production changes). The file was reorganized from one `describe` block into three, adding module mocks and a new behavioral test.

### Changes Made

**Anchor string updates (CHAN-02 — start RED, go GREEN in Plan 02):**
- Test 2 description changed from "wraps generateEstimateForProject in step.run('call-ai-provider', ...)" to "invokes shared graph via step.run('orchestrate-estimate', ...)"
- `step.run('call-ai-provider')` regex replaced with `step.run('orchestrate-estimate')`
- `generateEstimateForProject\s*\(` assertion replaced with `buildEstimateGraph\(`
- `makeDefaultAdapter\(` assertion added
- IndexOf ordering check removed (no longer relevant post-graph-delegation)

**record-usage test (unchanged — stays GREEN):**
- `step.run('record-usage')` and `recordUsage\s*\(` assertions preserved
- `stepRunCount >= 2` assertion preserved

**New QA-03 behavioral test:**
- Mocks: `@/lib/services/generate-estimate`, `@/lib/estimate/adapters/default`, `@/lib/estimate/graph`, `@/lib/supabase/service` (with `fromCalls` tracking array), `@/lib/quota`, `@/lib/notifications/dispatch`, `@/lib/notifications/copy`, `@/lib/observability/pipeline-events`, `@/lib/inngest/client`
- Invokes graph instance stub directly (mirrors what Inngest step would do)
- Asserts `fromCalls` does not contain `'whatsapp_sessions'`
- Asserts `generateEstimateForProject` call count is `<= 1` (mock isolation)

## Test Results After Plan 01

```
tests/unit/inngest/generate-estimate-job.test.ts (4 tests | 1 failed)
  ✓ INNGEST-02 + INNGEST-06: function config (id, idempotency, retries)
  ✗ CHAN-02: invokes shared graph via step.run("orchestrate-estimate") — RED (expected)
  ✓ CHAN-02: still wraps recordUsage in SEPARATE step.run("record-usage")
  ✓ QA-03: non-vague web happy path — zero whatsapp_sessions rows
```

**The 1 failing test is intentional** — `generate-estimate.ts` still contains `step.run('call-ai-provider', ...)` until Plan 02 renames it and adds `buildEstimateGraph`/`makeDefaultAdapter` imports.

## Deviations from Plan

None — plan executed exactly as written.

The action block in the plan specified exact file content. Comments containing `call-ai-provider` were removed (plan acceptance criteria required zero occurrences of `call-ai-provider` in the file, including comments).

## Acceptance Criteria Verification

| Criterion | Result |
|-----------|--------|
| File contains `orchestrate-estimate` | PASS (4 occurrences) |
| File contains `buildEstimateGraph(` | PASS (1 occurrence) |
| File contains `makeDefaultAdapter(` | PASS (1 occurrence) |
| File contains `whatsapp_sessions` | PASS (6 occurrences) |
| File contains `QA-03` | PASS (4 occurrences) |
| File does NOT contain `call-ai-provider` | PASS (0 occurrences) |
| `record-usage` step assertion exists | PASS (2 occurrences) |
| File does not import `@/lib/whatsapp/` | PASS (0 occurrences) |
| At least 1 FAILING test (anchor is RED) | PASS (1 failing: CHAN-02 orchestrate-estimate anchor) |

## Self-Check: PASSED

- File exists: `tests/unit/inngest/generate-estimate-job.test.ts` — FOUND
- Commit exists: `c07aa64` — FOUND (`git log --oneline -1` confirms)
- RED test is correct failure (asserts `orchestrate-estimate` but production still has `call-ai-provider`) — CONFIRMED
