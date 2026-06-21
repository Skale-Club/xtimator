---
phase: 99
plan: 01
subsystem: ai-provider-fallback
tags: [HARD-03, provider-fallback, gemini, openrouter, resilience]
requires:
  - "99-00 Wave-0 RED test scaffold (with-fallback / transcribe-fallback / gemini vision / never-throw)"
provides:
  - "callWithFallback({op,primary,fallback}) -> { result, servedBy, fallbackFired } shared OpenRouter->Gemini policy"
  - "ProvidersUnavailableError marker (providerUnavailable=true, .cause = primary error) for both-down"
  - "analyzePhotoGemini(base64, mimeType) vision fallback"
  - "getAIProviderWithFallback(companyId) fallback-aware AIProvider for generate/refine"
  - "transcribeAudioOR + analyzePhotoOR now fall back to Gemini on FAILURE (not just key-absence)"
affects:
  - "lib/services/generate-estimate.ts (generate path now fallback-aware)"
  - "all transcribeAudioOR / analyzePhotoOR callers (inherit fallback, zero edits)"
tech-stack:
  added: []
  patterns:
    - "Generic callWithFallback thunk wrapper (covers standalone fns AND AIProvider methods uniformly)"
    - "Dynamic import of Gemini SDK / with-fallback to keep bundles lean (server-only)"
    - "Marker error re-thrown (never swallowed) so never-throw graph nodes convert to failure state"
key-files:
  created:
    - "lib/ai/with-fallback.ts"
    - "lib/ai/provider-with-fallback.ts"
  modified:
    - "lib/ai/providers/gemini.ts"
    - "lib/ai/openrouter-client.ts"
    - "lib/services/generate-estimate.ts"
decisions:
  - "ProvidersUnavailableError constructor is flexible: (cause) single-arg (wrapper internal) OR (message, cause) two-arg (never-throw test) — satisfies both contract call shapes"
  - "Did NOT write 'gemini' to pipeline_events.provider (column union can't hold it); servedBy/fallbackFired returned as a seam for Phase 100/GUARD-04"
  - "Shared PHOTO_PROMPT exported from openrouter-client.ts and imported in gemini.ts (single source, no duplication)"
  - "getAIProvider (model selection) left untouched; fallback layered via a thin getAIProviderWithFallback wrapper"
metrics:
  duration: "~12 min"
  completed: "2026-06-21"
  tasks: 3
  files: 5
  commits: 3
---

# Phase 99 Plan 01: Shared OpenRouter->Gemini Provider-Fallback Wrapper (HARD-03) Summary

One shared provider-fallback policy (`callWithFallback`) now backs every AI call path — generate, transcribe, and vision attempt OpenRouter first and fall back to Gemini exactly once on failure; refine has a fallback-aware provider ready for Phase 101. On both-providers-down a marked `ProvidersUnavailableError` is thrown (carrying the primary error as `.cause`) so 99-02 can map it deterministically to `provider_unavailable`.

## What Was Built

- **`lib/ai/with-fallback.ts`** — `callWithFallback({ op, primary, fallback })` returns `{ result, servedBy: 'primary'|'fallback', fallbackFired }`. Primary success → no fallback (exactly 1 call, QA-03). Primary throws → fallback runs at most once. Both throw → marked `ProvidersUnavailableError` (`providerUnavailable = true as const`, `.cause` = primary error). No retry loop; tenant scope lives in the thunks.
- **`analyzePhotoGemini(base64, mimeType)`** (in `gemini.ts`) — Gemini vision fallback mirroring `transcribeAudioGemini`'s `{ inlineData: { mimeType, data: base64 } }` shape; uses the shared `PHOTO_PROMPT`.
- **`transcribeAudioOR`** — preserves the key-absent short-circuit to Gemini FIRST, then wraps the key-present Whisper body (`whisperPrimary`, langfuse trace intact) in `callWithFallback` with `transcribeAudioGemini` as the fallback (failure-based fallback added).
- **`analyzePhotoOR`** — OpenRouter vision body extracted into `visionPrimary` (langfuse trace intact) and wrapped in `callWithFallback` with `analyzePhotoGemini` fallback. Exported signatures unchanged → all callers inherit fallback with zero edits.
- **`lib/ai/provider-with-fallback.ts`** — `getAIProviderWithFallback(companyId)` resolves the primary via the existing `getAIProvider(companyId)` (model selection untouched) + a lazy `GeminiAdapter` fallback; `generateEstimate`/`refineEstimate` run through `callWithFallback`. The marked error propagates unchanged on both-down (not caught here).
- **`lib/services/generate-estimate.ts`** — one-line swap `getAIProvider` → `getAIProviderWithFallback` at the generate call site.

## Tasks & Commits

| Task | Name                                                          | Commit  |
| ---- | ------------------------------------------------------------ | ------- |
| 1    | callWithFallback wrapper + analyzePhotoGemini vision fallback | 0755094 |
| 2    | Wire transcription + vision to failure-based fallback         | 4380b08 |
| 3    | Fallback-aware provider for generate/refine + wire call site  | 035e243 |

## Verification

- `npx vitest run tests/unit/ai` → 7 files / 30 tests GREEN (with-fallback all 4 cases, transcribe-fallback both cases, gemini-adapter incl. vision, provider-factory unchanged).
- `npx vitest run tests/unit/estimate/never-throw.test.ts -t "no throw"` → GREEN (both-providers-down resolves to a failure state without throwing — the 99-01-owned presence case).
- `npx tsc --noEmit` → all five touched source files clean (no errors in `with-fallback.ts`, `provider-with-fallback.ts`, `openrouter-client.ts`, `gemini.ts`, `services/generate-estimate.ts`).

## Deviations from Plan

None — plan executed exactly as written. The only judgment call was the `ProvidersUnavailableError` constructor signature: the `with-fallback.test.ts` exercises it via the wrapper (single-arg `cause`) while `never-throw.test.ts` constructs it directly as `(message, cause)`. The constructor accepts both shapes (documented in the decisions block), preserving the marker contract for both call sites.

## Known RED-by-design / Deferred (NOT 99-01 regressions)

- `tests/unit/estimate/never-throw.test.ts › "...exactly provider_unavailable"` — RED by design; the marker→typed-reason mapping in `generate.ts` is owned by **99-02**. The companion "no throw" case (99-01's scope) is GREEN.
- `tests/unit/estimate/failure-mapping.test.ts` — Wave-0 RED for `lib/estimate/failure.ts` (FailureReason model), owned by **99-02**.
- `tests/unit/estimate/observability.test.ts › OBS-03 generate-estimate.ts` — **pre-existing**, unrelated. Asserts `lib/inngest/functions/generate-estimate.ts` (a file 99-01 did not touch) carries `langfuseSessionId`; belongs to Phase 97 observability. Verified failing identically with 99-01 changes stashed.
- `tests/unit/inngest/generate-estimate-job.test.ts(145,66)` tsc TS2348 — pre-existing mock-typing issue, present before any 99-01 source change.

Both pre-existing items logged to `deferred-items.md`.

## Self-Check: PASSED

- FOUND: lib/ai/with-fallback.ts
- FOUND: lib/ai/provider-with-fallback.ts
- FOUND: lib/ai/providers/gemini.ts (analyzePhotoGemini)
- FOUND: lib/ai/openrouter-client.ts (callWithFallback wiring)
- FOUND: lib/services/generate-estimate.ts (getAIProviderWithFallback)
- FOUND commit: 0755094
- FOUND commit: 4380b08
- FOUND commit: 035e243
