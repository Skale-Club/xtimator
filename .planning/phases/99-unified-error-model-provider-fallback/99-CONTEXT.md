# Phase 99: Unified Error Model + Shared Provider-Fallback Wrapper - Context

**Gathered:** 2026-06-21
**Status:** Ready for planning
**Mode:** Smart discuss (autonomous — grey-area decisions made at Claude's discretion, grounded in the live code map; no UI surface in this phase)

<domain>
## Phase Boundary

Foundational hardening for the estimate engine: make every layer speak ONE failure language and make every AI call path degrade the SAME way. This phase ships (a) a single typed failure model shared by API routes, graph nodes, Inngest functions and adapters, with one mapping from a failure to a channel response, and (b) one shared provider-fallback wrapper (OpenRouter → Gemini) that every AI call path uses. Scope is HARD-03 + HARD-04 only. It must be behavior-preserving except where it removes ad-hoc `throw → 500` and adds the fallback path. No new estimate features, no UI.

**Requirements:** HARD-03 (shared provider-fallback policy on generate/transcribe/vision/refine), HARD-04 (single typed error/failure model across routes/nodes/Inngest/adapters).
</domain>

<decisions>
## Implementation Decisions

### Unified failure model
- **Keep `XtimatorError` (`lib/errors/`) as the canonical HTTP-boundary error** — it already has type+surface+status+userMessage+Sentry routing. Do NOT introduce a parallel error class. The unification reconciles the graph's `failure` channel WITH `XtimatorError`, it does not replace it.
- **Promote the graph's `failure: { reason: string }` (`lib/estimate/graph/state.ts`) to a typed union.** Define a `FailureReason` type (e.g. `'no_input' | 'transcription_failed' | 'vision_failed' | 'generation_failed' | 'invalid_output' | 'provider_unavailable'`). Keep the field shape `{ reason: FailureReason; detail?: string }` so existing readers (`onError` in both adapters) keep working; widen reason from free string to the union. Preserve the never-throw/always-finalize invariant (ENGINE-04) — nodes still set state, never throw.
- **One mapping module** (e.g. `lib/estimate/failure.ts` or `lib/errors/estimate-failure.ts`): `failureReasonToXtimatorError(reason, detail?) → XtimatorError` (surface `'estimates'`) used at the HTTP boundary, and a single helper the adapters call to turn a `FailureReason` into the channel reply. The WhatsApp adapter keeps its human copy but sources it through this map.
- **Refine route stops doing bare `throw → 500`.** `app/api/estimates/[id]/refine/route.ts` wraps its handler so any thrown value goes through `asResponse(err)` (the existing converter) — consistent typed JSON instead of an opaque 500. (Full graph migration of refine is Phase 101; this phase only fixes its error surface.)
- Do NOT change HTTP status codes for already-typed paths — `statusByType` mapping is unchanged. This is additive consistency, not a contract break.

### Shared provider-fallback wrapper
- **New single wrapper** (e.g. `lib/ai/with-fallback.ts`): `callWithFallback({ op, primary, fallback }) → { result, servedBy: 'primary' | 'fallback', fallbackFired: boolean }`. Runs `primary()`; on a thrown error (non-2xx, network, malformed) runs `fallback()` exactly once; if both fail, throws the original primary error wrapped so the caller maps it to `provider_unavailable`.
- **Apply to all four AI call paths**: estimate generate (OpenRouter→Gemini chat), vision `analyzePhotoOR` (OpenRouter→Gemini vision), refine (same as generate), and transcription `transcribeAudioOR`. Transcription TODAY only falls back when the OpenAI key is MISSING (key-based) — upgrade it to ALSO fall back on call FAILURE (failure-based), without removing the existing key-absent path.
- **Gemini is the fallback provider** — `lib/ai/providers/gemini.ts` already exists (`transcribeAudioGemini`). The planner must add Gemini chat + Gemini vision fallback functions if they do not yet exist; keep them dynamically imported (as transcription already does) so the Gemini SDK stays out of bundles that do not need it.
- **Fallback is attempted exactly once** (no multi-provider cascade, no retry storm). The primary provider, the fallback firing, and which provider ultimately served are returned in the result so observability (GUARD-04, Phase 100) and the failure model can record them. Surface `fallbackFired` / `servedBy` in pipeline-events metadata if cheap; otherwise leave a clean seam for Phase 100.
- Provider selection (OpenRouter model id, per-company override) stays in `lib/ai/index.ts` / `getAIProvider`; the wrapper is orthogonal to model selection (out-of-scope: model swaps for quality).

### Invariants to preserve (regression-gated)
- WhatsApp never-throw / always-reply on every failure path (frozen `never-reply-regression.test.ts` stays green).
- Default adapter's re-throw-for-Inngest-retry contract (so Inngest retry/onFailure still fires).
- Multi-tenant `companyId` stays closure/param across all nodes and the wrapper — no LLM-suppliable tenant field; no `companyId` read from LLM output.
- Deterministic happy path stays at exactly 1 AI call per generation when no fallback fires (QA-03 spirit).
</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `lib/errors/index.ts` — `XtimatorError`, `asResponse(err)`, `asInternal`, throw helpers. `asResponse` already handles `XtimatorError`, `ZodError`, and unknown → 500 with Sentry capture.
- `lib/errors/codes.ts` — `ErrorType`, `Surface` (`'estimates'` exists), `statusByType`, `userMessageByCode`. Add estimate-specific `userMessageByCode` entries if helpful.
- `lib/estimate/graph/state.ts` — `failure: Annotation<{ reason: string } | undefined>()` is the channel to type.
- `lib/ai/openrouter-client.ts` — `transcribeAudioOR` (has key-based Gemini fallback), `analyzePhotoOR` (NO fallback), `translateTextsOR`. All throw on non-2xx.
- `lib/ai/providers/openrouter.ts` — `OpenRouterAdapter.generateEstimate` / `refineEstimate` (single provider, no fallback; refine builds its OWN prompt — left for Phase 101).
- `lib/ai/providers/gemini.ts` — existing `transcribeAudioGemini`; pattern for adding Gemini chat/vision.
- `lib/ai/index.ts` — `getAIProvider(companyId?)` provider factory.
- `lib/estimate/adapters/{default,whatsapp}.ts` — `onError(state)` consumers of `failure`.
- `lib/observability/pipeline-events.ts` — `recordPipelineEvent()` best-effort; place to record `provider`/`fallbackFired`.

### Established Patterns
- Closure-factory adapters (`makeDefaultAdapter`, `makeWhatsAppAdapter`) — keep tenant scope in closure, mirror for any new helper.
- Best-effort observability that NEVER throws (`recordPipelineEvent` swallows errors) — the fallback wrapper's bookkeeping must follow the same never-regress-reliability rule.
- Dynamic import for provider SDKs to keep bundles lean (`await import('@/lib/ai/providers/gemini')`).

### Integration Points
- HTTP boundary: `app/api/estimates/[id]/refine/route.ts`, `app/api/generate-estimate/route.ts`, `app/api/transcribe/route.ts`, `app/api/analyze-photos/route.ts`.
- Engine boundary: graph nodes (`lib/estimate/graph/nodes/*`), adapters `onError`.
- Inngest functions (`lib/inngest/functions/*`) catch & set `{ failure }` — align reasons to the new union.
</code_context>

<specifics>
## Specific Ideas

- The fallback wrapper's return shape (`servedBy` / `fallbackFired`) is deliberately designed as the seam GUARD-04 (Phase 100) consumes for correlation/observability — keep it explicit rather than swallowing it.
- `FailureReason` union values should map cleanly onto both an `XtimatorError` (type+surface) AND each channel's human reply, so the union is the single source both sides derive from.
</specifics>

<deferred>
## Deferred Ideas

- Routing the refine path fully through the canonical graph + Inngest (HARD-01) and reusing `buildSystemPrompt`/`buildUserContent` for refine (HARD-02) — Phase 101. This phase only fixes refine's error surface, not its architecture.
- Zod schema validation + bounded retry on AI output (GUARD-01) — Phase 100; the `'invalid_output'` failure reason is defined here but its producer lands in Phase 100.
- Emitting the correlation ID across pipeline-events/Langfuse/Sentry (GUARD-04) — Phase 100; this phase only ensures `servedBy`/`fallbackFired` are available to carry.
- Multi-provider cascade beyond one fallback — out of scope (no retry storm).
</deferred>
