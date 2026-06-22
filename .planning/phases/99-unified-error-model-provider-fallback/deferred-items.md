# Phase 99 — Deferred Items

Out-of-scope discoveries logged during execution. NOT fixed here (scope boundary:
only auto-fix issues directly caused by the current task's changes).

## Pre-existing test failures (unrelated to Phase 99)

### OBS-03 RED stub still failing (Phase 97 leftover)

- **File:** `tests/unit/estimate/observability.test.ts`
- **Case:** `OBS-03: generate-estimate.ts includes projectId and companyId as the only identifiers in trace metadata`
- **Status:** Failing at the plan's base commit (`bfd96fc`); last touched by Phase 97 commit `61139e5` (RED test stub), well before this plan's first commit (`7592432`).
- **Why deferred:** This is a Phase 97 (Unified Observability) Wave-0 RED stub whose implementation has not landed. It is unrelated to Phase 99 (HARD-03/HARD-04) and none of this plan's commits touched it. Per the executor scope boundary, pre-existing failures in unrelated files are out of scope.
- **Owner:** Phase 97 (Unified Observability — Langfuse v5 + Sentry coexistence), OBS-03.

## Pre-existing failures observed during 99-01 (out of scope)

- **tests/unit/estimate/observability.test.ts › OBS-03: generate-estimate.ts includes projectId and companyId as the only identifiers in trace metadata** — asserts `lib/inngest/functions/generate-estimate.ts` source matches `/langfuseSessionId|langfuseUserId/`. Fails identically with 99-01 changes stashed (verified via git stash). Belongs to Phase 97 Unified Observability work (Langfuse v5 session/user metadata), NOT plan 99-01. 99-01 touched `lib/services/generate-estimate.ts`, a different file.
- **tests/unit/inngest/generate-estimate-job.test.ts(145,66) TS2348** — pre-existing tsc typing issue on a `buildEstimateGraph` mock (`mock.results[0].value` callable typing). Present at commit 4380b08 before any 99-01 source change. Unrelated to 99-01 modules.
