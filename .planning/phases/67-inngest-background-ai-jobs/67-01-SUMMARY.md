---
phase: 67-inngest-background-ai-jobs
plan: 01
subsystem: testing

tags: [inngest, vitest, tdd, red-stubs, idempotency, nyquist]

# Dependency graph
requires:
  - phase: 56-usage-tracking
    provides: usage_events.idempotency_key partial UNIQUE index (verified via migration source-of-truth)
provides:
  - 14 vitest RED stub files locking the contract for Plans 67-02..05
  - tests/setup/inngest-mocks.ts shared helper exporting mockInngestSend()
  - traceability map (each describe block prefixed with INNGEST-XX requirement ID)
affects: [67-02, 67-03, 67-04, 67-05, 69-uat]

# Tech tracking
tech-stack:
  added: []  # Wave 0 is test-only — no production deps added
  patterns:
    - "Nyquist Wave 0: failing test stubs precede every line of production code"
    - "expect.fail('not implemented — Wave N delivers this') as the RED-phase signal"
    - "describe block prefixed with requirement ID for grep-based traceability"

key-files:
  created:
    - tests/setup/inngest-mocks.ts
    - tests/unit/inngest/client.test.ts
    - tests/unit/inngest/route.test.ts
    - tests/unit/inngest/generate-estimate-job.test.ts
    - tests/unit/inngest/transcribe-audio-job.test.ts
    - tests/unit/inngest/analyze-photos-job.test.ts
    - tests/unit/inngest/whatsapp-process-job.test.ts
    - tests/unit/inngest/idempotency.test.ts
    - tests/unit/inngest/dev-script.test.ts
    - tests/unit/api/generate-estimate-dispatch.test.ts
    - tests/unit/api/transcribe-dispatch.test.ts
    - tests/unit/api/analyze-photos-dispatch.test.ts
    - tests/unit/api/jobs-status.test.ts
    - tests/unit/whatsapp/handler-inngest-dispatch.test.ts
    - tests/unit/hooks/use-job-status.test.ts
    - .planning/phases/67-inngest-background-ai-jobs/deferred-items.md
  modified: []

key-decisions:
  - "RED stubs use bare `expect.fail()` rather than importing not-yet-existent production modules — keeps Wave 0 commit non-breaking and avoids a chicken-and-egg compile failure"
  - "Each describe() title is prefixed with the INNGEST-XX requirement ID so plan executors in Waves 1-3 can grep tests by requirement"
  - "DB index verification skipped against live DB (env unavailable on this machine) — verified instead via migration source-of-truth (supabase/migrations/20260513000002_phase56_usage_idempotency.sql); no follow-up migration added because the existing one already creates `usage_events_idempotency` partial UNIQUE"

patterns-established:
  - "Shared mock factory module pattern: tests/setup/inngest-mocks.ts exports vi.fn factories (e.g., mockInngestSend) so dispatch tests across api/ and whatsapp/ share one mock contract"
  - "Wave-0 contract-locking: each future implementation wave starts by reading the failing tests in tests/unit/inngest/* — making them pass IS the implementation spec"

requirements-completed: []  # INNGEST-01..08 are NOT completed by Wave 0 — RED stubs only LOCK the contract; Plans 67-02..05 deliver GREEN.

# Metrics
duration: 30min
completed: 2026-05-15
---

# Phase 67 Plan 01: Wave 0 RED Stubs for Inngest Background AI Jobs Summary

**14 vitest RED stub files + shared mockInngestSend factory locking the contract for Inngest client, 4 jobs, 4 dispatch routes, status proxy, polling hook, and WhatsApp handler refactor — every requirement INNGEST-01..08 is now driven by a failing test before any production code exists.**

## Performance

- **Duration:** ~30 min
- **Started:** 2026-05-15T16:55Z
- **Completed:** 2026-05-15T17:10Z
- **Tasks:** 1 of 1
- **Files created:** 16 (15 source + 1 deferred-items.md)
- **Files modified:** 0

## Accomplishments

- 14 RED test stub files with 36 failing `expect.fail('not implemented')` assertions across 8 INNGEST-XX requirement IDs
- Shared `mockInngestSend()` factory in `tests/setup/inngest-mocks.ts` ready for Plans 02-05 to wire into dispatch tests
- DB-level idempotency safety net for INNGEST-06 verified via migration source-of-truth (no new migration needed — `usage_events_idempotency` partial UNIQUE index from Phase 56 is the canonical artifact and not dropped by any later migration)
- Out-of-scope discoveries logged in `deferred-items.md` (env unavailable for live DB check + 39 pre-existing test failures triaged for Phase 69)

## Task Commits

1. **Task 1: Verify usage_events idempotency UNIQUE index + create RED test stubs** — `e647bd2` (test)

**Plan metadata:** _to be added in final commit_

## Files Created/Modified

- `tests/setup/inngest-mocks.ts` — exports `mockInngestSend(eventId)` returning a `vi.fn().mockResolvedValue({ ids: [eventId] })`
- `tests/unit/inngest/client.test.ts` — INNGEST-01 client singleton contract (2 RED tests)
- `tests/unit/inngest/route.test.ts` — INNGEST-01 serve handler GET/POST/PUT exports + 4-function registration (2 RED tests)
- `tests/unit/inngest/generate-estimate-job.test.ts` — INNGEST-02 + INNGEST-06: id, idempotency CEL, split step.run for AI vs DB write (3 RED tests)
- `tests/unit/inngest/transcribe-audio-job.test.ts` — INNGEST-03 + INNGEST-06: id, idempotency on recordingId, split step.run for Whisper vs DB save (3 RED tests)
- `tests/unit/inngest/analyze-photos-job.test.ts` — INNGEST-04 + INNGEST-06: id, idempotency, one step.run per photo, final record-usage step (3 RED tests)
- `tests/unit/inngest/whatsapp-process-job.test.ts` — INNGEST-07: id, idempotency on batchKey, ≥3 step.run blocks (2 RED tests)
- `tests/unit/inngest/idempotency.test.ts` — INNGEST-06 cross-cutting: every function exports non-empty CEL `idempotency` (1 RED test)
- `tests/unit/inngest/dev-script.test.ts` — INNGEST-08: package.json `dev:inngest` URL (1 RED test)
- `tests/unit/api/generate-estimate-dispatch.test.ts` — INNGEST-02: <1s jobId return; no direct AI call; no direct recordUsage; inngest.send name + id (4 RED tests)
- `tests/unit/api/transcribe-dispatch.test.ts` — INNGEST-03 NEW route: jobId return; inngest.send name + id; no Whisper inline (3 RED tests)
- `tests/unit/api/analyze-photos-dispatch.test.ts` — INNGEST-04: jobId return; checkQuota gates dispatch; no Anthropic inline (3 RED tests)
- `tests/unit/api/jobs-status.test.ts` — INNGEST-05 NEW proxy: 401 when unauthed; Bearer auth proxy to api.inngest.com; { status, output } shape (3 RED tests)
- `tests/unit/whatsapp/handler-inngest-dispatch.test.ts` — INNGEST-07: handler no longer inlines Whisper or Vision; dispatches `whatsapp/process.requested` (3 RED tests)
- `tests/unit/hooks/use-job-status.test.ts` — INNGEST-05: 1500ms polling; stops on terminal status; { status, output, error } state (3 RED tests)
- `.planning/phases/67-inngest-background-ai-jobs/deferred-items.md` — env/DB verification deferred + 39 pre-existing failures triaged for Phase 69

## Decisions Made

- **Bare `expect.fail()` over import-then-assert:** Each stub uses `describe`/`it`/`expect.fail('not implemented — Wave N delivers this')` rather than importing `lib/inngest/client.ts` (which doesn't exist yet) and asserting on its shape. Rationale: importing not-yet-existent modules makes Wave 0 commit fail at the module-resolution layer, not at the test-runner layer — the goal is RED tests, not RED imports. The implementation waves will rewrite each stub body to import + assert as they ship.
- **Requirement ID prefix in describe titles:** Every describe block starts with `'INNGEST-XX: ...'` (e.g., `'INNGEST-02 + INNGEST-06: generateEstimateJob'`) so future executors can `grep -l 'INNGEST-02' tests/` to find every test that depends on a single requirement.
- **DB index verification via migration source-of-truth:** Live `psql` check skipped because `.env.local` symlink target is offline on this machine. Verified instead by reading `supabase/migrations/20260513000002_phase56_usage_idempotency.sql` (creates the index) and confirming no later migration drops/alters it. The plan's optional follow-up migration is unnecessary because the existing migration is already idempotent (`CREATE UNIQUE INDEX usage_events_idempotency` is the source contract).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Live DB index verification could not run against dev DB**

- **Found during:** Task 1, Step A
- **Issue:** Plan asked to run `psql "$DATABASE_URL"` or `node supabase/audits/run-audit.mjs` to verify the partial UNIQUE index. On this machine `.env.local` is a symlink to `G:\My Drive\Dev\xtimator\.env.local`; the target is offline (Google Drive not mounted), so `DATABASE_URL` cannot be loaded.
- **Fix:** Verified via the migration source-of-truth (`supabase/migrations/20260513000002_phase56_usage_idempotency.sql` creates the index; `ls supabase/migrations/ | grep -iE 'usage|idempot'` returns only that one file → no later migration drops it). Decision documented in `deferred-items.md` along with the exact follow-up command to run when the DB is reachable.
- **Files modified:** `.planning/phases/67-inngest-background-ai-jobs/deferred-items.md` (created)
- **Verification:** Migration file inspected; no follow-up migration needed because the existing one already provides the contract.
- **Committed in:** `e647bd2` (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking — env unavailability mitigated by migration source-of-truth verification)
**Impact on plan:** No scope change. The plan's optional `<follow-up migration if missing>` branch was not exercised because the original migration is intact.

## Issues Encountered

- **Pre-existing test failures (39) discovered during full-suite run:** Running `npx vitest run` reports 75 failures total: 36 are this plan's intentional RED stubs, 39 are pre-existing (admin-actions, admin-dashboard, admin-gate, blog-actions, cleanup-route-auth, landing-actions, seo-actions, wizard-client-only, generate-estimate-name-patch, plus 3 integration tests needing live DB). None touch files modified by Plan 67-01 → out of scope per the executor's scope-boundary rule. Triaged for Phase 69 (UAT Validation + Bug Triage) and logged in `deferred-items.md`.

## User Setup Required

None — Wave 0 is test-only. INNGEST_EVENT_KEY / INNGEST_SIGNING_KEY env vars are required by Plans 67-02..05 (Wave 1+).

## Self-Check: PASSED

All claimed artifacts verified:

- `tests/setup/inngest-mocks.ts` — FOUND
- `tests/unit/inngest/client.test.ts` — FOUND
- `tests/unit/inngest/route.test.ts` — FOUND
- `tests/unit/inngest/generate-estimate-job.test.ts` — FOUND
- `tests/unit/inngest/transcribe-audio-job.test.ts` — FOUND
- `tests/unit/inngest/analyze-photos-job.test.ts` — FOUND
- `tests/unit/inngest/whatsapp-process-job.test.ts` — FOUND
- `tests/unit/inngest/idempotency.test.ts` — FOUND
- `tests/unit/inngest/dev-script.test.ts` — FOUND
- `tests/unit/api/generate-estimate-dispatch.test.ts` — FOUND
- `tests/unit/api/transcribe-dispatch.test.ts` — FOUND
- `tests/unit/api/analyze-photos-dispatch.test.ts` — FOUND
- `tests/unit/api/jobs-status.test.ts` — FOUND
- `tests/unit/whatsapp/handler-inngest-dispatch.test.ts` — FOUND
- `tests/unit/hooks/use-job-status.test.ts` — FOUND
- `.planning/phases/67-inngest-background-ai-jobs/deferred-items.md` — FOUND
- Commit `e647bd2` — FOUND
- Vitest output: 14 test files, 36 RED tests (>= 25 minimum) — VERIFIED

## Next Phase Readiness

- **Plan 67-02 (Wave 1):** Read `tests/unit/inngest/client.test.ts`, `route.test.ts`, `generate-estimate-job.test.ts`, `api/generate-estimate-dispatch.test.ts`, `dev-script.test.ts` — make them pass by delivering `lib/inngest/client.ts`, `app/api/inngest/route.ts`, `lib/inngest/functions/generate-estimate.ts`, refactoring `app/api/generate-estimate/route.ts`, and adding the `dev:inngest` package script.
- **Plan 67-03:** Same pattern for `transcribe-audio-job`, `analyze-photos-job`, plus their dispatch routes (one new + one refactor).
- **Plan 67-04:** Same pattern for `whatsapp-process-job` + `handler-inngest-dispatch.test.ts`.
- **Plan 67-05:** Same pattern for `jobs-status.test.ts` (proxy route) + `use-job-status.test.ts` (polling hook) + capture flow wiring.
- **DB:** No blocker — index already exists per Phase 56 migration. Live verification can run any time the DB is reachable (see `deferred-items.md` for the command).
- **Pre-existing test failures (39):** Out of scope for Phase 67. Triage in Phase 69.

---

*Phase: 67-inngest-background-ai-jobs*
*Plan: 01*
*Completed: 2026-05-15*
