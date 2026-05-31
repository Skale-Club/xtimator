---
phase: quick-260525-wc6
plan: 01
subsystem: ai-transcription
tags: [reliability, ai, inngest, openrouter, openai, whisper, fallback]
dependency-graph:
  requires:
    - lib/platform-config.ts:getIntegrationKey('openai')  # fallback key source
  provides:
    - lib/ai/openrouter-client.ts:transcribeAudioOR  # hardened: 5xx retry + OpenAI direct fallback
    - lib/ai/openrouter-client.ts:OPENAI_TRANSCRIPTION_BASE
    - lib/ai/openrouter-client.ts:OPENAI_FALLBACK_MODEL
  affects:
    - lib/inngest/functions/transcribe-audio.ts  # caller — benefits from self-healing without code change
tech-stack:
  added: []
  patterns:
    - "In-process single-retry + cross-provider fallback inside a centralized client function (signature unchanged) — eliminates 70s Inngest-level backoff hangs"
    - "Composite error message naming BOTH failure modes for actionable onFailure notifications"
    - "FormData rebuilt per attempt (some runtimes consume FormData bodies after fetch)"
key-files:
  created: []
  modified:
    - lib/ai/openrouter-client.ts  # +132 / -10
decisions:
  - "5xx → retry once after ~500ms before falling back (transient OpenRouter blips self-heal cheaply)"
  - "4xx → throw immediately, no OpenAI fallback (auth/config/payload bugs must surface, not be masked)"
  - "Network errors (fetch throws) treated as 5xx → eligible for retry + fallback"
  - "Dual failure throws single Error with BOTH provider failure descriptions concatenated"
  - "OpenAI direct call sends NO HTTP-Referer / X-Title (those are OpenRouter-specific)"
  - "Module-internal transcribeViaOpenAIDirect (not exported) — fallback is implementation detail, not public API"
  - "console.warn fired before fallback fetch so devs see the fallback path firing in terminal logs"
metrics:
  duration: ~3m
  completed: 2026-05-25
  tasks: 1
  files_modified: 1
  commits: 1
---

# Quick Task 260525-wc6: Fix Audio Transcription 500 Error — Add 5xx Retry + OpenAI Direct Fallback Summary

Hardened `transcribeAudioOR` in `lib/ai/openrouter-client.ts` with one in-process retry on OpenRouter 5xx and a single fallback to OpenAI's direct `/v1/audio/transcriptions` endpoint when OpenRouter keeps failing or the network drops — collapsing the previous ~70s Inngest-level backoff hang into a ~2-4s self-heal.

## What Changed

Single-file edit to `lib/ai/openrouter-client.ts`:

1. **New module-level constants** (near `OPENROUTER_BASE`):
   - `OPENAI_TRANSCRIPTION_BASE = 'https://api.openai.com/v1'`
   - `OPENAI_FALLBACK_MODEL = 'whisper-1'` (OpenAI's standard universally-available Whisper variant)

2. **New module-internal helper** `transcribeViaOpenAIDirect(audioBlob, ext)`:
   - Reads OpenAI key via `getIntegrationKey('openai')` (which already falls back to `process.env.OPENAI_API_KEY` per platform-config.ts:207 — zero extra config required for local dev)
   - Posts FormData (`file`, `model: whisper-1`, `response_format: text`) to `https://api.openai.com/v1/audio/transcriptions`
   - Sends Bearer auth only — NO `HTTP-Referer` / `X-Title` (those are OpenRouter-specific)
   - Throws on missing key, 4xx, or 5xx

3. **`transcribeAudioOR` body rewritten** (signature byte-identical: `(audioBlob: Blob, ext: string, model = OR_DEFAULTS.transcription): Promise<string>`):
   - **Attempt 1 (OpenRouter):** if `ok` → return; if 4xx → throw immediately; if 5xx → record failure and proceed
   - **Attempt 2 (OpenRouter retry):** wait ~500ms, retry once; same 4xx-throws-immediately rule
   - **Attempt 3 (OpenAI direct fallback):** `console.warn('[openrouter-client] ... falling back to OpenAI direct ...')` then call `transcribeViaOpenAIDirect`
   - **On dual failure:** throw composite Error `Transcription failed on both providers. {OpenRouter failure}. {OpenAI failure}` — Inngest's `onFailure` → `ai_job.failed` notification now has actionable context

4. **FormData rebuilt per attempt** via inline `buildForm()` helper — some runtimes mark FormData bodies as consumed after fetch; rebuilding is cheap and avoids subtle bugs across retries.

5. **`analyzePhotoOR` and `translateTextsOR` unchanged** — distinct failure modes, distinct retry semantics, out of scope for this surgical fix.

## Why

Before this change: a single OpenRouter 5xx → Inngest retries the entire step with ~25-30s exponential backoff → user UI hangs in "Transcribing" for ~70s and frequently fails outright (per `.planning/debug/transcribing-hangs.md`).

After: worst-case latency before throwing is ~500ms retry delay + 3 short HTTP round-trips ≈ 2-4s, with automatic recovery via OpenAI direct when OpenRouter is having issues. The user already has `OPENAI_API_KEY` in `.env.local`, so the fallback path is zero-config.

## Key Invariants Preserved

- `transcribeAudioOR` exported signature byte-identical → zero caller breakage; `lib/inngest/functions/transcribe-audio.ts:86` (`transcribeAudioOR(fileData, ext)`) untouched.
- 4xx errors keep the original error message format `OpenRouter transcription failed (${status}): ${body}` so any log scrapers / Inngest filters keep working.
- 4xx never falls back → real config/auth/payload bugs still surface immediately instead of being masked by a working OpenAI fallback.
- No new dependencies, no new tests added, no other files touched.

## Requirements Satisfied

- **FIX-TRANSCRIBE-5XX-01**: Retry once on OpenRouter 5xx — implemented in attempt-2 block (`await new Promise(r => setTimeout(r, 500))` then `callOpenRouter()` again).
- **FIX-TRANSCRIBE-5XX-02**: Fall back to OpenAI direct on persistent 5xx / network errors — implemented in attempt-3 block via `transcribeViaOpenAIDirect(audioBlob, ext)`.
- **FIX-TRANSCRIBE-5XX-03**: 4xx errors throw immediately (no fallback) so real bugs surface — implemented in both attempt-1 and attempt-2 with explicit `res.status >= 400 && res.status < 500` guards.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add 5xx retry + OpenAI direct fallback inside transcribeAudioOR | `e2b8e43` | lib/ai/openrouter-client.ts |

## Verification

1. **`npx tsc --noEmit`** — clean for our scope. Pre-existing 4 errors in `.next/types/validator.ts` (auto-generated Next.js validator referencing route group `(auth)` page files in `.next/types/`) are unrelated stale generated typings — documented as out-of-scope per the SCOPE BOUNDARY rule. No errors involve `lib/ai/openrouter-client.ts`, `lib/platform-config.ts`, or `lib/inngest/functions/transcribe-audio.ts`.
2. **Caller signature grep** — `transcribeAudioOR\(fileData,\s*ext\)` still matches at `lib/inngest/functions/transcribe-audio.ts:86`. Caller signature preserved.
3. **OpenAI URL grep** — `api\.openai\.com/v1` matches at line 16 (constant definition). URL is built via template literal `${OPENAI_TRANSCRIPTION_BASE}/audio/transcriptions` at line 70 → produces the correct `https://api.openai.com/v1/audio/transcriptions` URL.
4. **OpenAI key grep** — `getIntegrationKey\(['"]openai['"]\)` matches 2 times in the file: once in JSDoc comment (line 50) and once as the actual call inside `transcribeViaOpenAIDirect` (line 60). Exactly 1 runtime call.
5. **Console.warn grep** — `[openrouter-client] ` matches exactly once at line 183 (the new fallback log line).

## Deviations from Plan

None — plan executed exactly as written.

## Authentication Gates

None encountered.

## Deferred Issues

None.

## Self-Check: PASSED

- File `lib/ai/openrouter-client.ts` modified with new constants, helper, and rewritten `transcribeAudioOR` body — confirmed via Read.
- Commit `e2b8e43` exists in git log: `fix(quick-260525-wc6): add 5xx retry + OpenAI direct fallback to transcribeAudioOR`.
- Caller `lib/inngest/functions/transcribe-audio.ts:86` still calls `transcribeAudioOR(fileData, ext)` — signature preserved.
- TypeScript clean for all touched / related files; only pre-existing `.next/types/validator.ts` errors remain (out of scope per SCOPE BOUNDARY rule).

---

## Follow-up: read transcript / estimateId from DB after pollJob

After the OpenRouter→OpenAI fallback fix shipped, audio transcription
succeeded in Inngest but the UI still failed with "We couldn't catch
your description". Root cause confirmed via the Inngest dev API:

    curl http://localhost:8288/v1/runs/<runId>
    -> { ..., "status": "Completed", "output": "" }

The transcribe-audio (and generate-estimate) functions return
`{ transcript }` / `{ estimateId, ... }` but the Inngest dev server
posts back `output: ""` after a function whose body is multiple
`step.run` + a trailing fire-and-forget `void notify(...)`. The data
itself is persisted correctly by `step.run('save-transcript')` and by
the estimates insert.

Fix (commit `269cfdb`, `components/capture/capture-recorder.tsx`):
stop trusting `pollJob`'s returned payload — read the authoritative
row from Supabase after pollJob signals Completed. Three call sites
updated (runPipeline transcribe stage, runPipeline generate stage,
photos-only stage, plus triggerEstimateGeneration text path).

Matches the pattern already in use by
`components/workspace/ai-input-group/use-ai-input-submit.ts`.

Tradeoff: the `clientSuggestion` toast is dropped on these paths
(it's computed at generation time and not persisted). Acceptable —
toast is non-critical UX; the alternative was redirecting to
`?estimate=undefined`.

Removed now-unused imports: `storeClientSuggestion`,
`GenerateEstimateResponse`.
