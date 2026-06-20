# Architecture Research — Shared LangGraph Estimate Engine (v4.3)

**Domain:** Multi-channel agentic estimate pipeline (web UI + MCP + WhatsApp) on Next.js 16 + Inngest + LangGraph + Supabase
**Researched:** 2026-06-20
**Confidence:** HIGH (integration points read from actual source; graph↔durable-execution trade-offs verified against current ecosystem docs)

---

## Executive Summary

The milestone goal — "extract the WhatsApp StateGraph into a shared canonical domain graph consumed by web, MCP, and WhatsApp" — is achievable with **modest, well-bounded refactoring** because the hard part is already done: `generateEstimateForProject` (`lib/services/generate-estimate.ts`) is the single generation core all three channels already share. What diverges today is (1) orchestration and (2) the quality/refinement intelligence that only WhatsApp has (`evaluateVagueness → askDetails`).

The central finding: **the current WhatsApp graph conflates three concerns that must be separated to make it shareable** — (a) channel-specific media *ingestion* (WhatsApp media download + Whisper/Vision via OpenRouter, done inside `processMessageNode`), (b) the *domain core* (generate → assess quality → refine decision), and (c) channel-specific *reply/session* side-effects (`sendConfirmation`, `askDetails`, `sendError`, `whatsapp_sessions` writes). Only (b) is canonical. Web already performs (a) decoupled at upload time via separate Inngest jobs (`transcribe-audio.ts`, `analyze-photos.ts`), and that decoupling is a strength to preserve — not a divergence to eliminate.

Recommended shape: a **shared domain graph that enters at `generate`** with ingestion modeled as a *pluggable pre-node* (no-op/passthrough for web & MCP because transcripts/descriptions already exist on the project; WhatsApp media-download node for WhatsApp). Channel-specific reply is modeled as a *pluggable terminal handler* injected via a channel adapter, not hard-coded nodes. For graph↔Inngest, **keep the whole-graph-in-one-`step.run` pattern initially** (option a) to de-risk the extraction, then **graduate the two expensive operations (AI generate, AI assess) to their own `step.run` checkpoints via a thin "step runner" the graph calls** (a pragmatic hybrid of options a and b) — never adopt LangGraph's own checkpointer (option c), which would double-persist state Inngest already owns and add a second recovery model with no benefit here.

---

## Current Architecture (verified from source)

### What each channel does today

```
WHATSAPP (has the full intelligence)
  webhook → handler.ts (processInboundWithDebounce)
    ├─ pre-flight: read receipt, typing, session lookup, entitlement gate, draft project
    ├─ debounce buffer (Redis, 5s) → batch
    └─ inngest.send(EVENT_WHATSAPP_PROCESS)
         → whatsapp-process.ts (whatsAppProcessJob, retries:1, onFailure→fallback reply)
             step.run('refresh-typing')
             step.run('orchestrate-estimate')   ◄── ENTIRE graph inside ONE step
                 graph.invoke():
                   supervisor → Send[] fan-out → processMessage (×N, PARALLEL)
                     │  (per message: WhatsApp media download + OpenRouter
                     │   transcribe/vision + INSERT recordings/photos)
                   → gather → checkInputs
                   → generateEstimate  (calls generateEstimateForProject, channel:'whatsapp')
                   → evaluateVagueness (re-reads estimate, isVagueEstimate)
                   → askDetails | sendConfirmation | sendError
                       (whatsapp_sessions INSERT + sendWhatsAppMessage + logOutboundMessage)

  (second graph, session-state inbound)
  handler.ts (awaiting_confirm) → EVENT_WHATSAPP_INTENT
    → whatsAppIntentRouterJob → intent-router.ts (classifyAndRoute)
        normalize → ChatOpenAI classify → CONFIRM_OR_CANCEL | EDIT | CREATE | QUERY
        CREATE → processInboundMessages (re-enters the create path above)

WEB (linear, no intelligence)
  POST /api/generate-estimate (auth + ratelimit + quota + requestId/attemptId/inputType)
    → inngest.send(EVENT_ESTIMATE_GENERATE)
       → generate-estimate.ts (generateEstimateJob, retries:2, onFailure→ai_job.failed)
           step.run('call-ai-provider')  → generateEstimateForProject
           step.run('record-usage')      → recordUsage (idempotent)
  Ingestion DECOUPLED & earlier:
    upload → EVENT_TRANSCRIBE_AUDIO → transcribe-audio.ts (whisper-transcribe + save)
    upload → EVENT_ANALYZE_PHOTOS   → analyze-photos.ts (step.run per photo + record-usage)
  ⇒ by generation time, recordings.transcript & photos.ai_description already exist.

MCP (linear, no intelligence)
  create_estimate (write.ts) → verify project tenancy
    → inngest.send(EVENT_ESTIMATE_GENERATE, prompts:[prompt])   ◄── SAME path as web
  check_job_status → polls Inngest REST /v1/events/{id}/runs
```

### Component responsibilities (today)

| Component | Owns today | Canonical? |
|-----------|-----------|------------|
| `lib/services/generate-estimate.ts` `generateEstimateForProject` | Gather project/recordings/photos/company → AI provider → persist estimate+sections+items, version mgmt, client auto-link, math validation | **YES — already shared by all 3** |
| `lib/whatsapp/estimate-graph.ts` | Orchestration + WhatsApp ingestion + quality assessment + WhatsApp reply/session | Partly — only the orchestration + quality logic is canonical |
| `processMessageNode` (in graph) | WhatsApp media download + OpenRouter transcribe/vision + insert recordings/photos | **NO** — WhatsApp-specific ingestion |
| `transcribe-audio.ts` / `analyze-photos.ts` | Web/upload-time ingestion (Whisper/Vision), checkpointed per item | **NO** — channel ingestion, but the RIGHT pattern |
| `evaluateVaguenessNode` + `ask-details.ts` (`isVagueEstimate`, `buildAskDetailsMessage`, `revertVagueEstimate`) | Quality assessment + refinement decision | **YES — the intelligence to share** |
| `sendConfirmation`/`askDetails`/`sendError` nodes | `whatsapp_sessions` writes + `sendWhatsAppMessage` + `logOutboundMessage` | **NO** — WhatsApp edge/reply |
| Inngest functions (`whatsapp-process`, `generate-estimate`) | Durability, retries, idempotency, `onFailure`, pipeline_events, notifications, quota | **YES — keep as the durability boundary** |

---

## Recommended Architecture

### Layered model — separate ingestion / domain core / channel edges

```
┌───────────────────────────────────────────────────────────────────────┐
│ CHANNEL ENTRY (Inngest functions — durability boundary, per channel)   │
│  whatsapp-process.ts   generate-estimate.ts   (MCP reuses web fn)       │
│  step.run wrappers • retries • onFailure • idempotency • pipeline_events│
└───────────────┬───────────────────────────────────────────────────────┘
                │ invoke(sharedGraph, initialState, { channelAdapter })
                ▼
┌───────────────────────────────────────────────────────────────────────┐
│ SHARED DOMAIN GRAPH   lib/estimate/graph/                               │
│                                                                         │
│   START → ingest? → generate → assess → decide ──┬─► refine/askDetails  │
│            (plug)   (CORE)    (CORE)  (CORE)      └─► finalize           │
│                                                                         │
│   ingest, refine/askDetails, finalize = CHANNEL-PLUGGED edge nodes      │
│   generate, assess, decide            = CANONICAL domain nodes          │
└───────────────┬───────────────────────────────────────────────────────┘
                │ generate node calls ↓
                ▼
┌───────────────────────────────────────────────────────────────────────┐
│ GENERATION CORE  lib/services/generate-estimate.ts  (UNCHANGED today)   │
│  generateEstimateForProject(companyId, projectId, opts)                 │
└───────────────────────────────────────────────────────────────────────┘
```

### The canonical graph (channel-agnostic nodes)

| Node | Responsibility | Implementation |
|------|----------------|----------------|
| `ingest` (pluggable) | Ensure project has usable inputs. **Web/MCP: passthrough** (transcripts/descriptions already persisted) → routes to `generate` or to a "no inputs" terminal. **WhatsApp: download media + OpenRouter transcribe/vision + insert** (lifted from `processMessageNode`, incl. the `Send` fan-out). | Channel adapter supplies the node fn; default = passthrough that checks `hasUsableInputs(projectId)`. |
| `generate` (CORE) | Call `generateEstimateForProject(companyId, projectId, opts)`; never re-throw — set `generationFailed` flag on error (current WhatsApp node behavior, generalized). | Shared. `opts.channel`/`opts.prompts` threaded from state. |
| `assess` (CORE) | Re-read estimate, run `isVagueEstimate` (lifted from `ask-details.ts`, kept channel-neutral). Produces `isVague`. | Shared. This is the "intelligence parity" win for web/MCP. |
| `decide` (CORE, conditional edge) | `generationFailed → onError`; `isVague → refine`; else `finalize`. | Shared edge function. |
| `refine` (pluggable) | What to do when quality is low. **WhatsApp: `revertVagueEstimate` + open `awaiting_details` session + `buildAskDetailsMessage` reply.** **Web/MCP (v1): finalize-with-flag** (persist a `needs_detail`/low-confidence marker on the estimate so the UI/result can prompt; no conversational loop yet). | Channel adapter. |
| `finalize` (pluggable) | **WhatsApp: open `awaiting_confirm` session + `sendConfirmation`.** **Web/MCP: no-op** (estimate row + revalidate is already done inside `generateEstimateForProject`; the HTTP/poll layer surfaces it). | Channel adapter. |
| `onError` (pluggable) | **WhatsApp: `sendError` reply.** **Web/MCP: re-throw** so the Inngest `onFailure` path (ai_job.failed notification, terminal pipeline_event) fires exactly as today. | Channel adapter. |

**Key design decision — the channel adapter.** Rather than building three separate `StateGraph` instances, build **one graph whose pluggable nodes are resolved from a `ChannelAdapter`** passed into a `buildEstimateGraph(adapter)` factory that closes over the adapter — mirroring the existing `buildEstimateGraph()` factory and the `makeQueryTools(companyId, supabase)` closure pattern already in the repo (more type-safe here than LangGraph `configurable`). The adapter interface:

```typescript
// lib/estimate/graph/types.ts
export interface ChannelAdapter {
  channel: 'web' | 'mcp' | 'whatsapp'
  ingest(state: EstimateState): Promise<Partial<EstimateState>>   // web/mcp = passthrough
  refine(state: EstimateState): Promise<Partial<EstimateState>>   // web/mcp = mark + finalize
  finalize(state: EstimateState): Promise<Partial<EstimateState>> // web/mcp = no-op
  onError(state: EstimateState): Promise<Partial<EstimateState>>  // web/mcp = throw
}
```

This keeps the canonical `generate → assess → decide` core defined exactly once and lets each channel "plug only its edge nodes," which is the literal milestone requirement.

---

## Decision 1 — graph ↔ Inngest checkpoint granularity

**Recommendation: (a) now → pragmatic hybrid of (a)+(b) later. Never (c).**

### The three options, with verified trade-offs

| Option | Durability on retry | Cost of re-running AI | Complexity | Observability | Coupling |
|--------|--------------------|--------------------|-----------|---------------|----------|
| **(a) Whole graph in one `step.run`** *(current WhatsApp)* | Retry re-runs the WHOLE graph — re-downloads media, re-transcribes, re-generates, re-assesses. No per-node checkpoint. | **HIGH** — a transient failure in `assess` (a cheap DB read) re-charges Whisper + Vision + Claude generate. | **LOWEST** — graph stays a pure library; Inngest sees one opaque step. | One Inngest step span; node-level timing only via Langfuse. | **NONE** — graph has zero Inngest imports. |
| **(b) Each node = its own `step.run`** | Per-node durable; a retry resumes after the last completed node. | **LOWEST** — generate never re-charges if a later node fails. | **HIGHEST** — graph nodes must call `step.run`, coupling the graph to Inngest; `Send` parallel fan-out + `step.run` interplay is fiddly; harder to unit-test the graph in isolation. | Best — every node is an Inngest step span. | **TIGHT** — graph imports Inngest `step`; no longer trivially reusable outside Inngest. |
| **(c) LangGraph checkpointer + thin Inngest wrapper** | LangGraph persists state to its own store (Postgres/Supabase); resume from LangGraph checkpoint. | Low, but **you now run two durability systems**. | **HIGH + redundant** — Inngest already gives durable steps, idempotency, `onFailure`; adding a checkpointer means two recovery models, two state stores, two sources of truth for "did this run." | Split across Inngest + checkpointer; correlation pain. | Couples to a checkpointer backend you don't otherwise need. |

### Why (a) first

Verified ecosystem fact: **wrapping a whole graph (or any LangGraph segment) in a single durable step means a retry replays every node, re-executing all LLM/side-effect calls** — LangGraph nodes after a checkpoint always re-run on replay; durable-execution replay only short-circuits *completed durable steps*, and here the whole graph is a single step ([LangChain durable-execution docs](https://docs.langchain.com/oss/python/langgraph/durable-execution); [dev.to: idempotency in production LangGraph](https://dev.to/ajay_gupta_60a0393643f3e9/dont-run-it-twice-mastering-idempotency-in-production-langgraph-agents-2gmp)). The current WhatsApp code already **accepts and mitigates this**: `retries: 1` (one retry, capping re-charge blast radius), every node swallows errors and routes to a reply instead of throwing, and `generateEstimateNode` sets `generationFailed` rather than re-throwing. So option (a) is not a bug to fix during extraction — it is a known posture. Extract the graph **without** changing the durability model first, so the migration is behavior-preserving and reviewable.

### The pragmatic hybrid (target end-state) — "step runner" passed into the graph

Mapping *every* node to a `step.run` (full option b) over-couples the graph. The high-value subset is the **two expensive, non-idempotent-cost operations**: the AI **generate** call and (for WhatsApp) the per-message **transcribe/vision** calls. Make only those durable by passing a **step runner function into the graph via state/config**, defaulting to a passthrough:

```typescript
// initialState carries an injected runner; default just executes inline
type StepRunner = <T>(id: string, fn: () => Promise<T>) => Promise<T>
const passthroughRunner: StepRunner = (_id, fn) => fn()

// generate node body:
const result = await runner('ai-generate', () =>
  generateEstimateForProject(companyId, projectId, opts))
```

The Inngest function injects `runner = (id, fn) => step.run(id, fn)`; unit tests inject `passthroughRunner`. This gives per-AI-call durability (generate won't re-charge if `assess` later fails) **without** importing Inngest into the graph and **without** a second checkpointer. It is the minimum coupling that buys the maximum durability. **Defer this to a dedicated late phase** so it lands after parity is proven and can be validated against re-charge metrics in `pipeline_events`.

**Do NOT adopt (c).** Inngest already owns durability, idempotency (`event.data.batchKey` / `requestId`), and `onFailure`. A LangGraph checkpointer would duplicate state Inngest persists and introduce a second, conflicting recovery authority — verified anti-pattern for this stack ([Diagrid: checkpoints are not durable execution](https://www.diagrid.io/blog/checkpoints-are-not-durable-execution-why-langgraph-crewai-google-adk-and-others-fall-short-for-production-agent-workflows)).

---

## Decision 2 — keep web's decoupled ingestion; graph enters at `generate`

**Recommendation: KEEP decoupled ingestion. The shared graph enters at `generate`; `ingest` is a pluggable pre-node that is a passthrough for web/MCP and the media-download node for WhatsApp.**

### Why keep decoupling

- Web's `transcribe-audio.ts` / `analyze-photos.ts` already run at **upload time**, each with **per-item `step.run` checkpoints** (`whisper-transcribe`, `vision-${photo.id}`) and independent `retries: 2`. By the time `EVENT_ESTIMATE_GENERATE` fires, `recordings.transcript` and `photos.ai_description` are populated. This is *better* durability granularity than WhatsApp's in-graph ingestion, and it lets the capture UI show "Transcribing → Analyzing → Generating" progress (v1.2/v4.2 behavior). Folding ingestion back into the graph for web would **regress** both the per-item checkpointing and the staged UX.
- WhatsApp's ingestion is genuinely coupled to the channel (Meta media IDs, `downloadWhatsAppMedia`, OpenRouter transcribe/vision, `whatsapp_messages.media_url` back-writes). It belongs in a WhatsApp-supplied `ingest` node, not the canonical core.

### Entry-node design (parameterized per channel)

The graph **always starts at `ingest`**, but `ingest` is adapter-supplied:

- **Web / MCP `ingest` = passthrough guard.** It does no media work. It calls a small shared `hasUsableInputs(projectId)` check (transcripts OR photo descriptions OR `prompts` in state — the exact precondition `generateEstimateForProject` already enforces at lines 103–114) and routes: inputs present → `generate`; none → `onError`/terminal. This means web/MCP "enter mid-graph" *logically* (their first real work is `generate`) while still sharing one graph definition and one entry point.
- **WhatsApp `ingest` = the lifted `processMessageNode` + `supervisor`/`Send` fan-out.** Parallel per-message download/transcribe/vision/insert, then converge (the existing `gather` + `checkInputs` logic) before `generate`.

State carries a discriminator so nodes branch cleanly:

```typescript
const EstimateState = Annotation.Root({
  companyId, projectId,                              // all channels
  channel: Annotation<'web'|'mcp'|'whatsapp'>(),     // drives adapter-internal branching
  prompts: Annotation<string[] | undefined>(),       // web/MCP free-form (already supported)
  // WhatsApp-only (optional; undefined for web/MCP):
  ownerPhone, messages, currentMessage, mediaResults,
  // shared outputs:
  estimateId, estimateLanguage, isVague, generationFailed,
})
```

This is the current `EstimateState` plus a `channel` discriminator and `prompts` — a superset, so the WhatsApp path is unchanged and web/MCP simply leave the WhatsApp fields `undefined` (same optional-field pattern already used for `currentMessage`).

---

## Decision 3 — module layout

**Recommendation: `lib/estimate/graph/` for the shared graph + canonical nodes; channel adapters live under `lib/estimate/adapters/` (WhatsApp adapter imports existing `lib/whatsapp/*` primitives).**

```
lib/estimate/                         # NEW — the shared domain
├── graph/
│   ├── index.ts                      # buildEstimateGraph(adapter) factory (mirrors current factory)
│   ├── state.ts                      # EstimateState Annotation (superset of today's)
│   ├── types.ts                      # ChannelAdapter, StepRunner interfaces
│   └── nodes/
│       ├── generate.ts               # CORE — wraps generateEstimateForProject (no re-throw)
│       ├── assess.ts                 # CORE — isVagueEstimate (lifted, channel-neutral)
│       └── decide.ts                 # CORE — conditional edge fns
├── adapters/
│   ├── default.ts                    # web/MCP adapter: ingest=passthrough, refine=mark+finalize,
│   │                                 #   finalize=no-op, onError=throw
│   └── whatsapp.ts                   # WhatsApp adapter: ingest=media fan-out, refine=askDetails,
│                                     #   finalize=sendConfirmation, onError=sendError
└── quality/
    └── vagueness.ts                  # isVagueEstimate moved here (channel-neutral core);
                                      #   ask-details.ts keeps WhatsApp copy/session helpers

lib/services/generate-estimate.ts     # UNCHANGED — still the generation core
lib/whatsapp/estimate-graph.ts        # SHRINKS to re-export buildEstimateGraph(whatsappAdapter)
                                      #   (or is deleted once whatsapp-process.ts imports new module)
lib/whatsapp/ask-details.ts           # KEEPS buildAskDetailsMessage + revertVagueEstimate
                                      #   (WhatsApp session/copy); imports core isVagueEstimate
```

- **How WhatsApp plugs edge nodes:** `lib/estimate/adapters/whatsapp.ts` imports the existing WhatsApp primitives (`downloadWhatsAppMedia`, `transcribeAudioOR`/`analyzePhotoOR`, `sendWhatsAppMessage`, `logOutboundMessage`, `whatsapp_sessions` writes, `revertVagueEstimate`, `buildAskDetailsMessage`) and supplies them as `ingest`/`refine`/`finalize`/`onError`. The WhatsApp-only `channel:'whatsapp'` flag continues to flow into `generateEstimateForProject` for the system-prompt addendum (lines 171–176) via the generate node.
- **How web/MCP enter mid-graph:** they invoke `buildEstimateGraph(defaultAdapter)`; the default `ingest` is a passthrough guard, so the first substantive node is `generate`. No separate "linear" path — `generate-estimate.ts` swaps its `step.run('call-ai-provider')` body to `graph.invoke(...)` (initially still wrapped in that one step → preserves option (a) durability and the existing `record-usage`/notification/pipeline_event steps around it).

---

## Integration Points (where the wiring lands)

| # | Integration point | Action |
|---|-------------------|--------|
| 1 | `lib/services/generate-estimate.ts` | **No change** — remains the generation core the `generate` node calls. (This is the load-bearing fact that makes the milestone cheap.) |
| 2 | `lib/inngest/functions/whatsapp-process.ts` `step.run('orchestrate-estimate')` | Repoint import from `@/lib/whatsapp/estimate-graph` to `@/lib/estimate/graph` + `whatsappAdapter`. Initial state gains `channel:'whatsapp'`. **Durability model unchanged** (still one step). |
| 3 | `lib/inngest/functions/generate-estimate.ts` `step.run('call-ai-provider')` | Replace the direct `generateEstimateForProject` call with `graph.invoke(defaultAdapter, {channel, prompts, language, ...})`. Keep `record-usage`, `onFailure`, `recordPipelineEvent`, notifications as-is. This is the line that gives web parity (assess/refine). |
| 4 | `lib/mcp/tools/write.ts` `create_estimate` | **No change** — it already dispatches `EVENT_ESTIMATE_GENERATE`; it inherits the upgraded graph for free via integration point 3. (Confirms MCP needs zero new code for parity.) |
| 5 | `app/api/generate-estimate/route.ts` | **No change** — same event, same payload. |
| 6 | `lib/whatsapp/ask-details.ts` → new `lib/estimate/quality/vagueness.ts` | Move `isVagueEstimate` to the channel-neutral core; WhatsApp keeps copy + session helpers and imports the core checker. |
| 7 | `lib/inngest/events.ts` `EstimateGeneratePayload` | Optionally add `channel?` (web/mcp) so the generate node can thread it; backward-compatible (already the pattern for `attemptId`/`inputType`). |
| 8 | `pipeline_events` (`lib/observability/pipeline-events.ts`) | Extend step vocabulary to record `assess`/`refine` for web/MCP so the new intelligence is observable in the existing Super-Admin event log (v4.2). Langfuse traces wrap `graph.invoke` once per channel. |
| 9 | `lib/whatsapp/intent-router.ts` | **Out of scope / no change.** This is a *separate* conversational-routing graph for session-state inbound; it ultimately calls `processInboundMessages` → the create path. It is not part of the create-time domain graph and should not be merged in this milestone. |

---

## New vs Modified (explicit)

### New components
- `lib/estimate/graph/` — `index.ts` (factory), `state.ts`, `types.ts` (`ChannelAdapter`, `StepRunner`), `nodes/generate.ts`, `nodes/assess.ts`, `nodes/decide.ts`
- `lib/estimate/adapters/default.ts` (web/MCP) and `lib/estimate/adapters/whatsapp.ts`
- `lib/estimate/quality/vagueness.ts` (channel-neutral `isVagueEstimate` + a `hasUsableInputs` guard)
- (Later phase) `StepRunner` injection wiring in the two Inngest functions

### Modified components
- `lib/inngest/functions/whatsapp-process.ts` — import swap + `channel:'whatsapp'` in initial state (durability unchanged)
- `lib/inngest/functions/generate-estimate.ts` — `call-ai-provider` step body now invokes the shared graph with the default adapter (this is the parity change)
- `lib/whatsapp/estimate-graph.ts` — shrinks to a thin re-export of `buildEstimateGraph(whatsappAdapter)`, then is deleted once `whatsapp-process.ts` imports the new module directly
- `lib/whatsapp/ask-details.ts` — re-exports/imports the moved `isVagueEstimate`; keeps WhatsApp session + copy helpers
- `lib/inngest/events.ts` — additive `channel?` on `EstimateGeneratePayload`
- `lib/observability/pipeline-events.ts` — additive `assess`/`refine` step values

### Explicitly unchanged (and why that matters)
- `lib/services/generate-estimate.ts` (generation core), `lib/mcp/tools/write.ts` (inherits via shared event), `app/api/generate-estimate/route.ts`, `lib/inngest/functions/transcribe-audio.ts` + `analyze-photos.ts` (decoupled ingestion preserved), `lib/whatsapp/intent-router.ts` (separate graph).

---

## Suggested Build Order (dependency-aware, de-risking first)

Ordering principle: **extract behind the most-tested channel first without changing its behavior, then migrate the simplest channel, then add intelligence, then optimize durability last.**

1. **Phase A — Extract the canonical core behind WhatsApp (behavior-preserving).**
   Create `lib/estimate/graph/` + `whatsappAdapter` by *moving* the existing WhatsApp nodes into the adapter and the `generate/assess/decide` nodes into the core. Repoint `whatsapp-process.ts`. **No durability change, no new intelligence, no web/MCP change.** WhatsApp is the channel with the richest test suite and the existing graph — if the extraction is faithful, its tests stay green. This de-risks the refactor itself. *Depends on: nothing.*

2. **Phase B — Migrate web/MCP onto the shared graph with the default adapter (generate-only parity first).**
   Swap `generate-estimate.ts` `call-ai-provider` to `graph.invoke(defaultAdapter)` where the default `ingest` = passthrough guard and `assess`/`refine`/`finalize` initially behave as *no-op finalize* (functionally identical to today's linear path). MCP comes along for free. **Goal: identical output to today, now flowing through the graph.** Proves the shared graph works for web/MCP before behavior changes. *Depends on: A.*

3. **Phase C — Turn on intelligence parity for web/MCP.**
   Implement the default adapter's real `assess` (`isVagueEstimate`) + `refine` (persist a low-confidence/`needs_detail` marker; surface in UI / MCP result). First *behavior* change for web/MCP, isolated to the default adapter. *Depends on: B.*

4. **Phase D — Unified observability.**
   Langfuse tracing around `graph.invoke` for all channels + `pipeline_events` `assess`/`refine` rows + tests/UAT across channels. *Depends on: A–C (so there is something uniform to observe).*

5. **Phase E (last, optional) — Durability granularity refactor.**
   Introduce the `StepRunner` injection so the AI `generate` call (and WhatsApp transcribe/vision) become their own `step.run` checkpoints, reducing re-charge on retry. Validate against `pipeline_events` retry/re-charge data gathered in D. Done last because it is an optimization, touches the durability contract, and benefits from the observability built in D. *Depends on: A, D.*

**Why this order de-risks:** the riskiest mechanical change (graph extraction) happens behind the best test coverage (A); the riskiest *product* change (web behavior) is split into a no-op migration (B) then an opt-in behavior flip (C); the change that touches money/durability (E) is last, after metrics exist to prove it helps.

---

## Anti-Patterns to Avoid

| Anti-pattern | Why it's wrong here | Do instead |
|--------------|--------------------|-----------|
| Adding a LangGraph checkpointer "for durability" | Inngest already owns durability/idempotency/onFailure; a checkpointer adds a second state store and a conflicting recovery authority | Keep Inngest as the sole durability boundary; inject a `StepRunner` only for the expensive AI nodes |
| Mapping every node to a `step.run` in one pass | Couples the graph to Inngest, complicates `Send` fan-out, breaks isolated unit-testing | Default to whole-graph-in-one-step; graduate only AI nodes via injected runner |
| Folding web ingestion into the graph | Regresses per-item checkpointing in `transcribe-audio`/`analyze-photos` and the staged capture UX | Keep ingestion decoupled; graph `ingest` is a passthrough guard for web/MCP |
| Three separate `StateGraph` instances per channel | Re-duplicates the orchestration you're trying to unify | One graph + `ChannelAdapter`; channels plug only edge nodes |
| Merging the intent-router graph into the create graph | It's a different concern (conversational routing over existing data) on a different trigger | Leave `intent-router.ts` untouched; it already re-enters the create path via `processInboundMessages` |
| Changing durability + extracting the graph in one phase | Two big variables at once → unreviewable, hard to bisect | Extract behavior-preserving first (Phase A), optimize durability last (Phase E) |

---

## Sources

- [LangChain — Durable execution (official docs)](https://docs.langchain.com/oss/python/langgraph/durable-execution) — HIGH: nodes after a checkpoint re-execute on replay; durability short-circuits only completed durable steps.
- [Diagrid — Checkpoints Are Not Durable Execution](https://www.diagrid.io/blog/checkpoints-are-not-durable-execution-why-langgraph-crewai-google-adk-and-others-fall-short-for-production-agent-workflows) — MEDIUM: checkpointer ≠ durable execution; don't stack two recovery models.
- [dev.to — Don't Run It Twice: Idempotency in Production LangGraph Agents](https://dev.to/ajay_gupta_60a0393643f3e9/dont-run-it-twice-mastering-idempotency-in-production-langgraph-agents-2gmp) — MEDIUM: side-effectful nodes must be idempotent because replay re-fires LLM/API calls.
- [Inngest — Idempotency](https://www.inngest.com/docs/guides/handling-idempotency) and [Errors & Retries](https://www.inngest.com/docs/guides/error-handling) — MEDIUM: event-id + function idempotency keys; per-step retry/replay semantics (matches the repo's `event.data.batchKey` / `requestId` usage).
- Primary source: the Xtimator codebase (read 2026-06-20) — `lib/whatsapp/estimate-graph.ts`, `lib/inngest/functions/{whatsapp-process,generate-estimate,transcribe-audio,analyze-photos}.ts`, `lib/services/generate-estimate.ts`, `lib/mcp/tools/write.ts`, `lib/whatsapp/{handler,intent-router,ask-details}.ts`, `lib/inngest/events.ts`, `app/api/generate-estimate/route.ts` — HIGH.

---
*Architecture research for: shared multi-channel LangGraph estimate engine (Xtimator v4.3)*
*Researched: 2026-06-20*
