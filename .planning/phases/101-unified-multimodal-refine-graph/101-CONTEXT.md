# Phase 101: Unified Multimodal Ingestion + Refine Through the Graph - Context

**Gathered:** 2026-06-21
**Status:** Ready for planning
**Mode:** Smart discuss (autonomous) + ONE user decision (refine sync-vs-async, see below)

<domain>
## Phase Boundary

Stop the refine path from being a parallel re-implementation. Today `app/api/estimates/[id]/refine/route.ts` re-implements multimodal parsing (Whisper + Vision inline), composes its own instruction string, and `OpenRouterAdapter.refineEstimate` builds its OWN system prompt (no injection hardening, no language/price-book/security blocks, no schema validation, no provider fallback). This phase routes refine through the SAME shared engine as generate: one multimodal ingestion path, one prompt builder, the Phase-99 provider fallback, and the Phase-100 zod validation + guardrails. Scope = HARD-01, HARD-02, UNIFY-01, UNIFY-02, UNIFY-03.

**Requirements:** HARD-01 (refine through the canonical graph reusing the shared engine), HARD-02 (refine reuses `buildSystemPrompt`/`buildUserContent`), UNIFY-01 (one multimodal ingestion path for web/WhatsApp/MCP/refine), UNIFY-02 (one prompt builder for all channels + refine), UNIFY-03 (refine accepts audio+image+text through the unified path with the same fallbacks + validation).
</domain>

<decisions>
## Implementation Decisions

### USER DECISION (2026-06-21): refine stays synchronous
The user chose **"unify internally, keep refine synchronous"**. Refine reuses the shared graph/ingestion/prompt-builder/guardrails/fallback but runs **INLINE** (passthrough StepRunner), preserving the editor's preview-then-save UX. Refine is intentionally NOT dispatched via Inngest — it is an interactive, non-persisting preview that neither writes a version nor charges quota the way generate does. Inngest durability remains the generate/MCP contract. ROADMAP Phase 101 success criterion 1 and REQUIREMENTS HARD-01 were amended to match this decision.

### UNIFY-01 — one multimodal ingestion path
- Extract a shared, channel-neutral multimodal ingestion module (e.g. `lib/estimate/ingest/multimodal.ts`): given raw inputs (audio blob(s), photo blob(s)/base64, free-form text), it produces `{ transcripts: string[], photoDescriptions: string[], texts: string[] }` using `transcribeAudioOR` + `analyzePhotoOR` (which, post-Phase-99, already carry the OpenRouter→Gemini fallback). One place owns "raw media → text", with the same fallbacks + error handling everywhere.
- **Refine** consumes this instead of its inline `transcribeRefineAudio` + per-photo `analyzePhotoOR` loop. **WhatsApp** adapter's `processMessage` fan-out (`lib/estimate/adapters/whatsapp.ts`) reuses the same primitives (keep its per-message Send[] structure — batch isolation is Phase 102; here just route through the shared ingestion helpers so there is no second transcription/vision implementation). **Web/MCP** keep upload-time ingestion (separate Inngest `transcribe-audio`/`analyze-photos` jobs — the graph `ingest` node stays a passthrough guard); they already call the same `transcribeAudioOR`/`analyzePhotoOR` primitives, so the "path" is unified at the primitive + assembly level, not by forcing web to re-ingest in-graph (preserves CHAN-02's decoupled ingestion from v4.3).
- The shared module applies the existing prompt-injection sanitization boundary consistently (the refine route currently concatenates raw transcript/vision text into an instruction with NO escaping — unifying fixes that).

### HARD-02 / UNIFY-02 — one prompt builder
- Refine must reuse `lib/ai/prompt-builder.ts`. Today `OpenRouterAdapter.refineEstimate` (and `GeminiAdapter.refineEstimate`) build a bespoke prompt with none of: language instruction, price-book block, security/injection block, or `sanitizeField` escaping. Replace that bespoke prompt.
- Add a refine-aware mode to the shared builder: either (a) `buildSystemPrompt(input, { mode: 'refine' })` that swaps only the role/task sentence ("update the existing estimate per the instruction") while REUSING the language + price-book + extraInstructions + Security blocks verbatim, and a `buildRefineUserContent(input, existingEstimate, instruction)` that emits the existing estimate + the sanitized instruction inside tagged, escaped sections; or (b) a thin `buildRefinePrompt` that internally composes the shared blocks. Planner picks the lower-churn option. Either way: ONE source of the language/price-book/security blocks; the refine instruction is sanitized via `sanitizeField` (it is untrusted user input).
- Equivalent inputs must yield equivalent prompts regardless of channel/operation (UNIFY-02). The `EstimateInput`/`RefineEstimateInput` types feed the same builder.

### HARD-01 — refine through the canonical graph (inline)
- Route refine through the shared graph rather than calling `provider.refineEstimate` directly from the HTTP handler. Concretely: a refine entry into the engine — a refine-capable node (or a small refine sub-graph) + a refine `ChannelAdapter` whose `finalize` returns the validated refined `EstimateOutput` as a PREVIEW (no DB write) and whose `onError` maps `FailureReason` to the route's typed JSON. Invoke it with the **passthrough StepRunner** (inline, synchronous) from the refine route. The graph path gives refine: GUARD-01 zod validation + bounded retry, the provider fallback, the unified ingestion, and the shared prompt — all for free.
- The refine route becomes a thin HTTP wrapper: auth, demo-guard, rate-limit (`refinePerMinute`), version/consolidated guards, parse FormData/JSON, hand raw inputs + existing estimate to the engine, return `{ success, refined, instruction }` (preview) or `asResponse(failure)`. PRESERVE the existing response contract the editor consumes (same JSON shape) and the existing status codes (422 no-usable-instruction, 429, demo-guard) per Phase 99/CONTEXT.
- Keep `estimate_activity` `estimate_refine_proposed` logging.
- Graph-neutrality must hold (ENGINE-01): the refine node/state additions carry NO channel-specific tokens; refine-channel specifics live in the refine adapter.

### UNIFY-03 — refine accepts all three modalities through the unified path
- Audio + image + text all flow through the shared ingestion module + shared prompt, with the same OpenRouter→Gemini fallbacks (Phase 99) and the same zod validation + bounded retry + guardrails (Phase 100). A refine with garbage AI output now retries once then returns a typed `invalid_output` failure (inherited), instead of the old opaque behavior.

### Equivalence (success criterion 5)
- A generate-vs-refine equivalence test: for equivalent inputs, refine and generate execute the same ingestion + prompt builder + guardrails so they produce equivalent structured output. Assert the shared seams are exercised by both (e.g. both call the shared ingestion + `buildSystemPrompt`; refine no longer references the deleted bespoke prompt).

### Invariants to preserve (regression-gated)
- never-throw/always-finalize; refine failures become typed responses, never opaque 500s (Phase 99 already fixed the route catch — keep it).
- Phase 100 guardrails (zod, anchoring, totals authority, correlation id) now also cover refine output.
- Multi-tenant `companyId` stays closure/param; price book queried by companyId.
- Editor preview-then-save UX unchanged (synchronous response, same JSON shape).
- WhatsApp never-reply + web/MCP generate paths do NOT regress (CHAN-01..04, QA-01..03).
- Do NOT introduce a LangGraph checkpointer; refine uses the passthrough StepRunner.
</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `app/api/estimates/[id]/refine/route.ts` — current inline refine (auth/guards/parse to KEEP as a thin wrapper; transcription/vision/prompt to REMOVE).
- `lib/ai/openrouter-client.ts` — `transcribeAudioOR`, `analyzePhotoOR` (now fallback-wrapped) = the ingestion primitives.
- `lib/ai/prompt-builder.ts` — `buildSystemPrompt`/`buildUserContent` + `sanitizeField`/`escapeXml` (the single prompt source; injection hardening to extend to refine).
- `lib/ai/providers/{openrouter,gemini}.ts` — `refineEstimate` (bespoke prompt to replace with the shared builder; both adapters).
- `lib/ai/provider-with-fallback.ts` + `lib/ai/with-fallback.ts` (Phase 99) — `getAIProviderWithFallback`, `withSchemaRetry` (Phase 100) — refine must route through these.
- `lib/ai/schema.ts` + `normalize.ts` (Phase 100) — refine output validated here too.
- `lib/estimate/graph/{index,state,types}.ts` + `adapters/{default,whatsapp}.ts` + `nodes/*` — the graph + adapter pattern to extend for refine.
- `lib/estimate/adapters/whatsapp.ts` `processMessage` — the multimodal fan-out to route through the shared ingestion.
- `lib/queries/estimate.ts` `getEstimateById`, `lib/queries/price-book.ts` `getPriceBookItems`.

### Established Patterns
- Closure-factory adapters (`makeDefaultAdapter`, `makeWhatsAppAdapter`) — mirror for a `makeRefineAdapter`.
- StepRunner passthrough seam (Phase 94) — invoke refine inline with it.
- Prompt-injection sanitization (escape + tag + length cap) — apply to the refine instruction.

### Integration Points
- HTTP: `app/api/estimates/[id]/refine/route.ts` (thin wrapper).
- Engine: graph refine node/adapter; shared ingestion module; shared prompt builder.
- Editor frontend: consumes `{ success, refined, instruction }` — response shape MUST stay stable (no frontend change).
</code_context>

<specifics>
## Specific Ideas

- The single biggest correctness + security win is killing the bespoke `refineEstimate` prompt in BOTH adapters and routing refine through `buildSystemPrompt`/`buildUserContent` (gets language, price book, security, sanitization).
- Reuse the Phase-99 fallback + Phase-100 validation by having refine call `getAIProviderWithFallback` + `withSchemaRetry` (the same seam generate uses) — do NOT add a second validation/retry path.
- Keep web/MCP's decoupled upload-time ingestion (CHAN-02) — "unified ingestion path" means one IMPLEMENTATION of transcription/vision/assembly reused, not forcing web to re-ingest inside the graph.
- Preserve the editor response contract byte-for-byte to avoid a frontend change (the user chose to keep refine synchronous specifically to avoid UX churn).
</specifics>

<deferred>
## Deferred Ideas

- WhatsApp per-message batch isolation (HARD-05), configurable auto-refine cap + recourse (HARD-06), replay-safe TTL (HARD-07) — Phase 102. Here we route WhatsApp through shared ingestion but do NOT change its batch atomicity.
- The eval harness exercising the unified path against golden fixtures (EVAL-01..04) — Phase 103.
- Dispatching refine via Inngest for durability — explicitly OUT per the 2026-06-21 user decision (refine stays a synchronous inline preview).
- Full per-node step.run durability decomposition — deferred per v4.3 guardrails.
</deferred>
