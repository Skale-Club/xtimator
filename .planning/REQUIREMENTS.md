# Requirements: v4.3 Unified Agentic Estimate Engine

**Goal:** Unify estimate creation across ALL channels (web UI, MCP, WhatsApp) under a single LangGraph-based agentic engine. Extract the domain graph today exclusive to WhatsApp into a shared, channel-neutral canonical core, and bring the quality-assessment + refinement intelligence (today WhatsApp-only) to web and MCP.

**Started:** 2026-06-20
**Status:** Defining requirements

## Why this milestone (the gap)

The generation core `generateEstimateForProject` (`lib/services/generate-estimate.ts`) is ALREADY shared by all three channels. What diverges is **orchestration** and **pipeline intelligence**:

- **WhatsApp** runs a LangGraph `StateGraph` (`lib/whatsapp/estimate-graph.ts`) with a quality gate: it detects a vague/low-quality estimate (`evaluateVagueness` → `isVagueEstimate()`) and asks the owner for more detail (`askDetails`) instead of sending a $0/empty estimate.
- **Web** (`lib/inngest/functions/generate-estimate.ts`) and **MCP** (`lib/mcp/tools/write.ts`) are **single-shot**: they generate once and return. No quality gate, no refinement — a vague estimate is delivered as-is.

This asymmetry is a real product gap: the web/MCP can silently produce a low-quality estimate that WhatsApp would have caught. This milestone unifies the orchestration into one shared graph driven by a `ChannelAdapter`, gives all channels the same quality verdict, and adds one automatic self-refine attempt before falling back to asking the human — turning today's one-pass gate into a true evaluator-optimizer loop.

**Source:** architecture analysis 2026-06-20 + research in `.planning/research/` (STACK / FEATURES / ARCHITECTURE / PITFALLS / SUMMARY).

---

## v1 Requirements (this milestone)

### ENGINE — Canonical Domain Graph

- [x] **ENGINE-01**: A shared, channel-neutral estimate domain graph exists in a dedicated module (e.g. `lib/estimate/graph/`) with reusable nodes `ingest → generate → assess → refine/ask → finalize`. Graph state carries NO channel-specific fields (no `ownerPhone`, no `WhatsAppMessage`).
- [x] **ENGINE-02**: A `ChannelAdapter` abstraction (closure-factory, mirroring the existing `makeQueryTools` pattern) lets each channel plug ONLY its edge behaviors (`ingest`, `finalize`/reply, `onError`) without modifying the core graph.
- [x] **ENGINE-03**: The deterministic quality gate (`isVagueEstimate`) is extracted into the shared graph and reused verbatim as the always-on, zero-cost check (no LLM call for the gate).
- [x] **ENGINE-04**: The shared graph preserves the never-throw / always-finalize invariant — nodes signal failure via a state channel (`failure?`), never by throwing; the adapter maps the terminal failure outcome to the channel's reply/cleanup.

### CHAN — Channel Migration

- [x] **CHAN-01**: WhatsApp consumes the shared graph; its current `estimate-graph.ts` behavior is preserved exactly — inbound media fan-out + conversational reply/session become edge nodes supplied by the WhatsApp adapter.
- [x] **CHAN-02**: The web generation path (`generate-estimate` Inngest job) consumes the shared graph, entering at the `generate` node — the web's decoupled upload-time ingestion (`transcribe-audio` / `analyze-photos`) is preserved; the graph's `ingest` node is a passthrough guard when transcripts/descriptions already exist.
- [x] **CHAN-03**: MCP `create_estimate` runs through the same shared graph (inherits the web path — no new dispatch contract, still `job_id` + poll).
- [x] **CHAN-04**: Behavior parity is verified — all three channels produce equivalent estimate output for equivalent inputs through the single engine; no channel regresses.

### SMART — Intelligence Parity (quality + refine)

- [x] **SMART-01**: When the engine detects a vague/low-quality estimate, it makes exactly ONE automatic self-refine attempt (e.g. re-prompt with a "be more specific" instruction) before involving the human — hard cap = 1 iteration.
- [x] **SMART-02**: If still vague after the refine attempt, the engine ends at a typed `needs_details` verdict (never a 500/throw). Quota is charged only for a delivered estimate, not per internal attempt.
- [x] **SMART-03**: Web surfaces the `needs_details` verdict as a persisted project-level state (`awaiting_details`) that prompts the user in the UI to add detail and regenerate — no `interrupt()` / no job blocking.
- [x] **SMART-04**: MCP surfaces the `needs_details` verdict as a structured status in the job result the calling LLM can act on (compatible with the existing `job_id` + poll contract — no elicitation).
- [x] **SMART-05**: WhatsApp's existing inline ask-details behavior is preserved, now driven by the shared verdict.

### OBS — Unified Observability

- [x] **OBS-01**: All three channels emit a unified Langfuse trace per estimate run via a single `CallbackHandler` attached at `graph.invoke` (channels distinguished by `metadata`/`tags`).
- [x] **OBS-02**: Langfuse is migrated to the v5 OTel SDK (`@langfuse/langchain` + `@langfuse/otel` + `@langfuse/tracing`, replacing the LangChain-v1-incompatible `langfuse@3.38.20`) and coexists with `@sentry/nextjs` OTel without collision (shared tracer provider / `skipOpenTelemetrySetup`).
- [x] **OBS-03**: Per-channel AI call-count and latency are visible in the traces (the metric foundation that justifies the deferred durability refactor).

### DURABLE — Checkpoint Foundation (scaffold only; full refactor deferred)

- [x] **DURABLE-01**: A `StepRunner` abstraction is defined and injected into the engine so AI-heavy nodes CAN later be promoted to their own durable Inngest `step.run` — without coupling the core graph to Inngest. Contract + scaffold only in this milestone.
- [x] **DURABLE-02**: The graph↔Inngest checkpoint-granularity decision is captured as a decision artifact (when to decompose, retry-cost trade-offs, why no LangGraph checkpointer) to guide the deferred full refactor.

### QA — Reliability & Test Guardrails

- [x] **QA-01**: A frozen regression test asserts the WhatsApp never-throw / always-reply guarantee survives the extraction — the owner always gets a reply on every failure path.
- [x] **QA-02**: Multi-tenant isolation is preserved — `companyId` stays closure/param across all shared nodes and any new refine tool; no LLM-suppliable tenant field (extend the existing `query-tools` "no tenant input" test).
- [x] **QA-03**: The deterministic happy path stays at exactly 1 AI call per generation — no surprise extra AI calls on the non-vague web fast path.

---

## Out of Scope (deferred / future)

| Feature | Reason |
|---------|--------|
| LLM-as-judge soft quality scoring | High cost/latency + new failure surface; the deterministic `isVagueEstimate()` gate is sufficient for v4.3. Revisit once traces show where it's needed. |
| Full durability granularity refactor (each AI node = own `step.run`) | Deferred until OBS metrics justify it; v4.3 ships only the `StepRunner` contract/scaffold (DURABLE-01/02). |
| Multi-iteration / unbounded refine loops | Capped at 1 automatic attempt (SMART-01) to protect cost/latency and the <5-min core value. |
| LangGraph `interrupt()` on web / MCP `elicitation` | Anti-features — they break the fire-and-forget async (`job_id`+poll) contracts and would hang the job. |
| Intent-router unification (`lib/whatsapp/intent-router.ts`) | A separate graph (classification + ReAct query agent); not part of the estimate-creation core. |
| Folding web's upload-time ingestion into the graph | Keep `transcribe-audio` / `analyze-photos` decoupled — better per-item checkpointing + staged UX; would double-charge web transcription. |
| Retiring the legacy `langfuse@3` package | Cleanup can follow after the v5 migration lands. |

---

## Key Decisions (Critical)

| Decision | Rationale |
|----------|-----------|
| Inngest owns durability — NO LangGraph checkpointer | In-memory savers don't survive retries/restarts; a Postgres saver duplicates state Inngest already owns. Finer resume = Inngest step decomposition (DURABLE), not a saver. |
| Keep web's decoupled ingestion; graph enters at `generate` | Preserves per-item checkpointing + staged capture UX; avoids double-charging transcription. `ingest` is a per-channel pluggable pre-node. |
| One graph + `ChannelAdapter` (closure factory) | Only the domain core is canonical; channel ingestion + reply/session are edge concerns. Matches the existing `makeQueryTools` pattern. |
| Auto-refine hard-capped at 1 | Makes the engine genuinely agentic (evaluator-optimizer) without runaway cost/latency. |
| Graph ends at a verdict, not `interrupt()`/pause | Only WhatsApp has a human waiting inline; web/MCP are async. The terminal "ask" side-effect differs per channel adapter. |
| Failure-as-state, reply-as-edge-node | Protects the WhatsApp never-throw/always-reply invariant when nodes are shared. |

---

## Traceability

Each v1 requirement maps to exactly one phase. Coverage = 100% (21/21).

| Requirement | Phase | Status |
|-------------|-------|--------|
| ENGINE-01 | Phase 94 | Complete |
| ENGINE-02 | Phase 94 | Complete |
| ENGINE-03 | Phase 94 | Complete |
| ENGINE-04 | Phase 94 | Complete |
| CHAN-01 | Phase 94 | Complete |
| DURABLE-01 | Phase 94 | Complete |
| DURABLE-02 | Phase 94 | Complete |
| QA-01 | Phase 94 | Complete |
| CHAN-02 | Phase 95 | Complete |
| CHAN-03 | Phase 95 | Complete |
| CHAN-04 | Phase 95 | Complete |
| QA-03 | Phase 95 | Complete |
| SMART-01 | Phase 96 | Complete |
| SMART-02 | Phase 96 | Complete |
| SMART-03 | Phase 96 | Complete |
| SMART-04 | Phase 96 | Complete |
| SMART-05 | Phase 96 | Complete |
| QA-02 | Phase 96 | Complete |
| OBS-01 | Phase 97 | Complete |
| OBS-02 | Phase 97 | Complete |
| OBS-03 | Phase 97 | Complete |

**Coverage:**
- v1 requirements: 21 total (ENGINE 4, CHAN 4, SMART 5, OBS 3, DURABLE 2, QA 3)
- Mapped to phases: 21 ✓
- Unmapped: 0 ✓

**Per-phase distribution:**
- Phase 94 — Extract Canonical Graph + StepRunner Seam (8): ENGINE-01..04, CHAN-01, DURABLE-01, DURABLE-02, QA-01
- Phase 95 — Migrate Web + MCP (passthrough) (4): CHAN-02, CHAN-03, CHAN-04, QA-03
- Phase 96 — Intelligence Parity (auto-refine + needs_details) (6): SMART-01..05, QA-02
- Phase 97 — Unified Observability (Langfuse v5) (3): OBS-01, OBS-02, OBS-03

-------------|-------|--------|
| (pending roadmap) | — | Pending |

**Coverage:**
- v1 requirements: 21 total (ENGINE 4, CHAN 4, SMART 5, OBS 3, DURABLE 2, QA 3)
- Mapped to phases: 0 (pending roadmap)
- Unmapped: 21 ⚠️

---
*Requirements defined: 2026-06-20*
*Last updated: 2026-06-20 after roadmap creation (phases 94-97 mapped; 21/21 requirements covered)*
