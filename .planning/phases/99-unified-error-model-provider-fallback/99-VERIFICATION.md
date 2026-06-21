---
phase: 99-unified-error-model-provider-fallback
verified: 2026-06-21T10:42:00Z
status: passed
score: 13/13 must-haves verified
re_verification:
  # initial verification — no previous report
  previous_status: none
gaps: []
human_verification:
  - test: "Force OpenRouter outage in staging and trigger a WhatsApp estimate"
    expected: "Estimate generates via Gemini fallback OR (if Gemini also down) the user still receives the provider_unavailable WhatsApp reply — never silence"
    why_human: "Requires real provider outage + live WhatsApp delivery; the never-throw/always-reply contract is unit-verified but end-to-end delivery is not"
---

# Phase 99: Unified Error Model & Provider Fallback Verification Report

**Phase Goal:** Every layer of the estimate engine speaks ONE failure language and every AI call path degrades the SAME way — (a) a single typed failure model shared by API routes, graph nodes, Inngest functions and adapters with one failure→channel-response mapping and no ad-hoc throw→500; (b) one shared OpenRouter→Gemini provider-fallback wrapper used by every AI call path (generate, transcribe, vision, refine), attempted exactly once and observable; never-throw/always-reply and the default-adapter re-throw-for-Inngest-retry contracts both still hold.
**Verified:** 2026-06-21T10:42:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| #  | Truth | Status | Evidence |
| -- | ----- | ------ | -------- |
| 1  | Single shared OpenRouter→Gemini fallback wrapper exists; fallback runs at most once; both-down throws marked error | ✓ VERIFIED | `lib/ai/with-fallback.ts:60-78` — try primary → catch → try fallback once → catch → `throw new ProvidersUnavailableError(primaryErr)`. No retry loop. Returns `{ result, servedBy, fallbackFired }`. |
| 2  | On primary success no fallback fires (exactly one AI call, QA-03) | ✓ VERIFIED | `with-fallback.ts:65-67` returns on primary success without touching fallback; tested in `tests/unit/ai/with-fallback.test.ts` (GREEN). |
| 3  | Both-down surfaces a marked `ProvidersUnavailableError` carrying the PRIMARY error as `.cause` | ✓ VERIFIED | `with-fallback.ts:39-48,75` — marker class with `providerUnavailable = true`, `.cause = primaryErr`. |
| 4  | generate path uses the fallback-aware provider; refine provider available | ✓ VERIFIED | `lib/services/generate-estimate.ts:7,181` imports + calls `getAIProviderWithFallback(companyId)`. `provider-with-fallback.ts:35-54` wires both generate & refine through `callWithFallback`. |
| 5  | `getAIProvider` (model selection) untouched | ✓ VERIFIED | `provider-with-fallback.ts:31` resolves primary via existing `getAIProvider(companyId)`; `provider-factory.test.ts` GREEN. |
| 6  | Transcription falls back on FAILURE; key-absent path preserved | ✓ VERIFIED | `openrouter-client.ts:67-76` key-absent short-circuits to Gemini (fetch not called); `:114-123` wraps `whisperPrimary` in `callWithFallback`. |
| 7  | Vision falls back on failure | ✓ VERIFIED | `openrouter-client.ts:207-216` wraps `visionPrimary` in `callWithFallback` → `analyzePhotoGemini` fallback. |
| 8  | `analyzePhotoGemini` exists, produces description from base64+mimeType | ✓ VERIFIED | `lib/ai/providers/gemini.ts:68-82` — mirrors `transcribeAudioGemini`, uses shared `PHOTO_PROMPT`, `inlineData {mimeType,data:base64}`. |
| 9  | Single typed `FailureReason` union drives both XtimatorError and channel copy; strict superset | ✓ VERIFIED | `lib/estimate/failure.ts:28-34` (contains `no_usable_input` + `generation_failed`); `failureReasonToXtimatorError` (54-61) + `failureReasonToChannelCopy` (86-91). |
| 10 | Graph failure channel typed `{ reason: FailureReason; detail? }` | ✓ VERIFIED | `lib/estimate/graph/state.ts:14,42` imports `FailureReason`, annotation typed. |
| 11 | generate node maps `ProvidersUnavailableError` marker → `provider_unavailable` (no hedge) | ✓ VERIFIED | `nodes/generate.ts:16,46-51` — `instanceof` + brand check → `provider_unavailable` else `generation_failed`; node never throws. `never-throw.test.ts -t "provider_unavailable"` GREEN. |
| 12 | Refine route: final catch `asResponse(err)`; inline transcription 500 removed; 422/429/demo-guard preserved; no bare throw→500 | ✓ VERIFIED | `refine/route.ts:282` `return asResponse(err)`; transcription at `:179` propagates (no inner 500); 422 at `:211-214`, 429 at `:92-95`, demo guard at `:85-86` intact; typed throws at 81/105/111/112/114/121. |
| 13 | WhatsApp always-replies via shared copy; default adapter re-throws typed error for Inngest retry; no 'gemini' in pipeline_events.provider | ✓ VERIFIED | `whatsapp.ts:435-436` sources copy via `failureReasonToChannelCopy` then sends; `default.ts:72-74` `throw failureReasonToXtimatorError(...)`; `pipeline-events.ts:40` provider type excludes 'gemini'. |

**Score:** 13/13 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `lib/ai/with-fallback.ts` | `callWithFallback` + `FallbackOutcome` + `ProvidersUnavailableError`; ≤1 fallback | ✓ VERIFIED | 78 lines; all 3 exports; imported by `provider-with-fallback.ts` + `openrouter-client.ts` (transcribe & vision) + `nodes/generate.ts`. |
| `lib/ai/provider-with-fallback.ts` | `getAIProviderWithFallback(companyId)`; getAIProvider untouched | ✓ VERIFIED | 55 lines; wires generate+refine; imported by `generate-estimate.ts:7`. |
| `lib/ai/providers/gemini.ts` | `analyzePhotoGemini` added | ✓ VERIFIED | `:68-82`; shared `PHOTO_PROMPT` import; existing adapter intact. |
| `lib/ai/openrouter-client.ts` | `transcribeAudioOR` (key-absent + failure fallback) and `analyzePhotoOR` wrapped; `PHOTO_PROMPT` exported | ✓ VERIFIED | `:62-124`, `:141-217`, `:134` export. |
| `lib/services/generate-estimate.ts` | uses `getAIProviderWithFallback` | ✓ VERIFIED | `:181`. |
| `lib/estimate/failure.ts` | strict-superset union; `failureReasonToXtimatorError` + channel-copy map | ✓ VERIFIED | 91 lines; both helpers + exact preserved copy strings. |
| `lib/estimate/graph/state.ts` | failure typed `{ reason: FailureReason; detail? }` | ✓ VERIFIED | `:42`. |
| `lib/estimate/graph/nodes/generate.ts` | marker → `provider_unavailable` (no hedge) | ✓ VERIFIED | `:46-51`. |
| `app/api/estimates/[id]/refine/route.ts` | `asResponse(err)`; inline 500 removed; 422/429/demo preserved | ✓ VERIFIED | `:282`, `:179`, `:211`, `:92`, `:85`. |
| `lib/estimate/adapters/whatsapp.ts` | onError via `failureReasonToChannelCopy`, always-reply | ✓ VERIFIED | `:435-436`. |
| `lib/estimate/adapters/default.ts` | re-throws typed XtimatorError | ✓ VERIFIED | `:72-74`. |

### Key Link Verification

| From | To | Via | Status |
| ---- | -- | --- | ------ |
| generate-estimate.ts | provider-with-fallback.ts | `getAIProviderWithFallback(companyId)` | ✓ WIRED (`:7` import, `:181` call) |
| openrouter-client.ts | with-fallback.ts | `callWithFallback` in transcribe + vision | ✓ WIRED (`:114`, `:207`) |
| openrouter-client.ts | providers/gemini.ts | dynamic import of `transcribeAudioGemini`/`analyzePhotoGemini` as fallback | ✓ WIRED (`:119`, `:212`) |
| graph/state.ts | failure.ts | `import type { FailureReason }` | ✓ WIRED (`:14`) |
| nodes/generate.ts | with-fallback.ts | `import { ProvidersUnavailableError }` | ✓ WIRED (`:16`) |
| adapters/whatsapp.ts | failure.ts | `failureReasonToChannelCopy(reason)` | ✓ WIRED (`:59`, `:435`) |
| adapters/default.ts | failure.ts | `failureReasonToXtimatorError(...)` | ✓ WIRED (`:23`, `:72`) |
| refine/route.ts | lib/errors | `asResponse(err)` | ✓ WIRED (`:29`, `:282`) |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| -------- | ------------- | ------ | ------------------ | ------ |
| provider-with-fallback.ts | `.result` | live `getAIProvider` primary + `GeminiAdapter` fallback through `callWithFallback` | Yes — real provider calls, not static | ✓ FLOWING |
| openrouter-client transcribe/vision | `result` | real Whisper/OpenRouter fetch primary + Gemini SDK fallback | Yes | ✓ FLOWING |
| failure.ts copy map | `REASON_TO_COPY[reason]` | static lookup (intentional — copy strings) | N/A (deterministic copy, not dynamic data) | ✓ FLOWING |

No hollow props or disconnected sources: failure copy is intentionally static (regression-gated copy strings); provider results flow from live adapter calls.

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| AI + estimate suites (fallback, mapping, never-throw, refine surface) | `npx vitest run tests/unit/ai tests/unit/estimate` | 18 files / 86 tests pass, 1 fail (OBS-03 only) | ✓ PASS |
| OBS-03 failure is pre-existing, not a Phase-99 regression | `git show bfd96fc:lib/services/generate-estimate.ts \| grep -c langfuseSessionId\|langfuseUserId` → 0; assertion existed at base | Confirmed RED at base bfd96fc | ✓ PASS (pre-existing) |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ----------- | ----------- | ------ | -------- |
| HARD-03 | 99-01 | Every AI call path uses one shared OpenRouter→Gemini fallback wrapper | ✓ SATISFIED | with-fallback.ts + provider-with-fallback.ts + wrapped transcribe/vision; REQUIREMENTS.md:31,79 marked Complete |
| HARD-04 | 99-02 | Single typed error/failure model; one failure→channel mapping; no ad-hoc throw→500 | ✓ SATISFIED | failure.ts + typed state/producers/readers + refine asResponse; REQUIREMENTS.md:32,80 marked Complete |

No orphaned requirements: REQUIREMENTS.md maps only HARD-03 and HARD-04 to Phase 99, both claimed by plans.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| — | — | None blocking | — | `return { failure: { reason } }` and static copy map are intentional failure-as-state design, not stubs; provider results flow from live calls. |

### Human Verification Required

1. **End-to-end fallback delivery** — Force an OpenRouter outage in staging and trigger a WhatsApp estimate.
   - Expected: estimate generates via Gemini fallback; if Gemini also down, user receives the `provider_unavailable` reply — never silence.
   - Why human: requires real provider outage + live WhatsApp delivery; never-throw/always-reply is unit-verified but live delivery is not.

### Gaps Summary

No gaps. All 13 must-haves across the three plans are verified against the actual source: the shared `callWithFallback` wrapper (single fallback, marked both-down error, observable `servedBy`/`fallbackFired` seam), the fallback-aware provider wired into generate, transcription/vision failure-fallback with the key-absent path preserved, the new `analyzePhotoGemini`, the single typed `FailureReason` model feeding both the HTTP boundary and channel copy, the typed graph state, the marker→`provider_unavailable` mapping with no hedge, the refine route's `asResponse(err)` with the inline transcription 500 removed and 422/429/demo-guard preserved, WhatsApp always-reply via the shared copy map, the default adapter's typed re-throw for Inngest retry, and no `'gemini'` written to `pipeline_events.provider`. Targeted suites are GREEN except the documented pre-existing OBS-03 observability stub (confirmed RED at base commit bfd96fc — not a Phase-99 regression). One end-to-end fallback-delivery check is routed to human verification.

---

_Verified: 2026-06-21T10:42:00Z_
_Verifier: Claude (gsd-verifier)_
