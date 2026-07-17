---
phase: 167-billing-cost-integrity
plan: 02
subsystem: billing
tags: [inngest, openrouter, vision, cost-tracking, credit-ledger, ai-cost-events]

# Dependency graph
requires:
  - phase: 167-01
    provides: "ai_cost_events partial unique index (audio_minutes/estimate only, vision left unconstrained), recordAICost 23505-swallow discipline, the working costContext-threading precedent on the estimate-generation path"
  - phase: 168-01
    provides: "the chunked (VISION_CHUNK_SIZE=10) per-photo step.run rewrite of analyze-photos.ts that this plan's call-site edit lands inside"
provides:
  - "analyzePhotoOR's per-photo call in analyze-photos.ts threads { attemptId, companyId, projectId } from the job payload — vision ai_cost_events rows carry real correlation ids instead of a random uuid + null ids"
  - "the record-credit-debit read-back (unchanged) now finds those rows and records a real summed cost for photo_batch debits instead of a permanently-null read"
  - "tests/unit/inngest/analyze-photos-cost.test.ts locking the threading, the read-back sum, N-shared-attemptId vision rows, and the partial-index-exclusion static contract"
affects: [168-02, future-billing-calibration]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "costContext threading at AI call sites: { attemptId, companyId, projectId } passed as the 4th positional arg to analyzePhotoOR, mirroring the already-working estimate-generation path (generate.ts -> generate-estimate.ts -> OpenRouterAdapter)"

key-files:
  created:
    - tests/unit/inngest/analyze-photos-cost.test.ts
  modified:
    - lib/inngest/functions/analyze-photos.ts

key-decisions:
  - "multimodal.ts (refine ingest) stays OUT of scope per the plan's Opus-checked must_haves truth — MultimodalRawInput carries no attemptId/companyId/projectId and refine has no photo credit-debit, so threading correlation ids there would be an unbudgeted change across every caller (whatsapp/media, agent-tools/normalize-input) for zero measurement impact. The plan's task <action> text still said to touch it (stale from before the Opus-check amendment); the must_haves truths and the orchestrator's explicit instruction both say not to — followed those."
  - "The test suite exercises the REAL analyzePhotoOR (only fetch/recordAICost/langfuse/getIntegrationKey mocked) instead of stubbing analyzePhotoOR out entirely, so the worker test proves the actual costContext plumbing end-to-end rather than just asserting call-site argument shape."
  - "record-credit-debit's read-back logic was NOT rewritten — verified via a test that feeds it rows already tagged with the batch's attemptId (the post-fix DB state) and asserts the pre-existing summing logic produces a non-null realCostUsd."

requirements-completed: [BILL-03]

# Metrics
duration: 20min
completed: 2026-07-17
---

# Phase 167 Plan 02: Vision costContext threading Summary

**analyzePhotoOR's per-photo call in the analyze-photos Inngest worker now passes `{ attemptId, companyId, projectId }` as its 4th argument, so every vision `ai_cost_events` row carries the job's real attemptId instead of a random uuid — bringing the previously dead-code `photo_batch` credit-debit read-back to life.**

## Performance

- **Duration:** ~20 min
- **Completed:** 2026-07-17
- **Tasks:** 1/1 completed
- **Files modified:** 2 (1 created, 1 modified)

## Accomplishments
- Closed audit finding D4 (BILL-03): the vision call site in `lib/inngest/functions/analyze-photos.ts` (inside 168-01's chunked `step.run` loop) now calls `analyzePhotoOR(base64, mimeType, undefined, { attemptId, companyId, projectId })` instead of `analyzePhotoOR(base64, mimeType)`.
- `attemptId`/`companyId`/`projectId` were already in closure scope from the handler's top-level destructuring (lines 118/120) — no new plumbing needed, exactly as the plan predicted.
- The `record-credit-debit` step's read-back (`.eq('attempt_id', attemptId)` + sum, lines ~308-327) is untouched and verified: it now finds the vision rows (since they finally carry the right attemptId) and records a real summed cost for the `photo_batch` debit instead of a permanent `null`.
- Confirmed (via the real `analyzePhotoOR` + mocked `recordAICost`) that N photos in one batch legitimately write N `vision`-operation rows sharing ONE attemptId, and that the 167-01 partial unique index (`ai_cost_events_attempt_op_unique`, `WHERE operation_type IN ('audio_minutes', 'estimate')`) does not constrain them.

## Task Commits

1. **Task 1: Thread costContext into the vision call(s) + prove the read-back finds rows** — `3e292b34` (feat)

**Plan metadata:** committed alongside this SUMMARY (see below)

## Files Created/Modified
- `lib/inngest/functions/analyze-photos.ts` — the per-photo `analyzePhotoOR` call inside the chunked loop now passes the job's costContext as its 4th argument (12-line diff; no other logic touched).
- `tests/unit/inngest/analyze-photos-cost.test.ts` (new) — 6 tests across 2 describe blocks:
  - **Worker threading + read-back** (real `analyzePhotoOR`, mocked `fetch`/`recordAICost`/`langfuse`/key-lookup): `recordAICost` receives the job's attemptId/companyId/projectId for every photo (not random/null); a missing job attemptId still yields a non-empty server-generated one; N photos in a batch share one attemptId across N `vision` rows; the `record-credit-debit` read-back sums `0.5 + 1.5 = 2` (non-null) for a 2-photo batch — the exact dead-code path the audit flagged; an all-null cost read still records `null` (never coerced to `0`).
  - **Static migration contract**: the 167-01 partial unique index predicate is `WHERE operation_type IN ('audio_minutes', 'estimate')` and does not mention `vision`/`photo_batch`.

## Decisions Made
- Followed the plan's `must_haves.truths` (Opus-checked) over its stale `<action>` bullet 2, which still said to touch `multimodal.ts` — the truths section and the orchestrator's explicit instruction both mark that file out of scope; left it untouched.
- Chose to exercise the real `analyzePhotoOR` implementation in the test file (mocking only its own dependencies: `fetch`, `recordAICost`, `langfuse`, `getIntegrationKey`) rather than mocking `analyzePhotoOR` itself, so the suite proves the actual costContext plumbing rather than just the call-site argument shape. This meant NOT mocking `@/lib/ai/openrouter-client` at all (mocking it would have made `await import('@/lib/ai/openrouter-client')` return the stub, defeating the point).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Unrelated files swept into the first commit attempt by a concurrent process**
- **Found during:** Task 1 commit
- **Issue:** A concurrent agent session is executing other plans (168-02, 165-01) against the same working directory. Between `git add lib/inngest/functions/analyze-photos.ts tests/unit/inngest/analyze-photos-cost.test.ts` and `git commit`, the resulting commit unexpectedly included `supabase/migrations/20260717000004_phase165_save_estimate_atomic.sql` and `types/database.types.ts` — files belonging to a different, unrelated in-progress plan (165-01), not staged by this executor.
- **Fix:** `git reset --soft HEAD~1` (undo the commit, preserve the index/working tree), then `git reset HEAD -- <the 2 unrelated paths>` to unstage them without touching their content, then re-committed with only the 2 intended files staged. Verified via `git show --stat HEAD` that the final commit contains exactly `lib/inngest/functions/analyze-photos.ts` and `tests/unit/inngest/analyze-photos-cost.test.ts`.
- **Files modified:** none beyond the intended 2 (the unrelated files were restored to their prior uncommitted state, untouched).
- **Verification:** `git show --stat HEAD` on the corrected commit; the other agent's uncommitted files remain present and unstaged in the working tree afterward.
- **Committed in:** `3e292b34` (the corrected Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking — shared-workspace git race, not a code issue)
**Impact on plan:** No scope creep; the actual code/test change matches the plan exactly. The deviation was purely a git-staging hygiene issue caused by concurrent execution in the same working directory, caught and corrected before it could contaminate another plan's commit history.

## Issues Encountered
- The initial test-file draft mocked `@/lib/ai/openrouter-client` entirely in one describe block while also trying to exercise its real implementation in another describe block in the same file — `vi.mock` is file-scoped/hoisted in Vitest, so the second block would have silently gotten the stub. Restructured to drop the `analyzePhotoOR` mock entirely and instead mock its own dependencies (`fetch`, `recordAICost`, `getIntegrationKey`, `langfuseClient`), letting every test in the file exercise the real implementation. Caught before running (not via a failing test), so no separate commit was needed.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 167 (Billing & Cost Integrity) is now fully complete: BILL-01 through BILL-06 all shipped (167-01: BILL-01/02/04/05/06; 167-02: BILL-03).
- No outstanding billing-cost-integrity work is deferred from this phase. Vision/photo_batch cost measurement is live end-to-end: capture (analyzePhotoOR) -> ai_cost_events row (correct attemptId/company/project) -> record-credit-debit read-back (real summed cost) -> credit ledger.
- `multimodal.ts`'s refine-ingest vision call remains uncorrelated (random attemptId, null company/project) by deliberate, documented scope decision — refine has no photo_batch credit-debit consumer today, so this has zero measurement impact. If refine ever grows its own photo cost roll-up, `MultimodalRawInput` would need an ids-carrying extension at that time.

## Self-Check: PASSED
- FOUND: `lib/inngest/functions/analyze-photos.ts`
- FOUND: `tests/unit/inngest/analyze-photos-cost.test.ts`
- FOUND: commit `3e292b34` in `git log --oneline --all`

---
*Phase: 167-billing-cost-integrity*
*Completed: 2026-07-17*
