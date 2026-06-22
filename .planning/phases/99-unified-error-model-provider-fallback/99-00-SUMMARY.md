---
phase: 99-unified-error-model-provider-fallback
plan: 00
subsystem: testing
tags: [vitest, red-tests, provider-fallback, error-model, langgraph, gemini, openrouter]

# Dependency graph
requires:
  - phase: 94-extract-canonical-graph
    provides: "lib/estimate/graph (makeGenerateNode, passthroughRunner, failure state channel) — the never-throw scaffold these tests extend"
  - phase: 46-typed-error-handling
    provides: "lib/errors (XtimatorError, asResponse, statusByType) — the canonical HTTP-boundary error the FailureReason map targets"
provides:
  - "tests/unit/ai/with-fallback.test.ts — RED contract for callWithFallback (primary-success / single-call / fallback-fired / both-fail+ProvidersUnavailableError marker)"
  - "tests/unit/ai/transcribe-fallback.test.ts — RED contract for transcribeAudioOR key-absent path + failure-based fallback"
  - "tests/unit/ai/gemini-adapter.test.ts (extended) — RED contract for analyzePhotoGemini vision via inlineData"
  - "tests/unit/estimate/failure-mapping.test.ts — RED contract for failureReasonToXtimatorError/Copy + strict-superset"
  - "tests/unit/api/refine-error-surface.test.ts — RED route-level contract for typed { error, code } envelope"
  - "tests/unit/estimate/never-throw.test.ts (extended) — RED both-providers-down -> provider_unavailable (no-throw + exact-string cases)"
affects: [99-01, 99-02]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Wave-0 Nyquist RED scaffold: author failing tests that pin Wave-1 contracts before any implementation, selectable by VALIDATION -t titles"
    - "Computed-specifier importTarget (/* @vite-ignore */) for not-yet-existent modules so the file COLLECTS and fails at RUN time (Phase 12/67/94 convention)"
    - "Route-level RED via the JSON back-compat path to avoid the jsdom Request.formData() multipart hang"

key-files:
  created:
    - tests/unit/ai/with-fallback.test.ts
    - tests/unit/ai/transcribe-fallback.test.ts
    - tests/unit/estimate/failure-mapping.test.ts
    - tests/unit/api/refine-error-surface.test.ts
    - .planning/phases/99-unified-error-model-provider-fallback/deferred-items.md
  modified:
    - tests/unit/ai/gemini-adapter.test.ts
    - tests/unit/estimate/never-throw.test.ts

key-decisions:
  - "Kept the static import in with-fallback.test.ts and failure-mapping.test.ts per plan — Wave-0 RED is the transform-time missing-module resolution; -t selectors resolve once Wave-1 lands the module"
  - "Refine route-level test drives the JSON { instruction } back-compat path (provider.refineEstimate rejects) instead of multipart, because Request.formData() multipart parsing hangs in the vitest/jsdom environment; still routes through the SAME bespoke top-level catch this phase replaces (genuine route-level RED, not asResponse-boundary)"
  - "never-throw both-down cases source the ProvidersUnavailableError marker via the computed-specifier importTarget so the file collects and the two pre-existing ENGINE-04 cases stay green"
  - "Used 'no_usable_input' (not 'no_input') in the FailureReason superset assertion — Option A, zero behavior change (per RESEARCH open question 1)"

patterns-established:
  - "Two-tagged both-down cases ('no throw' presence + 'provider_unavailable' exact string) so 99-01 and 99-02 each own a deterministic -t selector they can green in isolation"

requirements-completed: []

# Metrics
duration: ~25min
completed: 2026-06-21
---

# Phase 99 Plan 00: Wave-0 RED Test Scaffold Summary

**Seven Wave-0 failing tests (5 new + 2 extended) that pin the exact callWithFallback / FailureReason / refine-error-surface / provider_unavailable contracts Wave-1 (99-01, 99-02) must make GREEN.**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-06-21T09:58Z
- **Completed:** 2026-06-21T10:07Z
- **Tasks:** 3
- **Files modified:** 7 (5 created, 2 extended) + 1 deferred-items log

## Accomplishments
- HARD-03 wrapper contract locked: `callWithFallback` primary-success / single-call (QA-03) / fallback-fired / both-fail with a `ProvidersUnavailableError` marker carrying the PRIMARY error as `.cause`.
- HARD-03 transcription + vision contracts locked: `transcribeAudioOR` keeps the key-absent Gemini path (asserted green) AND adds failure-based fallback (RED); `analyzePhotoGemini` vision via `{ inlineData: { mimeType, data } }` (RED).
- HARD-04 failure-model contract locked: 6-reason `FailureReason → XtimatorError` type/status table + strict-superset (`generation_failed`, `no_usable_input`) + non-empty channel copy.
- HARD-04 refine error-surface locked at the route level: the real POST handler returns `{ error }` with NO `code` today; the test asserts a `code` field (RED), driving 99-02's `catch → asResponse(err)` wrap.
- HARD-04 invariant extended: both-providers-down resolves (never throws) to `{ failure: { reason: 'provider_unavailable' } }`, split into a "no throw" presence case (99-01) and an exact-string case (99-02).

## Task Commits

Each task was committed atomically:

1. **Task 1: RED tests for callWithFallback wrapper (HARD-03)** - `7592432` (test)
2. **Task 2: RED transcription failure-fallback + Gemini vision (HARD-03)** - `9393ad7` (test)
3. **Task 3: RED failure-mapping, refine error-surface, provider_unavailable (HARD-04)** - `8c2648c` (test)

## Files Created/Modified
- `tests/unit/ai/with-fallback.test.ts` (created) - 4 callWithFallback cases; RED on missing `@/lib/ai/with-fallback`.
- `tests/unit/ai/transcribe-fallback.test.ts` (created) - key-absent path (green) + failure-based fallback (RED).
- `tests/unit/ai/gemini-adapter.test.ts` (modified) - added `analyzePhotoGemini vision` case (RED); 4 pre-existing GeminiAdapter cases green.
- `tests/unit/estimate/failure-mapping.test.ts` (created) - reason→error map + superset + copy; RED on missing `@/lib/estimate/failure`.
- `tests/unit/api/refine-error-surface.test.ts` (created) - route-level `{ error, code }` assertion; RED today.
- `tests/unit/estimate/never-throw.test.ts` (modified) - two both-down cases (RED); 2 pre-existing ENGINE-04 cases green.
- `.planning/.../deferred-items.md` (created) - logs the pre-existing Phase-97 OBS-03 failure (out of scope).

## RED Status (as designed)

| Test (case) | Status now | Wave-1 owner |
|-------------|------------|--------------|
| with-fallback.test.ts (all 4) | RED — missing `@/lib/ai/with-fallback` (collection fails; `-t` selectors resolve once the module lands) | 99-01 |
| transcribe-fallback.test.ts "key-absent path preserved" | GREEN (today's behavior) | — |
| transcribe-fallback.test.ts "failure-based fallback" | RED — no failure fallback today | 99-01 |
| gemini-adapter.test.ts "vision" | RED — `analyzePhotoGemini` not exported | 99-01 |
| gemini-adapter.test.ts (4 pre-existing) | GREEN | — |
| failure-mapping.test.ts (all 3) | RED — missing `@/lib/estimate/failure` | 99-02 |
| refine-error-surface.test.ts | RED — route returns `{ error }` with no `code` | 99-02 |
| never-throw.test.ts "no throw" | RED — missing marker module | 99-01 |
| never-throw.test.ts "provider_unavailable" | RED — generate.ts still maps to `generation_failed` | 99-02 |
| never-throw.test.ts (2 pre-existing ENGINE-04) | GREEN | — |

## Decisions Made
See `key-decisions` frontmatter. Headline: the refine route-level test uses the JSON back-compat path (not multipart) because `Request.formData()` multipart parsing hangs in vitest/jsdom — it still exercises the same bespoke top-level catch this phase replaces, so the RED signal is genuinely route-level (not an asResponse-boundary substitute, which the plan explicitly forbids as a false pass).

## Deviations from Plan

None affecting scope. One environment-driven implementation adjustment, made within the plan's own contingency:

**1. [Environment adaptation — sanctioned by plan] Refine route-level test uses the JSON path instead of multipart**
- **Found during:** Task 3 (refine-error-surface)
- **Issue:** `Request.formData()` multipart parsing hangs indefinitely in the vitest/jsdom environment (verified with an isolated probe), so the multipart `audio` wiring the plan sketched timed out rather than reaching the handler's catch.
- **Fix:** Drove the route through its JSON `{ instruction }` back-compat path with `provider.refineEstimate` rejecting — reaching the SAME top-level bespoke `catch` (route line ~285) that returns `{ error }` with no `code`. The assertion `expect(body.code).toBeDefined()` fails (RED) at the route level.
- **Why not it.todo:** The plan offered `it.todo` as the fallback "if full route wiring is infeasible." Route wiring proved feasible via the JSON path, which is strictly better than `it.todo` (it actually executes the handler and produces a real assertion-level RED). The plan's hard constraint — "RED signal MUST come from the route handler, not from asResponse in isolation" — is satisfied.
- **Files modified:** tests/unit/api/refine-error-surface.test.ts
- **Verification:** `npx vitest run tests/unit/api/refine-error-surface.test.ts` → 1 failed, `AssertionError: expected undefined to be defined` at the `code` assertion.
- **Committed in:** `8c2648c` (Task 3 commit)

---

**Total deviations:** 1 environment adaptation (within plan contingency).
**Impact on plan:** No scope creep. All seven Wave-0 artifacts authored and RED as designed; the route-level RED is stronger than the plan's `it.todo` fallback.

## Issues Encountered
- **Pre-existing unrelated failure (out of scope):** `tests/unit/estimate/observability.test.ts > OBS-03` fails at the plan's base commit (`bfd96fc`); it is a Phase-97 (Unified Observability) RED stub last touched by commit `61139e5`, before this plan began. Logged to `deferred-items.md`; NOT fixed (scope boundary — unrelated file).

## Known Stubs
None. This is a test-only plan; no source modules, UI, or data wiring were created. The "stubs" here are the target modules these RED tests intentionally reference and that Wave-1 (99-01, 99-02) will create — they are the deliverable, not accidental placeholders.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Every Wave-1 task in 99-01 (callWithFallback, transcribe/vision fallback, ProvidersUnavailableError marker) and 99-02 (failure.ts map, refine error-surface wrap, generate.ts provider_unavailable mapping) now has a corresponding RED test selectable by `-t`.
- No source modules were created in this plan (test-only), per the plan's success criteria.
- Wave-1 should run `npx vitest run tests/unit/ai tests/unit/estimate tests/unit/api` and watch the listed RED cases flip to GREEN.

---
*Phase: 99-unified-error-model-provider-fallback*
*Completed: 2026-06-21*

## Self-Check: PASSED

- All 8 created/modified files present on disk.
- All 3 task commits present in history (`7592432`, `9393ad7`, `8c2648c`).
