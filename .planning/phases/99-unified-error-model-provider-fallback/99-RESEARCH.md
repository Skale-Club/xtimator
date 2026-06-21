# Phase 99: Unified Error Model + Shared Provider-Fallback Wrapper - Research

**Researched:** 2026-06-21
**Domain:** TypeScript error-model unification + AI provider-fallback orchestration (Next.js 16 / LangGraph estimate engine)
**Confidence:** HIGH (almost all findings are confirmed from live repo code; the one external dependency — Gemini vision SDK shape — is proven by existing working in-repo code)

## Summary

This is a brownfield hardening phase. The architecture is already decided in CONTEXT.md; the job of this research is de-risking the implementation by pinning exact current signatures, enumerating every call site that must change, and surfacing the one genuine unknown (Gemini vision) plus the regression-gating invariants.

Two big findings reduce risk substantially:

1. **Gemini chat + refine fallback already exist.** `lib/ai/providers/gemini.ts` exports a full `GeminiAdapter implements AIProvider` with working `generateEstimate` and `refineEstimate` (same interface as `OpenRouterAdapter`). The planner does NOT need to write a Gemini chat client from scratch — it needs a fallback *wrapper* that calls `OpenRouterAdapter` first and falls through to `GeminiAdapter` on failure. The ONLY Gemini function that does not yet exist is **vision** (`analyzePhotoGemini`), and its exact SDK call shape is already proven in-repo by `transcribeAudioGemini` (audio uses `{ inlineData: { mimeType, data: base64 } }`; vision is the byte-identical pattern with an image MIME type).

2. **The `failure.reason` producer/reader surface is tiny and fully enumerable** (2 producers, ~3 readers). Promoting `{ reason: string }` to a typed `FailureReason` union is low-risk because the current string space is only `'generation_failed'` and `'no_usable_input'`. The new union must be a strict superset of these two to avoid behavior regression.

**Primary recommendation:** Add `lib/ai/with-fallback.ts` (generic `callWithFallback`) + a Gemini-backed fallback provider helper, and `lib/estimate/failure.ts` (the `FailureReason` union + `failureReasonToXtimatorError` + a channel-copy map). Apply the wrapper at the 2 AIProvider call sites (generate, refine) and inside `transcribeAudioOR`/`analyzePhotoOR`. Wrap the refine route handler in a `try/catch → asResponse(err)`. Keep every Gemini import dynamic.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Unified failure model**
- Keep `XtimatorError` (`lib/errors/`) as the canonical HTTP-boundary error — already has type+surface+status+userMessage+Sentry routing. Do NOT introduce a parallel error class. The unification reconciles the graph's `failure` channel WITH `XtimatorError`; it does not replace it.
- Promote the graph's `failure: { reason: string }` (`lib/estimate/graph/state.ts`) to a typed union. Define `FailureReason` (e.g. `'no_input' | 'transcription_failed' | 'vision_failed' | 'generation_failed' | 'invalid_output' | 'provider_unavailable'`). Keep the field shape `{ reason: FailureReason; detail?: string }` so existing readers (`onError` in both adapters) keep working; widen reason from free string to the union. Preserve never-throw/always-finalize (ENGINE-04) — nodes still set state, never throw.
- One mapping module (e.g. `lib/estimate/failure.ts` or `lib/errors/estimate-failure.ts`): `failureReasonToXtimatorError(reason, detail?) → XtimatorError` (surface `'estimates'`) used at the HTTP boundary, and a single helper the adapters call to turn a `FailureReason` into the channel reply. WhatsApp adapter keeps its human copy but sources it through this map.
- Refine route stops doing bare `throw → 500`. `app/api/estimates/[id]/refine/route.ts` wraps its handler so any thrown value goes through `asResponse(err)` — typed JSON instead of an opaque 500. (Full graph migration of refine is Phase 101; this phase only fixes its error surface.)
- Do NOT change HTTP status codes for already-typed paths — `statusByType` mapping unchanged. Additive consistency, not a contract break.

**Shared provider-fallback wrapper**
- New single wrapper (e.g. `lib/ai/with-fallback.ts`): `callWithFallback({ op, primary, fallback }) → { result, servedBy: 'primary' | 'fallback', fallbackFired: boolean }`. Runs `primary()`; on a thrown error (non-2xx, network, malformed) runs `fallback()` exactly once; if both fail, throws the original primary error wrapped so the caller maps it to `provider_unavailable`.
- Apply to all four AI call paths: estimate generate (OpenRouter→Gemini chat), vision `analyzePhotoOR` (OpenRouter→Gemini vision), refine (same as generate), transcription `transcribeAudioOR`. Transcription TODAY only falls back when the OpenAI key is MISSING (key-based) — upgrade it to ALSO fall back on call FAILURE (failure-based), WITHOUT removing the existing key-absent path.
- Gemini is the fallback provider — `lib/ai/providers/gemini.ts` already exists (`transcribeAudioGemini`). Add Gemini chat + Gemini vision fallback functions if they do not yet exist; keep them dynamically imported so the Gemini SDK stays out of bundles that do not need it.
- Fallback attempted exactly once (no multi-provider cascade, no retry storm). Primary provider, fallback firing, and which provider ultimately served are returned so observability (GUARD-04, Phase 100) and the failure model can record them. Surface `fallbackFired`/`servedBy` in pipeline-events metadata if cheap; otherwise leave a clean seam for Phase 100.
- Provider selection (OpenRouter model id, per-company override) stays in `lib/ai/index.ts` / `getAIProvider`; the wrapper is orthogonal to model selection (out-of-scope: model swaps for quality).

**Invariants to preserve (regression-gated)**
- WhatsApp never-throw / always-reply on every failure path.
- Default adapter's re-throw-for-Inngest-retry contract (so Inngest retry/onFailure still fires).
- Multi-tenant `companyId` stays closure/param across all nodes and the wrapper — no LLM-suppliable tenant field; no `companyId` read from LLM output.
- Deterministic happy path stays at exactly 1 AI call per generation when no fallback fires (QA-03 spirit).

### Claude's Discretion
- Smart-discuss mode: grey-area decisions made at Claude's discretion, grounded in the live code map; no UI surface in this phase.
- Module naming/placement (`lib/ai/with-fallback.ts` vs alternatives; `lib/estimate/failure.ts` vs `lib/errors/estimate-failure.ts`) — pick one; recommendations below.
- Whether to surface `fallbackFired`/`servedBy` in pipeline-events now or leave a seam for Phase 100.
- Whether to add estimate-specific `userMessageByCode` entries.

### Deferred Ideas (OUT OF SCOPE)
- Routing refine fully through the canonical graph + Inngest (HARD-01) and reusing `buildSystemPrompt`/`buildUserContent` for refine (HARD-02) — Phase 101. This phase only fixes refine's error surface.
- Zod schema validation + bounded retry on AI output (GUARD-01) — Phase 100. The `'invalid_output'` reason is DEFINED here but its producer lands in Phase 100.
- Correlation ID across pipeline-events/Langfuse/Sentry (GUARD-04) — Phase 100. This phase only ensures `servedBy`/`fallbackFired` are available to carry.
- Multi-provider cascade beyond one fallback — out of scope (no retry storm).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| HARD-03 | Every AI call path (generate, transcribe, vision, refine) uses the same provider-fallback policy (OpenRouter → Gemini) through one shared client wrapper. | Call-site inventory below (4 paths, 6 physical sites). `GeminiAdapter` already provides chat+refine fallback; only `analyzePhotoGemini` (vision) is new — SDK shape proven by in-repo `transcribeAudioGemini`. Wrapper signature locked in CONTEXT. |
| HARD-04 | A single typed error/failure model across API routes, graph nodes, Inngest functions and adapters — one mapping from failure to channel response, no ad-hoc `throw → 500`. | `XtimatorError`/`asResponse` already canonical at HTTP boundary. `FailureReason` producer/reader inventory below (2 producers, 3 readers). Refine route is the only bare `throw → 500` to fix (5 ad-hoc `NextResponse.json(..,500/401/403/404/409)` sites enumerated). |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- **Tech stack is fixed:** Next.js (App Router, currently 16.2.6), TypeScript strict, zod. AI estimate/vision via the provider abstraction; transcription via Whisper (with Gemini fallback). Do not introduce new HTTP clients or SDKs — reuse `fetch` (OpenRouter) and `@google/genai` (Gemini) already in `package.json`.
- **Security — secrets:** NEVER put real `sk-ant-*`, `sk-proj-*`, `whsec_*`, etc. in code, comments, or planning docs. Use placeholders. All AI keys come from `getIntegrationKey(provider)` (platform config), never read from `process.env` directly in new code, never exposed to the browser. The fallback wrapper and Gemini helpers must continue to source keys via `getIntegrationKey('gemini')` / `getIntegrationKey('openrouter')` / `getIntegrationKey('openai')`.
- **Server-only:** `lib/ai/index.ts` is server-only by convention. The wrapper and Gemini helpers must never be imported into client components; keep Gemini behind dynamic `import('@/lib/ai/providers/gemini')`.
- **GSD workflow:** all edits go through a GSD command. (Informational; the planner handles this.)
- **No secrets in `.planning/`:** this RESEARCH.md and all downstream plans use placeholders only.

## Standard Stack

No new dependencies. Everything needed is already installed and in use.

### Core (already present — verified from package.json)
| Library | Version (installed) | Purpose | Why Standard |
|---------|---------------------|---------|--------------|
| `@google/genai` | `^2.0.0` (latest 2.9.0, Jun 2026) | Gemini fallback provider (chat/refine exist; vision to add) | Already the only Gemini SDK in repo; `GeminiAdapter` + `transcribeAudioGemini` use it |
| `@langchain/langgraph` | `^1.3.3` | Estimate graph state/annotations (`EstimateState`, `failure` channel) | The canonical graph runtime; `failure` is an `Annotation` here |
| `zod` | `^4.3.6` | (Already used by `asResponse` for `ZodError` handling) | Error converter already special-cases `ZodError` |
| `@sentry/nextjs` | `^10.56.0` | Sentry capture inside `asResponse` for `internal`/`offline` | Already wired; do not add a second capture path |
| `vitest` | `^4.1.4` | Unit test runner (Validation Architecture below) | Existing test framework |

### Supporting (existing modules to reuse — DO NOT rebuild)
| Module | Purpose | When to Use |
|--------|---------|-------------|
| `lib/errors/index.ts` | `XtimatorError`, `asResponse(err)`, `asInternal`, throw helpers | HTTP boundary; refine route wrap; `failureReasonToXtimatorError` returns one of these |
| `lib/errors/codes.ts` | `ErrorType`, `Surface` (`'estimates'` exists), `statusByType`, `userMessageByCode` | Map `FailureReason → ErrorType`; optionally add `*:estimates` message overrides |
| `lib/ai/providers/openrouter.ts` | `OpenRouterAdapter` (primary chat/refine) | `primary()` in `callWithFallback` for generate/refine |
| `lib/ai/providers/gemini.ts` | `GeminiAdapter` (fallback chat/refine), `transcribeAudioGemini` (fallback transcription) | `fallback()` in `callWithFallback`; ADD `analyzePhotoGemini` here |
| `lib/ai/index.ts` `getAIProvider` | Resolves the primary OpenRouter model (per-company/platform) | Keep as-is; wrapper is orthogonal to model selection |
| `lib/observability/pipeline-events.ts` `recordPipelineEvent` | Best-effort, never-throws event sink | Optional seam to record `provider`/`fallbackFired` |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Generic `callWithFallback({ primary, fallback })` | A fallback-aware `AIProvider` decorator class | A class works for generate/refine but NOT for the standalone `transcribeAudioOR`/`analyzePhotoOR` functions (not `AIProvider` methods). The generic function covers all four paths uniformly — matches CONTEXT's locked signature. Use the generic function. |
| New `FailureReason` module under `lib/estimate/failure.ts` | `lib/errors/estimate-failure.ts` | Either works. **Recommend `lib/estimate/failure.ts`**: it imports both the graph state type and `XtimatorError`; living under `lib/estimate/` keeps it next to its only readers (the adapters + graph) and avoids `lib/errors/` depending on `lib/estimate/`. |

**Installation:** none required.

**Version verification (run by researcher):** `@google/genai` installed at `^2.0.0`; current published latest is 2.9.0 (2026-06-19) — same major, in use. No upgrade needed for this phase.

## Architecture Patterns

### Recommended file layout (additive — no moves)
```
lib/
├── ai/
│   ├── with-fallback.ts          # NEW: callWithFallback({ op, primary, fallback })
│   ├── openrouter-client.ts      # EDIT: transcribeAudioOR + analyzePhotoOR wrap their primary in callWithFallback
│   ├── index.ts                  # unchanged (model selection stays here)
│   └── providers/
│       ├── openrouter.ts         # unchanged (primary)
│       └── gemini.ts             # EDIT: add analyzePhotoGemini (vision fallback); chat/refine already exist
├── estimate/
│   ├── failure.ts                # NEW: FailureReason union + failureReasonToXtimatorError + failureReasonToChannelCopy
│   └── graph/
│       ├── state.ts              # EDIT: failure: Annotation<{ reason: FailureReason; detail?: string } | undefined>()
│       ├── nodes/generate.ts     # EDIT: failure reason now typed (value unchanged: 'generation_failed')
│       └── adapters/
│           ├── default.ts        # onError: optionally source copy via failure map (value preserved)
│           └── whatsapp.ts       # onError + ingest: typed reasons; copy sourced via map
└── errors/                       # unchanged
app/api/estimates/[id]/refine/route.ts   # EDIT: wrap handler → asResponse(err); replace bare 500s
```

### Pattern 1: `callWithFallback` (the wrapper)
**What:** Runs `primary()`; on any throw runs `fallback()` exactly once; if both throw, re-throw the primary error wrapped. Returns `{ result, servedBy, fallbackFired }`.
**When to use:** Every one of the 4 AI call paths.
**Shape (derived from CONTEXT's locked signature; no external source needed):**
```typescript
// lib/ai/with-fallback.ts
export interface FallbackOutcome<T> {
  result: T
  servedBy: 'primary' | 'fallback'
  fallbackFired: boolean
}

export async function callWithFallback<T>(args: {
  op: string                         // e.g. 'generate' | 'transcribe' | 'vision' | 'refine' — for logging/observability
  primary: () => Promise<T>
  fallback: () => Promise<T>
}): Promise<FallbackOutcome<T>> {
  try {
    const result = await args.primary()
    return { result, servedBy: 'primary', fallbackFired: false }
  } catch (primaryErr) {
    try {
      const result = await args.fallback()
      return { result, servedBy: 'fallback', fallbackFired: true }
    } catch {
      // Both failed — re-throw the ORIGINAL primary error so the caller maps it
      // to provider_unavailable. (Do NOT throw the fallback error; primary is the
      // canonical signal. Wrap to preserve cause.)
      throw primaryErr
    }
  }
}
```
**Critical:** the wrapper itself NEVER swallows the final failure — it re-throws so the existing never-throw graph nodes (`generate.ts` catch) convert it to `{ failure: { reason: 'provider_unavailable' } }`, and the existing per-message `ok:false` catches in adapters/normalize still work. The wrapper changes *where the AI call comes from*, not *who catches it*.

### Pattern 2: Gemini vision fallback (`analyzePhotoGemini`) — the one new SDK call
**What:** Add to `lib/ai/providers/gemini.ts`, mirroring `transcribeAudioGemini` exactly.
**Source (HIGH confidence — proven in-repo):** `lib/ai/providers/gemini.ts:39-57` already calls `ai.models.generateContent({ model: 'gemini-2.5-flash', contents: [{ text }, { inlineData: { mimeType, data: base64 } }] })` for AUDIO. Vision is the byte-identical `Part` structure with an image MIME type. The web (js-genai v2 docs/GitHub) confirms `contents` accepts `Part[]` and the SDK is on the 2.x major in use.
```typescript
// lib/ai/providers/gemini.ts — NEW export, mirrors transcribeAudioGemini
const PHOTO_PROMPT =
  "Describe this photo from a contractor's perspective. Note materials, conditions, " +
  "measurements if visible, damage, and areas needing work. Be specific and concise."

export async function analyzePhotoGemini(base64: string, mimeType: string): Promise<string> {
  const apiKey = await getIntegrationKey('gemini')
  if (!apiKey) throw new Error('Gemini API key not configured')
  const ai = new GoogleGenAI({ apiKey })
  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: [
      { text: PHOTO_PROMPT },
      { inlineData: { mimeType, data: base64 } },   // SAME shape as audio fallback
    ],
  })
  return (response.text ?? '').trim()
}
```
Note: `analyzePhotoOR` takes `base64` already (not a Blob), so the vision fallback signature lines up with zero buffer juggling.

### Pattern 3: `FailureReason` union + dual mapping
**What:** One union → two derivations (an `XtimatorError` AND channel copy).
```typescript
// lib/estimate/failure.ts
export type FailureReason =
  | 'no_input'              // superset of current 'no_usable_input' (see migration note)
  | 'transcription_failed'
  | 'vision_failed'
  | 'generation_failed'    // current value — preserved verbatim
  | 'invalid_output'       // DEFINED here, PRODUCED in Phase 100 (GUARD-01)
  | 'provider_unavailable' // NEW — set when callWithFallback re-throws (both providers down)

export function failureReasonToXtimatorError(reason: FailureReason, detail?: string): XtimatorError {
  // surface always 'estimates'; map reason → ErrorType (statusByType unchanged)
}

export function failureReasonToChannelCopy(reason: FailureReason, language?: 'en'|'pt'|'es'): string {
  // WhatsApp/default human reply; preserves today's two copies for the two existing reasons
}
```
**Reason → ErrorType mapping (recommended, keeps statuses additive):**
| FailureReason | ErrorType | HTTP status (unchanged mapping) |
|---------------|-----------|----------------------------------|
| `no_input` | `bad_request` | 400 |
| `transcription_failed` | `internal` (or `bad_request` if input-driven) | 500 / 400 |
| `vision_failed` | `internal` | 500 |
| `generation_failed` | `internal` | 500 |
| `invalid_output` | `internal` | 500 |
| `provider_unavailable` | `offline` | 503 |

### Anti-Patterns to Avoid
- **Throwing from inside core graph nodes.** The wrapper re-throws; the *node's existing try/catch* converts to `failure`-state. Do not let the wrapper's re-throw escape `graph.invoke` unhandled — that reintroduces the silent-failure bug ENGINE-04 fixed.
- **A second error class.** `XtimatorError` is canonical. `FailureReason` is an *enum that maps onto* `XtimatorError`, not a rival.
- **Reading `companyId` from LLM output.** `companyId` stays a closure/param everywhere; the wrapper passes through closures, never accepts tenant data from a model.
- **Removing the key-absent transcription fallback.** `transcribeAudioOR` currently falls back to Gemini when no OpenAI key exists. Keep that branch; ADD the failure-based fallback on top.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Gemini chat/refine fallback | A new Gemini chat client | `GeminiAdapter.generateEstimate` / `.refineEstimate` (already exist, implement `AIProvider`) | Already written, tested (`tests/unit/ai/gemini-adapter.test.ts`), and prompt-parity with OpenRouter via `buildSystemPrompt`/`buildUserContent` |
| HTTP error → JSON response | A bespoke error responder in refine route | `asResponse(err)` from `lib/errors` | Already handles `XtimatorError`, `ZodError`, unknown → 500 + Sentry routing |
| Sentry capture | Manual `Sentry.captureException` in the wrapper | Let it bubble to `asResponse` (HTTP) or `recordPipelineEvent`/Inngest `onFailure` (engine) | Double-capture noise; `asResponse` already scopes tags by code/surface/type |
| Model selection / per-company override | New selection logic in the wrapper | `getAIProvider(companyId)` | Already resolves override → platform default → `OR_DEFAULTS.chat` |
| Best-effort observability | A new event table or logger | `recordPipelineEvent` (never-throws) | Already the D-06 best-effort sink; just add `provider`/fallback fields if cheap |

**Key insight:** This phase is ~80% wiring existing pieces together. The genuinely new code is small: `callWithFallback` (one function), `analyzePhotoGemini` (one function mirroring an existing one), `lib/estimate/failure.ts` (one union + two mappers), and the refine-route try/catch wrap.

## Runtime State Inventory

Not a rename/migration phase — but it touches a typed channel that flows through durable Inngest state, so one item is worth an explicit check.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | `pipeline_events.provider` column is `'openai'|'openrouter'|'anthropic'|null` (`pipeline-events.ts:40`). No `'gemini'` value today. | If you record fallback-served provider as `'gemini'`, EITHER widen the `provider` union/CHECK or record fallback via a separate field/metadata. SAFE DEFAULT: leave `provider` as-is and surface `fallbackFired` only — full provider attribution is GUARD-04 (Phase 100). |
| Live service config | None — no external dashboards key off these strings. | None. |
| OS-registered state | None. | None — verified (no scheduler/process names involve failure reasons). |
| Secrets/env vars | Gemini/OpenRouter/OpenAI keys read via `getIntegrationKey(...)` (platform config table). Names unchanged. | None — wrapper keeps the same key lookups. |
| Build artifacts | None — no generated code keys off `FailureReason`. | None. |
| **In-flight Inngest state** | `failure: { reason: string }` is carried in graph state inside a single `step.run` (`generate-estimate.ts:106`, whatsapp-process). Widening the type is source-only; the SHAPE `{ reason, detail? }` is back-compatible with any in-flight `{ reason }`. | None — widening string→union is additive at runtime; `detail?` is optional. No data migration. |

## Current `failure.reason` enumeration → proposed union (no regression)

**Producers (only 2 — verified by grep):**
| File:line | Current value produced |
|-----------|------------------------|
| `lib/estimate/graph/nodes/generate.ts:40` | `{ failure: { reason: 'generation_failed' } }` |
| `lib/estimate/adapters/whatsapp.ts:323` | `{ failure: { reason: 'no_usable_input' } }` |

**Readers (3):**
| File:line | How it reads |
|-----------|--------------|
| `lib/estimate/adapters/whatsapp.ts:431` | `state.failure?.reason === 'generation_failed'` → picks generation-failed copy, else no-input copy |
| `lib/estimate/adapters/default.ts:69` | `throw new Error(state.failure?.reason ?? 'generation_failed')` (re-throw for Inngest retry) |
| `lib/estimate/graph/nodes/decide.ts` | `checkGeneratedEdge` routes on `state.failure` presence (see `never-throw.test.ts:50-58`) — branches on PRESENCE, not the specific string |

**Migration note (the one naming decision):** the current WhatsApp value is `'no_usable_input'`; CONTEXT's example union uses `'no_input'`. These are NOT equal. The planner MUST choose one and keep it consistent:
- **Option A (lowest risk):** keep `'no_usable_input'` in the union. Zero string change at the only producer/reader; the WhatsApp `onError` `else`-branch (which fires for the no-input copy) keeps working unchanged.
- **Option B:** rename to `'no_input'` per CONTEXT example — must update producer (`whatsapp.ts:323`) AND the implicit reader (`whatsapp.ts:431` else-branch is presence-based so it still works, but any future `=== 'no_input'` check must match).
- **Recommendation: Option A** — preserve `'no_usable_input'` to guarantee zero behavior change; treat CONTEXT's `'no_input'` as illustrative. Document the chosen value in the plan.

Proposed union = strict superset of `{ 'generation_failed', 'no_usable_input' }` plus the forward-looking values:
`'no_usable_input' | 'transcription_failed' | 'vision_failed' | 'generation_failed' | 'invalid_output' | 'provider_unavailable'`
(`'transcription_failed'`/`'vision_failed'` already appear as `mediaResults` `reason` strings in `whatsapp.ts:201` and `normalize.ts:70,94` — reusing the same vocabulary is consistent.)

## Provider-fallback call-site inventory (HARD-03)

Four logical paths, six physical sites. The wrapper applies at the AI-call boundary in each.

| # | Path | File:line | Current primary | Fallback today | Change |
|---|------|-----------|-----------------|----------------|--------|
| 1 | generate (chat) | `lib/services/generate-estimate.ts:180-181` | `getAIProvider(companyId).generateEstimate(input)` | NONE | Wrap: `primary = OpenRouterAdapter.generateEstimate`, `fallback = GeminiAdapter.generateEstimate`. Easiest hook point: a fallback-aware provider OR wrap at this call site. |
| 2 | refine (chat) | `app/api/estimates/[id]/refine/route.ts:264` (`provider.refineEstimate`) AND `lib/ai/providers/openrouter.ts:98` | `getAIProvider(companyId).refineEstimate(input)` | NONE | Wrap same way: primary OpenRouter refine, fallback Gemini refine. |
| 3 | transcription | `lib/ai/openrouter-client.ts:62` (`transcribeAudioOR`) | OpenAI Whisper (`whisper-1`) | Gemini ONLY when OpenAI key MISSING (key-based, line 67-74) | ADD failure-based fallback: wrap the Whisper fetch as `primary`, `transcribeAudioGemini` as `fallback`. KEEP the existing key-absent branch (it short-circuits straight to Gemini). |
| 4 | vision | `lib/ai/openrouter-client.ts:120` (`analyzePhotoOR`) | OpenRouter vision (`/chat/completions` image_url) | NONE | Wrap: `primary` = current OpenRouter vision fetch, `fallback` = NEW `analyzePhotoGemini`. |

**Downstream consumers of these helpers (no change needed — they call through the wrapped helper):**
- `transcribeAudioOR` callers: `lib/inngest/functions/transcribe-audio.ts:125`, `lib/estimate/adapters/whatsapp.ts:195`, `lib/whatsapp/normalize.ts:62`, `app/api/estimates/[id]/refine/route.ts` (via `transcribeRefineAudio`).
- `analyzePhotoOR` callers: `lib/inngest/functions/analyze-photos.ts:147`, `lib/estimate/adapters/whatsapp.ts:242`, `lib/whatsapp/normalize.ts:87`, `app/api/estimates/[id]/refine/route.ts:202`.

Because paths 3 & 4 wrap *inside* `transcribeAudioOR`/`analyzePhotoOR`, all their call sites inherit the fallback with zero edits. Paths 1 & 2 wrap at the provider boundary; the cleanest single hook is a small fallback-aware wrapper around `getAIProvider`'s result (primary) + a lazily-imported `GeminiAdapter` (fallback) — keeps `getAIProvider` untouched.

## Unified error-model call-site inventory (HARD-04)

**Bare `throw → 500` / ad-hoc responses to fix (refine route only):** `app/api/estimates/[id]/refine/route.ts`
| Line | Current | Fix |
|------|---------|-----|
| 80 | `NextResponse.json({ error: 'Not authenticated' }, { status: 401 })` | `throw new XtimatorError('unauthorized','estimates',...)` (or keep — already typed-ish; CONTEXT only requires no opaque 500) |
| 104 | `{ error: 'No company found' }, 401` | typed `unauthorized`/`not_found` |
| 111 | `{ error: 'Estimate not found' }, 404` | `throwIfNotFound(estimate,'estimates')` |
| 114 | `{ error: 'Unauthorized' }, 403` | `throwIfForbidden(..., 'estimates')` |
| 122 | old-version 400 / 127 consolidated 409 | typed `bad_request` / `conflict` |
| 186-190 | transcription failure → 500 | becomes a thrown error caught by the top-level wrap → `asResponse` |
| 285-291 | `catch (error) { ... 500 }` | replace with `catch (err) { return asResponse(err) }` |

The minimum to satisfy CONTEXT: wrap the whole handler so `catch → asResponse(err)`, and ensure thrown values are `XtimatorError`s (or let `asResponse` map unknowns to 500 with the *typed* `internal:unknown` envelope — still consistent JSON shape `{ error, code }`, not the current bespoke `{ error }`). Removing the inline 500 at 186-190 is the headline fix.

**Failure→channel mapping unification (the single map):**
- `lib/estimate/adapters/whatsapp.ts:430-433` `onError` — currently inline two-branch copy. Re-source via `failureReasonToChannelCopy(reason, language)`. Preserve exact copy strings (regression-gated).
- `lib/estimate/adapters/default.ts:68-70` `onError` — re-throws `state.failure?.reason`. Keep the re-throw (Inngest retry contract) but the thrown value can be `failureReasonToXtimatorError(reason)` so `onFailure`/`asResponse` get a typed error. **Caution:** changing what `default.ts` throws affects `generate-estimate.ts` Inngest `onFailure` only via `error.message`; keep a message that still reads cleanly.

## Common Pitfalls

### Pitfall 1: Breaking the key-absent transcription fallback
**What goes wrong:** Replacing the whole `transcribeAudioOR` body with `callWithFallback` drops the existing `if (!apiKey) → transcribeAudioGemini` branch.
**How to avoid:** Keep the key-absent short-circuit FIRST (it returns Gemini directly). Apply `callWithFallback` only to the *key-present* Whisper path (`primary = Whisper fetch`, `fallback = transcribeAudioGemini`).
**Warning sign:** A test with no OpenAI key but a present Gemini key must still transcribe via Gemini on the first try (servedBy could be either — assert it returns a transcript, not which provider).

### Pitfall 2: Wrapper re-throw escaping the never-throw graph
**What goes wrong:** If both providers fail, the wrapper re-throws. If a caller is NOT inside an existing try/catch, that throw escapes `graph.invoke` → Inngest step dies → silent failure (the exact ENGINE-04 bug).
**How to avoid:** Confirm every wrapper consumer is already inside a catch that converts to `failure`-state or `ok:false`: generate node (`generate.ts:38`), WhatsApp processMessage (`whatsapp.ts:199-202, 260-268`), normalize (`normalize.ts:68-71, 92-95`). Map the both-failed case to `'provider_unavailable'`.
**Warning sign:** `never-throw.test.ts` goes red, or a new "both providers down" test throws instead of resolving to `{ failure }`.

### Pitfall 3: Regressing the frozen WhatsApp copy
**What goes wrong:** Sourcing `onError` copy through `failureReasonToChannelCopy` changes the exact strings.
**How to avoid:** Copy the two existing strings (`whatsapp.ts:431-433`) verbatim into the map for `'generation_failed'` and the no-input reason. The `never-throw` / channel-adapter tests assert the never-throw + reply behavior — keep them green.
**Warning sign:** `tests/unit/estimate/channel-adapter.test.ts` or any "always replies" assertion fails on copy text.

### Pitfall 4: `provider` column can't hold `'gemini'`
**What goes wrong:** Recording `provider: 'gemini'` into `pipeline_events` violates the typed union / DB CHECK (`pipeline-events.ts:40` lists only `openai|openrouter|anthropic|null`).
**How to avoid:** For THIS phase, surface `fallbackFired`/`servedBy` only (or omit and leave the seam for Phase 100/GUARD-04). Do NOT widen the DB column here unless you also migrate the CHECK — that's Phase 100 territory.

### Pitfall 5: Double AI cost / retry storm
**What goes wrong:** Wrapping generate AND letting Inngest retry 2× means up to 2 (providers) × 3 (attempts) = 6 calls.
**How to avoid:** Fallback fires EXACTLY ONCE per attempt (CONTEXT-locked). Inngest retries are orthogonal and pre-existing; do not add wrapper-level retries. Happy path stays exactly 1 call (QA-03) — assert `primary` called once, `fallback` not called on success.
**Warning sign:** A success-path test sees `fallback` invoked, or call count > 1 when primary succeeds.

### Pitfall 6: Multi-tenant leak via the wrapper
**What goes wrong:** Threading `companyId` through the model or accepting it from LLM output.
**How to avoid:** `companyId` is a closure/param (`generate.ts` reads `state.companyId` from trusted state; adapters capture it in closure). The wrapper takes only `primary`/`fallback` thunks — tenant scope is baked into those closures, never a wrapper field.

## Code Examples

### Wrapping `analyzePhotoOR` (vision — path 4)
```typescript
// lib/ai/openrouter-client.ts (sketch)
export async function analyzePhotoOR(base64: string, mimeType: string, model?: string): Promise<string> {
  const { callWithFallback } = await import('@/lib/ai/with-fallback')
  const { result } = await callWithFallback({
    op: 'vision',
    primary: () => analyzePhotoOpenRouter(base64, mimeType, model),   // current fetch body, extracted
    fallback: async () => {
      const { analyzePhotoGemini } = await import('@/lib/ai/providers/gemini')
      return analyzePhotoGemini(base64, mimeType)
    },
  })
  return result
}
```
Source: derived from existing `analyzePhotoOR` (`lib/ai/openrouter-client.ts:120-181`) + dynamic-import pattern already used at `lib/ai/openrouter-client.ts:72`.

### Refine route handler wrap (HARD-04)
```typescript
// app/api/estimates/[id]/refine/route.ts
import { asResponse } from '@/lib/errors'
export async function POST(request, ctx) {
  try {
    // ...existing logic, but throw XtimatorError instead of NextResponse.json(.., 4xx/5xx)...
    return NextResponse.json({ success: true, refined, instruction })
  } catch (err) {
    return asResponse(err)   // typed JSON, Sentry routing, no opaque 500
  }
}
```
Source: `asResponse` at `lib/errors/index.ts:83-129`.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Per-channel `generationFailed: boolean` | `failure: { reason }` state channel | Phase 94 (v4.3) | This phase types `reason` |
| Three error models (routes throw `XtimatorError`; graph returns `{ failure }`; refine `throw → 500`) | One typed model: `XtimatorError` at HTTP boundary, `FailureReason`→`XtimatorError` map at engine boundary | This phase (HARD-04) | Refine joins the typed model |
| Fallback only for transcription (key-absent) | Uniform OpenRouter→Gemini fallback on all 4 paths, failure-based | This phase (HARD-03) | Gemini becomes the universal fallback |

**Deprecated/outdated:** none introduced. `@google/genai` `^2.0.0` is current major (latest 2.9.0); no migration.

## Open Questions

1. **`'no_usable_input'` vs `'no_input'` union value.**
   - Known: only producer is `whatsapp.ts:323` = `'no_usable_input'`; only string-equality reader is `whatsapp.ts:431` (presence-based else-branch, not `===`).
   - Unclear: whether to adopt CONTEXT's illustrative `'no_input'`.
   - Recommendation: keep `'no_usable_input'` (Option A) for zero behavior change. Planner to lock.

2. **Record `fallbackFired`/`servedBy` now, or seam for Phase 100?**
   - Known: `pipeline_events.provider` cannot hold `'gemini'` today; `recordPipelineEvent` is best-effort.
   - Recommendation: return `{ servedBy, fallbackFired }` from the wrapper now (cheap, CONTEXT wants the seam), but do NOT write `'gemini'` into the `provider` column this phase — defer DB attribution to GUARD-04.

3. **Where to hook generate/refine fallback (paths 1 & 2).**
   - Options: (a) wrap at the two call sites (`generate-estimate.ts:181`, refine route + `OpenRouterAdapter.refineEstimate`), or (b) a thin fallback-aware `AIProvider` returned alongside `getAIProvider`.
   - Recommendation: a small helper `getAIProviderWithFallback(companyId)` that returns an object whose `generateEstimate`/`refineEstimate` internally call `callWithFallback(primaryOpenRouter, GeminiAdapter)`. Keeps both call sites a one-line swap and `getAIProvider` (model selection) untouched. Planner to confirm.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `@google/genai` | Gemini fallback (chat/refine exist, vision to add) | ✓ | `^2.0.0` (latest 2.9.0) | — |
| `@langchain/langgraph` | `failure` channel typing | ✓ | `^1.3.3` | — |
| `vitest` | unit tests | ✓ | `^4.1.4` | — |
| Gemini API key (`getIntegrationKey('gemini')`) | runtime fallback to fire | runtime/platform-config | — | If absent, fallback throws → wrapper re-throws primary error → `provider_unavailable` (graceful, never-throw preserved) |

**Missing dependencies with no fallback:** none — all libraries installed.
**Missing dependencies with fallback:** Gemini API key may be unset in a given environment; the wrapper degrades gracefully to `provider_unavailable` rather than crashing.

## Validation Architecture

`workflow.nyquist_validation` not found disabled in `.planning/config.json` context — treat as enabled.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest `^4.1.4` |
| Config file | `vitest.config.ts` (include `tests/unit/**`) |
| Quick run command | `npx vitest run tests/unit/ai tests/unit/estimate -t "<name>"` |
| Full suite command | `npx vitest run` |

Existing relevant tests (must stay green): `tests/unit/estimate/never-throw.test.ts`, `tests/unit/estimate/channel-adapter.test.ts`, `tests/unit/estimate/graph-neutrality.test.ts`, `tests/unit/ai/gemini-adapter.test.ts`, `tests/unit/ai/provider-factory.test.ts`.

### Phase Requirements → Test Map
| Req | Behavior | Type | Automated Command | File Exists? |
|-----|----------|------|-------------------|--------------|
| HARD-03 | `callWithFallback`: primary success → `servedBy:'primary'`, `fallbackFired:false`, fallback NOT called | unit | `npx vitest run tests/unit/ai/with-fallback.test.ts -t "primary success"` | ❌ Wave 0 |
| HARD-03 | fallback fires: primary throws → fallback result, `servedBy:'fallback'`, `fallbackFired:true` | unit | `... -t "fallback fired"` | ❌ Wave 0 |
| HARD-03 | both fail → re-throws the PRIMARY error (not fallback) | unit | `... -t "both fail"` | ❌ Wave 0 |
| HARD-03 | `transcribeAudioOR` keeps key-absent Gemini path AND adds failure-based fallback | unit | `npx vitest run tests/unit/ai/transcribe-fallback.test.ts` | ❌ Wave 0 |
| HARD-03 | `analyzePhotoGemini` exists + produces a description from base64+mime | unit | `npx vitest run tests/unit/ai/gemini-adapter.test.ts -t "vision"` | ⚠️ extend existing |
| HARD-03 | happy path = exactly 1 AI call (QA-03) | unit | `... -t "no fallback = single call"` | ❌ Wave 0 |
| HARD-04 | `failureReasonToXtimatorError` maps each `FailureReason` → expected `ErrorType`/status | unit | `npx vitest run tests/unit/estimate/failure-mapping.test.ts` | ❌ Wave 0 |
| HARD-04 | union is strict superset: `'generation_failed'`+`'no_usable_input'` still valid | unit | `... -t "superset"` | ❌ Wave 0 |
| HARD-04 | refine route returns typed JSON `{ error, code }` (not opaque 500) on thrown error | unit/route | `npx vitest run tests/unit/api/refine-error-surface.test.ts` | ❌ Wave 0 |
| HARD-04 (invariant) | core nodes never throw; both-providers-down → `{ failure: { reason: 'provider_unavailable' } }` | unit | `npx vitest run tests/unit/estimate/never-throw.test.ts` | ✅ extend |
| HARD-04 (invariant) | WhatsApp `onError` always replies; copy unchanged for existing reasons | unit | `npx vitest run tests/unit/estimate/channel-adapter.test.ts` | ✅ keep green |

### Sampling Rate
- **Per task commit:** `npx vitest run tests/unit/ai tests/unit/estimate`
- **Per wave merge:** `npx vitest run`
- **Phase gate:** full suite green before `/gsd:verify-work`.

### Wave 0 Gaps
- [ ] `tests/unit/ai/with-fallback.test.ts` — primary-success / fallback-fired / both-fail / single-call-on-success (HARD-03)
- [ ] `tests/unit/ai/transcribe-fallback.test.ts` — key-absent path preserved + failure-based fallback (HARD-03)
- [ ] extend `tests/unit/ai/gemini-adapter.test.ts` — `analyzePhotoGemini` vision (HARD-03)
- [ ] `tests/unit/estimate/failure-mapping.test.ts` — `FailureReason`→`XtimatorError` + superset (HARD-04)
- [ ] `tests/unit/api/refine-error-surface.test.ts` — refine returns typed JSON, not 500 (HARD-04)
- [ ] extend `tests/unit/estimate/never-throw.test.ts` — `provider_unavailable` both-down resolves to `{ failure }` (invariant)
- [ ] shared mock: a `vi.fn()` provider pair (primary throws / succeeds) — colocate in each test or a small helper

## Sources

### Primary (HIGH confidence — live repo code, read this session)
- `lib/errors/index.ts`, `lib/errors/codes.ts` — `XtimatorError`, `asResponse`, `statusByType`, `Surface`/`ErrorType`
- `lib/estimate/graph/state.ts` — `failure: Annotation<{ reason: string } | undefined>()`
- `lib/estimate/graph/nodes/generate.ts` — only `'generation_failed'` producer; never-throw catch
- `lib/estimate/adapters/whatsapp.ts`, `default.ts` — `onError` readers; `'no_usable_input'` producer
- `lib/ai/openrouter-client.ts` — `transcribeAudioOR` (key-based fallback), `analyzePhotoOR` (no fallback), `translateTextsOR`
- `lib/ai/providers/openrouter.ts` — `OpenRouterAdapter.generateEstimate/refineEstimate`
- `lib/ai/providers/gemini.ts` — `GeminiAdapter` (chat+refine EXIST), `transcribeAudioGemini` (proves vision inlineData shape)
- `lib/ai/index.ts`, `lib/ai/provider.interface.ts` — `getAIProvider`, `AIProvider`
- `lib/inngest/functions/{generate-estimate,transcribe-audio,analyze-photos}.ts` — Inngest call sites + `onFailure`
- `lib/services/generate-estimate.ts:180-181`, `lib/whatsapp/normalize.ts` — generate + media call sites
- `app/api/estimates/[id]/refine/route.ts` — bare `throw → 500` sites
- `lib/observability/pipeline-events.ts` — `recordPipelineEvent`, `provider` union
- `tests/unit/estimate/never-throw.test.ts` — the ENGINE-04 invariant assertion shape
- `package.json` — verified versions

### Secondary (MEDIUM — verified web)
- js-genai (GitHub googleapis/js-genai, release docs) — confirms `@google/genai` is on the 2.x major (latest 2.9.0, 2026-06-19) and `contents` accepts `Part[]`. (The exact `inlineData` shape is taken from in-repo working code, which is HIGH confidence.)

## Metadata

**Confidence breakdown:**
- Call-site inventory (both HARD-03 + HARD-04): HIGH — exhaustive grep + file reads
- `FailureReason` enumeration: HIGH — only 2 producers, 3 readers, all read this session
- Gemini chat/refine fallback exists: HIGH — `GeminiAdapter` read directly
- Gemini vision SDK shape: HIGH — identical to in-repo working `transcribeAudioGemini`; web confirms major version
- Error-model unification: HIGH — `asResponse`/`XtimatorError` read directly
- Pipeline-events `provider` constraint: HIGH — union read directly

**Research date:** 2026-06-21
**Valid until:** 2026-07-21 (stable brownfield; the only external dep, `@google/genai`, is pinned `^2.0.0` and unlikely to break the `generateContent`/`inlineData` shape within the 2.x line)
