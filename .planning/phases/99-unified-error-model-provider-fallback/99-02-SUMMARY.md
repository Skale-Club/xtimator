---
phase: 99-unified-error-model-provider-fallback
plan: 02
subsystem: api
tags: [error-model, langgraph, failure-reason, xtimator-error, estimates, refine, typescript]

# Dependency graph
requires:
  - phase: 99-01
    provides: ProvidersUnavailableError marker (lib/ai/with-fallback.ts) re-thrown when both providers are down
  - phase: 99-00
    provides: Wave-0 RED tests (failure-mapping, refine-error-surface, never-throw provider_unavailable case)
provides:
  - "lib/estimate/failure.ts — single FailureReason union + failureReasonToXtimatorError (HTTP boundary) + failureReasonToChannelCopy (adapter copy)"
  - "Typed graph failure channel { reason: FailureReason; detail? } in lib/estimate/graph/state.ts"
  - "generate.ts maps ProvidersUnavailableError marker -> typed 'provider_unavailable' reason"
  - "Both adapters' onError source reply/throw through the single failure map"
  - "Refine route joins the typed error model: catch -> asResponse(err); no bare throw->500"
affects: [phase-100-output-guardrails, phase-101-refine-through-graph]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "One typed FailureReason union is the single source both the HTTP XtimatorError and the channel copy derive from"
    - "Marker-brand detection (instanceof + .providerUnavailable===true) to recognize cross-module-instance errors"
    - "Route catch -> asResponse(err) yields the consistent typed JSON envelope { error, code }"

key-files:
  created:
    - lib/estimate/failure.ts
  modified:
    - lib/estimate/graph/state.ts
    - lib/estimate/graph/nodes/generate.ts
    - lib/estimate/adapters/whatsapp.ts
    - lib/estimate/adapters/default.ts
    - app/api/estimates/[id]/refine/route.ts

key-decisions:
  - "Option A: keep 'no_usable_input' verbatim (not CONTEXT's illustrative 'no_input') for zero behavior change at the only producer/reader"
  - "codes.ts left unchanged — the existing 'offline' default message is already user-appropriate; no estimate-specific override needed"
  - "transcription_failed/vision_failed reuse the no-input human copy; provider_unavailable gets its own 'briefly unavailable' copy"

patterns-established:
  - "FailureReason union as the single failure vocabulary across graph nodes, adapters and HTTP boundary"
  - "default adapter re-throws a typed XtimatorError (message = detail ?? reason) preserving the Inngest retry/onFailure contract"

requirements-completed: [HARD-04]

# Metrics
duration: 12min
completed: 2026-06-21
---

# Phase 99 Plan 02: Unified Typed Failure Model + Refine Error Surface (HARD-04) Summary

**One typed FailureReason union now drives both the HTTP XtimatorError and each channel's reply, the graph failure channel is typed, the both-providers-down marker maps to 'provider_unavailable', and the refine route returns a typed { error, code } envelope on every error path instead of a bare throw->500.**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-06-21T14:22:40Z
- **Completed:** 2026-06-21T14:34:09Z
- **Tasks:** 3
- **Files modified:** 6 (1 created, 5 modified)

## Accomplishments
- `lib/estimate/failure.ts`: `FailureReason` union (strict superset keeping `no_usable_input`/`generation_failed`), `failureReasonToXtimatorError` (surface `estimates`, statuses per the additive table), `failureReasonToChannelCopy` (exact WhatsApp strings preserved verbatim).
- Graph `failure` channel typed `{ reason: FailureReason; detail? }` — additive at runtime, no migration.
- `generate.ts` deterministically maps the 99-01 `ProvidersUnavailableError` marker to `'provider_unavailable'` (else `'generation_failed'`); node still never throws.
- WhatsApp `onError` sources copy through the single map (always-reply intact); default `onError` re-throws a typed `XtimatorError` (Inngest retry contract preserved).
- Refine route: final catch is `return asResponse(err)`, inline transcription 500 removed, untyped auth/not-found/forbidden/old-version/consolidated sites converted to typed throws; 422 / 429 / demo-guard / success preserved exactly.

## Task Commits

1. **Task 1: FailureReason union + mapping module + typed graph state** — `0b41f50` (feat)
2. **Task 2: Type producers/readers — generate.ts, whatsapp.ts, default.ts** — `337a099` (feat)
3. **Task 3: Refine route — remove bare throw->500, wrap with asResponse** — `0f3dc45` (fix)

_Task 1's RED contract was the pre-existing Wave-0 `failure-mapping.test.ts`; creating the module made it GREEN (no separate test commit needed — tests already authored in 99-00)._

## Files Created/Modified
- `lib/estimate/failure.ts` (created) — FailureReason union + dual mapping (XtimatorError + channel copy)
- `lib/estimate/graph/state.ts` — failure channel typed via `import type { FailureReason }`
- `lib/estimate/graph/nodes/generate.ts` — marker -> typed `provider_unavailable` mapping; still never throws
- `lib/estimate/adapters/whatsapp.ts` — onError sources copy via `failureReasonToChannelCopy`
- `lib/estimate/adapters/default.ts` — onError throws typed `failureReasonToXtimatorError(...)`
- `app/api/estimates/[id]/refine/route.ts` — `asResponse(err)` catch; typed throws; inline transcription 500 removed

## Decisions Made
- **Option A on the union value:** kept `'no_usable_input'` verbatim (research recommendation) — zero string change at the single producer (whatsapp.ts:323) and the presence-based onError reader.
- **codes.ts unchanged:** the existing `defaultMessageByType.offline` ("The service is temporarily unavailable. Please try again.") already reads well for `provider_unavailable`; an estimate-specific override would be redundant. (Plan made this optional/discretionary.)
- **Copy fallbacks:** `transcription_failed`/`vision_failed` reuse the existing no-input human copy; `provider_unavailable` gets a dedicated "briefly unavailable, try again" line.

## Deviations from Plan

None - plan executed exactly as written. All three tasks landed against the plan's task actions and acceptance criteria; no Rule 1-4 deviations were required.

## Issues Encountered
- During the full-suite verification several suites failed; investigation (including a baseline checkout of the pre-99-02 commit `74608f8`) confirmed they are **pre-existing and unrelated** to this plan's disjoint file set:
  - `tests/unit/estimate/observability.test.ts` — OBS-03 + TS1501 es2018 regex-flag errors (pre-existing, noted in success criteria).
  - `tests/unit/inngest/generate-estimate-job.test.ts` — TS2348 mock-callable (pre-existing, named in success criteria).
  - `tests/unit/api/generate-estimate-{dispatch,name-patch,quota}.test.ts` + `tests/unit/api/jobs-status.test.ts` — `cookies() called outside request scope` in `lib/queries/active-company.ts` via the **generate-estimate** route (a file NOT in this plan's scope).
  - `tests/unit/notifications/account-emails.test.ts` — TS2345 Branding-type mismatch (pre-existing).
  - `channel-adapter.test.ts` / `step-runner.test.ts` failed only in the heavy combined run (5s test-timeout under parallel LangGraph-compile load); both PASS in isolation.
- My six modified files are tsc-clean (0 errors among them); none of the 7 repo-wide tsc errors are in files I touched.

## Verification

- `npx vitest run tests/unit/estimate/failure-mapping.test.ts` — GREEN (6 rows + superset + copy)
- `npx vitest run tests/unit/api/refine-error-surface.test.ts` — GREEN (typed `{ error, code }` envelope)
- `npx vitest run tests/unit/estimate/never-throw.test.ts tests/unit/estimate/channel-adapter.test.ts tests/unit/estimate/graph-neutrality.test.ts` — all GREEN (invariants preserved, including the exact-string `provider_unavailable` case)
- Grep: no `, { status: 500 }` bespoke response remains in refine/route.ts; `asResponse(err)` present.

## Next Phase Readiness
- HARD-04 complete: every estimate layer speaks one typed failure language. Phase 99 is now 3/3 plans (99-00, 99-01, 99-02).
- Phase 100 (GUARD-01) will PRODUCE the already-DEFINED `invalid_output` reason via zod-validation + retry — the union slot is ready.
- Phase 101 (refine through the graph) inherits the typed refine error surface; the inline route logic it removes is now error-model-consistent.

---
*Phase: 99-unified-error-model-provider-fallback*
*Completed: 2026-06-21*

## Self-Check: PASSED

- FOUND: lib/estimate/failure.ts
- FOUND: .planning/phases/99-unified-error-model-provider-fallback/99-02-SUMMARY.md
- FOUND commit 0b41f50 (Task 1)
- FOUND commit 337a099 (Task 2)
- FOUND commit 0f3dc45 (Task 3)
