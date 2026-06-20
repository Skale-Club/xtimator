# Phase 95: Migrate Web + MCP onto the Shared Graph (generate-only passthrough) — Research

**Researched:** 2026-06-20
**Domain:** Inngest job migration + LangGraph graph.invoke type surface + Vitest source-text anchor tests
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Whole `graph.invoke(...)` call goes inside ONE `step.run('orchestrate-estimate', ...)`, mirroring `lib/inngest/functions/whatsapp-process.ts`. Existing two-step split (`call-ai-provider` + `record-usage`) becomes `orchestrate-estimate` + `record-usage`.
- **D-02:** `onError` in web/MCP adapter re-throws so Inngest retry/onFailure fires. The never-throw invariant is for CORE nodes only; adapter edge nodes are allowed to throw.
- **D-03:** `recordUsage` / `recordPipelineEvent` stay in the Inngest wrapper outside the graph, reading `result?.estimateId` from graph return state.
- **D-04:** MCP inherits via `EVENT_ESTIMATE_GENERATE` dispatch — ZERO code changes to `lib/mcp/tools/write.ts`.
- **D-05:** `ingest` stays pure passthrough `return {}`.
- **D-06:** `finalize` stays no-op `return {}`.
- **D-07:** Exact call-site in `generateEstimateJob` uses `makeDefaultAdapter` + `buildEstimateGraph`.

### Claude's Discretion

- Exact `estimateId` extraction from graph return state (`result?.estimateId` or `(result as EstimateStateType)?.estimateId`).
- Whether to alias `step.run` return type via a cast or use a typed wrapper.
- Whether `recordPipelineEvent` extracts `estimateId` from graph return or from a prior separate query.
- Order of `load_owner_userId` call relative to the new `step.run` (keep it before, as today).

### Deferred Ideas (OUT OF SCOPE)

- Vagueness surfacing on web (`awaiting_details` state, non-blocking UI prompt) → Phase 96
- Auto-refine → Phase 96
- MCP structured `needs_details` status → Phase 96
- Langfuse traces per channel → Phase 97
- `ingest` guard for "has usable input" → deferred (duplicate of existing guard in `generateEstimateForProject`)
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| CHAN-02 | Web generation path (`generate-estimate` Inngest job) consumes the shared graph, entering at the `generate` node. The graph's `ingest` node is a passthrough guard when transcripts/descriptions already exist. | D-07 call-site pattern; `buildEstimateGraph(makeDefaultAdapter(...))` factory is ready; `ingest` passthrough already coded in `lib/estimate/adapters/default.ts`. |
| CHAN-03 | MCP `create_estimate` runs through the same shared graph (inherits the web path — no new dispatch contract, still `job_id` + poll). | `lib/mcp/tools/write.ts` already dispatches `EVENT_ESTIMATE_GENERATE`; same Inngest job handles both; D-04 zero-code-change. |
| CHAN-04 | Behavior parity verified — all three channels produce equivalent estimate output for equivalent inputs; no channel regresses. | Source-text anchor tests plus the existing `graph-neutrality.test.ts` and `never-reply-regression.test.ts` must stay green; new QA-03 test per-requirement. |
| QA-03 | The deterministic happy path stays at exactly 1 AI call per generation — no surprise extra AI calls on the non-vague web fast path. No `whatsapp_*` rows are written. | The generate node uses `passthroughRunner` by default (no extra calls); `ingest`/`finalize` are no-ops so no WhatsApp DB writes can occur. Test mocks `generateEstimateForProject` and asserts call count = 1 + zero `from('whatsapp_sessions')` calls. |
</phase_requirements>

---

## Summary

Phase 95 is a surgical rewiring of one Inngest job file (`lib/inngest/functions/generate-estimate.ts`) and a one-line update to `lib/estimate/adapters/default.ts`. The Phase 94 foundation (shared graph, `ChannelAdapter` contract, `makeDefaultAdapter` stub) is confirmed present and green. The web/MCP path gains the shared engine by replacing the direct `generateEstimateForProject` call with `buildEstimateGraph(makeDefaultAdapter(...)).invoke(...)` inside a renamed `step.run('orchestrate-estimate', ...)`, exactly mirroring what `whatsapp-process.ts` already does.

The MCP channel inherits the change for free: `lib/mcp/tools/write.ts` dispatches `EVENT_ESTIMATE_GENERATE`, which routes to the same Inngest job. Zero code change to MCP. The `lib/estimate/adapters/default.ts` needs only one addition: `onError` must re-throw so Inngest's `onFailure` / retry pipeline fires (D-02).

The most consequential implementation details are: (1) the return type of `graph.invoke` is `EstimateStateType` (from `Annotation.Root`), so `result.estimateId` is typed and safe to read directly; (2) the step-id rename from `call-ai-provider` to `orchestrate-estimate` is safe because there is no LangGraph checkpointer and no in-flight job resumes mid-graph; (3) the existing `generate-estimate-job.test.ts` anchors on `'call-ai-provider'` and must be updated to `'orchestrate-estimate'` as part of this phase.

**Primary recommendation:** Two files change in production code; one test file needs anchor string updates; one new test file covers CHAN-02/CHAN-03/CHAN-04/QA-03.

---

## Standard Stack

### Core (unchanged — already installed)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@langchain/langgraph` | already installed (Phase 94) | `buildEstimateGraph`, `graph.invoke` | The shared graph is already built on this; no new install |
| `inngest` | already installed (Phase 67) | `step.run`, Inngest job wrapper | Sole durability layer (DURABLE-02) |
| `@supabase/supabase-js` | already installed | `requireServiceClient()` inside `makeDefaultAdapter` | Service-role DB access in Inngest context |

No new package installations required for Phase 95.

---

## Architecture Patterns

### Pattern 1: Whole Graph in One `step.run` (D-01 / DURABLE-02)

**What:** The entire `graph.invoke(...)` call runs inside a single `step.run('orchestrate-estimate', ...)` block. Inngest checkpoints around the whole graph; internal node transitions are not individually retried (no LangGraph checkpointer).

**When to use:** All three channels follow this pattern. WhatsApp already does it.

**Template (from `lib/inngest/functions/whatsapp-process.ts` lines 80-95):**
```typescript
// Source: lib/inngest/functions/whatsapp-process.ts
return await step.run('orchestrate-estimate', async () => {
  const { buildEstimateGraph } = await import('@/lib/whatsapp/estimate-graph')
  const graph = buildEstimateGraph()
  return await graph.invoke({ companyId, projectId, channel: 'whatsapp', ... })
})
```

**Web/MCP adaptation (D-07):**
```typescript
// Source: 95-CONTEXT.md D-07
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

### Pattern 2: `onError` Re-throws for Web/MCP (D-02)

**What:** The `onError` method in the web/MCP `ChannelAdapter` must re-throw instead of returning `{}`. This propagates the failure out of `step.run('orchestrate-estimate', ...)` → Inngest sees the step fail → retry + `onFailure` fires.

**Current state (Phase 94 stub):**
```typescript
// lib/estimate/adapters/default.ts (current — needs update)
async onError(_state: EstimateStateType): Promise<Partial<EstimateStateType>> {
  return {}
}
```

**Phase 95 update:**
```typescript
// lib/estimate/adapters/default.ts (Phase 95 target)
async onError(state: EstimateStateType): Promise<Partial<EstimateStateType>> {
  throw new Error(state.failure?.reason ?? 'generation_failed')
}
```

### Pattern 3: `estimateId` Extraction from Graph State

**What:** `graph.invoke()` returns `EstimateStateType` (the full state object from `Annotation.Root`). The `estimateId` field is typed directly on this object.

**Type evidence (from `lib/estimate/graph/state.ts`):**
```typescript
export const EstimateState = Annotation.Root({
  estimateId: Annotation<string | undefined>(),
  // ...
})
export type EstimateStateType = typeof EstimateState.State
```

**Confirmed field access pattern (from generate-estimate.ts current):**
```typescript
// Current pattern (Phase 92) reads result with a type cast:
const estimateId =
  (result as { estimateId?: string | null } | null)?.estimateId ?? null
```

**Phase 95 pattern:** Since the graph returns `EstimateStateType`, `result.estimateId` is directly typed. However, `step.run` in Inngest serializes/deserializes output through JSON, so the return type of `step.run(...)` is effectively `unknown` at runtime. The safe pattern is:

```typescript
const result = await step.run('orchestrate-estimate', async () => { ... })
// result is typed as the serialized return — safe access:
const estimateId = (result as EstimateStateType | null)?.estimateId ?? null
```

This mirrors the existing `(result as { estimateId?: string | null } | null)?.estimateId ?? null` pattern already in the file.

### Anti-Patterns to Avoid

- **Anti-pattern: `ingest` checking for usable input.** D-05 locks `ingest` as a pure passthrough `return {}`. Adding a "has usable input" check would be a behavior change and is explicitly deferred to Phase 96.
- **Anti-pattern: writing any `whatsapp_*` row in the web/MCP adapter.** `finalize` and `ingest` return `{}`; `onError` throws. No DB side-effects in the default adapter.
- **Anti-pattern: importing anything from `lib/whatsapp/` in `lib/estimate/adapters/default.ts`.** This would break the `graph-neutrality.test.ts` guard.
- **Anti-pattern: forgetting to pass `estimateLanguage` from the event payload.** The event payload field is `language`; the graph state field is `estimateLanguage`. Mapping: `estimateLanguage: language ?? undefined`.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Graph state return type | Custom result wrapper | Read `result.estimateId` directly (with cast) | `EstimateStateType` already has `estimateId: string \| undefined` |
| Adapter closure | Class-based adapter | `makeDefaultAdapter({ companyId, supabase })` factory (Phase 94 stub) | Mirrors `makeQueryTools` pattern already in codebase |
| Idempotency | Custom dedup | Inngest `idempotency: 'event.data.requestId'` (already wired) | Phase 67 already handles this end-to-end |

---

## Runtime State Inventory

> Step 2.5 SKIPPED — Phase 95 is not a rename/refactor/migration phase. It rewires an Inngest job to use an already-built graph adapter. No stored data, OS-registered state, or build artifacts carry string identifiers that change.

---

## Environment Availability

> Step 2.6 result: Phase 95 requires no external dependencies beyond what already exists. All libraries (LangGraph, Inngest, Supabase) are installed. No new tools, services, or runtimes needed.

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `@langchain/langgraph` | `buildEstimateGraph` | Already installed (Phase 94) | existing | — |
| `inngest` | `step.run`, job wrapper | Already installed (Phase 67) | existing | — |
| `@supabase/supabase-js` | `requireServiceClient()` | Already installed | existing | — |

**No missing dependencies.**

---

## Common Pitfalls

### Pitfall 1: Step-ID Rename and In-Flight Jobs

**What goes wrong:** Renaming `step.run('call-ai-provider', ...)` to `step.run('orchestrate-estimate', ...)` could theoretically confuse in-flight Inngest jobs that have already checkpointed past the old step.

**Why it's safe:** There is no LangGraph checkpointer (DURABLE-02). Inngest resumes jobs at the `step.run` level. A retry after the step rename replays from the beginning of the function handler (not mid-graph). Since the whole graph is inside one step, there is no "mid-step checkpoint" to confuse. The rename is safe.

**Warning signs:** None during normal operation. The only risk would be if a job was checkpointed _between_ `call-ai-provider` and `record-usage` at the exact moment of deploy — the retry would re-run both steps (harmless: usage is idempotent via the partial UNIQUE index on `idempotency_key`).

### Pitfall 2: The Existing `generate-estimate-job.test.ts` Asserts the OLD Step ID

**What goes wrong:** `tests/unit/inngest/generate-estimate-job.test.ts` line 41 asserts `step.run('call-ai-provider', ...)`. After Phase 95 renames this step, the test will fail.

**Root cause:** The test is a source-text anchor that was written against the Phase 67 implementation. The anchor string is now stale.

**How to fix:** Update the test to assert `'orchestrate-estimate'` instead of `'call-ai-provider'`, and add an assertion that `buildEstimateGraph` and `makeDefaultAdapter` appear in the source. This mirrors what `whatsapp-process-job.test.ts` asserts.

**Warning signs:** Test fails immediately after renaming the step.run call.

### Pitfall 3: `graph.invoke` Field Mismatch — `estimateLanguage` vs `language`

**What goes wrong:** The `EstimateGeneratePayload` has a `language` field (from `lib/inngest/events.ts`). The graph state has `estimateLanguage` (from `lib/estimate/graph/state.ts`). Passing `language` directly to `graph.invoke` won't populate the state correctly.

**How to avoid:** Map explicitly: `estimateLanguage: language ?? undefined` in the `graph.invoke(...)` call (as shown in D-07 in CONTEXT.md).

**Warning signs:** `result.estimateLanguage` is `undefined` even when `language` was provided in the event payload. `recordPipelineEvent` would log `undefined` language.

### Pitfall 4: `onError` Returning `{}` (Phase 94 Stub) Instead of Re-Throwing

**What goes wrong:** If `onError` returns `{}` (the Phase 94 stub), a generation failure silently resolves `graph.invoke` with a `failure` state set but no error propagated. The Inngest job succeeds, `recordUsage` runs (incorrectly recording usage for a failed generation), `onFailure` never fires, and no retry occurs.

**How to avoid:** Update `onError` per D-02 to `throw new Error(state.failure?.reason ?? 'generation_failed')` before any implementation work.

**Warning signs:** A failed generation appears as a successful Inngest run in the dashboard. No failure notification sent to owner.

### Pitfall 5: MCP `extractEstimateId` Compatibility

**What goes wrong:** `lib/mcp/tools/write.ts`'s `extractEstimateId` function probes the graph run output for `{ id }`, `{ estimate_id }`, or `{ estimate: { id } }`. After Phase 95, the graph returns `EstimateStateType` which has `{ estimateId }` (not `id` or `estimate_id`).

**Verification:** The MCP `extractEstimateId` probes `o.id` and `o.estimate_id`. The graph state uses `estimateId`. This means MCP's `check_job_status` will NOT find the estimate ID in the completed run output via the current probes.

**Severity:** MEDIUM — affects only the MCP caller's ability to extract `estimate_id` from the poll response for immediate `get_estimate` lookup. The estimate IS created; only the MCP convenience field `result.estimate_id` would be `undefined`.

**Resolution options:**
1. (Preferred, no behavior change) The `extractEstimateId` function in `write.ts` checks `o.estimateId` — but D-04 says zero changes to `write.ts`. This is a tension.
2. (Alternative) Have the `generate-estimate` Inngest job return `{ estimateId }` (the graph result) which preserves the MCP probe. Since `step.run` serializes the return value through JSON, the job's return value is whatever the last expression is — currently `return result` which is the full `EstimateStateType`. MCP's `extractEstimateId` checks `o.id` but state has `o.estimateId`. This gap pre-exists: MCP currently extracts from `generateEstimateForProject`'s return which has `{ estimateId, language }` — so the probe for `o.id` was already broken before Phase 95. The CONTEXT.md D-04 constraint says zero code changes to `write.ts`. This is an existing known gap, not a Phase 95 regression.

**Action for planner:** Flag this as a known pre-existing gap (D-04: no write.ts change). Phase 95 does not make this worse than current state. MCP `estimate_id` extraction from poll was already relying on a probe that doesn't match `generateEstimateForProject`'s return shape.

---

## Code Examples

### The Two-File Change Pattern

**File 1: `lib/estimate/adapters/default.ts` — only `onError` changes:**
```typescript
// Source: 95-CONTEXT.md D-02
async onError(state: EstimateStateType): Promise<Partial<EstimateStateType>> {
  throw new Error(state.failure?.reason ?? 'generation_failed')
}
```

**File 2: `lib/inngest/functions/generate-estimate.ts` — step.run block changes:**
```typescript
// Source: 95-CONTEXT.md D-07
import { makeDefaultAdapter } from '@/lib/estimate/adapters/default'
import { buildEstimateGraph } from '@/lib/estimate/graph'
import { requireServiceClient } from '@/lib/supabase/service'

// Inside generateEstimateJob handler, replacing step.run('call-ai-provider', ...):
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

// estimateId extraction (mirrors existing Phase 92 pattern in the file):
const estimateId =
  (result as { estimateId?: string | null } | null)?.estimateId ?? null
```

### Source-Text Anchor Test Pattern (from `whatsapp-process-job.test.ts`)

The Phase 94 refactor set the template for how to anchor-test a graph-delegating Inngest job:

```typescript
// Source: tests/unit/inngest/whatsapp-process-job.test.ts lines 77-79
it('invokes the estimate graph via the orchestrate-estimate step', () => {
  expect(jobSrc).toMatch(/step\.run\(['"]orchestrate-estimate['"]/)
  expect(jobSrc).toMatch(/buildEstimateGraph\(/)
})
```

This exact pattern applies to the Phase 95 update of `generate-estimate-job.test.ts`.

---

## Critical Finding: Existing Test Must Change

The test `tests/unit/inngest/generate-estimate-job.test.ts` currently passes GREEN with the `call-ai-provider` step ID assertion. After Phase 95, this assertion breaks. The test is NOT a "must stay green" test — it is a test that must be **updated as part of Phase 95** to reflect the new step ID.

Confirmed current state (GREEN, 3/3 tests pass):
```
✓ function body wraps generateEstimateForProject in step.run("call-ai-provider", ...)
```

Post-Phase-95 target (must become):
```
✓ function body invokes graph via step.run("orchestrate-estimate", ...)
```

**The planner must include a task to update `generate-estimate-job.test.ts`** as part of the Wave that renames the step.

---

## Tests That MUST Stay Green (No Assertion Changes Allowed)

| Test File | Requirement | Current State | Risk |
|-----------|-------------|---------------|------|
| `tests/unit/estimate/graph-neutrality.test.ts` | ENGINE-01 neutrality gate (no WhatsApp imports in core) | GREEN (5 tests pass) | LOW — Phase 95 does not touch `lib/estimate/graph/` core |
| `tests/unit/whatsapp/never-reply-regression.test.ts` | QA-01 WhatsApp never-throw/always-reply | GREEN (3 tests pass) | LOW — Phase 95 does not touch `lib/whatsapp/` or WhatsApp adapter |
| `tests/unit/inngest/whatsapp-process-job.test.ts` | INNGEST-07 WhatsApp job contract | GREEN | LOW — `whatsapp-process.ts` is unchanged |

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `generate-estimate.ts` calls `generateEstimateForProject` directly | `generate-estimate.ts` invokes shared graph via `makeDefaultAdapter` | Phase 95 | Web/MCP channels now share the canonical engine |
| `step.run('call-ai-provider', ...)` | `step.run('orchestrate-estimate', ...)` | Phase 95 | Consistent naming across WhatsApp + Web/MCP |
| `default.ts` `onError` returns `{}` (Phase 94 stub) | `default.ts` `onError` re-throws (D-02) | Phase 95 | Inngest retry + `onFailure` fires on generation failure |

---

## Open Questions

1. **MCP `extractEstimateId` probe mismatch (Pitfall 5)**
   - What we know: `lib/mcp/tools/write.ts` probes for `o.id`, `o.estimate_id`, or `o.estimate.id`. Graph state returns `{ estimateId }`. D-04 says zero changes to `write.ts`.
   - What's unclear: Was `extractEstimateId` working before Phase 95? The current code returns `generateEstimateForProject`'s result which has `{ estimateId, language }` — not `{ id }`. So this probe was already broken.
   - Recommendation: Treat as a pre-existing gap out of scope for Phase 95. Document in known-issues if desired. The MCP contract (job_id + poll) still works; only the convenience `result.estimate_id` field in the poll response is affected.

2. **`estimateLanguage` field inclusion in graph.invoke for web path**
   - What we know: D-07 includes `estimateLanguage: language ?? undefined` in `graph.invoke`. The `generate` node reads `state.estimateLanguage` but passes it to `generateEstimateForProject` via options.
   - What's unclear: The generate node in `lib/estimate/graph/nodes/generate.ts` does not currently forward `estimateLanguage` to `generateEstimateForProject` — it only passes `channel` and `prompts`. The `language` option is actually in the `opts` object for `generateEstimateForProject`.
   - Recommendation: Check `lib/services/generate-estimate.ts` to confirm `generateEstimateForProject` accepts a `language` option. If yes, the generate node should pass it. If the generate node doesn't forward it, the `estimateLanguage` field in graph state is unused this phase. This is low-risk since behavior parity (not new language features) is the goal.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.8 |
| Config file | `vitest.config.ts` (root) |
| Quick run command | `npx vitest run tests/unit/inngest/ tests/unit/estimate/` |
| Full suite command | `npm test` (= `vitest run`) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CHAN-02 | `generate-estimate` Inngest job uses shared graph + default adapter | unit (source-text anchor) | `npx vitest run tests/unit/inngest/generate-estimate-job.test.ts` | EXISTS — needs update (anchor strings change) |
| CHAN-03 | MCP inherits via `EVENT_ESTIMATE_GENERATE` dispatch — zero MCP code changes | unit (source-text anchor) | `npx vitest run tests/unit/mcp/` | Covered by existing MCP tests staying green |
| CHAN-04 | All three channels produce equivalent output; no channel regresses | unit (existing suite stays green) | `npx vitest run tests/unit/whatsapp/never-reply-regression.test.ts tests/unit/estimate/graph-neutrality.test.ts` | EXISTS — must stay green, no changes |
| QA-03 | Non-vague web path: exactly 1 AI call, zero `whatsapp_*` rows written | unit (new behavioral test) | `npx vitest run tests/unit/inngest/generate-estimate-job.test.ts` | NEW — Wave 0 gap |

### Sampling Rate

- **Per task commit:** `npx vitest run tests/unit/inngest/ tests/unit/estimate/ tests/unit/whatsapp/never-reply-regression.test.ts`
- **Per wave merge:** `npm test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `tests/unit/inngest/generate-estimate-job.test.ts` — update existing anchor assertions from `'call-ai-provider'` → `'orchestrate-estimate'` + add `buildEstimateGraph`/`makeDefaultAdapter` assertions (CHAN-02); add QA-03 behavioral test in same file (1 AI call, no `whatsapp_*` rows)

All other required test infrastructure exists.

---

## Project Constraints (from CLAUDE.md)

| Directive | How it Applies |
|-----------|----------------|
| Service role key never exposed to browser; all AI calls server-side via API routes | `requireServiceClient()` inside `makeDefaultAdapter` is correct; called inside `step.run` (server-side Inngest worker) |
| Next.js 14+ (App Router), TypeScript strict | All new code in `lib/estimate/adapters/default.ts` and `lib/inngest/functions/generate-estimate.ts` must be strict TypeScript |
| NEVER commit secrets, API keys | No secrets in planning docs — already followed |
| Supabase PostgreSQL with RLS on all tables | `makeDefaultAdapter` uses service-role client which bypasses RLS; `companyId` scopes all queries — consistent with established pattern |
| GSD Workflow Enforcement | Phase is being planned via `/gsd:plan-phase` — compliant |

---

## Sources

### Primary (HIGH confidence)

- `lib/inngest/functions/generate-estimate.ts` — current implementation; exact call-sites and patterns read directly from source
- `lib/inngest/functions/whatsapp-process.ts` — the structural template for D-01 (whole graph in one `step.run('orchestrate-estimate', ...)`)
- `lib/estimate/graph/index.ts` — `buildEstimateGraph(adapter, { runner })` factory; confirmed shape
- `lib/estimate/graph/state.ts` — `EstimateStateType` with `estimateId: Annotation<string | undefined>()`; return type of `graph.invoke`
- `lib/estimate/adapters/default.ts` — Phase 94 stub; `onError` returns `{}` (confirmed needs update)
- `lib/mcp/tools/write.ts` — confirmed dispatches `EVENT_ESTIMATE_GENERATE`; D-04 zero-code-change verified
- `lib/inngest/events.ts` — `EstimateGeneratePayload` shape; `language`, `prompts`, `requestId` fields confirmed
- `tests/unit/inngest/generate-estimate-job.test.ts` — confirmed GREEN (3/3), confirmed `'call-ai-provider'` anchor needs update
- `tests/unit/estimate/graph-neutrality.test.ts` — confirmed GREEN (2/2)
- `tests/unit/whatsapp/never-reply-regression.test.ts` — confirmed GREEN (3/3)
- `tests/unit/inngest/whatsapp-process-job.test.ts` — confirmed pattern for anchor tests post-graph-migration
- `vitest.config.ts` — Vitest 4.1.8, `jsdom` environment, `tests/unit/**` include pattern

### Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries already installed; no new dependencies
- Architecture patterns: HIGH — read directly from source files; template (whatsapp-process.ts) is live and green
- Pitfalls: HIGH — three of five pitfalls confirmed by reading actual source + running actual tests
- Test strategy: HIGH — test files read directly; current pass/fail state confirmed by running tests

**Research date:** 2026-06-20
**Valid until:** 2026-07-20 (stable internal code; no external APIs to go stale)
