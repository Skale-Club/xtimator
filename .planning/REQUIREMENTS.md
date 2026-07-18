# Requirements: Xtimator — Milestone v4.20 Structured Photo Extraction

**Defined:** 2026-07-17
**Core Value:** A business owner can go from job site audio recording to a sent, professional estimate in under 5 minutes without touching a keyboard.
**Milestone goal:** Photo analysis produces typed, structured intelligence (measurements, surfaces, materials, damage) that reaches the estimator as data — the biggest estimate-quality lever for measurement-heavy trades (flooring, painting, roofing). Design source: [audits/v4.19-ESTIMATE-DEEP-AUDIT.md](audits/v4.19-ESTIMATE-DEEP-AUDIT.md) § E5 (FUT-02, deliberately deferred until v4.19 fixed the pipeline's foundation).

> **Locked decisions (resolved autonomously per the standing no-checkpoint-interruptions preference):**
> - **Schema v1** (`PhotoExtraction`, versioned): `{ version: 1, surfaces: [{name, material, condition}], measurements: [{dimension: 'length'|'area'|'height'|'count', value, unit, subject, confidence: 'stated'|'estimated'}], materials: string[], damage: [{description, severity: 'minor'|'moderate'|'severe'}], trade_signals: string[], access_notes?: string, overall_description: string }`. `overall_description` is REQUIRED — it populates `ai_description` so every existing consumer (share, PDF, prompt fallback) renders unchanged.
> - **Two-layer enforcement, mirroring estimates (GUARD-01 pattern):** provider tool schema is advisory; the authoritative gate is one zod schema (`safeParse`). Invalid output → fall back to the PROSE path for that photo (no retry storm; one structured attempt per photo). Truncation (finish_reason 'length') → same prose fallback via the 166-01 typed-error pattern.
> - **Fallback ladder per photo:** structured (OpenRouter) → structured (Gemini functionDeclarations) → prose (existing analyzePhotoOR ladder). A photo NEVER fails analysis because structured extraction failed — PEXT never weakens the 168-01 skip-and-continue/coverage semantics.
> - **Kill-switch:** env `PHOTO_STRUCTURED_EXTRACTION` (default ON; `off` reverts to the prose pipeline byte-identically). Env is the house-accepted config layer for v1 (precedent: ESTIMATE_TOTAL_CEILING_USD); admin-panel toggle is a follow-up.
> - **Prompt serialization is a pure module** feeding the EXISTING `<photo_description>`/`sanitizeField` path — no new prompt-builder surface, no parallel unsanitized route. Prose-only photos (legacy or fallback) produce byte-identical prompt output to today.
> - **max_tokens 700** for the structured call (audit § E5 sizing), temperature 0.3 (166-01 consistency), costContext threaded (167-02 pattern) with operationType 'vision' unchanged.
> - **Refine-path photos stay prose** (ephemeral, never persisted — threading a schema there is cost without benefit). No re-analysis backfill of old photos in v1 (they keep prose; the serializer handles both shapes).
> - **v4.19 photo-pipeline semantics are regression contracts:** chunked full coverage, `.is('ai_description', null)` re-analyze filter, per-photo step.run checkpointing (stable names), skip-and-continue, N-of-M counts in pipeline_events.metadata, caption folding, cross-tenant scoping. None may weaken.

## v1 Requirements

Each requirement maps to exactly one roadmap phase.

### Structured Photo Extraction

- [x] **PEXT-01**: Each analyzed photo gains a persisted structured extraction (`photos.ai_extraction` JSONB: surfaces, measurements with unit + confidence, materials, damage, trade signals) validated by one authoritative zod schema, with `ai_description` populated from `overall_description` so every existing consumer renders unchanged.
- [x] **PEXT-02**: The generation prompt includes a compact structured block per extracted photo (measurements/materials/damage, sanitized through the existing sanitizeField path) — quantities reach the estimator as typed data; prose-only photos produce byte-identical prompt output to today.
- [ ] **PEXT-03**: A failed, invalid, or truncated structured call degrades to the prose pipeline for that photo with zero user-visible failure, and the env kill-switch reverts the whole feature to today's behavior — the v4.19 coverage/skip-and-continue/N-of-M semantics are provably intact either way.
- [ ] **PEXT-04**: Both providers (OpenRouter forced tool-call primary, Gemini functionDeclarations fallback) produce the same schema through the same zod gate — provider drift is locked by a parity test (the AIREL-03 lesson).
- [ ] **PEXT-05**: Structured calls carry the job's costContext and their real cost lands in ai_cost_events — the per-photo cost increase (~1.3-1.7×) is measurable, and photo_batch debits keep summing correctly.

## Future Requirements (deferred)

- **FUT-01**: Admin-panel toggle + per-tier gating for structured extraction (env-only in v1).
- **FUT-02**: Re-analysis backfill of legacy prose-only photos.
- **FUT-03**: Estimator-side quantity linking — map extraction measurements directly onto line-item quantity/unit suggestions (needs prompt-engineering iteration; v1 delivers the data, not the binding).
- **FUT-04**: Structured extraction on the refine path.

## Out of Scope (this milestone)

- **Any change to the estimate generation model/prompt beyond the photo-context serialization** — the estimator consumes richer context; its own instructions don't change.
- **UI for browsing extractions** — the data serves generation; surfacing it in the photo grid is a product decision for later.
- **The v4.19 operational deferrals** (prod migrations, audio-entitlement recalibration, UAT) — tracked in the v4.19 PROJECT.md entry, not blocked on this milestone.

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| PEXT-01..05 | 171 | In Progress (PEXT-01 complete) |
