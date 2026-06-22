# Requirements: v4.5 Estimate Engine Robustness & Reliability Harness

**Goal:** Make the AI estimate generation/editing core (audio + image + text) bulletproof. Close the divergence between the canonical graph and the bypassing refine path, validate every AI output, isolate and recover from per-input failures, unify the three input modalities behind one path, and add an evaluation harness that catches regressions before production.

**Started:** 2026-06-21
**Status:** Defining requirements

## Why this milestone (the gap)

v4.3 (phases 94-96) extracted a channel-neutral **canonical estimate graph** (`lib/estimate/graph/`) with `ingest → generate → assess → autoRefine → finalize` nodes, channel adapters (`lib/estimate/adapters/{default,whatsapp}.ts`), and a `StepRunner` durability seam. The shared service `generateEstimateForProject` (`lib/services/generate-estimate.ts`) is the single generation core for web, MCP and WhatsApp. That is a strong foundation — but a code map on 2026-06-21 surfaced concrete robustness gaps that make the **most important flow in the product** fragile:

1. **The refine path bypasses everything.** `app/api/estimates/[id]/refine/route.ts` re-implements multimodal parsing (Whisper + Vision inline), has **no Gemini fallback**, builds **its own system prompt** (ignores `lib/ai/prompt-builder.ts`), and runs **outside the graph and Inngest** — so it has no idempotency, no durability, and can drift from the generate path.
2. **Three different error models coexist.** Routes throw `XtimatorError`; graph nodes / Inngest return `{ failure }` as state; refine throws → 500. No single contract.
3. **WhatsApp batch is all-or-nothing.** One bad message in a batch can fail the whole lot (`lib/estimate/adapters/whatsapp.ts`); there is no per-message isolation/retry.
4. **Auto-refine cap is hard-coded at 1** with no user recourse when the estimate is still vague (`lib/estimate/graph/nodes/auto-refine.ts`).
5. **Session TTL is re-minted with `Date.now()`** — safe today (whole graph in one `step.run`) but a replay hazard the moment AI nodes get their own `step.run`.
6. **No output schema guard.** AI output is trusted as a draft and totals are recalculated, but there is no zod validation / structured retry when the model returns malformed or price-hallucinated output.
7. **No correlation ID** ties `pipeline_events` ↔ Langfuse ↔ Sentry for a single end-to-end generation.
8. **No evaluation harness.** There are unit tests, but no golden multimodal datasets, deterministic mocked providers, or quality-metric regression gate to prove the core does not regress.

**Source:** architecture code-map 2026-06-21 (see conversation analysis) + the v4.3 artifacts in `.planning/phases/94-*`..`97-*`.

---

## v1 Requirements (this milestone)

### HARD — Pipeline Hardening

- [x] **HARD-01**: Estimate refine runs through the canonical estimate graph reusing the shared engine — the inline transcription/vision/prompt logic in `app/api/estimates/[id]/refine/route.ts` is removed in favor of the shared multimodal ingestion, prompt builder, provider fallback, and output validation. _(Decision 2026-06-21: refine stays a synchronous interactive preview and runs the graph INLINE with the passthrough StepRunner — intentionally NOT dispatched via Inngest, since it neither persists nor charges quota like generate. Inngest durability remains the generate/MCP contract.)_
- [x] **HARD-02**: Refine reuses the single prompt source of truth (`buildSystemPrompt` / `buildUserContent` in `lib/ai/prompt-builder.ts`) — no separately maintained refine prompt.
- [x] **HARD-03**: Every AI call path (generate, transcribe, vision, refine) uses the same provider-fallback policy (OpenRouter → Gemini) through one shared client wrapper.
- [x] **HARD-04**: A single typed error/failure model is used across API routes, graph nodes, Inngest functions and adapters — one mapping from failure to channel response, no ad-hoc `throw → 500`.
- [x] **HARD-05**: A failing item in a WhatsApp multimodal batch is isolated — good messages still produce an estimate, and the failed item is reported per-message rather than failing the whole batch.
- [x] **HARD-06**: The auto-refine cap is configurable (not hard-coded) and, when the estimate is still vague after the cap, the user has an explicit recourse path (e.g. add detail and regenerate) rather than a dead end.
- [x] **HARD-07**: Session/awaiting-state TTLs are derived from durable state (replay-safe), not minted from `Date.now()` inside a node — so promoting AI nodes to their own `step.run` cannot corrupt TTLs on retry.

### GUARD — AI Output Validation & Guardrails

- [x] **GUARD-01**: AI estimate output (generate and refine) is validated against a zod schema before persistence; invalid output triggers a structured, bounded retry instead of persisting garbage or 500ing.
- [x] **GUARD-02**: Price-hallucination guardrails are enforced — when a line item matches a price-book entry the anchored price is used, and out-of-bounds unit prices are flagged/clamped per documented rules.
- [x] **GUARD-03**: Server-side totals/markup/tax recalculation is the authoritative total and is asserted against the AI-proposed total, with a recorded discrepancy signal (the AI total is never trusted blindly).
- [x] **GUARD-04**: Each generation run carries one correlation ID that links `pipeline_events`, the Langfuse trace, and any Sentry event, so a single run can be traced end-to-end across all three systems.

### UNIFY — Multimodal Modality Unification

- [x] **UNIFY-01**: A single multimodal ingestion path (audio + image + text) is shared by web, WhatsApp, MCP and refine — no channel re-implements transcription/vision/text assembly independently.
- [x] **UNIFY-02**: Prompt construction for all channels and for refine goes through the same builder, so equivalent inputs yield equivalent prompts regardless of channel.
- [x] **UNIFY-03**: Refine accepts the same three modalities (audio, image, text) through the unified ingestion path with the same fallbacks and validation as initial generation.

### EVAL — Test & Evaluation Harness

- [x] **EVAL-01**: A golden-fixture dataset exists for representative audio, photo, and text inputs (stored or referenced deterministically) usable by the test suite without live AI calls.
- [x] **EVAL-02**: Deterministic mocked AI providers (transcription, vision, generate, refine) let the full engine run in tests with stable, asserted outputs.
- [x] **EVAL-03**: A quality-metrics suite scores generated estimates on objective signals (non-zero total, minimum line-item count, vagueness verdict, zod-schema validity) and asserts thresholds.
- [x] **EVAL-04**: A CI regression gate runs the eval harness on the estimate engine and fails the build when quality metrics or schema validity regress.

---

## Future Requirements (deferred)

- **HARD-08** (deferred): Full per-node `step.run` durability decomposition of the graph (the v4.3 `StepRunner` seam exists; the full granularity refactor remains deferred per v4.3 scope guardrails).
- **EVAL-05** (deferred): LLM-as-judge qualitative scoring of estimate prose/professional tone (beyond objective metrics) — needs a stable judge prompt + budget.
- **GUARD-05** (deferred): User-facing "why was this flagged" explanations for guardrail interventions.

## Out of Scope (explicit exclusions)

- **New estimate features / line-item capabilities** — this milestone hardens the existing flow; it does not add new estimate functionality.
- **WhatsApp intent-router unification** — explicitly deferred by v4.3 scope guardrails; not reopened here.
- **A LangGraph checkpointer** — v4.3 decided Inngest is the sole durability layer (`lib/estimate/graph/CHECKPOINTING.md`); GUARD/HARD work must not introduce a LangGraph persistence layer.
- **Model/provider swaps for quality** — provider *fallback* (HARD-03) is in scope; choosing different default models for better estimates is not.
- **UI redesign of the estimate editor** — HARD-06 adds a recourse path but reuses existing UI patterns; no visual redesign.

---

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| HARD-03 | Phase 99 | Complete |
| HARD-04 | Phase 99 | Complete |
| GUARD-01 | Phase 100 | Complete |
| GUARD-02 | Phase 100 | Complete |
| GUARD-03 | Phase 100 | Complete |
| GUARD-04 | Phase 100 | Complete |
| HARD-01 | Phase 101 | Complete |
| HARD-02 | Phase 101 | Complete |
| UNIFY-01 | Phase 101 | Complete |
| UNIFY-02 | Phase 101 | Complete |
| UNIFY-03 | Phase 101 | Complete |
| HARD-05 | Phase 102 | Complete |
| HARD-06 | Phase 102 | Complete |
| HARD-07 | Phase 102 | Complete (102-01) |
| EVAL-01 | Phase 103 | Complete |
| EVAL-02 | Phase 103 | Complete |
| EVAL-03 | Phase 103 | Complete |
| EVAL-04 | Phase 103 | Complete |
