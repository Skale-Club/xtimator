---
phase: 95
slug: migrate-web-mcp-onto-the-shared-graph-generate-only-passthrough
status: draft
created: 2026-06-20
---

# Phase 95: Migrate Web + MCP onto the Shared Graph (generate-only passthrough) — Context

**Gathered:** 2026-06-20
**Status:** Ready for planning
**Mode:** `--auto` (decisions auto-selected from research defaults; no gray areas left ambiguous)

<domain>
## Phase Boundary

Repoint the web `generate-estimate` Inngest job to invoke the shared `buildEstimateGraph(makeDefaultAdapter(...))` instead of calling `generateEstimateForProject` directly. MCP inherits the change for free (same event dispatch → same Inngest job). Output is byte-equivalent to today for the non-vague happy path; the `assess` node runs but `finalize` is still a no-op so vagueness is not yet surfaced on web (Phase 96). The three channels (web, MCP, WhatsApp) now all share the canonical engine.

**In scope (REQs):** CHAN-02, CHAN-03, CHAN-04, QA-03.

**Explicitly NOT in this phase:**
- Surfacing vagueness on web (awaiting_details state) → Phase 96
- Auto-refine → Phase 96
- Langfuse observability → Phase 97
- Any change to `lib/mcp/tools/write.ts` (MCP inherits automatically)
- Any change to `lib/whatsapp/` (WhatsApp behavior unchanged)
</domain>

<decisions>
## Implementation Decisions

### D-01: `step.run` granularity in the Inngest job
Whole `graph.invoke(...)` call goes inside ONE `step.run('orchestrate-estimate', ...)`, exactly
mirroring `lib/inngest/functions/whatsapp-process.ts`. The existing two-step split
(`call-ai-provider` + `record-usage`) becomes:

```
step.run('orchestrate-estimate', () => graph.invoke({...}))
step.run('record-usage', () => recordUsage(...))
```

`record-usage` stays a separate step so a DB-write failure can retry independently.
This fulfills DURABLE-02 (Inngest sole durability layer; whole graph in one step).

### D-02: `onError` web/MCP adapter — re-throw
When `state.failure` is set, the WhatsApp adapter replies conversationally; the web/MCP
adapter has no conversational reply target. Its `onError` MUST re-throw so that
`step.run('orchestrate-estimate', ...)` propagates the error up to Inngest, triggering
retry + `onFailure` (the existing failure notification path in `generateEstimateJob`).

The never-throw invariant is for CORE nodes only. Adapter edge nodes are allowed to throw —
that is the correct way for the web channel to signal a terminal failure to its durability
layer (Inngest).

```ts
async onError(state): Promise<Partial<EstimateStateType>> {
  throw new Error(state.failure?.reason ?? 'generation_failed')
}
```

### D-03: `recordUsage` / `recordPipelineEvent` stay in the Inngest wrapper
These Inngest-specific side-effects remain in the `generateEstimateJob` wrapper outside
the graph. After `step.run('orchestrate-estimate', ...)` resolves, inspect the returned
state for `estimateId` (from `state.estimateId`) to feed downstream recording.
No changes needed to `recordPipelineEvent` call sites — they stay before/after the step.

### D-04: MCP inherits via event — zero code changes
`lib/mcp/tools/write.ts` already dispatches `EVENT_ESTIMATE_GENERATE` → same Inngest
job. Once the job uses the shared graph, MCP gets it automatically. CHAN-03 satisfied
with zero new MCP code.

### D-05: `ingest` stays pure passthrough `return {}`
Web/MCP inputs are already ingested upstream (`transcribe-audio` / `analyze-photos`).
The `ingest` node is a passthrough guard. No "has usable input" check is added in
Phase 95 — `generateEstimateForProject` has its own internal guards, and adding a
duplicate guard would be a behavior change (out of scope).

### D-06: `finalize` stays no-op `return {}`
The web surfaces the estimate via the existing job-poll contract (`GET /api/jobs/[jobId]`).
No reply, no DB write, no side-effect needed. The `estimateId` is captured from
`generateEstimateForProject`'s return value inside the `generate` node and flows
through the state; the Inngest wrapper can read `result.estimateId` from the graph
return value.

### D-07: `buildEstimateGraph` call-site in the Inngest job
```ts
import { makeDefaultAdapter } from '@/lib/estimate/adapters/default'
import { buildEstimateGraph } from '@/lib/estimate/graph'
import { requireServiceClient } from '@/lib/supabase/service'

// inside generateEstimateJob handler:
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

### Claude's Discretion
- Exact `estimateId` extraction from graph return state (read `result?.estimateId` or
  `(result as EstimateStateType)?.estimateId`).
- Whether to alias `step.run` return type via a cast or use a typed wrapper.
- Whether `recordPipelineEvent` extracts `estimateId` from graph return or from a prior
  separate query (keep existing approach — read from result).
- Order of `load_owner_userId` call relative to the new `step.run` (keep it before, as today).
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Milestone scope & decisions
- `.planning/REQUIREMENTS.md` — CHAN-02, CHAN-03, CHAN-04, QA-03 (this phase's requirements) + the "Key Decisions (Critical)" table (Inngest owns durability, ChannelAdapter closure-factory, graph enters at `generate` for web).
- `.planning/ROADMAP.md` — v4.3 block, Phase 95 goal + success criteria.

### Phase 94 artifacts (the foundation this phase builds on)
- `.planning/phases/94-extract-canonical-graph-behind-whatsapp-behavior-preserving-steprunner-seam/94-CONTEXT.md` — all Phase 94 locked decisions (module layout, ChannelAdapter shape, never-throw, StepRunner seam, DURABLE-02).
- `.planning/phases/94-extract-canonical-graph-behind-whatsapp-behavior-preserving-steprunner-seam/94-CHECKPOINTING.md` — the checkpoint-granularity decision artifact (Inngest is sole durability layer; whole graph in one `step.run`).

### Source files to modify
- `lib/inngest/functions/generate-estimate.ts` — the only file that changes in production code; replace the direct `generateEstimateForProject` call with `graph.invoke`.
- `lib/estimate/adapters/default.ts` — update `onError` to re-throw (D-02); `ingest`/`finalize` stay as Phase 94 stubs.

### Source files to read (patterns + unchanged)
- `lib/inngest/functions/whatsapp-process.ts` — the template for "whole graph in one step.run" (D-01).
- `lib/estimate/graph/index.ts` — `buildEstimateGraph(adapter, { runner })` factory.
- `lib/estimate/graph/state.ts` — `EstimateStateType` fields; `estimateId` is the return value to thread back.
- `lib/mcp/tools/write.ts` — confirms MCP already dispatches the same event; no change needed.
- `lib/inngest/events.ts` — `EstimateGeneratePayload` shape (companyId, projectId, requestId, language, prompts, attemptId, inputType).

### Test references
- `tests/unit/inngest/whatsapp-process-job.test.ts` — pattern for source-text anchor tests (if we write one for generate-estimate).
- `tests/unit/estimate/graph-neutrality.test.ts` — must stay green (no new WhatsApp imports in core).
- `tests/unit/whatsapp/never-reply-regression.test.ts` — must stay green (WhatsApp behavior unchanged).
</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `lib/estimate/graph/index.ts` → `buildEstimateGraph(adapter, { runner? })` — the graph factory, imported as-is.
- `lib/estimate/adapters/default.ts` → `makeDefaultAdapter({ companyId, supabase })` — Phase 94 stub, needs only `onError` updated.
- `lib/estimate/graph/state.ts` → `EstimateStateType` — the return type of `graph.invoke`.
- `lib/inngest/functions/whatsapp-process.ts` — structural template: `step.run('orchestrate-estimate', () => graph.invoke(...))`.

### Established Patterns
- **Whole graph in one `step.run`** (DURABLE-02): whatsapp-process.ts does `step.run('orchestrate-estimate', () => { const graph = buildEstimateGraph(); return graph.invoke({...}) })`.
- **`recordUsage` as a separate `step.run`** after the AI step: preserves idempotency on DB-write retry.
- **`requireServiceClient()`** for service-role DB in Inngest job context.
- **`loadOwnerUserId(companyId)`** stays before the main step (no change).

### Integration Points
- `lib/inngest/functions/generate-estimate.ts` → replace `step.run('call-ai-provider', ...)` with `step.run('orchestrate-estimate', ...)` wrapping `graph.invoke`.
- All `recordPipelineEvent` call-sites in `generateEstimateJob` remain; `estimateId` is now read from the graph return state instead of the direct `generateEstimateForProject` result.
- `lib/estimate/adapters/default.ts` → `onError`: add `throw new Error(state.failure?.reason ?? 'generation_failed')`.
- MCP (`lib/mcp/tools/write.ts`): ZERO changes — inherits via `EVENT_ESTIMATE_GENERATE` dispatch.

### What NOT to change
- `lib/whatsapp/estimate-graph.ts` — unchanged.
- `lib/whatsapp/` anything — unchanged.
- `lib/mcp/tools/write.ts` — unchanged.
- `lib/services/generate-estimate.ts` — unchanged.
- `app/api/generate-estimate/route.ts` — unchanged (still dispatches event to Inngest).
</code_context>

<specifics>
## Specific Ideas

- The `step.run('call-ai-provider', ...)` rename to `step.run('orchestrate-estimate', ...)` is an Inngest step-id rename. Existing in-flight jobs using the old step id will NOT be affected because retried jobs replay from the beginning (no LangGraph checkpointer). This is safe.
- `channel: 'web'` is the discriminator passed into the graph state — same pattern as `channel: 'whatsapp'` in whatsapp-process.ts.
- `estimateLanguage` field in graph state maps to the `language` payload field from `EstimateGeneratePayload`.
- The `ingest` passthrough for web means `checkInputsEdge` will always route to `generate` (no `failure` set), matching today's behavior where the Inngest job goes directly to AI.
</specifics>

<deferred>
## Deferred Ideas

- **Vagueness surfacing on web** (`awaiting_details` project state, non-blocking UI prompt) → Phase 96.
- **Auto-refine** (1× cap, re-prompt) → Phase 96.
- **MCP structured `needs_details` status** → Phase 96.
- **Langfuse traces per channel** → Phase 97.
- **`ingest` guard for "has usable input"** — could be added as a lightweight pre-check against DB recordings; deferred because `generateEstimateForProject` already handles this and adding it in Phase 95 would be a behavior change, not a behavior-preserving passthrough.
</deferred>

---

*Phase: 95-migrate-web-mcp-onto-the-shared-graph-generate-only-passthrough*
*Context gathered: 2026-06-20*
