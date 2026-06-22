# Phase 94: Extract Canonical Graph Behind WhatsApp (behavior-preserving) + StepRunner Seam - Research

**Researched:** 2026-06-20
**Domain:** Refactoring a channel-specific LangGraph `StateGraph` into a shared, channel-neutral domain core driven by a `ChannelAdapter` closure-factory, behind Inngest durability, without changing observable WhatsApp behavior.
**Confidence:** HIGH — every claim below is grounded in source read on 2026-06-20 (`estimate-graph.ts`, `ask-details.ts`, `whatsapp-process.ts`, `query-tools.ts`, `generate-estimate.ts`, `client.ts`, `confirm-actions.ts`, the two anchor test files, `vitest.config.ts`, `package.json`) plus the authoritative `.planning/research/{ARCHITECTURE,PITFALLS,STACK}.md`.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Module layout**
- **D-01:** New shared module `lib/estimate/graph/` holds the canonical graph: graph builder/wiring, the `Annotation.Root` state, and the channel-neutral core nodes (`generate`, `assess`/vagueness).
- **D-02:** New `lib/estimate/adapters/` holds channel adapters: `whatsapp.ts` (this phase) and a `default.ts` stub for web/MCP (wired in Phase 95 — created but minimal here).
- **D-03:** New `lib/estimate/quality/vagueness.ts` holds the extracted `isVagueEstimate` gate (moved verbatim from `lib/whatsapp/ask-details.ts`; re-export from the old path if needed to avoid breaking other importers).
- **D-04:** `lib/whatsapp/estimate-graph.ts` becomes a thin wiring layer that composes the shared graph + the WhatsApp adapter and preserves the existing `buildEstimateGraph()` export signature so `lib/inngest/functions/whatsapp-process.ts` needs zero or minimal change. (Whether it becomes a pure re-export or is deleted with `whatsapp-process.ts` updated is Claude's discretion during planning.)

**ChannelAdapter abstraction**
- **D-05:** `ChannelAdapter` is a **closure-factory**, mirroring the existing `makeQueryTools(companyId, supabase)` pattern. It returns the channel's edge behaviors only: `ingest` (turn raw inputs into persisted recordings/photos), `finalize` (deliver the result — WhatsApp: `sendConfirmation`/`askDetails` reply), and `onError` (terminal failure side-effect — WhatsApp: `sendError`).
- **D-06:** The core graph nodes (`generate`, `assess`) are channel-neutral and receive NO channel-specific objects. All WhatsApp-specific concerns (media download, `sendWhatsAppMessage`, sessions, `ownerPhone`) live in the WhatsApp adapter's closure, never in the core.

**Graph state shape**
- **D-07:** Canonical state (`Annotation.Root`) is channel-neutral: `companyId`, `projectId`, input refs, `estimateId`, `estimateLanguage`, `isVague`, and a `failure?` channel. It MUST NOT contain `ownerPhone`, `WhatsAppMessage`, or `currentMessage` — those stay in the WhatsApp adapter.
- **D-08:** The parallel media fan-out (`Send` + the `mediaResults` reducer) is preserved, but lives inside the WhatsApp adapter's `ingest` (it is WhatsApp inbound-media specific). The web/MCP `ingest` is a passthrough (transcripts/descriptions already exist).

**Never-throw invariant (QA-01 / ENGINE-04)**
- **D-09:** Core nodes signal failure via the `failure?` state channel — they NEVER throw and NEVER call channel I/O directly. The adapter's `onError`/`finalize` maps a terminal failure outcome to the channel reply. Preserves the existing `generationFailed → sendError` semantics.
- **D-10:** A frozen regression test asserts the WhatsApp never-throw/always-reply guarantee survives extraction: on every failure path (no usable input, generation throw, vague), the owner still gets exactly one reply. This test is the safety net for the refactor.

**StepRunner seam (DURABLE-01)**
- **D-11:** Define a minimal `StepRunner` interface (e.g. `run<T>(name: string, fn: () => Promise<T>): Promise<T>`) injected into the graph builder. The DEFAULT runner is a **passthrough** that just calls `fn()` — so behavior is unchanged today. This is the seam that lets AI-heavy nodes be promoted to their own durable Inngest `step.run` LATER without coupling the core graph to Inngest. Scaffold only — no node is actually decomposed in this phase.

**graph↔Inngest checkpoint granularity (DURABLE-02)**
- **D-12:** DECIDED for this milestone: keep the **whole-graph-inside-one-`step.run`** model (current WhatsApp pattern). Inngest owns durability/idempotency/`onFailure`; **no LangGraph checkpointer** is added (in-memory savers don't survive retries; a Postgres saver duplicates Inngest's state). Finer resume is achieved later via Inngest step decomposition through the injected `StepRunner`, not a checkpointer. Capture this as a short decision artifact in the phase (rationale + when to revisit).

**Behavior-preserving migration strategy**
- **D-13:** Build the shared graph + WhatsApp adapter, then rewire `lib/whatsapp/estimate-graph.ts` to compose them while keeping `buildEstimateGraph()`'s external contract stable. `whatsapp-process.ts` should remain untouched (or minimally touched). Verify by running the existing WhatsApp test suites — they must stay green with no assertion changes (only mock-path updates if a file moved).

### Claude's Discretion
- Exact `StepRunner` interface signature and where the default passthrough lives.
- Exact internal file split within `lib/estimate/graph/` (one file vs state/nodes/builder split).
- Whether `lib/whatsapp/estimate-graph.ts` ends as a re-export shim or is removed with `whatsapp-process.ts` updated to import from `lib/estimate/`.
- Whether `default.ts` adapter is a real stub now or a placeholder filled in Phase 95.

### Deferred Ideas (OUT OF SCOPE)
- **Web + MCP migration onto the shared graph** → Phase 95.
- **Auto-refine (1×) + `needs_details` verdict surfacing** → Phase 96.
- **Unified Langfuse v5 observability + Sentry coexistence** → Phase 97.
- **Full per-node durability decomposition** (each AI call = its own `step.run`) → deferred until OBS metrics justify it (out of scope for v4.3; only the `StepRunner` seam ships now).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| ENGINE-01 | Shared, channel-neutral estimate domain graph in a dedicated module (`lib/estimate/graph/`), state carries NO channel-specific fields. | "Channel-Neutral State Shape" + "What Moves Where" sections map every current `EstimateState` field to core-vs-adapter. |
| ENGINE-02 | `ChannelAdapter` closure-factory (mirrors `makeQueryTools`) lets each channel plug only edge behaviors. | "ChannelAdapter Interface Proposal" + `makeQueryTools` template at `lib/whatsapp/query-tools.ts:59`. |
| ENGINE-03 | Deterministic `isVagueEstimate` gate extracted into shared graph, reused verbatim (no LLM). | "Extracting the vagueness gate" — the function at `ask-details.ts:26` is pure; move to `lib/estimate/quality/vagueness.ts`, re-export from old path. |
| ENGINE-04 | Shared graph preserves never-throw / always-finalize: nodes signal failure via `failure?` state, adapter maps to channel reply. | "Never-throw invariant" section + current `generationFailed` flag (`estimate-graph.ts:56,254`) generalized to `failure?`. |
| CHAN-01 | WhatsApp consumes the shared graph; current `estimate-graph.ts` behavior preserved exactly; media fan-out + reply/session become adapter edge nodes. | "WhatsApp Adapter Composition" + "What Moves Where" (processMessage/Send/sessions → adapter). |
| DURABLE-01 | `StepRunner` abstraction defined + injected; default passthrough; no node decomposed. | "StepRunner Interface Proposal" — injected into `buildEstimateGraph`, default `passthroughRunner`. |
| DURABLE-02 | graph↔Inngest checkpoint-granularity decision captured as artifact (no LangGraph checkpointer; when to decompose). | "Decision Artifact (DURABLE-02)" section — ready-to-commit content. |
| QA-01 | Frozen regression test asserts WhatsApp never-throw/always-reply survives extraction. | "Validation Architecture" → QA-01 frozen test design (3 failure paths → exactly one reply). |
</phase_requirements>

## Summary

The extraction is **modest and well-bounded** because the load-bearing fact already holds: `generateEstimateForProject` (`lib/services/generate-estimate.ts`) is already channel-agnostic and is **not touched** in this phase. The WhatsApp `StateGraph` (`lib/whatsapp/estimate-graph.ts`) conflates three concerns — (a) WhatsApp inbound-media *ingestion* (`processMessage` fan-out: download + transcribe/vision + insert `recordings`/`photos`), (b) the *domain core* (`generateEstimate` → `evaluateVagueness` → decide), and (c) WhatsApp *reply/session* side-effects (`askDetails`/`sendConfirmation`/`sendError` writing `whatsapp_sessions` + `sendWhatsAppMessage` + `logOutboundMessage`). Only (b) is canonical. This phase lifts (b) into `lib/estimate/graph/`, leaves (a) and (c) in a WhatsApp adapter under `lib/estimate/adapters/whatsapp.ts`, and rewires `lib/whatsapp/estimate-graph.ts` to compose them while keeping `buildEstimateGraph()`'s signature byte-stable so `whatsapp-process.ts` is untouched.

The single largest risk is **a "behavior-preserving" trap created by the existing tests themselves**: the two anchor tests (`tests/unit/inngest/whatsapp-process-job.test.ts` and `tests/unit/inngest/generate-estimate-job.test.ts`) are **source-text assertions** — they `readFileSync('lib/whatsapp/estimate-graph.ts')` and regex for tokens like `generateEstimateForProject(`, `isVagueEstimate(`, `buildAskDetailsMessage(`, `revertVagueEstimate(`, `awaiting_details`, `generationFailed`, `checkGeneratedEdge`, and the literal `addConditionalEdges('generateEstimate', checkGeneratedEdge` wiring. If `lib/whatsapp/estimate-graph.ts` shrinks to a bare re-export, those tokens vanish from that file and **the suite breaks even though runtime behavior is identical**. This is the decisive constraint on D-04: either (i) `whatsapp-process.ts` continues to call a `lib/whatsapp/estimate-graph.ts` that still composes the WhatsApp adapter (so the WhatsApp-specific tokens — `revertVagueEstimate`, `buildAskDetailsMessage`, `awaiting_details`, `sendError` wiring — remain visible in that file via the adapter being co-located/re-exported there), or (ii) the two source-asserting tests are updated to point at the new file paths. Per CONTEXT D-13 ("only mock-path updates if a file moved"), updating the `readFileSync` *paths* in those tests is permitted; changing their *assertions* is the red flag that behavior changed.

**Primary recommendation:** Build `lib/estimate/graph/` (state + `generate`/`assess`/`decide` core + `buildEstimateGraph(adapter, { runner })` factory) and `lib/estimate/adapters/whatsapp.ts` (ingest fan-out + finalize reply/session + onError). Generalize `generationFailed` → a `failure?` channel. Move `isVagueEstimate` to `lib/estimate/quality/vagueness.ts` and re-export from `ask-details.ts`. Inject a `StepRunner` with a `passthroughRunner` default (no node decomposed). Keep the whole-graph-in-one-`step.run` model and write the DURABLE-02 decision artifact. Add the QA-01 frozen never-throw test. Keep `buildEstimateGraph()` callable with zero args (default WhatsApp adapter + passthrough runner) OR repoint `whatsapp-process.ts` to the explicit composition — and update only the `readFileSync` paths in the two anchor tests, never their assertions.

## Project Constraints (from CLAUDE.md)

- **GSD workflow enforcement:** all file edits go through a GSD command (this is a research-only task — no edits beyond writing this RESEARCH.md).
- **Tech stack is fixed:** Next.js 16 (App Router), TypeScript strict, `@langchain/langgraph@^1.3.3` (installed 1.3.6), `@langchain/core@^1.1.48`, `inngest@^4.4.0`, Supabase service-role client server-side only. AI via OpenRouter/Anthropic server-side.
- **Service-role key never in browser; all AI calls server-side.** The shared core runs under Inngest (service-role) — RLS is bypassed, so the explicit `.eq('company_id', companyId)` filter is the SOLE tenant-isolation control. Carry `companyId` as trusted closure/state, never LLM-derived (T-lrf-01 invariant; QA-02 lives in Phase 96 but the pattern must not regress here).
- **Secret handling:** no secrets in any doc, including this one and the DURABLE-02 decision artifact.
- **No new dependencies** for this phase (STACK.md confirms: no checkpoint package, LangGraph/LangChain v1 stays as-is; Langfuse v5 migration is Phase 97).

## Standard Stack

No new packages. Everything needed is installed and on the stable LangGraph v1 line.

### Core
| Library | Version (installed) | Purpose | Why Standard |
|---------|--------------------|---------|--------------|
| `@langchain/langgraph` | 1.3.6 (range `^1.3.3`) | `StateGraph`, `Annotation.Root`, `Send`, `START`/`END`, `addConditionalEdges` — the exact primitives the current graph uses | GA v1 with no-breaking-changes-until-2.0 commitment; `StateGraph` is the correct primitive for a deterministic domain pipeline (NOT `createReactAgent`). |
| `@langchain/core` | 1.1.48 | `tool` + zod (used by `makeQueryTools`; relevant only as the closure-factory template here) | Already the project's core; satisfies all peer deps. |
| `inngest` | 4.4.0 | Durability boundary (`step.run`, `retries`, `idempotency`, `onFailure`) | Sole durability layer — the `StepRunner` seam will later let nodes opt into `step.run` without the core importing Inngest. |

### Supporting (test only)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `vitest` | 4.1.4 | Test runner (`npm test` → `vitest run`) | All unit tests, including the QA-01 frozen regression test. jsdom env, `@` alias to repo root, `server-only` stubbed (see `vitest.config.ts`). |

### Alternatives Considered (all rejected — see STACK.md)
| Instead of | Could Use | Why rejected for Phase 94 |
|------------|-----------|---------------------------|
| Inngest `step.run` durability | LangGraph `MemorySaver`/`PostgresSaver` checkpointer | Double-durability; `MemorySaver` lost on Inngest replay; Postgres saver duplicates Inngest state. DURABLE-02 explicitly forbids it. |
| Hand-built `StateGraph` | `createReactAgent` / `createAgent` | The estimate flow is a deterministic pipeline, not a tool-loop. Needless rewrite + nondeterminism. |
| Bump LangGraph to 1.4.4 | — | Optional housekeeping, NOT this phase. Keep 1.3.6. |

**Installation:** none.

**Version verification:** confirmed installed `@langchain/langgraph` is `1.3.6` (read from `node_modules/@langchain/langgraph/package.json`). `package.json` declares the ranges above. No `npm install` needed for this phase.

## Architecture Patterns

### Recommended Module Structure (from ARCHITECTURE.md D-01..04, scoped to THIS phase)

```
lib/estimate/                          # NEW shared domain (only WhatsApp wired this phase)
├── graph/
│   ├── index.ts          # buildEstimateGraph(adapter, { runner }) factory
│   ├── state.ts          # EstimateState Annotation (channel-neutral)
│   ├── types.ts          # ChannelAdapter, StepRunner interfaces
│   └── nodes/
│       ├── generate.ts   # CORE — wraps generateEstimateForProject via runner; never throws → failure?
│       ├── assess.ts     # CORE — reads estimate, runs isVagueEstimate → isVague
│       └── decide.ts     # CORE — conditional-edge fns (checkInputs / checkGenerated / checkVague)
├── adapters/
│   ├── whatsapp.ts       # WhatsApp adapter: ingest (Send fan-out + media), finalize (confirm/askDetails), onError (sendError)
│   └── default.ts        # web/MCP stub — minimal placeholder, filled in Phase 95 (Claude's discretion: real stub vs placeholder)
└── quality/
    └── vagueness.ts      # isVagueEstimate moved here (channel-neutral); + (optional) hasUsableInputs guard

lib/services/generate-estimate.ts      # UNCHANGED — generation core
lib/whatsapp/estimate-graph.ts         # thin wiring: composes shared graph + whatsapp adapter; keeps buildEstimateGraph() signature (D-04)
lib/whatsapp/ask-details.ts            # KEEPS buildAskDetailsMessage + revertVagueEstimate; re-exports isVagueEstimate from quality/vagueness.ts (D-03)
```

> **Decision note (Claude's discretion, D-04):** Two viable shapes for keeping the anchor tests green — (A) `lib/whatsapp/estimate-graph.ts` *imports the whatsapp adapter and re-exports* the WhatsApp-specific helpers it composes, so the source-text tokens (`revertVagueEstimate`, `buildAskDetailsMessage`, `awaiting_details`, `sendError`) remain literally present in that file; or (B) move the whatsapp adapter's reply/session code into `lib/estimate/adapters/whatsapp.ts` and update the two anchor tests' `readFileSync` *paths* to point at the new files (allowed under D-13 — path change, not assertion change). Recommend (B) for clean separation, with a planning task explicitly listing the path updates. See "Common Pitfalls → Source-text test breakage".

### Current Graph Shape (verified from `lib/whatsapp/estimate-graph.ts`)

Flow: `START → supervisor → (supervisorEdge: Send[] fan-out) → processMessage[] (parallel) → gather → (checkInputsEdge) → generateEstimate → (checkGeneratedEdge) → evaluateVagueness → (checkVagueEdge) → askDetails | sendConfirmation | sendError → END`.

**Nodes (8) and edges (verified line refs):**
| Node | Lines | Role | Classification |
|------|-------|------|----------------|
| `supervisor` | 69-71 | no-op; fan-out happens on its conditional edge | WhatsApp adapter (ingest entry) |
| `supervisorEdge` | 75-81 | returns `Send('processMessage', {...state, currentMessage: msg})` per message, or `END` if none | WhatsApp adapter (ingest) |
| `processMessage` | 87-222 | per-message: text→insert recording; audio→download+upload+Whisper(OR)+insert; image→download+upload+vision(OR)+insert; never re-throws (`T-mq2-01`), returns `mediaResults` | WhatsApp adapter (ingest) |
| `gather` | 228-230 | no-op convergence | WhatsApp adapter (ingest) — convergence after fan-out |
| `checkInputsEdge` | 233-235 | `mediaResults.some(ok) ? 'generateEstimate' : 'sendError'` | Split: "has usable input" is the core precondition; routing to `sendError` is adapter terminal |
| `generateEstimate` | 241-258 | calls `generateEstimateForProject(companyId, projectId, {channel:'whatsapp'})`; **never re-throws** — sets `generationFailed` on catch | **CORE** (`generate`) |
| `checkGeneratedEdge` | 262-266 | `generationFailed \|\| !estimateId ? 'sendError' : 'evaluateVagueness'` | **CORE** (`decide`) → adapter terminal |
| `evaluateVagueness` | 272-283 | re-reads estimate (`total`, sections→items), runs `isVagueEstimate` → `isVague` | **CORE** (`assess`) |
| `checkVagueEdge` | 286-288 | `isVague ? 'askDetails' : 'sendConfirmation'` | **CORE** (`decide`) → adapter terminal |
| `askDetails` | 294-330 | `revertVagueEstimate` + insert `whatsapp_sessions` (`awaiting_details`, TTL) + `sendWhatsAppMessage` + `logOutboundMessage` | WhatsApp adapter (finalize/refine) |
| `sendConfirmation` | 336-390 | insert `whatsapp_sessions` (`awaiting_confirm`) + read estimate + `sendWhatsAppMessage` + `logOutboundMessage` | WhatsApp adapter (finalize) |
| `sendError` | 396-418 | `sendWhatsAppMessage` (two copies: generation-failed vs no-input) + `logOutboundMessage` | WhatsApp adapter (onError) |

**`Send` fan-out + reducer (D-08, preserve verbatim):** `mediaResults` (lines 46-49) uses reducer `(cur, update) => [...cur, ...update]`, default `() => []`. This is the only reducer; it accumulates across parallel branches. It is **commutative** (order-independent) — keep it that way (PITFALLS gotcha: parallel-written channels need a commutative reducer). The `Send[]` MUST stay on the conditional **edge** (`supervisorEdge`), never returned from a node (`InvalidUpdateError`). All of this lives inside the WhatsApp adapter's `ingest` after extraction.

### Pattern 1: ChannelAdapter as a closure-factory (mirrors `makeQueryTools`)
**What:** A factory that captures trusted scope (`companyId`, `supabase`, and for WhatsApp `ownerPhone`) in a closure and returns a small set of edge functions. Mirrors `makeQueryTools(companyId, supabase)` at `lib/whatsapp/query-tools.ts:59` — the tenant value is a closure param, never an input field.
**When to use:** Always for this phase — it is the literal requirement (ENGINE-02) and keeps multi-tenant isolation a closure invariant.

**Proposed interface (`lib/estimate/graph/types.ts`):**
```typescript
// Channel-neutral graph state (see state.ts). The adapter edge fns receive it and
// return a Partial<EstimateState> just like LangGraph nodes do.
import type { EstimateState } from './state'

export interface ChannelAdapter {
  /** Discriminator; threaded into generate node opts where relevant. */
  channel: 'whatsapp' | 'web' | 'mcp'

  /**
   * Turn raw channel inputs into persisted recordings/photos so the core's
   * "at least one transcript/photo/prompt" precondition holds.
   * WhatsApp: the Send fan-out + media download/transcribe/vision (today's
   *   processMessage). Web/MCP: passthrough (already ingested upstream).
   * Returns a Partial<EstimateState> (e.g. mediaResults / a usable-inputs flag).
   * NEVER throws — failures become state (mediaResults ok:false), exactly as today.
   */
  ingest(state: EstimateState): Promise<Partial<EstimateState>>

  /**
   * Deliver the successful result on the channel.
   * WhatsApp: branch on state.isVague — askDetails (revert + awaiting_details
   *   session + reply) vs sendConfirmation (awaiting_confirm session + reply).
   * Web/MCP: no-op (HTTP/poll layer surfaces the estimate).
   */
  finalize(state: EstimateState): Promise<Partial<EstimateState>>

  /**
   * Terminal failure side-effect. Reached when state.failure is set or no usable
   * input. WhatsApp: sendError reply (the two-copy message). Web/MCP: re-throw so
   * the Inngest onFailure fires (Phase 95 concern).
   */
  onError(state: EstimateState): Promise<Partial<EstimateState>>
}

/** Factory shape (closure-capture trusted scope, like makeQueryTools). */
export type MakeChannelAdapter = (args: {
  companyId: string
  supabase: SupabaseClient
  ownerPhone?: string   // WhatsApp-only; absent for web/MCP
}) => ChannelAdapter
```

> **Composition note:** CONTEXT D-05 lists three edge behaviors (`ingest`, `finalize`, `onError`). The current graph has a `refine` path (`askDetails`) distinct from `finalize` (`sendConfirmation`). For Phase 94 the cleanest behavior-preserving mapping is to fold the vague-vs-confirm branch **inside** WhatsApp's `finalize` (it reads `state.isVague` and does the right reply), keeping the adapter surface to exactly the 3 functions D-05 names. Phase 96 later splits `refine` out as its own edge when auto-refine lands. Either shape is acceptable; recommend the 3-function surface now to match D-05 verbatim.

### Pattern 2: StepRunner injected at the factory, default passthrough
**What:** A function the `generate` node (and later other AI nodes) calls to wrap expensive work, so the wrapping can become an Inngest `step.run` later without the core importing Inngest.
**When to use:** Define and inject now; use it only in the `generate` node body this phase; do NOT decompose any node into multiple steps (scaffold only — D-11).

**Proposed interface (`lib/estimate/graph/types.ts`):**
```typescript
/** Wrap a unit of work so it can later become an Inngest step.run. */
export interface StepRunner {
  run<T>(name: string, fn: () => Promise<T>): Promise<T>
}

/** Default — execute inline, no durability change. Behavior identical to today. */
export const passthroughRunner: StepRunner = {
  run: (_name, fn) => fn(),
}
```
Injected into the factory: `buildEstimateGraph(adapter, { runner = passthroughRunner } = {})`. The `generate` node uses it: `const result = await runner.run('ai-generate', () => generateEstimateForProject(companyId, projectId, opts))`. With the passthrough default this is exactly today's call — zero behavior change. Later (deferred phase) the Inngest function injects `{ run: (name, fn) => step.run(name, fn) }`.

> **Discretion (D-11):** interface shape (`run<T>(name, fn)` method vs a bare `<T>(name, fn) => Promise<T>` function type) and where `passthroughRunner` lives are Claude's call. Recommend the object-with-`run` form above (clearer at call sites, easy to inject Inngest's `step`). Keep `passthroughRunner` co-located in `types.ts` or a tiny `runner.ts`.

### Channel-Neutral State Shape (D-07) — what stays, what moves

Current `EstimateState` (`estimate-graph.ts:40-57`) → proposed split:

| Current field | Line | Phase 94 destination |
|---------------|------|----------------------|
| `companyId: string` | 41 | **CORE state** (trusted) |
| `projectId: string` | 42 | **CORE state** (trusted) |
| `ownerPhone: string` | 43 | **WhatsApp adapter closure** — REMOVE from core state |
| `messages: WhatsAppMessage[]` | 44 | **WhatsApp adapter closure/ingest input** — REMOVE from core state |
| `currentMessage: WhatsAppMessage?` | 45 | **WhatsApp adapter ingest internal** (Send payload) — REMOVE from core state |
| `mediaResults: Array<{msgId,ok,reason?}>` (+reducer) | 46-49 | **WhatsApp adapter ingest internal** — REMOVE from core; reducer preserved inside adapter |
| `estimateId: string?` | 50 | **CORE state** (output of generate) |
| `estimateLanguage: string?` | 51 | **CORE state** (output of generate; used by adapter for reply copy) |
| `isVague: boolean?` | 52 | **CORE state** (output of assess) |
| `generationFailed: boolean?` | 56 | **Generalize → `failure?: { reason: string }` CORE channel** (ENGINE-04). Adapter reads it in onError. |

**Proposed core `EstimateState` (`lib/estimate/graph/state.ts`):**
```typescript
import { Annotation } from '@langchain/langgraph'

export const EstimateState = Annotation.Root({
  companyId: Annotation<string>(),
  projectId: Annotation<string>(),
  channel: Annotation<'whatsapp' | 'web' | 'mcp'>(),     // discriminator (success criterion 1)
  prompts: Annotation<string[] | undefined>(),            // web/MCP free-form; undefined for WA
  estimateId: Annotation<string | undefined>(),
  estimateLanguage: Annotation<string | undefined>(),
  isVague: Annotation<boolean | undefined>(),
  failure: Annotation<{ reason: string } | undefined>(),  // replaces generationFailed (ENGINE-04)
  refineAttempts: Annotation<number | undefined>(),       // scaffolded for Phase 96 (criterion 1 lists it)
})
```
> **Where do WhatsApp-only fields live now?** Inside the WhatsApp adapter. The adapter's `ingest` needs `messages`/`currentMessage`/`mediaResults` and `ownerPhone`. Two viable approaches: (a) the adapter runs its own internal `Send` fan-out using a state shape that *extends* the core annotation with WhatsApp fields (a superset Annotation defined in `adapters/whatsapp.ts`), OR (b) the WhatsApp wiring keeps a thin WhatsApp-specific Annotation that includes the core fields plus WhatsApp fields, and the core nodes only ever read core fields. ARCHITECTURE.md sketches the superset approach (its `state.ts` keeps WhatsApp fields optional). **Recommendation:** keep the *core* annotation strictly neutral (success criterion 1 + the "zero WhatsApp imports in core" static check), and let `adapters/whatsapp.ts` define a `WhatsAppEstimateState` that includes the WhatsApp fields + the Send fan-out. The WhatsApp wiring file composes them. This is the cleanest way to satisfy criterion 1's "static check confirms the shared core has zero WhatsApp imports."

### Anti-Patterns to Avoid (from PITFALLS.md, scoped to Phase 94)
- **`ownerPhone` / `WhatsAppMessage` / `whatsapp_*` / `sendWhatsAppMessage` / `downloadWhatsAppMedia` in the shared core.** Grep the core module for these — must be zero (success criterion 1). They belong in the adapter only.
- **Letting a shared node `throw` "so web can surface a clean error."** Re-arms the silent-failure bug. Core nodes set `failure?`; the adapter decides what to do. (Phase 95/96 is where web's throw-on-failure lands, in its adapter — not the core.)
- **Adding any LangGraph checkpointer.** Forbidden by DURABLE-02. The graph stays `graph.compile()` with no checkpointer (line 444 today).
- **Decomposing nodes into multiple `step.run` now.** DURABLE-01 is scaffold-only — inject the runner, default passthrough, decompose nothing.
- **Replacing `isVagueEstimate` with an LLM.** It is deterministic and zero-cost; reuse verbatim (ENGINE-03).
- **Minting `Date.now()` / `randomUUID()` in a node that could replay.** The `askDetails`/`sendConfirmation` nodes compute `expiresAt = Date.now() + TTL` (lines 304, 342). Today this is safe because the whole graph is one atomic `step.run`. Since the durability model is unchanged this phase, this stays safe — but flag it in the adapter so the deferred decomposition phase coalesces TTLs from state (PITFALLS Pitfall 2).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Durable resume / retry / idempotency for the graph | A LangGraph checkpointer, a custom retry loop, or a second state store | Inngest `step.run` + `retries` + `idempotency` (already wrapping the graph) | Two durability systems = double-persist + conflicting recovery authority (DURABLE-02; STACK.md §1). |
| "Is this estimate too thin to send?" | A new LLM quality scorer | The existing deterministic `isVagueEstimate` (`ask-details.ts:26`) moved verbatim | Zero cost, zero latency, already tested (`ask-details.test.ts`). ENGINE-03. |
| Multi-tenant scoping of shared queries | Passing `companyId` as a node/tool input | Closure-capture (`makeQueryTools` pattern) + `.eq('company_id', companyId)` on every query | Service role bypasses RLS; the explicit filter is the only isolation. T-lrf-01. |
| Parallel media accumulation | A manual array-merge with locking | The existing LangGraph `Annotation` reducer `(cur,update)=>[...cur,...update]` | Commutative, order-independent, already correct (`estimate-graph.ts:46-49`). |
| WhatsApp send/format/PDF/session logic | Re-implementing reply/session code in the core | Import existing `lib/whatsapp/*` primitives **into the adapter** | Keeps the core neutral; the adapter is the only place WhatsApp code lives. |

**Key insight:** This phase is a **move**, not a rewrite. Every node body, the `Send` fan-out, the reducer, and the never-throw catches already exist and are tested — the work is relocating them across a clean core/adapter boundary while keeping `buildEstimateGraph()`'s signature and the source-text tests' tokens intact.

## Common Pitfalls

### Pitfall 1: Source-text test breakage (the #1 trap for this phase)
**What goes wrong:** `tests/unit/inngest/whatsapp-process-job.test.ts` reads `lib/whatsapp/estimate-graph.ts` via `readFileSync` (lines 28-31) and asserts tokens are present in *that file*: `generateEstimateForProject`, `awaiting_details`, `isVagueEstimate(`, `buildAskDetailsMessage(`, `revertVagueEstimate(`, `generationFailed`, `checkGeneratedEdge`, and the literal `addConditionalEdges('generateEstimate', checkGeneratedEdge`. If the graph is moved out of that file, these regexes fail even though behavior is identical.
**Why it happens:** The test is a *structural* guard, not a behavioral one. Moving code is exactly what trips it.
**How to avoid:** Decide the D-04 shape deliberately. If the WhatsApp adapter/reply code moves to `lib/estimate/adapters/whatsapp.ts` and the core to `lib/estimate/graph/`, update the `readFileSync` *paths* (and possibly split into reads of two files) so the same tokens are asserted at their new homes — a **path/mock update, allowed by D-13**. Do NOT delete or weaken assertions. If a token must move files (e.g. `generationFailed` → `failure`), that is a *behavioral-contract* change and the test assertion must be updated to match the new contract intentionally (and noted in the plan), not silently.
**Warning signs:** Any assertion (not path) in these two tests needs changing → stop and confirm the extraction didn't alter behavior.

### Pitfall 2: `failure` rename leaks the never-throw guarantee
**What goes wrong:** Generalizing `generationFailed` → `failure?` touches the catch in `generateEstimateNode` (line 254), the `checkGeneratedEdge` (line 263), and `sendErrorNode`'s message-selection (line 406, which branches on `state.generationFailed`). Miss one and either the wrong error copy is sent or a failure path stops routing to the reply.
**Why it happens:** The flag is read in three places across node + edge + reply.
**How to avoid:** Map all three explicitly: `generate` sets `failure = { reason: 'generation_failed' }` instead of `generationFailed = true`; `decide` checks `state.failure || !state.estimateId`; the WhatsApp `onError` picks the copy from `state.failure?.reason` (generation-failed copy vs no-input copy). Keep both copies byte-identical to lines 407-408 so the QA-01 test's text assertions hold.
**Warning signs:** The "no usable input" path and the "generation threw" path send the same message (they must differ — see `sendErrorNode` lines 406-408).

### Pitfall 3: `whatsapp-process.ts` initial state drift
**What goes wrong:** `whatsapp-process.ts` (lines 83-93) invokes `graph.invoke({ companyId, projectId, ownerPhone, messages, currentMessage, mediaResults, estimateId, estimateLanguage, isVague })`. If the core state no longer has `ownerPhone`/`messages`/`currentMessage`/`mediaResults`, this object shape must move into the WhatsApp wiring/adapter (which builds the WhatsApp-superset initial state), or `whatsapp-process.ts` must pass `channel:'whatsapp'` + the WhatsApp inputs through the adapter factory.
**How to avoid:** Per D-13, keep `whatsapp-process.ts` untouched if possible: have `buildEstimateGraph()` (zero-arg, WhatsApp default) accept the same initial-state shape it does today. If `whatsapp-process.ts` is repointed (Claude's discretion), the only change is the import path + adding `channel:'whatsapp'` — the anchor test asserts `step.run('orchestrate-estimate'` and `buildEstimateGraph(` are present (lines 50-51), so those tokens must remain.
**Warning signs:** TypeScript error on the `graph.invoke({...})` object, or the `whatsapp-process-job` test's `buildEstimateGraph(` / `orchestrate-estimate` regex failing.

### Pitfall 4: `isVagueEstimate` import cycle / dual ownership
**What goes wrong:** Moving `isVagueEstimate` to `lib/estimate/quality/vagueness.ts` while `ask-details.ts` still exports it (re-export per D-03) can create confusion about the source of truth, and the `ask-details.test.ts` imports `isVagueEstimate` from `@/lib/whatsapp/ask-details` (line 3).
**How to avoid:** Move the function + its `VagueCheckEstimate` type to `vagueness.ts`; in `ask-details.ts` add `export { isVagueEstimate, type VagueCheckEstimate } from '@/lib/estimate/quality/vagueness'`. `ask-details.test.ts` then passes unchanged (re-export keeps the old import path valid) — this satisfies D-03's "re-export from the old path if needed."
**Warning signs:** `ask-details.test.ts` fails its `isVagueEstimate` cases → the re-export is missing or the move changed logic (it must be verbatim).

## Code Examples

### Current never-throw generate node (the core's `generate`, to preserve)
```typescript
// Source: lib/whatsapp/estimate-graph.ts:241-258 (verified 2026-06-20)
async function generateEstimateNode(state) {
  // NEVER re-throw: a throw propagates out of graph.invoke → fails the Inngest
  // step → job dies with NO reply (the recurring silent-failure bug).
  try {
    const result = await generateEstimateForProject(state.companyId, state.projectId, { channel: 'whatsapp' })
    return { estimateId: result.estimateId, estimateLanguage: result.language }
  } catch (err) {
    return { generationFailed: true }   // → becomes failure: { reason: 'generation_failed' }
  }
}
```
**Phase 94 core version (channel-neutral, runner-wrapped):**
```typescript
// lib/estimate/graph/nodes/generate.ts — channel threaded from state; never throws
export const makeGenerateNode = (runner: StepRunner) => async (state: EstimateState) => {
  try {
    const opts = state.channel === 'whatsapp' ? { channel: 'whatsapp' as const, prompts: state.prompts }
                                              : { prompts: state.prompts }
    const result = await runner.run('ai-generate', () =>
      generateEstimateForProject(state.companyId, state.projectId, opts))
    return { estimateId: result.estimateId, estimateLanguage: result.language }
  } catch (err) {
    return { failure: { reason: 'generation_failed' } }   // ENGINE-04: failure-as-state
  }
}
```

### Closure-factory tenant invariant to mirror (ChannelAdapter template)
```typescript
// Source: lib/whatsapp/query-tools.ts:59 — companyId is a CLOSURE param, never an input field.
export function makeQueryTools(companyId: string, supabase: SupabaseClient) {
  // every query: .eq('company_id', companyId)  ← sole isolation under service role
  ...
}
```

### Current `Send` fan-out (stays inside WhatsApp adapter ingest)
```typescript
// Source: lib/whatsapp/estimate-graph.ts:75-81 — Send[] on the EDGE, not a node return.
function supervisorEdge(state) {
  const msgs = state.messages ?? []
  if (msgs.length === 0) return END
  return msgs.map((msg) => new Send('processMessage', { ...state, currentMessage: msg }))
}
```

## Decision Artifact (DURABLE-02) — ready-to-commit content

The plan should produce a short artifact (e.g. `lib/estimate/graph/CHECKPOINTING.md` or a doc block in `index.ts`). Content:

> **graph ↔ Inngest checkpoint granularity (decided 2026-06-20, v4.3).**
> **Decision:** The whole estimate graph runs inside ONE Inngest `step.run`. Inngest is the SOLE durability layer (retries, idempotency via `event.data.batchKey`/`requestId`, `onFailure`). **No LangGraph checkpointer** (`MemorySaver`/`PostgresSaver`/`SqliteSaver`) is added.
> **Why no checkpointer:** `MemorySaver` is per-process and is lost when Inngest replays the step on a fresh worker (the "Pod B" problem). A Postgres/Sqlite saver duplicates the state Inngest already owns and creates a second, conflicting recovery authority. Cross-message "wait for the owner's reply" is already handled by `whatsapp_sessions` rows + new Inngest events, not a LangGraph `interrupt`.
> **Cost trade-off accepted:** a retry after a successful AI generate re-runs the whole graph and re-charges the AI call. Today this is bounded by `retries: 1` on `whatsapp-process` + the never-throw → terminal-reply discipline.
> **When to revisit / how to get finer resume:** promote individual AI-heavy nodes to their own `step.run` via the injected `StepRunner` (the Inngest function injects `{ run: (name, fn) => step.run(name, fn) }`), NOT a checkpointer. Do this only once OBS metrics (Phase 97) show retry re-charge is material. The `StepRunner` seam ships now (DURABLE-01) so this is later a wiring change, not a refactor.

## State of the Art

| Old approach | Current approach | When changed | Impact for this phase |
|--------------|------------------|--------------|-----------------------|
| LangGraph v0 (`langchain` meta-package, legacy callbacks) | LangGraph v1 GA (`@langchain/langgraph@1.x`, `StateGraph`/`Annotation.Root`/`Send` stable, no breaking changes until 2.0) | LangGraph 1.0 GA (2025) | Safe to keep the exact primitives the current graph uses; no API migration needed. |
| Checkpointer-as-durability for HITL | Durable-execution runtime (Inngest) owns durability; checkpointer only for in-process resume | ecosystem consensus 2025 | Reinforces DURABLE-02 — no checkpointer. |

**Deprecated/outdated:** none relevant to Phase 94. (Langfuse v3→v5 is a Phase 97 concern, not here.)

## Open Questions

1. **`refineAttempts` in core state now or in Phase 96?**
   - What we know: Phase 94 success criterion 1 (ROADMAP) explicitly lists `refineAttempts` in the channel-neutral state; CONTEXT D-07 does not mention it.
   - What's unclear: whether to scaffold the field this phase or defer.
   - Recommendation: scaffold the `refineAttempts?: number` field in `state.ts` now (criterion 1 is authoritative for "what must be TRUE"), leave it unused — zero behavior impact, avoids a state-shape change in Phase 96.

2. **3-function adapter (`ingest`/`finalize`/`onError`) vs 4-function (`+refine`)?**
   - What we know: D-05 names exactly 3; ARCHITECTURE.md sketches `refine` as a 4th. The current graph's vague path (`askDetails`) is distinct from confirm (`sendConfirmation`).
   - Recommendation: 3-function surface for Phase 94 (fold vague-vs-confirm inside WhatsApp `finalize` by reading `state.isVague`), matching D-05 verbatim. Split `refine` out in Phase 96 when auto-refine needs it. Flag in the plan so Phase 96 knows the seam.

3. **Re-export shim vs file-move for `lib/whatsapp/estimate-graph.ts` (D-04 discretion).**
   - Recommendation: move to the new module and update the two anchor tests' `readFileSync` paths (allowed). Document the exact path edits as an explicit planning task so the "behavior-preserving" gate is auditable.

## Environment Availability

Step 2.6: SKIPPED for external services — this phase is a code-only refactor with no new tools/services/runtimes. The only environment dependency is the existing test runner:

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `vitest` (via `npm test`) | QA-01 frozen test + keeping suite green | ✓ | 4.1.4 | — |
| `@langchain/langgraph` | the graph itself | ✓ | 1.3.6 | — |
| Inngest dev (`npx inngest-cli dev`) | optional manual smoke only | ✓ (dev dep workflow) | latest | not needed for unit gates |

No missing dependencies. No network/API access required to validate this phase (all node-level behavior is unit-tested with mocked Supabase/AI, per the existing test patterns).

## Validation Architecture

`workflow.nyquist_validation` is `true` in `.planning/config.json` → this section is REQUIRED and drives VALIDATION.md.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.4 (jsdom env, `globals: true`, `@`→repo root alias, `server-only` stubbed) |
| Config file | `vitest.config.ts` |
| Quick run command | `npx vitest run tests/unit/whatsapp tests/unit/inngest/whatsapp-process-job.test.ts` |
| Full suite command | `npm test` (→ `vitest run`, includes `tests/unit/**` + `tests/integration/**`) |

### Phase Requirements → Test Map
| Req ID | Behavior to validate | Test type | Automated command | File exists? |
|--------|----------------------|-----------|-------------------|--------------|
| ENGINE-01 | Shared core state is channel-neutral; core module imports NO `lib/whatsapp/*` and references no `ownerPhone`/`whatsapp_*`/`sendWhatsAppMessage`/`WhatsAppMessage` | static (source-grep) | `npx vitest run tests/unit/estimate/graph-neutrality.test.ts` | ❌ Wave 0 |
| ENGINE-02 | `buildEstimateGraph(adapter)` accepts a `ChannelAdapter`; the WhatsApp adapter is a closure-factory capturing trusted `companyId` (no tenant input field) | unit | `npx vitest run tests/unit/estimate/channel-adapter.test.ts` | ❌ Wave 0 |
| ENGINE-03 | `isVagueEstimate` available from `lib/estimate/quality/vagueness.ts`, identical truth table; old `@/lib/whatsapp/ask-details` import still works (re-export) | unit | `npx vitest run tests/unit/estimate/vagueness.test.ts tests/unit/whatsapp/ask-details.test.ts` | ⚠️ partial — `ask-details.test.ts` exists; new vagueness test ❌ Wave 0 |
| ENGINE-04 | Core nodes never throw; `generate` failure sets `failure?` (not throw); `decide` routes failure to the adapter terminal | unit | `npx vitest run tests/unit/estimate/never-throw.test.ts` | ❌ Wave 0 |
| CHAN-01 | WhatsApp runs entirely on the shared graph; `buildEstimateGraph()` signature stable; `whatsapp-process.ts` still calls it via `orchestrate-estimate` step | static + unit | `npx vitest run tests/unit/inngest/whatsapp-process-job.test.ts` (paths updated, assertions unchanged) | ✅ (path-update only) |
| DURABLE-01 | `StepRunner` defined; default `passthroughRunner.run(name, fn)` returns `fn()` unchanged; graph builder accepts an injected runner | unit | `npx vitest run tests/unit/estimate/step-runner.test.ts` | ❌ Wave 0 |
| DURABLE-02 | Decision artifact exists and states "no LangGraph checkpointer; Inngest sole durability"; graph compiled with NO checkpointer | static (source-grep) | `npx vitest run tests/unit/estimate/no-checkpointer.test.ts` (assert artifact present + `.compile()` has no saver arg) | ❌ Wave 0 |
| QA-01 | Frozen: on each WhatsApp failure path (no usable input / generation throw / vague), the owner gets EXACTLY ONE reply | unit (behavioral) | `npx vitest run tests/unit/whatsapp/never-reply-regression.test.ts` | ❌ Wave 0 |

### QA-01 frozen-test design (the safety net — most important)
The current safety net is structural (`whatsapp-process-job.test.ts` greps source). QA-01 should add a **behavioral** test that invokes the WhatsApp-composed graph with mocked `sendWhatsAppMessage`/Supabase/AI and asserts reply count:
- **Path A — no usable input:** `messages` produce all `mediaResults.ok:false` (or empty) → `checkInputsEdge` → onError → exactly one `sendWhatsAppMessage` with the no-input copy ("couldn't process your message").
- **Path B — generation throws:** `generateEstimateForProject` mock rejects → `generate` sets `failure` (does NOT throw) → `decide` → onError → exactly one `sendWhatsAppMessage` with the generation-failed copy.
- **Path C — vague estimate:** AI returns total 0 / no items → `assess` `isVague:true` → finalize(askDetails) → `revertVagueEstimate` called + `awaiting_details` session insert + exactly one `sendWhatsAppMessage` (ask-details copy).
- **Invariant across all paths:** `graph.invoke(...)` resolves (never rejects) AND `sendWhatsAppMessage` is called exactly once. Mirror the mock style of `tests/unit/whatsapp/ask-details.test.ts` (chainable Supabase mock) and `query-tools.test.ts`.

### Sampling Rate
- **Per task commit:** `npx vitest run tests/unit/estimate tests/unit/whatsapp` (fast; covers the new module + the WhatsApp safety net).
- **Per wave merge:** `npm test` (full suite — the behavior-preserving gate: every existing WhatsApp + Inngest test green with NO assertion changes).
- **Phase gate:** full suite green before `/gsd:verify-work`; plus the explicit "no assertion changed in pre-existing tests, only `readFileSync` paths" audit (D-13).

### Wave 0 Gaps
- [ ] `tests/unit/estimate/graph-neutrality.test.ts` — source-grep core has zero WhatsApp imports (ENGINE-01, success criterion 1).
- [ ] `tests/unit/estimate/channel-adapter.test.ts` — adapter is a closure-factory; no tenant input field (ENGINE-02, T-lrf-01 pattern).
- [ ] `tests/unit/estimate/vagueness.test.ts` — `isVagueEstimate` truth table at new path (ENGINE-03).
- [ ] `tests/unit/estimate/never-throw.test.ts` — core nodes never throw; failure-as-state (ENGINE-04).
- [ ] `tests/unit/estimate/step-runner.test.ts` — `passthroughRunner` + injection (DURABLE-01).
- [ ] `tests/unit/estimate/no-checkpointer.test.ts` — artifact present + no saver on `.compile()` (DURABLE-02).
- [ ] `tests/unit/whatsapp/never-reply-regression.test.ts` — the QA-01 frozen behavioral test (3 failure paths → 1 reply).
- [ ] **Path updates (NOT assertion changes)** in `tests/unit/inngest/whatsapp-process-job.test.ts` if files move — update `readFileSync` targets only (D-13).
- [ ] Re-export wiring so `tests/unit/whatsapp/ask-details.test.ts` passes unchanged (ENGINE-03 / D-03).
- Framework install: none — Vitest already present.

## Sources

### Primary (HIGH confidence — codebase, read 2026-06-20)
- `lib/whatsapp/estimate-graph.ts` — full graph: 8 nodes, `Send` fan-out (75-81), `mediaResults` reducer (46-49), never-throw catches (213-221, 254-257), conditional edges (433-441), `buildEstimateGraph()` (443-445), `graph.compile()` no checkpointer (444).
- `lib/whatsapp/ask-details.ts` — `isVagueEstimate` (26-32, pure), `buildAskDetailsMessage` (53-55), `revertVagueEstimate` (64-77), `VagueCheckEstimate` type.
- `lib/inngest/functions/whatsapp-process.ts` — single `step.run('orchestrate-estimate')` (80-94), `retries:1`, `idempotency:'event.data.batchKey'`, `onFailure`→`sendFallbackReply` (47-62), initial `graph.invoke` shape (83-93).
- `lib/whatsapp/query-tools.ts` — `makeQueryTools(companyId, supabase)` closure-factory (59), T-lrf-01 header (7-21), `.eq('company_id', companyId)` everywhere.
- `lib/services/generate-estimate.ts` — `generateEstimateForProject` (65), `GenerateEstimateOptions` (`language`/`prompts`/`channel:'whatsapp'`, 29-48), input precondition (103-114), unchanged this phase.
- `lib/whatsapp/client.ts` — `sendWhatsAppMessage` (14), `downloadWhatsAppMedia` (95) — WhatsApp side-effects that stay in the adapter.
- `lib/whatsapp/confirm-actions.ts` — confirm-flow side-effects (separate from create graph; not extracted, but confirms WhatsApp-only nature of reply/session code).
- `tests/unit/inngest/whatsapp-process-job.test.ts` — source-text anchor test (readFileSync of `estimate-graph.ts` + token regexes; the behavior-preserving constraint).
- `tests/unit/whatsapp/ask-details.test.ts` — `isVagueEstimate`/`buildAskDetailsMessage`/`revertVagueEstimate` unit tests (import from `@/lib/whatsapp/ask-details`).
- `tests/unit/whatsapp/query-tools.test.ts` — the "no tenant input field" + "every query company-scoped" template (T-lrf-01).
- `tests/unit/inngest/generate-estimate-job.test.ts` — source-text anchor for the web job (step-split contract; relevant to Phase 95 but confirms the source-grep test style).
- `vitest.config.ts`, `package.json` — framework + installed versions; `node_modules/@langchain/langgraph/package.json` → 1.3.6.
- `.planning/REQUIREMENTS.md`, `.planning/ROADMAP.md` (Phase 94 block + 5 success criteria, lines 1045-1055), `.planning/config.json`.

### Secondary (HIGH — authoritative phase research)
- `.planning/research/ARCHITECTURE.md` — module layout, `ChannelAdapter` sketch, graph↔Inngest decision, build order (Phase A = this phase).
- `.planning/research/PITFALLS.md` — never-throw regression (Pitfall 4), double-durability (1), channel divergence (5), multi-tenant (6), step-replay non-determinism (2), checkpointer conflict (3).
- `.planning/research/STACK.md` — no new checkpoint package; LangGraph/LangChain v1 stays; `MemorySaver`/`PostgresSaver` already transitive (do not wire).

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — versions read from installed `node_modules` + `package.json`; no new deps.
- Architecture / extraction mapping: HIGH — every node/edge/field mapped from source with line refs.
- Pitfalls: HIGH — the source-text-test trap is verified by reading the actual `readFileSync` assertions; never-throw chain verified in source.
- StepRunner / ChannelAdapter interfaces: HIGH (template = real `makeQueryTools`); exact signatures are Claude's discretion (D-05/D-11).

**Research date:** 2026-06-20
**Valid until:** 2026-07-20 (stable — internal refactor, no fast-moving external deps; the only external surface is LangGraph v1 which is API-frozen until 2.0).
