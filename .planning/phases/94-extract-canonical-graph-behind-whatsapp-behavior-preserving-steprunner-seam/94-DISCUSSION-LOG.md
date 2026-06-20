# Phase 94: Extract Canonical Graph Behind WhatsApp - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-20
**Phase:** 94-extract-canonical-graph-behind-whatsapp-behavior-preserving-steprunner-seam
**Mode:** `--auto` (gray areas auto-resolved using research defaults; no interactive questions)
**Areas discussed:** Module layout, ChannelAdapter shape, Graph state shape, Never-throw mechanism, StepRunner seam, graph↔Inngest granularity, Behavior-preserving migration strategy

---

## Module layout

| Option | Description | Selected |
|--------|-------------|----------|
| `lib/estimate/graph/` + `lib/estimate/adapters/` + `lib/estimate/quality/` | Research-recommended split: shared core, channel adapters, extracted gate | ✓ |
| Keep everything under `lib/whatsapp/`, just generalize | Lower churn, but leaks WhatsApp ownership over a now-shared concern | |
| Single `lib/agentic/` mega-module | Less discoverable; mixes graph + channel concerns | |

**Auto-selected:** research default (`lib/estimate/*`). **Rationale:** ARCHITECTURE.md module layout; keeps the core channel-neutral and discoverable.

## ChannelAdapter shape

| Option | Description | Selected |
|--------|-------------|----------|
| Closure-factory (like `makeQueryTools`) | `makeWhatsAppAdapter(...)` returns `{ ingest, finalize, onError }` | ✓ |
| Class / interface implementation | More ceremony; not the repo's idiom | |
| Config object of callbacks | Flatter, but loses captured trusted scope (multi-tenant) | |

**Auto-selected:** closure-factory. **Rationale:** mirrors the existing `makeQueryTools` pattern; captures `companyId`/session as a closure invariant (multi-tenant safety).

## Graph state shape

| Option | Description | Selected |
|--------|-------------|----------|
| Channel-neutral `Annotation.Root` (no `ownerPhone`/`WhatsAppMessage`) | Channel specifics live in the adapter closure | ✓ |
| Keep current state, mark WA fields optional | Faster but leaks channel divergence into the core | |

**Auto-selected:** channel-neutral state. **Rationale:** ENGINE-01 + PITFALLS.md channel-divergence prevention.

## Never-throw mechanism

| Option | Description | Selected |
|--------|-------------|----------|
| `failure?` state channel + adapter `onError` | Nodes never throw / never do channel I/O | ✓ |
| Try/catch in each node calling channel reply directly | Re-leaks WhatsApp I/O into shared nodes | |

**Auto-selected:** failure-as-state + reply-as-edge-node. **Rationale:** ENGINE-04 + QA-01; protects the documented WhatsApp silent-failure guarantee.

## StepRunner seam (DURABLE-01)

| Option | Description | Selected |
|--------|-------------|----------|
| Inject a `StepRunner` interface; default = passthrough | Seam for later per-node durability; zero behavior change now | ✓ |
| Wire each node to Inngest `step.run` now | Out of scope (full refactor deferred); adds risk without metrics | |
| Do nothing | Leaves no seam; future durability work would be invasive | |

**Auto-selected:** inject passthrough `StepRunner`. **Rationale:** DURABLE-01 scaffold-only; SUMMARY.md build order.

## graph↔Inngest granularity (DURABLE-02)

| Option | Description | Selected |
|--------|-------------|----------|
| Whole graph in one `step.run`, no checkpointer (document decision) | Inngest owns durability; finer resume later via StepRunner | ✓ |
| Add LangGraph checkpointer (Memory/Postgres) | Double-durability; savers don't survive retries / duplicate Inngest state | |
| Decompose now | Out of scope (deferred full refactor) | |

**Auto-selected:** keep one-step + document. **Rationale:** the milestone's central locked decision (REQUIREMENTS.md Key Decisions; ARCHITECTURE.md).

## Behavior-preserving migration strategy

| Option | Description | Selected |
|--------|-------------|----------|
| Compose shared graph + WA adapter behind stable `buildEstimateGraph()` | Inngest job untouched; existing WA tests stay green | ✓ |
| Rewrite `whatsapp-process.ts` to call the new module directly | More churn at the durability boundary; riskier | |

**Auto-selected:** keep `buildEstimateGraph()` contract stable. **Rationale:** CHAN-01 behavior-preserving; QA-01 regression net.

## Claude's Discretion

- Exact `StepRunner` interface signature + location of the default passthrough.
- Internal file split within `lib/estimate/graph/`.
- Whether `lib/whatsapp/estimate-graph.ts` ends as a re-export shim or is deleted.
- Whether the `default.ts` adapter is a real stub now or a placeholder for Phase 95.

## Deferred Ideas

- Web/MCP migration → Phase 95; auto-refine + `needs_details` → Phase 96; Langfuse observability → Phase 97; full per-node durability decomposition → deferred (out of scope for v4.3).
