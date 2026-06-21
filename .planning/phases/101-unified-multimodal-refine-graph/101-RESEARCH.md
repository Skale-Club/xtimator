# Phase 101: Unified Multimodal Ingestion + Refine Through the Graph - Research

**Researched:** 2026-06-21
**Domain:** Brownfield refactor of the estimate engine — refine path unification (graph topology, shared ingestion, shared prompt builder, fallback + zod validation reuse)
**Confidence:** HIGH (all findings are grounded in the actual current source read directly, not training data; library versions confirmed from package.json)

## Summary

The refine path is today a parallel re-implementation that bypasses every hardening seam landed in Phases 99 and 100. `app/api/estimates/[id]/refine/route.ts` does its own Whisper upload+transcribe, its own per-photo vision loop, concatenates raw (unsanitized) transcript/vision text into an instruction string, then calls `getAIProvider(companyId).refineEstimate(...)` — the **non-fallback** provider — whose adapter (`OpenRouterAdapter.refineEstimate` AND `GeminiAdapter.refineEstimate`) builds a **bespoke system prompt** with none of the language / price-book / security / `sanitizeField` blocks. The result: no OpenRouter→Gemini fallback, no zod validation, no bounded retry, no injection hardening on the refine path.

This phase routes refine through the same seams as generate, **synchronously and inline** (USER DECISION 2026-06-21: refine stays a synchronous non-persisting preview, NOT dispatched via Inngest). The cleanest architecture that satisfies "through the canonical graph" + generate-equivalence with the **least editor-contract risk** is: a `makeRefineAdapter` ChannelAdapter + a core refine node, wired by a small `buildRefineGraph(adapter, { runner })` factory and invoked with the `passthroughRunner`. The refined preview is carried back on a new **channel-neutral** state field (`refined?: EstimateOutput`), the adapter's `finalize` is a no-op (no DB write — preview only), and the adapter's `onError` maps `state.failure` to a typed `XtimatorError` via the existing `failureReasonToXtimatorError`, which `asResponse` turns into the route's `{ error, code }` envelope with the correct status. The route stays a thin HTTP wrapper preserving its `{ success, refined, instruction }` shape and 422/429/demo-guard status codes.

The single biggest correctness + security win is deleting both bespoke `refineEstimate` prompt bodies and routing refine through `buildSystemPrompt`/`buildUserContent` plus `getAIProviderWithFallback().refineEstimate` (which already inherits the Phase-99 fallback and the Phase-100 `withSchemaRetry` seam — see `lib/ai/provider-with-fallback.ts` lines 86-98). A shared `lib/estimate/ingest/multimodal.ts` collapses the refine inline ingestion and the WhatsApp per-message transcription/vision into one implementation over the existing `transcribeAudioOR` / `analyzePhotoOR` primitives.

**Primary recommendation:** Build `makeRefineAdapter` + a `makeRefineNode(runner)` core node wired by `buildRefineGraph`; add a channel-neutral `refined?` (and `instruction?`/`existingEstimate?`) field to `EstimateState`; have the refine node call `getAIProviderWithFallback(companyId).refineEstimate(...)` (inheriting fallback + schema-retry); extract `lib/estimate/ingest/multimodal.ts`; extend the prompt builder with a `mode: 'refine'` branch + `buildRefineUserContent`; delete both adapters' bespoke refine prompts; keep the route a thin wrapper.

---

## Project Constraints (from CLAUDE.md)

- **Tech stack is fixed:** Next.js 16 (App Router), TypeScript strict, zod. (CLAUDE.md says "14+"; package.json shows `next 16.2.6`, `zod ^4.3.6`, `@langchain/langgraph ^1.3.3`.)
- **All AI calls server-side via API routes** — refine route + graph node run server-side; never expose service role to browser. The refine engine uses `requireServiceClient` only inside the service/adapter layer, never shipped to client.
- **Secrets:** placeholders only in any doc/seed/summary. No `sk-*`/`whsec_*`/key material anywhere in planning artifacts. (This research contains none.)
- **GSD workflow enforcement:** all edits must go through a GSD command. This is a planned phase → `/gsd:execute-phase`.
- **RLS / multi-tenant:** `company_id` scoping on every table. The refine path MUST keep `companyId` a closure/param, **never** LLM-derived (matches the `provider-with-fallback.ts` and adapter invariants).

---

## User Constraints (from CONTEXT.md)

### Locked Decisions

- **USER DECISION (2026-06-21): refine stays synchronous.** Refine reuses the shared graph/ingestion/prompt-builder/guardrails/fallback but runs **INLINE** (passthrough StepRunner), preserving the editor's preview-then-save UX. Refine is intentionally **NOT** dispatched via Inngest — it is an interactive, non-persisting preview that neither writes a version nor charges quota the way generate does. Inngest durability remains the generate/MCP contract.
- **UNIFY-01:** Extract a shared, channel-neutral multimodal ingestion module (`lib/estimate/ingest/multimodal.ts`): given raw inputs (audio blob(s), photo blob(s)/base64, free-form text) it produces `{ transcripts, photoDescriptions, texts }` using `transcribeAudioOR` + `analyzePhotoOR` (post-Phase-99 these carry the OpenRouter→Gemini fallback). Refine consumes this instead of its inline `transcribeRefineAudio` + per-photo loop. WhatsApp `processMessage` reuses the same primitives **without changing its per-message `Send[]` structure** (batch isolation is Phase 102). Web/MCP keep upload-time ingestion (separate Inngest jobs; the graph `ingest` node stays a passthrough guard). The shared module applies the existing prompt-injection sanitization boundary consistently.
- **HARD-02 / UNIFY-02:** Refine must reuse `lib/ai/prompt-builder.ts`. Replace the bespoke prompt in BOTH `OpenRouterAdapter.refineEstimate` and `GeminiAdapter.refineEstimate`. Add a refine-aware mode to the shared builder (option (a) `buildSystemPrompt(input, { mode: 'refine' })` + `buildRefineUserContent(...)`, OR (b) a thin `buildRefinePrompt` composing shared blocks — planner picks lower-churn). ONE source of language/price-book/security blocks; the refine instruction is sanitized via `sanitizeField`. Equivalent inputs → equivalent prompts (UNIFY-02).
- **HARD-01:** Route refine through the shared graph rather than calling `provider.refineEstimate` directly from the HTTP handler — a refine-capable node (or small refine sub-graph) + a refine `ChannelAdapter` whose `finalize` returns the validated refined `EstimateOutput` as a PREVIEW (no DB write) and whose `onError` maps `FailureReason` to the route's typed JSON. Invoke with the **passthrough StepRunner** inline from the route. Refine route becomes a thin HTTP wrapper (auth, demo-guard, rate-limit `refinePerMinute`, version/consolidated guards, parse FormData/JSON, hand raw inputs + existing estimate to the engine, return `{ success, refined, instruction }` or `asResponse(failure)`). PRESERVE the response contract + status codes (422 / 429 / demo-guard). Keep `estimate_activity` `estimate_refine_proposed` logging. Graph-neutrality must hold (ENGINE-01): refine node/state additions carry NO channel-specific tokens.
- **UNIFY-03:** Audio + image + text all flow through the shared ingestion module + shared prompt, with the same OpenRouter→Gemini fallbacks (Phase 99) and the same zod validation + bounded retry + guardrails (Phase 100). A refine with garbage AI output retries once then returns a typed `invalid_output` failure (inherited).
- **Equivalence (criterion 5):** generate-vs-refine equivalence test — for equivalent inputs, refine and generate execute the same ingestion + prompt builder + guardrails. Assert both call the shared ingestion + `buildSystemPrompt`; refine no longer references the deleted bespoke prompt.
- **Invariants (regression-gated):** never-throw/always-finalize; refine failures become typed responses, never opaque 500s; Phase 100 guardrails now also cover refine output; multi-tenant `companyId` stays closure/param; editor preview-then-save UX unchanged; WhatsApp never-reply + web/MCP generate paths do NOT regress; **do NOT introduce a LangGraph checkpointer** (passthrough StepRunner only).

### Claude's Discretion

- Prompt-builder refine mode shape: option (a) `mode: 'refine'` flag + `buildRefineUserContent` vs option (b) `buildRefinePrompt` wrapper — "planner picks the lower-churn option." This research **recommends (a)** (see Architecture Pattern 3).
- Refine-through-graph mechanism: (a) refine adapter + refine-capable node via a graph factory + passthrough runner; (b) small dedicated refine sub-graph; (c) shared `runRefine()` service reusing the seams WITHOUT a full graph node. This research **recommends a hybrid of (a)+(b): a dedicated 3-node refine sub-graph (`ingest-guard → refine → finalize`, plus `onError`) built by `buildRefineGraph`** (see Architecture Pattern 1, with the rationale for why a refine node is added to the canonical engine rather than reusing the generate graph verbatim).

### Deferred Ideas (OUT OF SCOPE — do not implement here)

- WhatsApp per-message batch isolation (HARD-05), configurable auto-refine cap + recourse (HARD-06), replay-safe TTL (HARD-07) → **Phase 102**. Here we route WhatsApp through shared ingestion but do **NOT** change its batch atomicity / `Send[]` structure.
- The eval harness against golden fixtures (EVAL-01..04) → **Phase 103**.
- Dispatching refine via Inngest for durability → explicitly OUT (user decision).
- Full per-node `step.run` durability decomposition → deferred (v4.3 guardrails).

---

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| HARD-01 | Refine runs through the canonical graph reusing the shared engine (inline, passthrough runner) | Architecture Pattern 1 (`buildRefineGraph` + `makeRefineNode` + `makeRefineAdapter`); state field `refined?`; failure mapping via `failureReasonToXtimatorError` → `asResponse` |
| HARD-02 | Refine reuses `buildSystemPrompt` / `buildUserContent` — no separate refine prompt | Architecture Pattern 3 (prompt-builder `mode: 'refine'` + `buildRefineUserContent`); "Don't Hand-Roll" #1; Pitfall 4 |
| UNIFY-01 | One multimodal ingestion path shared by web/WhatsApp/MCP/refine | Architecture Pattern 2 (`lib/estimate/ingest/multimodal.ts`); ingestion signature serving Blobs (refine) + downloaded media (WhatsApp) |
| UNIFY-02 | One prompt builder; equivalent inputs → equivalent prompts | Architecture Pattern 3; Validation: refine-uses-shared-prompt test + generate-vs-refine equivalence test |
| UNIFY-03 | Refine accepts audio+image+text via the unified path with the same fallbacks + validation | Refine node calls `getAIProviderWithFallback(companyId).refineEstimate(...)` which already inherits Phase-99 fallback + Phase-100 `withSchemaRetry` (verified in `provider-with-fallback.ts:86-98`) |

---

## Standard Stack

This is a brownfield refactor — **no new dependencies**. Everything needed already exists in the repo. Versions confirmed from `package.json`.

### Core (already installed — reuse, do not add)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@langchain/langgraph` | ^1.3.3 | `StateGraph`, `Annotation.Root`, `START`/`END` for the refine sub-graph | The canonical engine (`lib/estimate/graph/`) is already built on it; the refine sub-graph mirrors `buildEstimateGraph` |
| `zod` | ^4.3.6 | `estimateOutputSchema` validates refine output (inherited) | Phase 100 single-sourced `EstimateOutput = z.infer<typeof estimateOutputSchema>` |
| `vitest` | ^4.1.4 | Unit test runner (`npm run test` → `vitest run`) | The entire `tests/unit/**` suite + the invariant gates |

### Supporting (already in `lib/` — the seams to wire into)
| Module | Purpose | When to Use |
|--------|---------|-------------|
| `lib/ai/provider-with-fallback.ts` → `getAIProviderWithFallback(companyId)` | OpenRouter→Gemini fallback + `withSchemaRetry` (cap 1) for generate AND refine | Refine node calls `.refineEstimate(...)` here — NOT `getAIProvider(...)` |
| `lib/ai/prompt-builder.ts` → `buildSystemPrompt`, `buildUserContent`, `sanitizeField` | Single prompt source + injection hardening | Extend with a refine mode; sanitize the refine instruction |
| `lib/ai/openrouter-client.ts` → `transcribeAudioOR`, `analyzePhotoOR` | Fallback-wrapped transcription + vision primitives | The shared ingestion module wraps these |
| `lib/estimate/graph/{index,state,types}.ts` | `StepRunner`/`passthroughRunner`, `ChannelAdapter`, `EstimateState` | Add refine node/state field; build `buildRefineGraph` |
| `lib/estimate/failure.ts` → `failureReasonToXtimatorError`, `FailureReason` | Typed failure → HTTP error | Refine adapter `onError` maps `state.failure` here; `asResponse` consumes it |
| `lib/errors` → `asResponse`, `XtimatorError`, `throwIfNotFound`, `throwIfForbidden` | Typed `{ error, code }` envelope + status codes | Route wrapper keeps these verbatim |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| A refine sub-graph (`buildRefineGraph`) | Reuse `buildEstimateGraph` with a refine adapter | Rejected: the canonical generate graph runs `generate → assess → autoRefine → finalize`, which PERSISTS an estimate version and runs the vagueness/auto-refine loop. Refine is a non-persisting preview with NO assess/auto-refine. Forcing refine through that topology would either trigger DB writes (breaks "no persist") or require gutting the nodes. A small dedicated sub-graph is cleaner and lower-risk. |
| A graph node + adapter | A plain `runRefine()` service (option c) with no graph | Rejected for "through the canonical graph" (HARD-01 literal): a service-only path technically reuses the seams but does NOT satisfy "runs through the graph" and weakens the equivalence story. The sub-graph keeps refine isomorphic to generate (same ChannelAdapter contract, same StepRunner seam, same never-throw failure-as-state). |

**No `npm install` required.** Do not add packages.

---

## Architecture Patterns

### Recommended Module Layout (additions only)
```
lib/estimate/
├── ingest/
│   └── multimodal.ts          # NEW — UNIFY-01 shared raw-media → text
├── graph/
│   ├── state.ts               # EDIT — add channel-neutral refine fields
│   ├── refine-graph.ts        # NEW — buildRefineGraph(adapter, { runner })
│   └── nodes/
│       └── refine.ts          # NEW — makeRefineNode(runner) core node
├── adapters/
│   ├── refine.ts              # NEW — makeRefineAdapter (preview finalize + onError)
│   └── whatsapp.ts            # EDIT — processMessage routes through ingest/multimodal
lib/ai/
├── prompt-builder.ts          # EDIT — mode:'refine' + buildRefineUserContent
└── providers/
    ├── openrouter.ts          # EDIT — delete bespoke refine prompt, use shared builder
    └── gemini.ts              # EDIT — delete bespoke refine prompt, use shared builder
app/api/estimates/[id]/refine/
└── route.ts                   # EDIT — thin wrapper invoking buildRefineGraph
```

### Pattern 1: Refine through the graph — `makeRefineAdapter` + `makeRefineNode` + `buildRefineGraph` (RECOMMENDED)

**What:** A dedicated 3-node refine sub-graph mirroring the canonical engine's adapter/node/runner contract, invoked inline with `passthroughRunner`.

**Why this best satisfies "through the graph" + equivalence with least editor-contract risk:**
- It is a real `StateGraph` (HARD-01 literal "through the canonical graph"), using the SAME `ChannelAdapter` interface, the SAME `StepRunner` seam, and the SAME never-throw failure-as-state discipline as generate.
- It does NOT touch the generate graph's `generate/assess/autoRefine/finalize` nodes, so web/MCP/WhatsApp generation cannot regress (Pitfall 7).
- The preview is returned via a state field, never a DB write — preserving the editor's preview-then-save UX byte-for-byte.

**State additions (channel-neutral — ENGINE-01 safe; no WhatsApp tokens):**
```typescript
// lib/estimate/graph/state.ts — ADD to EstimateState (Annotation.Root)
  /** Refine-only input: the existing estimate being refined (preview, never persisted). */
  existingEstimate: Annotation<EstimateOutput | undefined>(),
  /** Refine-only input: the assembled, sanitized-downstream refine instruction. */
  instruction: Annotation<string | undefined>(),
  /** Refine-only output: the validated refined estimate PREVIEW. No DB write. */
  refined: Annotation<EstimateOutput | undefined>(),
```
> These names are generic ("refine"/"instruction"/"existingEstimate"/"refined") — none are channel-specific, so `graph-neutrality.test.ts`'s FORBIDDEN-token grep stays green. Import `EstimateOutput` type-only from `@/lib/ai/schema` (or `@/lib/ai/types`) — a type import does not violate neutrality (no whatsapp token).

**Core refine node (never throws — failure-as-state, mirroring `makeGenerateNode`):**
```typescript
// lib/estimate/graph/nodes/refine.ts
import { getAIProviderWithFallback } from '@/lib/ai/provider-with-fallback'
import { getPriceBookItems } from '@/lib/queries/price-book'   // companyId-scoped
import { ProvidersUnavailableError, InvalidEstimateOutputError } from '@/lib/ai/with-fallback'
import type { FailureReason } from '@/lib/estimate/failure'
import type { EstimateStateType } from '../state'
import type { StepRunner } from '../types'

export const makeRefineNode =
  (runner: StepRunner) =>
  async (state: EstimateStateType): Promise<Partial<EstimateStateType>> => {
    try {
      if (!state.existingEstimate || !state.instruction) {
        return { failure: { reason: 'no_usable_input' } }
      }
      const refined = await runner.run('ai-refine', async () => {
        // companyId from state (trusted, never LLM-derived); price book queried by it.
        const provider = await getAIProviderWithFallback(state.companyId)
        return provider.refineEstimate({
          existingEstimate: state.existingEstimate!,
          instruction: state.instruction!,
          // priceBookItems + currencyCode resolved here (companyId-scoped) — same
          // inputs the refine route resolves today, now inside the node.
          priceBookItems: /* getPriceBookItems(svc, state.companyId) filtered by currency */,
          currencyCode: /* normalized */,
        })
      })
      return { refined }
    } catch (err) {
      const reason: FailureReason =
        err instanceof ProvidersUnavailableError ||
        (err as { providerUnavailable?: unknown } | null)?.providerUnavailable === true
          ? 'provider_unavailable'
          : err instanceof InvalidEstimateOutputError ||
            (err as { invalidOutput?: unknown } | null)?.invalidOutput === true
            ? 'invalid_output'
            : 'generation_failed'
      return { failure: { reason } }
    }
  }
```
> Note the failure-mapping block is intentionally **identical** to `makeGenerateNode` (generate.ts lines 49-56) so refine inherits the exact provider_unavailable / invalid_output / generation_failed typed reasons. This is the equivalence guarantee at the failure level.

**Refine adapter (preview finalize, no DB write; onError maps to typed HTTP error):**
```typescript
// lib/estimate/adapters/refine.ts
import type { SupabaseClient } from '@supabase/supabase-js'
import type { EstimateStateType } from '@/lib/estimate/graph/state'
import type { ChannelAdapter } from '@/lib/estimate/graph/types'
import { failureReasonToXtimatorError } from '@/lib/estimate/failure'

export function makeRefineAdapter({ companyId, supabase }: {
  companyId: string; supabase: SupabaseClient
}): ChannelAdapter {
  return {
    channel: 'web',                       // refine is a web-editor operation; reuse 'web'
    async ingest() { return {} },         // inputs assembled upstream (route → shared ingest)
    async finalize() { return {} },       // PREVIEW: no DB write — route reads state.refined
    async onError(state) {                 // re-throw typed error so asResponse maps it
      throw failureReasonToXtimatorError(
        state.failure?.reason ?? 'generation_failed',
        state.failure?.detail
      )
    },
  }
}
```
> `finalize` is a deliberate no-op: the refined estimate is a preview the route returns from `state.refined`; persistence happens later via the editor's Save. `onError` re-throws (like the default adapter) so the route's outer `try/catch → asResponse(err)` turns it into `{ error, code }` with the right status (provider_unavailable→503, invalid_output→500, no_usable_input→400 per `failure.ts` `REASON_TO_TYPE`).

**The factory (mirrors `buildEstimateGraph`, simpler topology):**
```typescript
// lib/estimate/graph/refine-graph.ts
import { StateGraph, START, END } from '@langchain/langgraph'
import { EstimateState, type EstimateStateType } from './state'
import { passthroughRunner, type ChannelAdapter, type StepRunner } from './types'
import { makeRefineNode } from './nodes/refine'

function checkRefinedEdge(state: EstimateStateType): string {
  return state.failure ? 'onError' : 'finalize'
}

export function buildRefineGraph(
  adapter: ChannelAdapter,
  { runner = passthroughRunner }: { runner?: StepRunner } = {}
) {
  return new StateGraph(EstimateState)
    .addNode('ingest', (s) => adapter.ingest(s))      // passthrough guard
    .addNode('refine', makeRefineNode(runner))
    .addNode('finalize', (s) => adapter.finalize(s))   // no-op preview
    .addNode('onError', (s) => adapter.onError(s))
    .addEdge(START, 'ingest')
    .addEdge('ingest', 'refine')
    .addConditionalEdges('refine', checkRefinedEdge, ['finalize', 'onError'])
    .addEdge('finalize', END)
    .addEdge('onError', END)
    .compile()                                         // NO checkpointer (DURABLE-02)
}
```
> **LangGraph reachability note (from `index.ts` Pitfall 1 comment):** every conditional-edge target MUST be listed in the 3rd arg array (`['finalize', 'onError']`) for `@langchain/langgraph` 1.3.x reachability. `.compile()` takes NO persistence argument (passthrough/Inngest-only durability — no checkpointer, regression-gated by `no-checkpointer.test.ts`).

**How the route invokes it (returns the preview, maps failures):**
```typescript
// in route.ts, after assembling instruction + existingEstimate (see Pattern 4)
const adapter = makeRefineAdapter({ companyId, supabase })
const graph = buildRefineGraph(adapter)             // passthroughRunner default → INLINE/sync
const result = await graph.invoke({
  companyId, projectId: estimate.project_id, channel: 'web',
  existingEstimate, instruction: instructionText,
})
// onError re-throws inside graph.invoke → caught by the route's outer try/catch → asResponse.
// success path:
return NextResponse.json({ success: true, refined: result.refined, instruction: instructionText })
```

### Pattern 2: Shared multimodal ingestion — `lib/estimate/ingest/multimodal.ts` (UNIFY-01)

**What:** One channel-neutral function that turns raw media into text, over the fallback-wrapped primitives. Serves BOTH refine (Blobs / base64) and WhatsApp (already-downloaded buffers/base64), WITHOUT coupling either to the other's I/O.

**Recommended signature** (decouples by accepting already-prepared inputs — neither caller's download/storage logic leaks in):
```typescript
// lib/estimate/ingest/multimodal.ts
import { transcribeAudioOR, analyzePhotoOR } from '@/lib/ai/openrouter-client'

export interface MultimodalRawInput {
  /** Audio items as Blobs + their container ext (refine: from FormData; whatsapp: built from buffer). */
  audio?: Array<{ blob: Blob; ext: string }>
  /** Photos already in base64 + mime (refine: base64 from arrayBuffer; whatsapp: buffer.toString('base64')). */
  photos?: Array<{ base64: string; mimeType: string }>
  /** Free-form text (instruction text, whatsapp text body). */
  texts?: string[]
}

export interface MultimodalIngestResult {
  transcripts: string[]
  photoDescriptions: string[]
  texts: string[]
}

/**
 * Channel-neutral raw-media → text. NEVER throws on a single-item failure
 * (mirrors today's refine per-photo try/catch + whatsapp ok:false) — a failed
 * item is skipped; the aggregate result still returns. Uses the fallback-wrapped
 * primitives so OpenRouter→Gemini fallback applies uniformly (Phase 99).
 */
export async function ingestMultimodal(input: MultimodalRawInput): Promise<MultimodalIngestResult> {
  const transcripts: string[] = []
  for (const a of input.audio ?? []) {
    try { const t = await transcribeAudioOR(a.blob, a.ext); if (t) transcripts.push(t) }
    catch (e) { console.error('[ingest] transcription failed:', e) }
  }
  const photoDescriptions: string[] = []
  for (const p of input.photos ?? []) {
    try { const d = await analyzePhotoOR(p.base64, p.mimeType); if (d) photoDescriptions.push(d) }
    catch (e) { console.error('[ingest] vision failed:', e) }
  }
  const texts = (input.texts ?? []).map((t) => t.trim()).filter(Boolean)
  return { transcripts, photoDescriptions, texts }
}
```
**Why this signature serves both without coupling:**
- **Refine** (route): builds `audio: [{ blob: audioFile, ext: 'webm' }]` and `photos: photoFiles.map(f => ({ base64, mimeType }))` directly from FormData Blobs. (NOTE: today the refine route uploads audio to storage then re-downloads before transcription — `transcribeRefineAudio`. That round-trip is unnecessary for the in-memory Blob; `transcribeAudioOR` accepts a Blob directly. The shared module drops the storage round-trip; **confirm with the planner** whether the storage upload had a side purpose — read of the code shows it does not retain the file, so it is pure overhead.)
- **WhatsApp** (`processMessage`): already downloads the media buffer and uploads to storage for inbox playback. It can call `ingestMultimodal({ audio: [{ blob: new Blob([buf], {type:mime}), ext }] })` (or `photos`) to get the transcript/description text **instead of** calling `transcribeAudioOR`/`analyzePhotoOR` directly — same primitives, one implementation. Its per-message `Send[]` structure, storage upload, and `mediaResults ok:false` reducer are UNCHANGED (Pitfall 6 / Phase 102 boundary). This is a mechanical swap of the two primitive call sites, not a structural change.

> Both `transcribeAudioOR` and `analyzePhotoOR` are themselves already fallback-wrapped (`openrouter-client.ts` lines 114-123, 207-216), so the shared module gets OpenRouter→Gemini fallback "for free" — it must NOT add a second fallback layer.

### Pattern 3: Prompt-builder refine mode (HARD-02 / UNIFY-02) — RECOMMENDED option (a)

**What:** Extend `buildSystemPrompt` with a `mode: 'refine'` option that swaps ONLY the role/task sentence while reusing the language + price-book + extraInstructions + Security blocks verbatim, plus a new `buildRefineUserContent(input, existingEstimate, instruction)` that emits the existing estimate + the **sanitized** instruction in tagged sections.

**Why (a) over (b):** (a) keeps a single function emitting the language/price-book/security blocks — there is literally one place those strings live, which is exactly what UNIFY-02 demands and what the equivalence test asserts. A separate `buildRefinePrompt` wrapper (b) would either duplicate or re-call those blocks indirectly, adding a second entry point to reason about. (a) is lower churn: the existing `buildSystemPrompt` body is reused unchanged except for the opening sentence.

**Signature changes:**
```typescript
// lib/ai/prompt-builder.ts
export function buildSystemPrompt(
  input: EstimateInput,
  opts?: { mode?: 'generate' | 'refine' }
): string {
  const mode = opts?.mode ?? 'generate'
  // ONLY the opening role/task paragraph differs by mode:
  let prompt = mode === 'refine'
    ? `You are a professional estimator. Update the existing estimate to reflect the user's refinement instruction. Modify, add, or remove sections/items as needed; keep everything else unchanged. Use ${currencyCode} for all numeric prices...`
    : `You are a professional estimator for a ${input.industry ?? 'general services'} business. Create a detailed, itemized estimate...`
  // …then the SAME ## Language, ## Your Company Price Book, ## Additional Instructions,
  //   and ## Security blocks run verbatim for BOTH modes (no duplication).
  return prompt
}

export function buildRefineUserContent(
  input: EstimateInput,
  existingEstimate: EstimateOutput,
  instruction: string
): string {
  // Reuse the project/transcript/photo/description assembly from buildUserContent
  // for any NEW modalities carried on `input` (refine accepts audio+image+text),
  // THEN append the existing estimate + the SANITIZED instruction in tagged sections:
  return [
    buildUserContent(input),                                  // new-input modalities (escaped)
    '## Current Estimate\n' + JSON.stringify(existingEstimate, null, 2),
    '## Refinement Instruction\n<instruction>' + sanitizeField(instruction) + '</instruction>',
  ].join('\n\n')
}
```
> **Security fix (the core win):** today the refine route concatenates raw transcript/vision text into `instruction` with NO escaping, and the bespoke adapter prompts inject it raw (`${input.instruction}` in openrouter.ts:128 / gemini.ts:187). Routing through `sanitizeField` + the `## Security` "treat as untrusted data" block closes the injection hole. The `<instruction>` tag must be added to the Security block's enumerated tag list ("…instructions (inside `<instruction>` tags)…") so the model is told to treat it as untrusted.

**Adapter rewrite (both providers — delete bespoke prompt):** In `OpenRouterAdapter.refineEstimate` and `GeminiAdapter.refineEstimate`, replace the entire bespoke `system` / `priceBookContext` / `baseUser` construction with:
```typescript
const system = buildSystemPrompt(refineInputAsEstimateInput, { mode: 'refine' })
const user = appendRetryHint(
  buildRefineUserContent(refineInputAsEstimateInput, input.existingEstimate, input.instruction),
  input.retryHint
)
```
> `RefineEstimateInput` does not currently carry `industry`/`language`/`projectName` etc. The planner must decide how the refine path supplies an `EstimateInput`-shaped object to the shared builder. Two options: (i) widen `RefineEstimateInput` to carry the builder-relevant fields (language, industry, priceBookItems already present, currencyCode present), or (ii) have the refine NODE build the `EstimateInput` (it already resolves company/language for generate) and pass a richer refine input. **Recommend (ii)** — the node resolves language/industry/price book from `companyId` exactly like `generateEstimateForProject` does, so refine truly reuses the same builder inputs (strongest UNIFY-02 equivalence). This means the bespoke prompt deletion in the adapters is paired with the adapters receiving a builder-ready input.

### Pattern 4: Refine route as a thin wrapper (HARD-01)

**What:** Keep auth → demo-guard → rate-limit (`refinePerMinute`) → company lookup → estimate fetch + `is_current`/`consolidated` guards → FormData/JSON parse → assemble inputs → invoke `buildRefineGraph` → return `{ success, refined, instruction }` or `asResponse`. Remove: `transcribeRefineAudio`, the per-photo vision loop, the bespoke instruction concatenation, and the direct `getAIProvider(...).refineEstimate(...)` call.

**Preserved contract (verified against current route.ts):**
- Response shape on success: `{ success: true, refined, instruction }` (lines 274-278) — UNCHANGED.
- 400: invalid audio/photo type, or no instruction+audio+photos (lines 144, 153, 166-171) — keep in the wrapper.
- 422: "No usable instruction could be extracted" (lines 210-215) — keep as a route-level guard BEFORE invoking the graph (after ingestion yields empty text).
- 429: rate limit (lines 91-96) — keep verbatim.
- demo-guard: `demoGuardResponse()` (lines 85-86) — keep verbatim.
- `estimate_activity` `estimate_refine_proposed` insert (lines 262-272) — keep AFTER a successful graph result.
- Outer `try/catch → asResponse(err)` (lines 279-283) — keep; this is what maps the adapter `onError` re-throw to `{ error, code }`.

**Assembly flow in the wrapper (replacing the inline ingestion):**
```typescript
// after parsing instructionText / audioFile / photoFiles (keep this parse block):
const ingest = await ingestMultimodal({
  audio: audioFile ? [{ blob: audioFile, ext: extFromMime(audioFile.type) }] : [],
  photos: await Promise.all(photoFiles.map(async (f) => ({
    base64: Buffer.from(await f.arrayBuffer()).toString('base64'),
    mimeType: getImageMimeType(f),
  }))),
  texts: instructionText ? [instructionText] : [],
})
// Assemble the single instruction string the refine node consumes (transcripts +
// photo descriptions + text), matching today's "Voice note:" / "From new photo(s):" joins.
const assembled = assembleRefineInstruction(ingest)   // small local helper, or pass parts to node
if (!assembled) return NextResponse.json({ error: 'No usable instruction…' }, { status: 422 })
```
> The 422 "no usable instruction" guard stays in the route (it is a pre-graph input check, not an AI failure). The `existingEstimate` mapping from the DB row (current route.ts lines 225-243) stays in the route (or moves into the refine node — planner's call; keeping it in the route is lower-risk since it already works).

### Anti-Patterns to Avoid
- **Adding a second validation/retry path for refine.** Refine MUST inherit `withSchemaRetry` by calling `getAIProviderWithFallback(...).refineEstimate(...)`. Do NOT wrap refine output in a fresh zod parse or retry loop — the seam already exists (`provider-with-fallback.ts:86-98`). (CONTEXT "do NOT add a second validation/retry path.")
- **Reusing the generate graph for refine.** Triggers persistence + assess/auto-refine. Use the dedicated `buildRefineGraph`.
- **Putting refine inputs on a WhatsApp-shaped state.** Refine state fields must be channel-neutral; the WhatsApp superset stays inside `whatsapp.ts`.
- **Calling `getAIProvider` (no fallback) from the refine path.** The current route's bug. Always `getAIProviderWithFallback`.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Refine system/user prompt | A bespoke refine prompt (current `OpenRouterAdapter`/`GeminiAdapter`) | `buildSystemPrompt(input, { mode:'refine' })` + `buildRefineUserContent` | Bespoke prompts lack language, price-book, security, and `sanitizeField` — an injection + i18n + price-anchoring regression on the most-used flow |
| Provider fallback for refine | A new OpenRouter→Gemini try/catch in the route | `getAIProviderWithFallback(companyId)` | Already implements fallback + schema-retry for both generate AND refine (`provider-with-fallback.ts:86-98`) |
| Output validation / retry for refine | A fresh zod parse + retry loop | The inherited `withSchemaRetry` seam | Phase 100 made it the single source; a second path = drift + double-retry |
| Raw-media → text | Inline Whisper upload/download + per-photo loop (current route) and a parallel impl in WhatsApp | `lib/estimate/ingest/multimodal.ts` over `transcribeAudioOR`/`analyzePhotoOR` | One implementation; one place owns fallback + per-item error handling |
| Failure → HTTP response | A bespoke `{ error }` 500 | adapter `onError` → `failureReasonToXtimatorError` → `asResponse` | Phase 99 made `{ error, code }` + status the single contract; refine must use it |
| Instruction escaping | Manual string concatenation of transcript/vision text | `sanitizeField` inside `buildRefineUserContent` | Closes the existing injection hole on refine |

**Key insight:** Every seam refine needs already exists and is already wired for generate. This phase is almost entirely *deleting* the parallel refine implementation and *routing* through the existing seams — not building new machinery.

---

## Runtime State Inventory

> This is a code/config-only refactor (no rename, no stored-key changes, no service reconfiguration). Inventory included for completeness per the brownfield-refactor trigger.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | None — refine is a non-persisting preview; no DB keys/collections change. `estimate_activity.event_type = 'estimate_refine_proposed'` stays the exact string. | None (verified: route.ts:266, no schema change) |
| Live service config | None — no external service (OpenRouter/Gemini/Whisper/Langfuse) config or model id changes. Provider model resolution (`getAIProvider`) is untouched. | None |
| OS-registered state | None — no Task Scheduler / pm2 / cron entries touch the refine path. | None |
| Secrets/env vars | None — same OpenRouter/OpenAI/Gemini keys via `getIntegrationKey`; no key names change. | None |
| Build artifacts | None — pure TypeScript source edits + new files; no package install, no egg-info/compiled artifacts. | None |

**The canonical question — after every file is updated, what runtime systems still have stale state?** None. The only persisted side-effect on the refine path is the unchanged `estimate_activity` insert, whose string literal is preserved.

---

## Common Pitfalls

### Pitfall 1: Breaking the editor response contract
**What goes wrong:** Changing the JSON shape (`{ success, refined, instruction }`) or status codes (422/429/demo-guard/400) breaks the editor frontend, which the user explicitly chose synchronous refine to AVOID.
**Why it happens:** Moving logic into the graph tempts a refactor of the return shape.
**How to avoid:** Keep the route returning the exact same object; the graph yields `state.refined` which maps 1:1 to the old `refined`. Regression-gate with `refine-error-surface.test.ts` (already exists) + a new response-shape test.
**Warning signs:** Any change to `NextResponse.json({...})` keys; any new status code.

### Pitfall 2: Changing WhatsApp batch atomicity
**What goes wrong:** Refactoring `processMessage` beyond swapping the two primitive call sites alters the `Send[]` fan-out or the `mediaResults` reducer — that is HARD-05 (Phase 102), out of scope.
**Why it happens:** "Route through shared ingestion" reads broader than it is.
**How to avoid:** ONLY replace the `transcribeAudioOR(...)` / `analyzePhotoOR(...)` call sites inside `processMessage` with `ingestMultimodal(...)` calls returning the same string. Leave the per-message `ok:false` returns, storage uploads, and reducer untouched.
**Warning signs:** Edits to `supervisorEdge`, `WhatsAppEstimateState`, or the `mediaResults` reducer.

### Pitfall 3: Graph-neutrality violation (ENGINE-01)
**What goes wrong:** Adding a WhatsApp-flavored token (or importing `lib/whatsapp/*`) into `state.ts` / refine node / refine adapter under `lib/estimate/graph/` fails `graph-neutrality.test.ts`.
**Why it happens:** Naming a state field after a channel, or importing channel code.
**How to avoid:** Use neutral names (`existingEstimate`, `instruction`, `refined`). Keep `makeRefineAdapter` under `lib/estimate/adapters/` (adapters are allowed channel code; the *graph dir* is the neutral one). Type-only import of `EstimateOutput` is fine.
**Warning signs:** Any FORBIDDEN token (`lib/whatsapp`, `ownerPhone`, `WhatsAppMessage`, `sendWhatsAppMessage`, `whatsapp_`, `downloadWhatsAppMedia`) appearing under `lib/estimate/graph/` or `lib/estimate/quality/`.

### Pitfall 4: A bespoke refine prompt surviving in one adapter
**What goes wrong:** Deleting the OpenRouter bespoke prompt but leaving Gemini's (or vice-versa) breaks UNIFY-02 silently — the Gemini fallback path would still inject raw instruction.
**Why it happens:** Two adapters, easy to miss one (both `refineEstimate` methods build their own prompt: openrouter.ts:102-136, gemini.ts:164-257).
**How to avoid:** Replace BOTH. Add a test that greps both adapter sources for the bespoke marker string ("## Current Estimate" assembled inline / "## Refinement Instruction") and asserts it is gone, and that both call `buildSystemPrompt(..., { mode:'refine' })`.
**Warning signs:** `## Refinement Instruction` literal remaining in `gemini.ts` or `openrouter.ts`.

### Pitfall 5: Not sanitizing the refine instruction
**What goes wrong:** The instruction (which now includes transcript + vision text) reaches the model unescaped → prompt injection.
**How to avoid:** Wrap it via `sanitizeField` inside `buildRefineUserContent` and tag it `<instruction>`; add `<instruction>` to the Security block's untrusted-tag enumeration.
**Warning signs:** `${instruction}` interpolated without `sanitizeField`.

### Pitfall 6: companyId scoping / multi-tenant leak
**What goes wrong:** Reading `companyId` from graph state populated by anything LLM-derived, or querying the price book without the companyId filter.
**How to avoid:** `companyId` is set by the route from the authenticated company row and threaded as state (trusted scope, exactly like generate). Price book query filters by `companyId` + currency (mirror `generate-estimate.ts:109-111`). The adapter captures `companyId` in its closure.
**Warning signs:** `getPriceBookItems` without a companyId arg; companyId derived from `refined`/AI output.

### Pitfall 7: Web/MCP generate regression
**What goes wrong:** Editing the shared `buildSystemPrompt`/`buildUserContent` or the generate node in a way that changes generate output.
**Why it happens:** Adding the `mode` param or refine fields touches shared code.
**How to avoid:** `mode` defaults to `'generate'` (no behavior change when omitted); generate call sites pass no opts. Refine state fields are optional (`| undefined`) so generate state is unaffected. Run `generate-estimate.test.ts`, `prompt-builder.test.ts`, `never-throw.test.ts`, `graph-neutrality.test.ts` as the regression gate.
**Warning signs:** Any diff to the generate branch of `buildSystemPrompt`; any required new field on `EstimateInput`.

---

## State of the Art

| Old (current) Approach | Current (target) Approach | Impact |
|------------------------|---------------------------|--------|
| Refine route does inline Whisper upload+download+transcribe | `ingestMultimodal` transcribes the in-memory Blob directly (no storage round-trip) | Simpler, fewer failure modes; confirm storage round-trip had no side purpose (it does not — file is deleted immediately) |
| Refine calls `getAIProvider` (no fallback) | Refine calls `getAIProviderWithFallback` | Refine gains OpenRouter→Gemini fallback + schema-retry |
| Bespoke refine prompt in both adapters | Shared `buildSystemPrompt({mode:'refine'})` + `buildRefineUserContent` | Refine gains language/price-book/security/sanitize |
| Refine outside the graph/Inngest | Refine through `buildRefineGraph` inline (passthrough runner) | Refine gains never-throw failure-as-state + typed responses; stays synchronous (no Inngest) |

**Deprecated/outdated by this phase:**
- `transcribeRefineAudio` (route-local) → replaced by `ingestMultimodal`.
- `OpenRouterAdapter.refineEstimate` bespoke prompt body → replaced by shared builder.
- `GeminiAdapter.refineEstimate` bespoke prompt body → replaced by shared builder.

---

## Environment Availability

> Skipped — this phase is purely code/config changes (TypeScript source edits + new files). No new external tools, runtimes, services, or package installs. The existing test runner (`vitest ^4.1.4`) and all `lib/` seams are already present. (Step 2.6: no external dependencies introduced.)

---

## Validation Architecture

> `workflow.nyquist_validation` is `true` in `.planning/config.json` → section included.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.4 |
| Config file | `vitest.config.ts` (repo root — present; `npm run test` → `vitest run`) |
| Quick run command | `npx vitest run tests/unit/ai tests/unit/estimate tests/unit/api/refine-error-surface.test.ts` |
| Full suite command | `npm run test` (→ `vitest run`) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| UNIFY-01 | `ingestMultimodal` turns audio Blobs + base64 photos + text into `{transcripts, photoDescriptions, texts}`; single-item failure is skipped, not thrown | unit | `npx vitest run tests/unit/estimate/multimodal-ingest.test.ts` | ❌ Wave 0 |
| HARD-02 / UNIFY-02 | Refine uses the shared prompt builder; NO bespoke refine prompt remains in either adapter (grep both sources; assert `buildSystemPrompt(...,{mode:'refine'})` called) | unit | `npx vitest run tests/unit/ai/refine-shared-prompt.test.ts` | ❌ Wave 0 |
| HARD-02 | `buildSystemPrompt({mode:'refine'})` reuses language + price-book + security blocks; `buildRefineUserContent` sanitizes the instruction (`<instruction>` escaped, tagged) | unit | `npx vitest run tests/unit/ai/prompt-builder.test.ts` | ⚠️ exists — extend with refine-mode cases |
| UNIFY-03 | Refine inherits fallback (provider_unavailable) + zod validation (invalid_output) — refine node maps markers to typed reasons like generate | unit | `npx vitest run tests/unit/estimate/refine-node.test.ts` | ❌ Wave 0 |
| HARD-01 | Refine route response shape `{ success, refined, instruction }` + status codes (422/429/demo-guard/400) unchanged; failure → `{ error, code }` via asResponse | unit | `npx vitest run tests/unit/api/refine-route-contract.test.ts` | ❌ Wave 0 (extends existing `refine-error-surface.test.ts`) |
| HARD-01 (criterion 5) | generate-vs-refine equivalence: both call the shared ingestion + `buildSystemPrompt`; refine no longer references the deleted bespoke prompt | unit | `npx vitest run tests/unit/estimate/generate-refine-equivalence.test.ts` | ❌ Wave 0 |
| Invariant | graph-neutrality stays green (refine state/node carry no WhatsApp tokens) | unit | `npx vitest run tests/unit/estimate/graph-neutrality.test.ts` | ✅ exists (must stay green) |
| Invariant | never-throw stays green (refine node never throws; generate node unchanged) | unit | `npx vitest run tests/unit/estimate/never-throw.test.ts` | ✅ exists (must stay green) |
| Invariant | no-checkpointer (refine graph compiled without persistence) | unit | `npx vitest run tests/unit/estimate/no-checkpointer.test.ts` | ✅ exists (extend to cover `buildRefineGraph`) |
| Invariant | WhatsApp never-reply regression (processMessage swap doesn't change batch behavior) | unit | `npx vitest run tests/unit/whatsapp/never-reply-regression.test.ts` | ✅ exists (must stay green) |

### Sampling Rate
- **Per task commit:** `npx vitest run tests/unit/ai tests/unit/estimate` (fast; covers the seams touched).
- **Per wave merge:** `npm run test` (full suite — catches generate/WhatsApp regressions).
- **Phase gate:** Full suite green + `npx tsc --noEmit` clean before `/gsd:verify-work`.

### Wave 0 Gaps
- [ ] `tests/unit/estimate/multimodal-ingest.test.ts` — covers UNIFY-01 (audio/photo/text aggregation; per-item failure skipped not thrown; uses mocked `transcribeAudioOR`/`analyzePhotoOR`).
- [ ] `tests/unit/ai/refine-shared-prompt.test.ts` — covers HARD-02/UNIFY-02 (no bespoke prompt remains in either adapter; both call shared builder with `mode:'refine'`).
- [ ] `tests/unit/estimate/refine-node.test.ts` — covers UNIFY-03 (refine node never throws; maps ProvidersUnavailableError→provider_unavailable, InvalidEstimateOutputError→invalid_output; success → `{ refined }`).
- [ ] `tests/unit/api/refine-route-contract.test.ts` — covers HARD-01 (response shape + 422/429/demo-guard/400 preserved; failure → typed envelope). Extends/co-locates with existing `refine-error-surface.test.ts`.
- [ ] `tests/unit/estimate/generate-refine-equivalence.test.ts` — covers criterion 5 (shared seams exercised by both; bespoke-prompt deletion asserted).
- [ ] Extend `tests/unit/ai/prompt-builder.test.ts` with refine-mode cases (language/price-book/security reuse; instruction sanitization).
- [ ] Extend `tests/unit/estimate/no-checkpointer.test.ts` to assert `buildRefineGraph` compiles without a checkpointer.
- [ ] Framework install: none — Vitest already present.

> **vitest multipart caveat (from existing `refine-error-surface.test.ts` comment lines 16-21):** `Request.formData()` multipart parsing hangs in the vitest/jsdom env. Drive the route-contract test through the JSON `{ instruction }` back-compat path (same handler + same outer catch), as the existing test does. Multimodal (audio/photo) ingestion is validated at the `ingestMultimodal` unit level, not through the route's FormData path.

---

## Open Questions

1. **Where does `existingEstimate` mapping live — route or node?**
   - What we know: route.ts:225-243 maps the DB estimate row → `EstimateOutput` today; it works.
   - What's unclear: moving it into the refine node would make the node self-contained (better equivalence) but adds DB reads to the node.
   - Recommendation: keep the mapping in the route for this phase (lower risk), pass `existingEstimate` as a state field. Revisit if Phase 103 eval wants the node self-contained.

2. **How does the refine path supply an `EstimateInput`-shaped object to the shared builder?**
   - What we know: `RefineEstimateInput` carries `priceBookItems`, `currencyCode`, `existingEstimate`, `instruction`, `retryHint` — but NOT `industry`/`language`/`projectName`.
   - What's unclear: whether to widen `RefineEstimateInput` or have the node build the `EstimateInput`.
   - Recommendation: have the refine NODE resolve language/industry/price book from `companyId` (mirroring `generateEstimateForProject`) and pass a builder-ready input to the adapter — strongest UNIFY-02 equivalence. Planner confirms exact field threading.

3. **Drop the audio storage round-trip on the refine path?**
   - What we know: `transcribeRefineAudio` uploads → downloads → deletes the audio purely to hand a Blob to `transcribeAudioOR`, which already accepts a Blob.
   - Recommendation: drop the round-trip (pass the FormData Blob straight to `ingestMultimodal`). Confirm no audit/inbox requirement keeps refine audio (read of the code shows the file is deleted immediately → no retention purpose).

---

## Sources

### Primary (HIGH confidence — read directly from the repo)
- `app/api/estimates/[id]/refine/route.ts` — current inline refine (rewrite target; contract to preserve).
- `lib/ai/prompt-builder.ts` — `buildSystemPrompt`/`buildUserContent`/`sanitizeField`/`escapeXml`.
- `lib/ai/providers/openrouter.ts`, `lib/ai/providers/gemini.ts` — bespoke refine prompts to delete.
- `lib/ai/provider-with-fallback.ts` — `getAIProviderWithFallback`, `withSchemaRetry` (refine already inherits both).
- `lib/ai/with-fallback.ts` — `callWithFallback`, `ProvidersUnavailableError`, `InvalidEstimateOutputError`.
- `lib/ai/openrouter-client.ts` — `transcribeAudioOR`, `analyzePhotoOR` (fallback-wrapped primitives).
- `lib/ai/types.ts`, `lib/ai/schema.ts` (via Phase 100 summary), `lib/ai/index.ts`, `lib/ai/provider.interface.ts`.
- `lib/estimate/graph/{index,state,types}.ts`, `nodes/{generate,decide}.ts` — graph topology, `EstimateState`, `ChannelAdapter`/`StepRunner`/`passthroughRunner`.
- `lib/estimate/adapters/{default,whatsapp}.ts` — adapter pattern; WhatsApp `processMessage` fan-out.
- `lib/estimate/failure.ts` — `FailureReason`, `failureReasonToXtimatorError`, `failureReasonToChannelCopy`.
- `lib/services/generate-estimate.ts` — generate seam (the equivalence baseline).
- `tests/unit/estimate/{graph-neutrality,never-throw}.test.ts`, `tests/unit/api/refine-error-surface.test.ts`, `tests/unit/ai/prompt-builder.test.ts` — invariants + test patterns.
- `.planning/phases/100-output-guardrails-schema-correlation/100-01-SUMMARY.md`, `.planning/REQUIREMENTS.md`, `.planning/phases/101-.../101-CONTEXT.md`, `.planning/config.json`, `package.json`, `CLAUDE.md`.

### Secondary (MEDIUM)
- Phase 99 summary referenced via `100-01-SUMMARY.md` dependency graph (99-SUMMARY.md path did not exist; the fallback/error-model facts were cross-verified directly against `lib/ai/with-fallback.ts` and `lib/ai/provider-with-fallback.ts`).

### Tertiary (LOW)
- None. No web/external sources needed — this is a self-contained brownfield refactor verified entirely against current source.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new deps; versions confirmed from package.json; all seams read directly.
- Architecture: HIGH — refine-through-graph design mirrors the existing, working `buildEstimateGraph`/adapter/node/runner pattern; failure mapping reuses verified `generate.ts` logic; preview-via-state-field avoids any DB write.
- Pitfalls: HIGH — each is grounded in a specific current-source line (bespoke prompts, raw instruction concat, WhatsApp batch structure, neutrality grep tokens).

**Research date:** 2026-06-21
**Valid until:** ~2026-07-21 (stable; brownfield internal refactor — no fast-moving external dependency. Re-verify only if Phase 100/99 seams or the LangGraph major version change.)
