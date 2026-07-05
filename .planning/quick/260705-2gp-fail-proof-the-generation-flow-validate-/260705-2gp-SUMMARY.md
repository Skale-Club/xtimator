---
phase: quick-260705-2gp
plan: 01
subsystem: ai-pipeline
tags: [reliability, observability, ai, transcription, vision, price-research, billing, admin]
requires:
  - lib/ai/with-fallback.ts callWithFallback contract (99-01)
  - Inngest transcribe-audio job with step.run checkpointing (Phase 92/110/112)
  - price-research evidence gate isUsableCandidate (Phase 107)
provides:
  - Empty-output throws on transcribeAudioOR + analyzePhotoOR (silent-empty saves eliminated)
  - Analyzed-photos-only generation precondition (unanalyzed photos no longer satisfy it)
  - Gemini + OpenAI fallback-key cards in the admin AI integrations panel
  - ProvidersUnavailableError.fallbackCause (additive operator visibility)
  - Retry-idempotent ai_cost_events insert (step.run('record-ai-cost'))
  - BYOK decrypt-failure Sentry capture (byok.keyResolution tag)
  - Flat+nested url_citation annotation tolerance + zero-citations console.warn (both adapters)
  - price_research_cache write-failure console.warn
affects:
  - lib/ai (transcription, vision, fallback wrapper)
  - lib/services/generate-estimate.ts precondition
  - admin /admin/integrations/ai panel (2 new provider cards)
  - lib/inngest/functions/transcribe-audio.ts (new memoized step)
  - lib/estimate/price-research (adapters + cache observability)
tech-stack:
  added: []
  patterns:
    - Post-wrapper empty-output guard (throw AFTER callWithFallback so an empty HTTP-ok primary is not silently accepted)
    - Never-throw Sentry capture wrapped in inner try/catch (mirrors lib/observability/capture.ts)
    - Inngest step.run memoization for side-effect idempotency across retries
key-files:
  created:
    - tests/unit/ai/empty-output-guards.test.ts
  modified:
    - lib/ai/openrouter-client.ts
    - lib/ai/with-fallback.ts
    - lib/services/generate-estimate.ts
    - lib/admin/integrations-providers.ts
    - lib/billing/byok.ts
    - lib/inngest/functions/transcribe-audio.ts
    - lib/estimate/price-research/adapters/openrouter-web.ts
    - lib/estimate/price-research/adapters/anthropic-web.ts
    - lib/estimate/price-research/cache.ts
    - tests/unit/ai/transcribe-fallback.test.ts
    - tests/unit/ai/with-fallback.test.ts
    - tests/unit/services/generate-estimate.test.ts
    - tests/unit/billing/byok.test.ts
    - tests/unit/estimate/price-research-openrouter-web.test.ts
    - tests/unit/estimate/price-research-anthropic-web.test.ts
    - tests/unit/estimate/price-research-cache.test.ts
key-decisions:
  - "Empty-output guards placed AFTER callWithFallback (not inside providers): an empty-but-HTTP-ok primary is a wrapper success, and genuinely silent audio returns '' from both providers anyway"
  - "fallbackCause is a plain optional public field assigned post-construction — the dual-shape constructor signature is a pinned test contract and stays untouched"
  - "Citation-annotation type discrimination skips ONLY when type is present AND differs from 'url_citation' (absent type stays tolerated, matching prior behavior)"
  - "BYOK Sentry capture is observability-only — fail-open-to-platform-key return and the BYOK billing policy remain unchanged (explicitly deferred)"
metrics:
  duration: ~13 minutes
  tasks: 3
  files: 17
completed: 2026-07-05
---

# Quick Task 260705-2gp: Fail-Proof the Generation Flow Summary

**One-liner:** Closed 9 audit-verified generation-pipeline defects — empty AI outputs now throw instead of recording success, unanalyzed-photos-only projects are rejected, the dead OpenAI/Gemini fallback keys are manageable in the admin panel again, and four silent failure modes (fallback error, BYOK decrypt, duplicate cost events, cache-write loss, zero-citations evidence-gate wipeout) got loud.

## What Was Done

### Task 1 — Empty-output guards + fallbackCause (D1, D2, D8)
- `transcribeAudioOR` throws `'Transcription produced no text — no speech detected in the audio'` when the final (post-fallback) transcript is empty. Previously an empty transcript was saved, the job recorded SUCCESS, and credits were charged.
- `analyzePhotoOR` throws `'Photo analysis produced no description'` on an empty final analysis instead of silently feeding zero photo context into estimates.
- `ProvidersUnavailableError` gains an optional public `fallbackCause` field carrying the FALLBACK's error; assigned in `callWithFallback`'s both-fail path. `.cause` (primary error), message, and the `providerUnavailable` brand are unchanged — pinned by pre-existing tests that stayed byte-identical and green.
- Commits: `2cb246de` (RED), `bfa05f49` (GREEN).

### Task 2 — Precondition, admin keys, BYOK Sentry, cost idempotency (D3, D5, D6, D7)
- `generate-estimate.ts`: `hasPhotos` now counts only photos with a non-empty `ai_description` — matching what the prompt builder actually consumes. Error message byte-identical.
- `integrations-providers.ts`: restored `gemini` (generation/vision fallback) and `openai` (Whisper transcription fallback) cards to the 'ai' category. Context: the prod DB Gemini key was invisible/unrotatable and the OpenAI row was MISSING, leaving the transcription fallback dead. No other UI change needed — `loadCategoryInitials` iterates providers generically.
- `byok.ts`: decrypt/key-resolution failure now calls `Sentry.captureException` tagged `{ background: 'byok.keyResolution', company_id }`, wrapped in its own never-throw try/catch. Fail-open-to-platform-key return unchanged.
- `transcribe-audio.ts`: the bare `void recordAICost(...)` is now `await step.run('record-ai-cost', ...)` — memoized across Inngest retries so a save-transcript retry can never double-insert an `ai_cost_events` row. `minutes`/`whisperCost` still computed outside the step so the SAME value threads into `record-credit-debit`.
- Commits: `a4f84f9a` (RED), `b531a14f` (GREEN).

### Task 3 — Citation tolerance + zero-citations telemetry + cache observability (D4, D9)
- `openrouter-web.ts`: `UrlCitation` type extended with flat `url`/`content`; the indexing loop tolerates both nested and flat shapes with type discrimination (skip only when `type` present AND `!== 'url_citation'`).
- Both adapters: `console.warn('[price-research] ...: N results but 0 citations indexed ...')` when results parse but zero citations were indexed — the telemetry for the measured 97% evidence-gate rejection that was previously invisible.
- `cache.ts` `put()`: destructures the upsert `error` and warns `'[price-research] cache write failed'` — never throws, keeps resolving void.
- HARD constraint verified: `isUsableCandidate`, both adapters' cited/null-out re-association blocks, `missFor`, and the schema are byte-identical (checked via `git diff` — only a comment references the gate).
- Commits: `a11494d4` (RED), `e6e5e554` (GREEN).

## Verification Results

- **Inner loop (9 touched test files):** 67/67 passed.
- **Typecheck:** `npx tsc --noEmit -p tsconfig.ci.json` — clean (exit 0).
- **Full gate:** `npx vitest run tests/unit tests/eval` — **2816 passed, 24 todo, 1 failed**: `tests/unit/company-action.test.ts` timed out in the parallel run (a documented pre-existing parallel-only flake) and **passed 11/11 in isolation** — NOT a regression from this plan.

## Contract-Change Audit

Only intentional behavior changes (verified to break no existing test):
1. `transcribeAudioOR` throws on empty final transcript (previously returned `''`).
2. `analyzePhotoOR` throws on empty final analysis.
3. `generateEstimateForProject` rejects when the only inputs are photos without `ai_description`.
4. `ProvidersUnavailableError.fallbackCause` — purely additive.

## Deviations from Plan

None - plan executed exactly as written.

Note: `components/workspace/send/*` diffs visible in the branch range come from pre-existing commit `4dae51f4` (a prior session), not this plan — none of this plan's six commits touch those files.

## Known Stubs

None — no hardcoded empty values, placeholder text, or unwired components were introduced. All new code paths are wired to real data sources and covered by tests.

## Deferred (explicitly out of scope, per plan)

- BYOK billing policy: debiting `byok_enabled` companies served by the platform key.
- Any empty-primary-triggers-fallback redesign of `callWithFallback`.

## Commits

| Commit | Type | Description |
| --- | --- | --- |
| 2cb246de | test | Failing tests: empty-output guards + fallbackCause |
| bfa05f49 | feat | Empty-output guards on transcription/vision + fallbackCause (D1, D2, D8) |
| a4f84f9a | test | Failing tests: unanalyzed-photos rejection + BYOK Sentry capture |
| b531a14f | feat | Generation precondition, admin fallback keys, BYOK Sentry, cost idempotency (D3, D5, D6, D7) |
| a11494d4 | test | Failing tests: citation tolerance, zero-citations warn, cache-write warn |
| e6e5e554 | feat | Citation shape tolerance + zero-citations telemetry + cache-write warn (D4, D9) |

## Operational Follow-ups (not code)

- Super-admin: open `/admin/integrations/ai` and save the **OpenAI** key (Whisper fallback is currently DEAD in production without it) and verify/rotate the **Gemini** key now that its card is visible.
- Watch logs for `[price-research] ... 0 citations indexed` to confirm whether the 97% evidence-gate rejection is annotation shape drift (now partly fixed by flat-shape tolerance) or a degraded provider.

## Self-Check: PASSED

- All 10 claimed source/test files + SUMMARY exist on disk.
- All 6 commits (2cb246de, bfa05f49, a4f84f9a, b531a14f, a11494d4, e6e5e554) found in git log.
- All 9 must-have artifact patterns verified present ('Transcription produced no text', 'fallbackCause', 'photos.some', ''gemini'', 'record-ai-cost', 'byok.keyResolution', '0 citations indexed' x2, 'cache write failed').
