---
phase: quick-260527-k4i
plan: 01
subsystem: ai-transcription
tags: [reliability, ai, inngest, openrouter, transcription, retry, fallback]
requires:
  - lib/ai/openrouter-client.ts (transcribeAudioOR retry + OpenAI-direct fallback path)
provides:
  - isTransientORAuthGlitch helper that classifies OpenRouter `401 User not found` as transient
  - transcribeAudioOR self-heals spurious 401s via existing retry + OpenAI fallback
affects:
  - lib/inngest/functions/transcribe-audio.ts (caller — behavior improves, code untouched)
tech-stack:
  added: []
  patterns:
    - "Narrow transient-error classification: status === 401 && /user not found/i.test(body) only — every other 4xx still hard-fails"
key-files:
  created: []
  modified:
    - lib/ai/openrouter-client.ts
decisions:
  - "Treat ONLY 401 + 'User not found' body as transient — all other 4xx (incl. other 401s) still throw immediately so real auth/config bugs are not masked"
  - "Transient 401 records into the existing orFailure accumulator with a '(transient)' marker, reusing the 5xx retry + OpenAI-direct fallback path rather than adding a new code path"
metrics:
  duration: ~6 min
  completed: 2026-05-27
  tasks: 1
  files: 1
---

# Quick Task 260527-k4i: Treat OpenRouter 401 "User not found" as Transient Summary

Made OpenRouter's spurious `401 {"message":"User not found","code":401}` transcription response flow into the existing in-process retry + OpenAI-direct fallback path in `transcribeAudioOR` instead of throwing immediately, so the Inngest transcribe-audio job self-heals in ~2-4s without relying on Inngest's ~25-30s outer backoff or polluting logs with error-level 401s.

## What Changed

`lib/ai/openrouter-client.ts` — surgical edit to `transcribeAudioOR` only:

1. **New module-internal helper** `isTransientORAuthGlitch(status, body)` (not exported), returning `status === 401 && /user not found/i.test(body)`. Placed just above `transcribeAudioOR`, after `transcribeViaOpenAIDirect`.
2. **Attempt-1 4xx branch** now reads the response body first, then guards: a transient 401 records `orFailure = \`OpenRouter ${status} (transient): ...\`` and falls through to the retry path; any other 4xx throws the unchanged `OpenRouter transcription failed (${status}): ...` error.
3. **Attempt-2 (retry) 4xx branch** mirrors the same guard, recording into `orFailure` with the existing pipe-concatenation style (`${orFailure} | retry ${status} (transient): ...`); any other 4xx throws the unchanged `OpenRouter transcription failed on retry (${status}): ...` error.
4. **JSDoc** on `transcribeAudioOR` updated to note the single 4xx exception.

Both catch blocks are unchanged — the transient 401 never throws, so it never reaches the `e.message.startsWith('OpenRouter transcription failed (4'...)` re-throw guards; genuine 4xx still throws and is correctly re-propagated.

## Verification

- `npx tsc --noEmit` reports **no errors involving `lib/ai/openrouter-client.ts`** (`grep openrouter-client` → no matches). Pre-existing `@modelcontextprotocol/sdk` module-resolution errors in `app/api/mcp/*` and `lib/mcp/*` are unrelated to this task and out of scope (SCOPE BOUNDARY).
- `grep isTransientORAuthGlitch lib/ai/openrouter-client.ts` → exactly 1 definition (line 95) + 2 call sites (lines 159, 191).
- `grep "transcribeAudioOR(fileData" lib/inngest/functions/transcribe-audio.ts` → still matches (line 86) — caller untouched.
- `git diff --stat` → only `lib/ai/openrouter-client.ts` changed (31 insertions, 5 deletions); `analyzePhotoOR`, `translateTextsOR`, and `transcribeViaOpenAIDirect` are byte-unchanged; `transcribeAudioOR` exported signature byte-identical.
- Manual trace: a `401 {"error":{"message":"User not found","code":401}}` on attempt 1 records `orFailure = "OpenRouter 401 (transient): ..."` and falls through to attempt 2; a `401 {"message":"Invalid API key"}` still throws `OpenRouter transcription failed (401): ...`.

## Follow-up Cleanup (double-read defect)

The initial implementation (`c4b3dfe`) introduced a defect: on the transient-401 fall-through path, both attempts read the response body **twice** — once inside the 4xx `if` (`const err = await res.text()`) and again on the subsequent "5xx" record line. When a spurious `401 User not found` fell through, the second `res.text()` ran on an already-consumed body; the `.catch(() => 'unknown')` swallowed the rejected promise but **clobbered** the recorded failure, turning `"OpenRouter 401 (transient): {json}"` into `"OpenRouter 401: unknown"` — losing both the `(transient)` marker and the actionable error detail. Control flow was unaffected, but the body was double-read and diagnostics were lost.

**Fix (`21962ab`):** Restructured both attempts so the error body is read **exactly once**, then status is branched on:

1. **Attempt 1** — read `err` once after the `res.ok` early-return; throw on non-transient 4xx via `res.status >= 400 && res.status < 500 && !isTransientORAuthGlitch(...)`; otherwise record `orFailure = \`OpenRouter ${status}${transient ? ' (transient)' : ''}: ...\`` covering both 5xx and transient-401.
2. **Attempt 2 (retry)** — analogous single read + guard, recording into the pipe-concatenated `orFailure` with the same `(transient)` marker preserved.

Verified `res.text()` appears at most once per try block in `transcribeAudioOR` (success-path read + single error-body read). `npx tsc --noEmit` reports no errors involving `openrouter-client.ts`. Catch blocks, JSDoc, `isTransientORAuthGlitch`, the helper, and the exported signature are all untouched.

## Deviations from Plan

None - plan executed exactly as written.

## Commits

- `c4b3dfe`: fix(quick-260527-k4i): treat OpenRouter 401 'User not found' as transient in transcribeAudioOR
- `21962ab`: fix(quick-260527-k4i): read OpenRouter error body once, preserve transient marker

## Self-Check: PASSED

- FOUND: lib/ai/openrouter-client.ts (modified)
- FOUND: commit c4b3dfe
- FOUND: SUMMARY at .planning/quick/260527-k4i-treat-openrouter-401-user-not-found-as-t/260527-k4i-SUMMARY.md
