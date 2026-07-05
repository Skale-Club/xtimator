---
phase: quick-260705-2gp
verified: 2026-07-05T00:00:00Z
status: passed
score: 9/9 must-haves verified
---

# Quick Task 260705-2gp: Fail-Proof the Generation Flow — Verification Report

**Task Goal:** 9 verified defects (D1-D9) fixed across the generation flow: empty-output guards, input precondition tightening, admin fallback-key restoration, citation-shape tolerance + zero-citations telemetry, and four observability/idempotency gaps.
**Verified:** 2026-07-05
**Status:** passed
**Re-verification:** No — initial verification
**Method:** Goal-backward against actual code (git range `58a8f847..b0a79250`, 7 commits). SUMMARY claims not trusted; every fix read in source and cross-checked against diffs and test locks. Tests NOT re-run here per orchestrator instruction — orchestrator independently ran `tsc` (clean) and the affected suites (401/401 across 62 files); executor full gate 2816 passed with only the documented pre-existing parallel flake.

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
| --- | ----- | ------ | -------- |
| 1 | D1: Silent/garbage audio fails the transcription job with a clear message instead of silent empty save + credit charge | VERIFIED | `lib/ai/openrouter-client.ts:164-166` throws 'Transcription produced no text — no speech detected in the audio' AFTER the fallback wrapper resolves. Propagates out of `step.run('whisper-transcribe')` (`transcribe-audio.ts:132-145`); cost + credit-debit steps sit AFTER it, so no charge on failure; `onFailure` sends ai_job.failed. Locked by `transcribe-fallback.test.ts:79-92` |
| 2 | D2: Empty photo analysis fails loudly | VERIFIED | `lib/ai/openrouter-client.ts:304-306` throws 'Photo analysis produced no description' after the wrapper. Locked by `empty-output-guards.test.ts` (empty → rejects; non-empty → passes through exact string) |
| 3 | D3: Unanalyzed-photos-only project rejected by the precondition | VERIFIED | `lib/services/generate-estimate.ts:138`: `photos.some((p) => p.ai_description && p.ai_description.trim().length > 0)`. Error message byte-identical. Locked by `generate-estimate.test.ts:303-316`; pre-existing photos-only case (line 296) still carries ai_description |
| 4 | D5: Super-admin can see/rotate Gemini + configure OpenAI Whisper-fallback keys | VERIFIED | `lib/admin/integrations-providers.ts:64-75`: gemini + openai rows in the 'ai' category after openrouter (primary preserved). `loadCategoryInitials` iterates `category.providers` generically (lines 177-238) with an unconfigured-default loop — no other UI change needed |
| 5 | D8: ProvidersUnavailableError exposes fallbackCause; .cause remains PRIMARY | VERIFIED | `lib/ai/with-fallback.ts:44-45` (field), `:113-115` (`new ProvidersUnavailableError(primaryErr)` → single-arg constructor → `.cause = primaryErr`; `err.fallbackCause = fallbackErr`). Locked by `with-fallback.test.ts:82-100` (fallbackCause = FALLBACK_ERR, .cause = PRIMARY_ERR); pre-existing both-fail case (line 79) still asserts .cause = PRIMARY_ERR |
| 6 | D4: Zero-citations state warns loudly in BOTH adapters; results stay evidence-gated | VERIFIED | `openrouter-web.ts:218-226` and `anthropic-web.ts:144-149` warn '[price-research] ... N results but 0 citations indexed' after successful safeParse. Locked by tests asserting the warn AND `isUsableCandidate(out[0]) === false` (openrouter-web.test.ts:299-305, anthropic-web.test.ts:198-204) |
| 7 | D7: Inngest retry never double-inserts ai_cost_events | VERIFIED | `transcribe-audio.ts:213-224`: `await step.run('record-ai-cost', ...)` (memoized across retries); `minutes`/`whisperCost` computed OUTSIDE the step (lines 203-209) and the same `whisperCost` threads into `record-credit-debit` unchanged |
| 8 | D6: BYOK decrypt failure captured in Sentry with byok.keyResolution + company_id tags | VERIFIED | `lib/billing/byok.ts:76-82`: `Sentry.captureException(err, { tags: { background: 'byok.keyResolution', company_id: companyId } })` in its own inner try/catch (never-throw); console.warn kept; fail-open `return null` unchanged. Locked by `byok.test.ts:103-112` |
| 9 | D9: Failed price_research_cache upsert emits console.warn | VERIFIED | `cache.ts:82-98`: `const { error } = await ...upsert(...)`; `if (error) console.warn('[price-research] cache write failed', error.message)`; put() still resolves void. Locked by `price-research-cache.test.ts:202-226` |

**Score:** 9/9 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `lib/ai/openrouter-client.ts` | Empty-output guards, contains 'Transcription produced no text' | VERIFIED | Lines 164-166 (D1), 304-306 (D2); both placed after `callWithFallback` destructure |
| `lib/ai/with-fallback.ts` | fallbackCause, contains 'fallbackCause' | VERIFIED | Field declared line 45, assigned line 114; constructor signatures untouched |
| `lib/services/generate-estimate.ts` | hasPhotos counts analyzed only, contains 'photos.some' | VERIFIED | Line 138 |
| `lib/admin/integrations-providers.ts` | gemini + openai in 'ai' category, contains `'gemini'` | VERIFIED | Lines 65 + 71, exact row-shape mirror with `as IntegrationProvider` cast |
| `lib/inngest/functions/transcribe-audio.ts` | contains 'record-ai-cost' | VERIFIED | Line 213, `step.run('record-ai-cost', ...)` |
| `lib/billing/byok.ts` | contains 'byok.keyResolution' | VERIFIED | Line 78 |
| `lib/estimate/price-research/adapters/openrouter-web.ts` | flat+nested tolerance + '0 citations indexed' | VERIFIED | Type ext lines 48-55, tolerant loop 181-189, warn 218-226 |
| `lib/estimate/price-research/adapters/anthropic-web.ts` | '0 citations indexed' mirror | VERIFIED | Lines 144-149 |
| `lib/estimate/price-research/cache.ts` | contains 'cache write failed' | VERIFIED | Line 98 |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | -- | --- | ------ | ------- |
| openrouter-client.ts D1 throw | transcribe-audio onFailure (ai_job.failed) | thrown Error out of step.run('whisper-transcribe') | WIRED | transcribeAudioOR invoked at transcribe-audio.ts:144 inside the step; onFailure (lines 68-102) builds the ai_job.failed notification from error.message |
| CATEGORIES 'ai'.providers | admin /admin/integrations/ai cards | loadCategoryInitials iterating category.providers | WIRED | Loader is fully generic (`ids = category.providers.map(p => p.id)` + unconfigured default); pattern `id: 'openai' as IntegrationProvider` present |
| transcribe-audio.ts | ai_cost_events single-row-per-run | step.run('record-ai-cost') memoization | WIRED | Pattern `step.run('record-ai-cost'` matches; recordAICost awaited inside |
| price-research adapters | operator log stream | console.warn on results>0 && citations==0 | WIRED | Pattern `[price-research]` present in both warns |

### Critical Checks (Orchestrator-Specified)

| # | Check | Result |
| - | ----- | ------ |
| 1 | Evidence gate byte-identical | PASS — `git diff 58a8f847..b0a79250 -- lib/estimate/price-research/provider.ts` is EMPTY (isUsableCandidate untouched). Adapter diffs contain ONLY the type extension, indexing-loop tolerance, and the warn — the cited?/null-out re-association blocks appear in neither diff |
| 2 | `.cause === primary` preserved | PASS — both-fail path constructs `new ProvidersUnavailableError(primaryErr)` (single-arg → cause = primaryErr); fallbackCause purely additive; pre-existing test contract (with-fallback.test.ts:79) still asserts PRIMARY_ERR |
| 3 | D1/D2 throws AFTER wrapper resolution | PASS — both guards sit after `const { result } = await callWithFallback(...)`. A primary-THROWS → fallback-good path resolves through the wrapper with the fallback's non-empty result and passes the guard. (An empty-but-HTTP-ok primary is a wrapper "success" and does not consult the fallback — the documented, intentional audit design, mirrored in both code comments and the D1 test) |
| 4 | D3 uses ai_description non-empty check | PASS — `p.ai_description && p.ai_description.trim().length > 0`, matching the prompt builder's filter at lines 178-180 |

### Requirements Coverage

| Requirement | Status | Evidence |
| ----------- | ------ | -------- |
| D1 | SATISFIED | Truth 1 |
| D2 | SATISFIED | Truth 2 |
| D3 | SATISFIED | Truth 3 |
| D4 | SATISFIED | Truth 6 + flat-shape test (openrouter-web.test.ts:229-265, isUsableCandidate true) |
| D5 | SATISFIED | Truth 4 |
| D6 | SATISFIED | Truth 8 |
| D7 | SATISFIED | Truth 7 |
| D8 | SATISFIED | Truth 5 |
| D9 | SATISFIED | Truth 9 |

### Scope Audit

Changed files in `58a8f847..b0a79250` (excluding .planning): exactly the 9 lib files + 8 test files declared in the plan's `files_modified`. No scope creep. TDD commit cadence intact (test commit precedes each feature commit for all three tasks).

### Anti-Patterns Found

None. The `PLACEHOLDER_PREFIX` matches in generate-estimate.ts are pre-existing legitimate eager-create-naming logic, not stubs. All new console.warns are intentional telemetry specified by the plan.

### Behavioral Spot-Checks

SKIPPED (per orchestrator instruction) — externally evidenced: orchestrator independently ran `npx tsc --noEmit` (clean) and the affected suites (401/401 pass across 62 files); executor's full gate was 2816 passed with only the documented pre-existing parallel flake (green in isolation).

### Human Verification Required

None blocking. One operational follow-up (not a code gap): the operator must actually SAVE the OpenAI key via the now-visible admin card for the production Whisper fallback to come alive — the code path was already wired and the panel row is now restored; saving the key is a runtime action outside this repo.

### Gaps Summary

No gaps. All 9 defects are fixed exactly as specified: both empty-output guards are placed after the fallback wrapper (primary-fail → fallback-good still succeeds), the evidence gate is provably byte-identical (empty git diff on provider.ts; re-association blocks absent from adapter diffs), the ProvidersUnavailableError contract is preserved with fallbackCause purely additive, and every new behavior carries a dedicated test lock.

---

_Verified: 2026-07-05_
_Verifier: Claude (gsd-verifier)_
