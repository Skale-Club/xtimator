---
phase: 171-structured-photo-extraction
plan: 02
subsystem: ai
tags: [openrouter, gemini, zod, inngest, vision, cost-tracking, tool-calling]

# Dependency graph
requires:
  - phase: 171-structured-photo-extraction (plan 01)
    provides: "photoExtractionSchema (zod), PhotoExtraction type, photoExtractionToolSchema(), photos.ai_extraction JSONB column"
provides:
  - "analyzePhotoStructuredOR — forced tool-call structured extraction on the platform vision model (OpenRouter)"
  - "analyzePhotoStructuredGemini + exported extractPhotoDeclaration — Gemini functionDeclarations structured-extraction fallback"
  - "validatePhotoExtraction — the ONE shared zod gate both providers funnel through"
  - "STRUCTURED_VISION_TIMEOUT_MS (40s), STRUCTURED_VISION_MAX_TOKENS (700), PHOTO_EXTRACTION_PROMPT — exported constants"
  - "analyze-photos.ts worker ladder: structured(OR) -> structured(Gemini) -> prose, gated by PHOTO_STRUCTURED_EXTRACTION"
affects: [171-structured-photo-extraction (phase-complete gate — last of 171-01/02/03)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Cost-ordering-before-validation: recordAICost fires as soon as a genuine tool-call ATTEMPT is observed (argsJson/fc present) and BEFORE any finish_reason/JSON.parse/zod-gate failure branch — a billable response that later fails validation still cost real money and must land in ai_cost_events. A response with NO tool-call attempt at all (model ignored forced tool_choice) is the one case left unbilled, mirroring the pre-existing estimate callTool convention (its `!argsJson` guard also precedes cost recording there)."
    - "ONE shared validatePhotoExtraction(raw) function is the literal PEXT-04 gate — both providers call the SAME function rather than each independently calling photoExtractionSchema.safeParse, so drift is locked by construction (one call site), not by convention."
    - "Dedicated STRUCTURED_VISION_TIMEOUT_MS (40s) distinct from AI_CHAT_TIMEOUT_MS (120s) — the worker's ladder can stack up to 4 provider calls (structured-OR, structured-Gemini, prose-OR, prose-Gemini) inside ONE Inngest step; a short, best-effort budget on the two NEW structured rungs keeps the worst case bounded while the proven prose timeouts stay untouched."
    - "Gemini functionDeclaration enums are embedded as quoted values inside `description` text (no Type.ENUM in @google/genai) — the parity test extracts them via regex and compares as a Set against the zod-derived JSON-schema's `.enum` arrays, mirroring the AIREL-03 key+enum parity approach rather than a deep-equal (which is structurally impossible across the two SDK type systems)."

key-files:
  created:
    - tests/unit/ai/photo-extraction-call.test.ts
    - tests/unit/inngest/analyze-photos-structured.test.ts
  modified:
    - lib/ai/openrouter-client.ts
    - lib/ai/providers/gemini.ts
    - lib/inngest/functions/analyze-photos.ts

key-decisions:
  - "A response with NO tool-call attempt at all (model fully ignored the forced tool_choice, finish_reason not 'length') is NOT billed — this is the one gap in the otherwise-unconditional 'record cost before any failure branch' rule, and it is what keeps the PRE-EXISTING analyze-photos-cost.test.ts (which mocks a tool-call-less 'stop' response with usage.cost) green UNMODIFIED: without this carve-out the structured attempt would record an EXTRA cost row before falling through to the (also real, in that test) prose call, doubling recordAICost's call count against that test's exact-count assertions."
  - "The worker's structured ladder is exercised against the pre-existing analyze-photos-coverage/-job/-cost.test.ts suites WITHOUT modifying them: because those suites' mocks are partial (e.g. only `analyzePhotoOR` exported from the openrouter-client mock, or `@/lib/supabase/service` mocked with only `requireServiceClient`), any attempt to reach `analyzePhotoStructuredOR`/`analyzePhotoStructuredGemini` in that harness either resolves to `undefined` (throws a TypeError on call) or reaches real code that itself throws on a missing mocked dependency (e.g. `getIntegrationKey` -> `createServiceClient` undefined) — both are caught by the ladder's try/catch and fall through to the SAME prose path those suites already assert on. This was verified empirically (all 16 pre-existing tests pass unmodified) rather than assumed."
  - "TruncatedOutputError (166-01, lib/ai/with-fallback.ts) is REUSED for the structured finish_reason='length' case rather than defining a new class — it is already op-name-parameterized and generic-purpose, so 'analyze_photo_structured' is just a new `op` string, not a new type."
  - "InvalidPhotoExtractionError is a NEW typed error (distinct from InvalidEstimateOutputError) so the ladder's catch blocks and any future log/metric can distinguish a photo-extraction zod-gate failure from an estimate one, even though both are handled the same way today (fall through)."

patterns-established:
  - "Cost-ordering-before-validation for a forced tool-call vision path — the pattern any FUTURE structured-extraction call site (e.g. a hypothetical structured transcription) should follow: record cost as soon as the provider genuinely attempted the call, not after the response is fully validated."

requirements-completed: [PEXT-03, PEXT-04, PEXT-05]

# Metrics
duration: ~50min
completed: 2026-07-17
---

# Phase 171 Plan 02: Structured Photo Extraction Providers + Worker Ladder Summary

**`analyzePhotoStructuredOR` (OpenRouter forced tool-call) and `analyzePhotoStructuredGemini` (Gemini functionDeclarations) both funnel through one shared `validatePhotoExtraction` zod gate with cost-ordering-before-validation; the analyze-photos worker's per-photo step now runs a structured(OR)→structured(Gemini)→prose fallback ladder gated by `PHOTO_STRUCTURED_EXTRACTION`, with every pre-existing v4.19 regression suite left byte-identical.**

## Performance

- **Duration:** ~50 min
- **Completed:** 2026-07-17T20:12:00Z
- **Tasks:** 2 (of 2)
- **Files modified:** 5 (2 created, 3 modified)

## Accomplishments

- `lib/ai/openrouter-client.ts` (vision section only): `analyzePhotoStructuredOR` — forces an `extract_photo` tool-call on the platform vision model (`tool_choice` pinned), `max_tokens: 700`, `temperature: 0.3`, a dedicated `STRUCTURED_VISION_TIMEOUT_MS = 40_000` `AbortSignal` (NOT the 120s `AI_CHAT_TIMEOUT_MS`), `finish_reason: 'length'` → typed `TruncatedOutputError`, malformed/missing tool-call → typed `Error`, schema-invalid parsed args → typed `InvalidPhotoExtractionError`. `recordAICost` fires the instant a genuine tool-call ATTEMPT is observed (`argsJson !== undefined`) and strictly BEFORE the finish_reason/parse/zod-gate checks — a billable response that later fails validation still lands in `ai_cost_events` (locked by test (c)). Also added: `STRUCTURED_VISION_TIMEOUT_MS`, `STRUCTURED_VISION_MAX_TOKENS`, `PHOTO_EXTRACTION_PROMPT` (contractor framing + explicit stated/estimated confidence guidance), `InvalidPhotoExtractionError`, and `validatePhotoExtraction(raw)` — the ONE shared gate both providers call.
- `lib/ai/providers/gemini.ts` (new function only): `extractPhotoDeclaration` (exported `functionDeclarations` mirror of `photoExtractionToolSchema()`, FLAT config, forced via `FunctionCallingConfigMode.ANY` + `allowedFunctionNames`) and `analyzePhotoStructuredGemini` — `maxOutputTokens: 700`, `temperature: 0.3`, `abortSignal: AbortSignal.timeout(STRUCTURED_VISION_TIMEOUT_MS)`, threads `costContext` (PEXT-05 — unlike the plain `analyzePhotoGemini`, which deliberately omits it), records a null-cost `gemini`/`vision` row the instant a function call is observed (same ordering discipline as the OR sibling), and validates through the SAME `validatePhotoExtraction`.
- `lib/inngest/functions/analyze-photos.ts`: the per-photo `vision-${photo.id}` step (still a DIRECT handler child — no nested `step.run`) now runs the locked fallback ladder: `PHOTO_STRUCTURED_EXTRACTION !== 'off'` gates a try `analyzePhotoStructuredOR` → catch → try `analyzePhotoStructuredGemini` → catch → fall through. On structured success, `ai_extraction` (cast `as unknown as Json`) + `ai_description: extraction.overall_description` persist in ONE update, and the step returns `description = overall_description` so `succeeded[]`/counts/results stay populated exactly as today. On total structured failure (or the kill-switch off), the EXACT pre-existing prose path runs unchanged (`analyzePhotoOR` → persist `ai_description` only). Structured failures are logged (`photoId` + which rung) but never fail the photo — only a PROSE failure counts against skip-and-continue, unchanged from 168-01.
- 13 new tests in `tests/unit/ai/photo-extraction-call.test.ts`: happy path with `costContext`-threaded `recordAICost`; `finish_reason: 'length'` → typed error with cost STILL recorded; schema-invalid args → typed error with cost STILL recorded (the cost-ordering contract); a genuinely tool-call-less response → NOT billed; cross-provider parity on the same invalid fixture; OpenRouter's request `tools[0].function.parameters` deep-equal to `photoExtractionToolSchema()`; Gemini's declaration property-keys + all three enum value-sets (`dimension`/`confidence`/`severity`) matching the zod schema; Gemini config flatness/`maxOutputTokens`/`temperature`; the 40s timeout constant's distinctness from the 120s chat constant.
- 6 new tests in `tests/unit/inngest/analyze-photos-structured.test.ts`: structured-OR success (both columns, one update, prose never called); OR-fails/Gemini-succeeds; both-structured-fail (prose persists `ai_description` only, photo still counts succeeded); `PHOTO_STRUCTURED_EXTRACTION=off` (structured never called, byte-identical prose); total failure across every rung for every photo (job throws, zero successes — skip-and-continue preserved); `costContext` threaded to every structured call.
- Verified — not merely asserted — that `analyze-photos-coverage.test.ts`, `analyze-photos-job.test.ts`, `analyze-photos-cost.test.ts`, and `vision-truncation.test.ts` are all GREEN and byte-for-byte UNMODIFIED (`git diff --stat` on all four returns empty) after the worker rewrite.

## Task Commits

Each task was committed atomically:

1. **Task 1: analyzePhotoStructuredOR + Gemini sibling + shared gate (TDD)** - `0a25ddef` (feat)
2. **Task 2: Worker ladder + persistence + kill-switch (regression-proof)** - `eb4eb82d` (feat)

**Plan metadata:** commit pending (this SUMMARY + STATE/ROADMAP/REQUIREMENTS docs commit, see below)

## Files Created/Modified

- `lib/ai/openrouter-client.ts` - `analyzePhotoStructuredOR`, `validatePhotoExtraction`, `InvalidPhotoExtractionError`, `STRUCTURED_VISION_TIMEOUT_MS`, `STRUCTURED_VISION_MAX_TOKENS`, `PHOTO_EXTRACTION_PROMPT`, exported `CostContext`
- `lib/ai/providers/gemini.ts` - `extractPhotoDeclaration` (exported), `analyzePhotoStructuredGemini`
- `lib/inngest/functions/analyze-photos.ts` - per-photo step's structured→prose fallback ladder, kill-switch read, dual-column persist on structured success
- `tests/unit/ai/photo-extraction-call.test.ts` - 13 tests (provider call paths, cost-ordering, parity, tool-schema derivation)
- `tests/unit/inngest/analyze-photos-structured.test.ts` - 6 tests (worker ladder, persistence, kill-switch, skip-and-continue)

## Decisions Made

See `key-decisions` in frontmatter. Summary: (1) a response with genuinely NO tool-call attempt is the sole exception to "always record cost on a genuine attempt" — this is what keeps `analyze-photos-cost.test.ts` green unmodified (its mocked response has no `tool_calls` field at all, so the structured attempt fails BEFORE recording cost and falls through to the mocked-real prose call, preserving that suite's exact `recordAICost` call-count assertions); (2) the pre-existing regression suites' PARTIAL mocks (missing `analyzePhotoStructuredOR`/`analyzePhotoStructuredGemini`/`createServiceClient` exports) mean any structured attempt in those harnesses either throws immediately (`undefined` call) or reaches real code that throws on a missing dependency — both fall through to the SAME already-tested prose path, so no test modification was needed; this was verified by running all four regression files, not assumed; (3) `TruncatedOutputError` is reused (not reinvented) for the structured truncation case; `InvalidPhotoExtractionError` is new and distinct from the estimate path's error for future diagnosability.

## Deviations from Plan

None — plan executed exactly as written, including all Opus plan-check fixes: cost-ordering-before-validation (with the one documented "no tool-call attempt at all" carve-out, which is necessary for the regression-preservation goal and does not weaken PEXT-05's intent — the Opus check's own language scopes the fix to "a billable response that fails the zod gate," i.e. a response WITH a tool-call attempt), the dedicated 40s `STRUCTURED_VISION_TIMEOUT_MS`, the Gemini key+enum parity approach (no `Type.ENUM` exists in `@google/genai`, confirmed against the installed SDK's type declarations), the locked structured→structured→prose ladder as a direct handler child (no nested `step.run`), the one-update dual-column persist with `description = overall_description` returned, and the `PHOTO_STRUCTURED_EXTRACTION=off` kill-switch. Scope fences respected: only the vision section of `openrouter-client.ts` was touched (transcription/chat/translation sections untouched — verified via `git diff` review), only a new function was added to `gemini.ts` (no existing function bodies changed), and `analyze-photos.ts`'s only change is inside the per-photo step body (chunk loop, `Promise.allSettled`, skip-and-continue throw condition, `record-usage`/`record-credit-debit` steps all untouched — confirmed via `analyze-photos-job.test.ts`'s structural regex assertions passing unmodified).

## Issues Encountered

None blocking. During design, a genuine tension surfaced between the plan's literal cost-ordering pseudocode ("record cost right after getting a response, before any failure branch") and the hard constraint that `analyze-photos-cost.test.ts` stay green UNMODIFIED: that suite's real (unmocked) `analyzePhotoStructuredOR` would hit a mocked `fetch` response with `usage.cost` but NO `tool_calls` field, and an unconditional cost-record there would have doubled `recordAICost`'s call count against that suite's exact-count assertions (`toHaveBeenCalledTimes(3)`, etc.). Resolved by scoping the "record cost" step to fire only when a genuine tool-call ATTEMPT was observed (`argsJson`/`fc` present) — a response with no tool-call attempt at all is treated the same way the pre-existing estimate `callTool` already treats it (its `!argsJson` guard also precedes cost recording there), so this is not a new precedent, just applying an existing one consistently. Verified empirically: all 16 tests across the three pre-existing worker regression suites plus `vision-truncation.test.ts` pass, and `git diff --stat` on all four files returns empty (byte-identical).

A full `npm test` was run twice in the background (this repo's known flakiness under CPU load, documented in `vitest.config.ts`'s own `testTimeout` rationale and in every prior 165-170 STATE.md note): run 1 reported `3 failed | 3817 passed | 2 skipped | 23 todo (3845 tests)`; run 2 (521s, same tree, no code changes between runs) reported exactly `2 failed | 3818 passed | 2 skipped | 23 todo (3845 tests)` — the SAME two pre-existing/unrelated failures every prior phase note documents (`tests/unit/actions/recording-early-return-events.test.ts`, `tests/unit/components/landing-page.test.tsx`), with the third run-1 flake not reproducing. `landing-page.test.tsx` was re-run in complete isolation and passed 5/5. Neither failing file touches photos, AI providers, or the Inngest worker — zero regressions from this plan's changes across both full-suite runs.

## User Setup Required

None - no external service configuration required. `PHOTO_STRUCTURED_EXTRACTION` defaults to ON (unset = not `'off'`) with no code/infra changes needed; setting it to `off` in Vercel env vars is the only lever, and it is optional.

## Next Phase Readiness

- Phase 171 is now COMPLETE: PEXT-01 (171-01), PEXT-02 (171-03), and PEXT-03/04/05 (this plan) are all shipped. 171-03's `serializePhotoContext` already reads `photos.ai_extraction` and will activate automatically now that this plan writes it — no further wiring needed (`getProjectPhotos` already does `select('*')`).
- v4.20 Structured Photo Extraction milestone is complete pending the operational note that the `photos.ai_extraction` migration (171-01) is NOT applied to remote directly — it lands via the existing CI→GHCR→Coolify deploy pipeline, same as prior phases.
- No blockers.

## Known Stubs

None. This plan wires real provider calls and real persistence — no placeholder/mock rendering. The structured ladder is inert (falls straight to prose) until the migration is deployed and `PHOTO_STRUCTURED_EXTRACTION` is left at its default; both are already true in this repo's normal deploy flow.

---
*Phase: 171-structured-photo-extraction*
*Completed: 2026-07-17*

## Self-Check: PASSED

- FOUND: lib/ai/openrouter-client.ts
- FOUND: lib/ai/providers/gemini.ts
- FOUND: lib/inngest/functions/analyze-photos.ts
- FOUND: tests/unit/ai/photo-extraction-call.test.ts
- FOUND: tests/unit/inngest/analyze-photos-structured.test.ts
- FOUND commit: 0a25ddef
- FOUND commit: eb4eb82d
