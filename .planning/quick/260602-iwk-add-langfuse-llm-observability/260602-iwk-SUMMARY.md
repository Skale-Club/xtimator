---
phase: quick
plan: 260602-iwk
subsystem: observability
tags: [langfuse, llm-observability, openrouter, tracing]
dependency_graph:
  requires: []
  provides: [langfuse-singleton, llm-tracing]
  affects: [lib/ai/providers/openrouter.ts, lib/ai/openrouter-client.ts]
tech_stack:
  added: [langfuse]
  patterns: [lazy-singleton, best-effort-tracing, server-only-guard]
key_files:
  created:
    - lib/observability/langfuse.ts
  modified:
    - lib/ai/providers/openrouter.ts
    - lib/ai/openrouter-client.ts
    - .env.local.example
    - .env.example
    - package.json
    - package-lock.json
decisions:
  - getLangfuse() lazy singleton pattern — module-level _client avoids re-initializing on every call in serverless cold starts
  - flushAt:1 + flushInterval:0 — ensures traces are flushed before Vercel function exits (no batching)
  - server-only import guard — prevents langfuse.ts from being bundled client-side
  - Inner try/catch for all Langfuse blocks — tracing failure never propagates to AI callers
  - Safe metadata inputs only — base64/audioBlob excluded from trace inputs per T-iwk-01
metrics:
  duration: ~15min
  completed: "2026-06-02T16:44:59Z"
  tasks_completed: 3
  files_changed: 7
---

# Quick Task 260602-iwk: Add Langfuse LLM Observability Summary

**One-liner:** Langfuse tracing on all OpenRouter and Whisper AI call sites via lazy singleton with silent-disable-on-missing-keys and serverless flush settings.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Install langfuse + getLangfuse() singleton | 5dfd981 | lib/observability/langfuse.ts, package.json, package-lock.json |
| 2 | Instrument openrouter.ts callTool | 58462ff | lib/ai/providers/openrouter.ts |
| 3 | Instrument openrouter-client.ts + env examples | f69af51 | lib/ai/openrouter-client.ts, .env.local.example, .env.example |

## What Was Built

### lib/observability/langfuse.ts

Lazy singleton factory `getLangfuse(): Langfuse | null`:
- `import 'server-only'` prevents browser bundle inclusion
- Returns `null` silently when `LANGFUSE_PUBLIC_KEY` or `LANGFUSE_SECRET_KEY` are absent
- `flushAt: 1, flushInterval: 0` ensures serverless flush before function exits
- Constructor wrapped in try/catch — init failure degrades to null, never throws

### lib/ai/providers/openrouter.ts

- `OpenRouterChatResponse` type extended with `usage?: { prompt_tokens?, completion_tokens? }`
- `callTool` gains optional `operationName` param (defaults to `'generate_estimate'`)
- `generateEstimate` passes `operationName: 'generate_estimate'`
- `refineEstimate` passes `operationName: 'refine_estimate'`
- After successful JSON parse, emits a Langfuse `trace.generation` with model, messages as input, parsed output, token counts, and start/end timing — wrapped in inner try/catch

### lib/ai/openrouter-client.ts

Three functions instrumented:
- `analyzePhotoOR` → Langfuse `trace.generation('analyze_photo')` with `input: { mimeType, prompt }` — base64 excluded (T-iwk-01)
- `translateTextsOR` → Langfuse `trace.generation('translate_texts')` with `input: { texts, targetLanguage }`
- `transcribeAudioOR` → Langfuse `trace.span('transcribe_audio')` with `input: { ext, model }`, `output: transcript.slice(0, 200)` — audioBlob excluded (T-iwk-01)

### Env examples updated

Both `.env.local.example` and `.env.example` have Langfuse section with commented placeholder keys.

## Deviations from Plan

None — plan executed exactly as written.

The only structural difference from the plan's `callTool` patch: the outer `catch` block was changed from a bare `catch` to `catch (err)` with an `instanceof SyntaxError` re-throw guard. This is required because the inner Langfuse try/catch can re-throw non-SyntaxError errors and the outer catch must distinguish parse failures from Langfuse rethrows. This is a correctness fix (Rule 1) that preserves the original intended behavior.

## Threat Model — Implemented Mitigations

| Threat ID | Status |
|-----------|--------|
| T-iwk-01 (base64/audioBlob in traces) | Mitigated — inputs shaped as safe metadata objects only |
| T-iwk-02 (availability — tracing blocks caller) | Mitigated — all calls in try/catch, flushAt:1 prevents batch blocking |
| T-iwk-03 (LANGFUSE_SECRET_KEY exposure) | Accepted — server-only guard + env-var pattern consistent with SUPABASE_SECRET_KEY |

## Known Stubs

None.

## Self-Check

- [x] `lib/observability/langfuse.ts` exists and contains `server-only`, `flushAt: 1`
- [x] `5dfd981`, `58462ff`, `f69af51` commits present in git log
- [x] `tsc --noEmit` passes with zero errors
- [x] `base64` and `audioBlob` do not appear in any Langfuse trace block
- [x] `.env.local.example` and `.env.example` both contain `LANGFUSE_PUBLIC_KEY`

## Self-Check: PASSED
