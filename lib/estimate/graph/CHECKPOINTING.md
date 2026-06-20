# Graph ↔ Inngest Checkpoint Granularity (DURABLE-02)

> Decision artifact for the canonical estimate graph. **Decided 2026-06-20, v4.3.**
> Source: Phase 94 CONTEXT D-12 + 94-RESEARCH.md "Decision Artifact (DURABLE-02)".

## Decision

The whole estimate graph runs inside ONE Inngest `step.run` (`orchestrate-estimate`).
**Inngest is the sole durability layer** for the graph — it owns retries, idempotency
(via `event.data.batchKey` / `requestId`), and `onFailure`. **No LangGraph checkpointer**
(`MemorySaver` / `PostgresSaver` / `SqliteSaver`) is added. The graph is built with a plain
`graph.compile()` that takes **no saver / checkpointer argument**.

## Why no checkpointer

- **`MemorySaver` is per-process** and is lost when Inngest replays the step on a fresh
  worker (the "Pod B" problem): the in-memory state never survives the retry, so it buys
  nothing for our durability model.
- **A Postgres / Sqlite saver duplicates the state Inngest already owns** and creates a
  second, conflicting recovery authority. Two durability systems = double-persist + ambiguous
  "who is the source of truth on replay" — exactly the trap this decision exists to avoid.
- **Cross-message "wait for the owner's reply" is NOT a LangGraph `interrupt`.** It is already
  handled by `whatsapp_sessions` rows (e.g. `awaiting_details` / `awaiting_confirm`) plus new
  inbound Inngest events. The graph itself is a single-pass deterministic pipeline; it does not
  pause-and-resume inside one invocation.

## Cost trade-off (accepted)

A retry **after** a successful AI generate re-runs the whole graph and **re-charges the AI
call**. Today this is bounded by `retries: 1` on the `whatsapp-process` Inngest function plus
the never-throw → terminal-reply discipline (a failure becomes a `failure?` state channel that
the adapter `onError` turns into exactly one reply, never a thrown crash). The re-charge cost is
accepted at this granularity for v4.3.

## When to revisit / how to get finer resume

Promote individual AI-heavy nodes to their own `step.run` via the injected `StepRunner`, **NOT**
a checkpointer. The Inngest function injects `{ run: (name, fn) => step.run(name, fn) }`; the
default `passthroughRunner` (`run: (_name, fn) => fn()`) keeps today's behavior unchanged. Because
the `StepRunner` seam ships now (DURABLE-01), finer per-node durability later is a **wiring change,
not a refactor**.

Do this only once observability metrics (Phase 97) show the retry re-charge is material. Until
then, whole-graph-in-one-`step.run` with no LangGraph checkpointer remains the model.
