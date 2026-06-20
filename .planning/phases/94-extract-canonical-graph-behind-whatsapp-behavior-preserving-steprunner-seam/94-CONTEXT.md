# Phase 94: Extract Canonical Graph Behind WhatsApp (behavior-preserving) + StepRunner Seam - Context

**Gathered:** 2026-06-20
**Status:** Ready for planning
**Mode:** `--auto` (decisions auto-selected from research defaults; no gray areas left ambiguous)

<domain>
## Phase Boundary

Lift the WhatsApp `StateGraph` (`lib/whatsapp/estimate-graph.ts`) into a SHARED, channel-neutral estimate domain graph (`lib/estimate/graph/`) driven by a `ChannelAdapter`. The extraction is **behavior-preserving**: WhatsApp keeps producing identical behavior and its existing test suites stay green. This phase also lands two contracts the rest of the milestone depends on — the `StepRunner` seam (DURABLE-01) and the documented graph↔Inngest checkpoint-granularity decision (DURABLE-02) — plus a frozen never-throw/always-reply regression test (QA-01).

**In scope (REQs):** ENGINE-01, ENGINE-02, ENGINE-03, ENGINE-04, CHAN-01, DURABLE-01, DURABLE-02, QA-01.

**Explicitly NOT in this phase:** migrating web/MCP onto the graph (Phase 95), any new intelligence — auto-refine / `needs_details` (Phase 96), observability / Langfuse (Phase 97), and the full per-node durability refactor (deferred / out of scope for the milestone).

</domain>

<decisions>
## Implementation Decisions

### Module layout
- **D-01:** New shared module `lib/estimate/graph/` holds the canonical graph: graph builder/wiring, the `Annotation.Root` state, and the channel-neutral core nodes (`generate`, `assess`/vagueness).
- **D-02:** New `lib/estimate/adapters/` holds channel adapters: `whatsapp.ts` (this phase) and a `default.ts` stub for web/MCP (wired in Phase 95 — created but minimal here).
- **D-03:** New `lib/estimate/quality/vagueness.ts` holds the extracted `isVagueEstimate` gate (moved verbatim from `lib/whatsapp/ask-details.ts`; re-export from the old path if needed to avoid breaking other importers).
- **D-04:** `lib/whatsapp/estimate-graph.ts` becomes a thin wiring layer that composes the shared graph + the WhatsApp adapter and preserves the existing `buildEstimateGraph()` export signature so `lib/inngest/functions/whatsapp-process.ts` needs zero or minimal change. (Whether it becomes a pure re-export or is deleted with `whatsapp-process.ts` updated is Claude's discretion during planning.)

### ChannelAdapter abstraction
- **D-05:** `ChannelAdapter` is a **closure-factory**, mirroring the existing `makeQueryTools(companyId, supabase)` pattern (`lib/whatsapp/query-tools.ts`). It returns the channel's edge behaviors only: `ingest` (turn raw inputs into persisted recordings/photos), `finalize` (deliver the result — WhatsApp: `sendConfirmation`/`askDetails` reply), and `onError` (terminal failure side-effect — WhatsApp: `sendError`).
- **D-06:** The core graph nodes (`generate`, `assess`) are channel-neutral and receive NO channel-specific objects. All WhatsApp-specific concerns (media download, `sendWhatsAppMessage`, sessions, `ownerPhone`) live in the WhatsApp adapter's closure, never in the core.

### Graph state shape
- **D-07:** Canonical state (`Annotation.Root`) is channel-neutral: `companyId`, `projectId`, input refs, `estimateId`, `estimateLanguage`, `isVague`, and a `failure?` channel. It MUST NOT contain `ownerPhone`, `WhatsAppMessage`, or `currentMessage` — those stay in the WhatsApp adapter.
- **D-08:** The parallel media fan-out (`Send` + the `mediaResults` reducer) is preserved, but lives inside the WhatsApp adapter's `ingest` (it is WhatsApp inbound-media specific). The web/MCP `ingest` is a passthrough (transcripts/descriptions already exist).

### Never-throw invariant (QA-01 / ENGINE-04)
- **D-09:** Core nodes signal failure via the `failure?` state channel — they NEVER throw and NEVER call channel I/O directly. The adapter's `onError`/`finalize` maps a terminal failure outcome to the channel reply. Preserves the existing `generationFailed → sendError` semantics.
- **D-10:** A frozen regression test asserts the WhatsApp never-throw/always-reply guarantee survives extraction: on every failure path (no usable input, generation throw, vague), the owner still gets exactly one reply. This test is the safety net for the refactor.

### StepRunner seam (DURABLE-01)
- **D-11:** Define a minimal `StepRunner` interface (e.g. `run<T>(name: string, fn: () => Promise<T>): Promise<T>`) injected into the graph builder. The DEFAULT runner is a **passthrough** that just calls `fn()` — so behavior is unchanged today. This is the seam that lets AI-heavy nodes be promoted to their own durable Inngest `step.run` LATER without coupling the core graph to Inngest. Scaffold only — no node is actually decomposed in this phase.

### graph↔Inngest checkpoint granularity (DURABLE-02)
- **D-12:** DECIDED for this milestone: keep the **whole-graph-inside-one-`step.run`** model (current WhatsApp pattern). Inngest owns durability/idempotency/`onFailure`; **no LangGraph checkpointer** is added (in-memory savers don't survive retries; a Postgres saver duplicates Inngest's state). Finer resume is achieved later via Inngest step decomposition through the injected `StepRunner`, not a checkpointer. Capture this as a short decision artifact in the phase (rationale + when to revisit).

### Behavior-preserving migration strategy
- **D-13:** Build the shared graph + WhatsApp adapter, then rewire `lib/whatsapp/estimate-graph.ts` to compose them while keeping `buildEstimateGraph()`'s external contract stable. `whatsapp-process.ts` should remain untouched (or minimally touched). Verify by running the existing WhatsApp test suites — they must stay green with no assertion changes (only mock-path updates if a file moved).

### Claude's Discretion
- Exact `StepRunner` interface signature and where the default passthrough lives.
- Exact internal file split within `lib/estimate/graph/` (one file vs state/nodes/builder split).
- Whether `lib/whatsapp/estimate-graph.ts` ends as a re-export shim or is removed with `whatsapp-process.ts` updated to import from `lib/estimate/`.
- Whether `default.ts` adapter is a real stub now or a placeholder filled in Phase 95.

</decisions>

<specifics>
## Specific Ideas

- The `ChannelAdapter` should read like `makeQueryTools` — a closure capturing trusted scope (`companyId`, `supabase`, and for WhatsApp the `ownerPhone`/session), returning a small set of functions. This keeps multi-tenant isolation as a closure invariant (QA-02 territory, enforced from day one).
- "Behavior-preserving" is the hard contract for this phase: if a WhatsApp test needs an assertion changed (not just an import/mock path), that's a signal the extraction changed behavior — stop and reconcile.

</specifics>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Milestone scope & decisions
- `.planning/REQUIREMENTS.md` — ENGINE-01..04, CHAN-01, DURABLE-01/02, QA-01 (this phase's requirements) + the "Key Decisions (Critical)" table (Inngest owns durability, ChannelAdapter, failure-as-state, graph ends at verdict).
- `.planning/ROADMAP.md` — v4.3 block, Phase 94 goal + success criteria.

### Research (authoritative for this phase)
- `.planning/research/ARCHITECTURE.md` — module layout (`lib/estimate/graph/`, adapters, quality), the one-graph+ChannelAdapter shape, the graph↔Inngest decision (keep one-step, inject StepRunner, reject checkpointer), and the de-risked build order.
- `.planning/research/PITFALLS.md` — never-throw regression risk, double-durability trap, channel-divergence leaks, multi-tenant isolation, step-replay non-determinism. Each has prevention + target phase.
- `.planning/research/SUMMARY.md` — synthesis + 2 load-bearing decisions.
- `.planning/research/STACK.md` — confirms NO new checkpoint package; LangGraph/LangChain v1 stays as-is (langfuse migration is Phase 97, not here).

### Source files to extract/preserve
- `lib/whatsapp/estimate-graph.ts` — the StateGraph being extracted (nodes, Send fan-out, reducer, never-throw, conditional edges).
- `lib/whatsapp/ask-details.ts` — `isVagueEstimate` + buildAskDetailsMessage + revertVagueEstimate (gate to extract).
- `lib/inngest/functions/whatsapp-process.ts` — the single `step.run('orchestrate-estimate')` wrapper + `onFailure` fallback (the durability boundary to preserve).
- `lib/whatsapp/query-tools.ts` — read the header; the closure-scoped `companyId` pattern is the template for `ChannelAdapter` + the multi-tenant invariant.
- `lib/services/generate-estimate.ts` — `generateEstimateForProject` (the shared core the `generate` node calls; unchanged).

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `makeQueryTools(companyId, supabase)` (`lib/whatsapp/query-tools.ts`) — the closure-factory template for `ChannelAdapter`.
- The existing `StateGraph` / `Annotation.Root` / `Send` fan-out / `mediaResults` reducer in `estimate-graph.ts` — moved, not rewritten.
- `isVagueEstimate` (`lib/whatsapp/ask-details.ts`) — the deterministic, zero-cost quality gate to extract verbatim.
- `generateEstimateForProject` (`lib/services/generate-estimate.ts`) — already channel-agnostic; the `generate` node wraps it unchanged.

### Established Patterns
- Never-throw nodes that route to a `sendError`/failure terminal — must be preserved as failure-as-state + adapter `onError`.
- `Annotation` reducer (`[...cur, ...update]`) for parallel-branch accumulation — preserved inside the WhatsApp adapter `ingest`.
- `requireServiceClient()` for service-role DB access in webhook/job context.
- Whole-graph-in-one-`step.run` durability boundary (Inngest) — preserved; `StepRunner` injected as passthrough.

### Integration Points
- `lib/inngest/functions/whatsapp-process.ts` → `buildEstimateGraph()` — keep this contract stable so the Inngest job is untouched.
- WhatsApp adapter edge nodes call `sendWhatsAppMessage` / `logOutboundMessage` / `whatsapp_sessions` — these stay OUT of the shared core.

</code_context>

<deferred>
## Deferred Ideas

- **Web + MCP migration onto the shared graph** → Phase 95.
- **Auto-refine (1×) + `needs_details` verdict surfacing** → Phase 96.
- **Unified Langfuse v5 observability + Sentry coexistence** → Phase 97.
- **Full per-node durability decomposition** (each AI call = its own `step.run`) → deferred until OBS metrics justify it (out of scope for v4.3; only the `StepRunner` seam ships now).

</deferred>

---

*Phase: 94-extract-canonical-graph-behind-whatsapp-behavior-preserving-steprunner-seam*
*Context gathered: 2026-06-20*
