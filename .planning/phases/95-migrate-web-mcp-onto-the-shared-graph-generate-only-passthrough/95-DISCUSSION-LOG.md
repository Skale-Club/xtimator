# Phase 95: Migrate Web + MCP onto the Shared Graph — Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-20
**Phase:** 95-migrate-web-mcp-onto-the-shared-graph-generate-only-passthrough
**Mode:** `--auto` (gray areas auto-resolved using research defaults; no interactive questions)
**Areas discussed:** step.run granularity, onError web/MCP behavior, side-effects placement, MCP inheritance, ingest passthrough depth

---

## step.run granularity

| Option | Description | Selected |
|--------|-------------|----------|
| Keep two-step split (`call-ai-provider` + `record-usage`) and call `graph.invoke` inside the first | Minimal change to existing structure | |
| Whole graph in one `step.run('orchestrate-estimate')` + separate `record-usage` step | Matches whatsapp-process.ts pattern; fulfills DURABLE-02 locked decision | ✓ |

**Auto-selected:** Whole graph in one `step.run('orchestrate-estimate')`.
**Rationale:** The locked DURABLE-02 decision says "keep whole-graph-inside-one-step.run; Inngest owns durability." This is also the exact pattern in `whatsapp-process.ts`, which is the template for this migration.

---

## onError web/MCP adapter behavior

| Option | Description | Selected |
|--------|-------------|----------|
| Return `{}` (pure no-op) | Graph resolves cleanly; Inngest's `onFailure` does NOT fire because no error propagated | |
| Re-throw `new Error(state.failure?.reason)` | `step.run` sees error; Inngest retries + `onFailure` fires (existing failure notification path preserved) | ✓ |
| Return `{ failure: { reason } }` and let wrapper inspect | Requires new wrapper logic to check return state and throw manually | |

**Auto-selected:** Re-throw.
**Rationale:** The web channel's "reply to a failure" is to propagate the error to its durability layer (Inngest), triggering the existing retry + `onFailure` notification. The never-throw invariant applies to CORE nodes, not adapter edge nodes. A pure no-op would silently swallow failures, breaking the existing behavior.

---

## recordUsage / recordPipelineEvent placement

| Option | Description | Selected |
|--------|-------------|----------|
| Move side-effects inside the graph (adapter finalize) | Couples Inngest-specific behavior to the shared graph | |
| Keep in Inngest wrapper outside the graph | Inngest-specific logic stays at the Inngest boundary; graph stays pure | ✓ |

**Auto-selected:** Keep in Inngest wrapper.
**Rationale:** `recordUsage` and `recordPipelineEvent` are Inngest-specific side-effects with idempotency contracts tied to `requestId`. They belong at the Inngest boundary, not inside the channel-neutral graph.

---

## MCP inheritance

| Option | Description | Selected |
|--------|-------------|----------|
| Explicit `lib/mcp/tools/write.ts` changes | Adds unnecessary coupling + test surface | |
| Inherit via EVENT_ESTIMATE_GENERATE dispatch (zero MCP code change) | Free migration — same event, same Inngest job, same graph | ✓ |

**Auto-selected:** Zero MCP code change.
**Rationale:** MCP already dispatches `EVENT_ESTIMATE_GENERATE` → `generate-estimate` Inngest job. Once the job uses the shared graph, CHAN-03 is satisfied automatically. No new dispatch contract needed.

---

## ingest passthrough depth

| Option | Description | Selected |
|--------|-------------|----------|
| Pure passthrough `return {}` | Behavior-preserving; existing guards in `generateEstimateForProject` handle validation | ✓ |
| Add "has usable input" guard against DB recordings | New validation logic = behavior change; out of scope for Phase 95 | |

**Auto-selected:** Pure passthrough.
**Rationale:** Phase 95 is behavior-preserving. `generateEstimateForProject` already validates inputs. Adding a duplicate guard is a behavior change (new failure modes) that belongs in Phase 96 or later.

---

## Claude's Discretion

- Exact TypeScript cast for `graph.invoke` return type to extract `estimateId`.
- Whether the step-id rename (`call-ai-provider` → `orchestrate-estimate`) needs a note in the PR description about in-flight job compatibility (safe: no checkpointer, whole-graph replay).
- Internal variable naming inside the updated `generateEstimateJob` handler.

## Deferred Ideas

- Vagueness surfacing on web → Phase 96.
- Auto-refine → Phase 96.
- MCP structured `needs_details` status → Phase 96.
- Langfuse per-channel traces → Phase 97.
- `ingest` guard for "has usable input" → deferred (Phase 96 or later, after Phase 95 proves the passthrough works).
