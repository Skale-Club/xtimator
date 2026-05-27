---
phase: quick-260527-l9c
plan: 01
subsystem: ai
tags: [openrouter, transcription, auth, error-handling, resilience]
requires:
  - lib/ai/openrouter-client.ts transcribeAudioOR retry-then-fallback flow
provides:
  - transcribeAudioOR with 4xx-throws-immediately behavior (401 included); no transient-401 special case
affects:
  - lib/inngest/functions/transcribe-audio.ts (caller — signature unchanged, behavior now surfaces real 401s)
  - every AI task routing through lib/ai/index.ts (real auth failures no longer masked)
tech-stack:
  added: []
  patterns:
    - "4xx (incl. 401) = caller fault → throw immediately, never mask via retry/fallback"
    - "5xx + network = transient → retry once then fall back to OpenAI direct (whisper-1)"
key-files:
  created: []
  modified:
    - lib/ai/openrouter-client.ts
decisions:
  - "OpenRouter 401 'User not found' is now treated as a genuine auth failure (dead/invalid/revoked key), not a transient glitch — OpenRouter shipped a fix on 2026-02-20 returning 503 for infra/auth-lookup failures, making the prior 260527-k4i transient premise obsolete and harmful (it masked a real dead key in prod on 2026-05-27 and wasted a retry)."
metrics:
  duration: ~3m
  completed: 2026-05-27
---

# Phase quick-260527-l9c Plan 01: Remove Obsolete OpenRouter Transient-401 Handling Summary

Removed the obsolete `isTransientORAuthGlitch` special case from `transcribeAudioOR` so any OpenRouter 4xx (including `401 "User not found"`) throws immediately as a genuine auth/config error instead of being masked by the retry + OpenAI fallback path; 5xx/network resilience is untouched.

## What Changed

`lib/ai/openrouter-client.ts` — single-file mechanical refactor (13 insertions, 28 deletions):

1. **Deleted** the `isTransientORAuthGlitch(status, body)` helper and its doc comment in full (no dangling comment).
2. **Simplified Attempt 1 4xx guard** from `if (res.status >= 400 && res.status < 500 && !isTransientORAuthGlitch(res.status, err))` to a plain `if (res.status >= 400 && res.status < 500)`; thrown error message unchanged (`OpenRouter transcription failed (${res.status}): ...`). The 5xx fall-through no longer computes `transient`; the record line now reads `orFailure = \`OpenRouter ${res.status}: ${err.slice(0, 200)}\``.
3. **Simplified Attempt 2 / retry 4xx guard** identically; thrown error message unchanged (`OpenRouter transcription failed on retry (${res.status}): ...`); record line now reads `orFailure = \`${orFailure} | retry ${res.status}: ${err.slice(0, 200)}\``.
4. **Updated comments** — the `transcribeAudioOR` doc comment and both inline comment blocks no longer claim `401 User not found` is transient; they state plainly that any 4xx (incl. 401) throws immediately, and only 5xx/network retry then fall back to OpenAI direct (whisper-1). Added the rationale that OpenRouter now returns 503 for its own infra/auth-lookup failures.

Untouched (as required): exported `transcribeAudioOR` signature, `transcribeViaOpenAIDirect`, the two `catch (e)` 4xx-rethrow guards, the network-error orFailure recording, and the Attempt 3 OpenAI direct fallback.

## Why

OpenRouter deployed a fix on 2026-02-20 so that infrastructure / auth-lookup failures now return **503**, not **401**. A `401 "User not found"` today is therefore a GENUINE auth failure (dead/invalid/revoked key). On 2026-05-27 a dead key in production caused all AI tasks to fail, while the prior task's (260527-k4i) "transient" treatment masked the real error and wasted a retry. Since every AI task in the app routes through this single key (lib/ai/index.ts), masking real 401s was high-impact, so the special case was removed and correct 4xx-throws-immediately behavior restored.

## Verification

- **`npx tsc --noEmit`**: `lib/ai/openrouter-client.ts` has **zero errors** (confirmed via filtered tsc run — file does not appear in the error list).
- **Repo grep for `isTransientORAuthGlitch`**: zero references in any `.ts`/`.tsx` source file. Remaining matches are only in `.planning/` docs (this plan + the prior 260527-k4i plan/summary), which is expected.
- **Repo grep for `transient` (case-insensitive) in the changed file**: zero matches — no `transient` variable, no `(transient)` label remains.
- **Manual code read**: a 401 on Attempt 1 now hits the plain 4xx guard and throws `OpenRouter transcription failed (401): ...` immediately, never reaching the retry or OpenAI fallback. 5xx/network paths still retry once then fall back to OpenAI direct.

### Pre-existing tsc errors (out of scope — NOT introduced by this change, NOT fixed)

The full `npx tsc --noEmit` run surfaces pre-existing errors in files unrelated to this one-file change. These were verified to be in untracked / separately-modified WIP files and an uninstalled dependency, and `lib/ai/openrouter-client.ts` is NOT among them:

- `components/whatsapp/whatsapp-inbox.tsx` (untracked WIP) — `'thread' is possibly 'null'` (x2)
- `lib/actions/whatsapp-settings.ts` (modified outside this task) — `Cannot find name 'supabase'` (x6)
- `app/api/mcp/route.ts`, `lib/mcp/errors.ts`, `lib/mcp/server.ts`, `lib/mcp/tools/registry.ts` — `Cannot find module '@modelcontextprotocol/sdk/...'` (SDK dependency not installed) + one implicit-any

Per task constraints, these were noted but not touched.

## Deviations from Plan

None - plan executed exactly as written.

## Commits

- `948144e` fix(quick-260527-l9c): treat OpenRouter 401 as genuine auth error, remove obsolete transient handling

## Self-Check: PASSED

- FOUND: lib/ai/openrouter-client.ts (modified, tsc-clean)
- FOUND: commit 948144e
- CONFIRMED: zero `isTransientORAuthGlitch` references in source; zero `transient` references in the changed file
