---
phase: 100-output-guardrails-schema-correlation
plan: 03
subsystem: observability
tags: [langfuse, sentry, correlation-id, attemptId, inngest, pipeline-events, guard-04]

# Dependency graph
requires:
  - phase: 100-00
    provides: "Wave-0 RED contracts (observability.test.ts GUARD-04 correlationId + OBS-03 token)"
  - phase: 99
    provides: "failureReasonToXtimatorError + XtimatorError.meta + FailureReason union"
  - phase: 91/92
    provides: "attemptId lineage (route → Inngest payload → recordPipelineEvent)"
provides:
  - "One correlation id (the promoted attemptId) joins pipeline_events ↔ Langfuse trace ↔ Sentry per run"
  - "Langfuse v5 graph.invoke config metadata: { langfuseSessionId, langfuseUserId, correlationId } (closes pre-existing OBS-03 RED)"
  - "failureReasonToXtimatorError carries optional correlationId into XtimatorError.meta"
  - "asResponse tags Sentry scope with correlation_id from err.meta.correlationId"
affects: [101-refine-through-graph, 103-eval-harness, observability, debugging]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Promote the existing attemptId to THE correlation id — no new minted concept (Phase 91/92 lineage reuse)"
    - "Langfuse v5 (@langfuse/langchain@5.5.3) runnable-config metadata form for trace session/user/correlation tokens"
    - "Best-effort/never-throw observability: inert metadata + guarded Sentry tag (Phase 92 D-06 rule)"

key-files:
  created: []
  modified:
    - lib/inngest/functions/generate-estimate.ts
    - lib/estimate/failure.ts
    - lib/errors/index.ts

key-decisions:
  - "correlationId === attemptId (reused, not minted) — minimal churn, aligns with Phase 91/92 lineage"
  - "Used the v5 config-metadata form (langfuseSessionId/langfuseUserId/correlationId) on graph.invoke rather than minting a deterministic createTraceId — the metadata form is the required deliverable and closes OBS-03 cheaply"
  - "Reworded the SAFE-METADATA comment to avoid literal forbidden tokens (transcript/raw_content/apiKey/audio_data) — the OBS-03 dotall regex would otherwise false-positive against a comment"
  - "Inngest (non-asResponse) path relies on the shared OTel trace + Langfuse correlationId metadata; no new Sentry plumbing added inside the job (RESEARCH Open-Question 2) to keep blast radius minimal"

patterns-established:
  - "GUARD-04 correlation seam: attemptId → Langfuse metadata.correlationId + pipeline_events attempt_id + Sentry correlation_id tag"

requirements-completed: [GUARD-04]

# Metrics
duration: ~7min
completed: 2026-06-21
---

# Phase 100 Plan 03: Correlation ID (GUARD-04) Summary

**One correlation id (the promoted attemptId) now joins pipeline_events ↔ the Langfuse v5 trace metadata ↔ the Sentry correlation_id tag for every generation run — closing the pre-existing OBS-03 RED.**

## Performance

- **Duration:** ~7 min
- **Started:** 2026-06-21T11:39:00Z
- **Completed:** 2026-06-21T11:44:00Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Threaded `correlationId = attemptId` into the Langfuse trace via the v5 `graph.invoke` config metadata (`{ langfuseSessionId, langfuseUserId, correlationId }`), promoting the existing Phase 91/92 attemptId to THE correlation id.
- Closed the pre-existing OBS-03 RED token assertion (`langfuseSessionId`/`langfuseUserId` now present in `generate-estimate.ts`) alongside the new GUARD-04 correlationId case — `observability.test.ts` is fully GREEN (9/9).
- `failureReasonToXtimatorError` now accepts an optional `correlationId` and rides it on `XtimatorError.meta`; `asResponse` tags the Sentry scope with `correlation_id` when present. Both changes are back-compatible (optional arg, guarded tag).
- All additions are inert/best-effort: the metadata object cannot throw and the Sentry tag is a no-op when absent — observability never fails or retries the generation job (Phase 92 rule preserved).

## Task Commits

Each task was committed atomically:

1. **Task 1: Thread correlationId=attemptId into the Langfuse trace metadata (closes OBS-03)** - `2ba91e6` (feat)
2. **Task 2: Carry correlationId through failureReasonToXtimatorError into meta + tag Sentry in asResponse** - `dab7fef` (feat)

_Plan metadata commit follows this SUMMARY._

## Files Created/Modified
- `lib/inngest/functions/generate-estimate.ts` - Added v5 config metadata `{ langfuseSessionId, langfuseUserId, correlationId: attemptId }` + `tags` to the `graph.invoke` call.
- `lib/estimate/failure.ts` - `failureReasonToXtimatorError` gains optional `correlationId` arg → conditionally added to meta.
- `lib/errors/index.ts` - `asResponse` adds `scope.setTag('correlation_id', ...)` guarded by `err.meta?.correlationId`.

## Decisions Made
- **correlationId === attemptId (reused, not minted):** minimal churn, aligns with Phase 91/92 lineage and the existing `recordPipelineEvent` attemptId carried on every step of a run.
- **Config-metadata form over `createTraceId`:** the `metadata.correlationId` form is the required deliverable, satisfies OBS-03, and gives a human-searchable trace attribute; the optional deterministic-trace-id path was not needed.
- **No new Sentry plumbing inside the Inngest job:** per RESEARCH Open-Question 2, the job's failure path relies on the shared OTel trace (Sentry + Langfuse share one NodeTracerProvider) plus the Langfuse correlationId metadata; the explicit `correlation_id` tag covers the HTTP-surfaced (`asResponse`) path when a caller passes the id into `failureReasonToXtimatorError`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] SAFE-METADATA comment triggered the OBS-03 dotall forbidden-token regex**
- **Found during:** Task 1 (Langfuse metadata threading)
- **Issue:** The plan's suggested comment listed the literal forbidden tokens (`transcript`, `raw_content`, `apiKey`, `audio_data`). The OBS-03 assertion `expect(src).not.toMatch(/langfuseSessionId.*transcript|transcript.*langfuseSessionId/s)` uses the dotall `/s` flag, so `langfuseSessionId` in the metadata followed by the word "transcript" anywhere later in the file (my comment) matched and turned OBS-03 RED.
- **Fix:** Reworded the comment to "no user content or secrets ever enter trace metadata" — preserving the documented SAFE-METADATA intent without the literal forbidden tokens.
- **Files modified:** lib/inngest/functions/generate-estimate.ts
- **Verification:** observability.test.ts 9/9 GREEN after the reword.
- **Committed in:** `2ba91e6` (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Cosmetic comment wording only; the metadata payload and intent are exactly as specified. No scope creep.

## Issues Encountered
None beyond the deviation above.

## Pre-existing / Out-of-Scope (noted, not touched)
- `tests/unit/estimate/totals-authority.test.ts` and `tests/unit/ai/price-anchoring.test.ts` are **Wave-0 RED contracts for plan 100-02 (GUARD-02/03)** — they fail because `@/lib/estimate/totals` and `@/lib/ai/price-anchoring` are not yet implemented. Confirmed RED independently of this plan's changes (via `git stash`). Not this plan's scope.
- `tests/unit/ai/schema.test.ts` `result.data is of type 'unknown'` tsc notes, `observability.test.ts` `es2018` regex-flag tsc notes, `generate-estimate-job.test.ts`, `account-emails.test.ts`, and `tests/unit/xphere-client.test.ts` (`pipeline` missing) — all **pre-existing**, unrelated to this plan. The xphere file is explicitly out of scope and was not touched/staged/committed.

## User Setup Required
None - no external service configuration required. (Langfuse keys remain env-only; the span processor no-ops without them; GUARD-04 wiring is source-verifiable without live keys.)

## Next Phase Readiness
- GUARD-04 complete. The correlation seam (attemptId → Langfuse metadata.correlationId + pipeline_events attempt_id + Sentry correlation_id) is in place for Phase 101's refine-through-the-graph (which inherits the same Inngest job path) and Phase 103's eval harness.
- Remaining Phase 100 work: plan 100-02 (GUARD-02 price anchoring + GUARD-03 totals authority/discrepancy), still Wave-0 RED by design.

---
*Phase: 100-output-guardrails-schema-correlation*
*Completed: 2026-06-21*

## Self-Check: PASSED
- Files: lib/inngest/functions/generate-estimate.ts, lib/estimate/failure.ts, lib/errors/index.ts, 100-03-SUMMARY.md — all FOUND
- Commits: 2ba91e6, dab7fef — all FOUND
