---
phase: 92
slug: pipeline-event-persistence
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-05-29
---

# Phase 92 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest ^4.1.4 |
| **Config file** | `vitest.config.*` (include pattern scoped to `tests/unit/**` per STATE.md decision) |
| **Quick run command** | `npm test` (`vitest run`) |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~15 seconds (whole suite is unit-level; Supabase + Inngest mocked, no live DB) |

---

## Sampling Rate

- **After every task commit:** Run `npm test`
- **After every plan wave:** Run `npm test`
- **Before `/gsd:verify-work`:** Full suite green **and** `tsc` clean
- **Max feedback latency:** ~15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 92-W0-01 | 00 | 0 | EVENT-01 | unit (static SQL contract) | `npx vitest run tests/unit/observability/pipeline-events-migration.test.ts` | ❌ W0 | ⬜ pending |
| 92-W0-02 | 00 | 0 | EVENT-01/02/03 | unit (mocked service client) | `npx vitest run tests/unit/observability/record-pipeline-event.test.ts` | ❌ W0 | ⬜ pending |
| 92-W0-03 | 00 | 0 | EVENT-02 | unit (static source read) | `npx vitest run tests/unit/observability/instrumentation-presence.test.ts` | ❌ W0 | ⬜ pending |
| 92-W0-04 | 00 | 0 | EVENT-03 | unit (mocked fetch/dispatch) | `npx vitest run tests/unit/observability/input-type-threading.test.ts` | ❌ W0 | ⬜ pending |
| 92-W0-05 | 00 | 0 | EVENT-04 | unit (mocked supabase) | `npx vitest run tests/unit/observability/event04-regression.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

> Test files are created RED in Wave 0 (stubs/contracts), then turned green as the migration, helper, and instrumentation land in subsequent waves. The planner assigns implementation tasks to the same Req IDs; each implementation task must leave its mapped test green.

---

## How To Assert Each Tricky Seam

- **Best-effort / swallow (D-06, EVENT-02):** mock `requireServiceClient` to return a client whose `.insert()` rejects; assert `await recordPipelineEvent(...)` resolves (does not throw) and `console.warn` was called. `vi.mock('@/lib/supabase/service')`.
- **EVENT-04 still fires:** reuse the `makeSupabaseMock` table-switch pattern from `tests/unit/api/transcribe-dispatch.test.ts:52-103`; spy on the `estimate_activity` insert and assert it is called with `event_type:'recording_added'` after instrumentation is added to `createRecording`.
- **RLS posture (static contract, EVENT-01):** `readFileSync` the migration SQL and assert it contains `ENABLE ROW LEVEL SECURITY`, a `FOR SELECT` policy with the `platform_admins … auth.uid()` predicate, and NO `FOR INSERT/UPDATE/DELETE … TO authenticated` policy (deny-all). Mirrors how `transcribe-audio-job.test.ts` asserts `step.run` names from source.
- **Instrumentation presence (static, EVENT-02):** `readFileSync` each of the 3 Inngest functions + 3 routes and assert `recordPipelineEvent` appears with the expected `step`/`status` literals. Deterministic, no Inngest-runtime mocking.
- **retry_count (EVENT-03):** mock the count query so a repeat `attempt_id + step` returns a prior count; assert the written row carries the incremented `retry_count`.

---

## Wave 0 Requirements

- [ ] `tests/unit/observability/pipeline-events-migration.test.ts` — RLS/columns/indexes static contract (EVENT-01)
- [ ] `tests/unit/observability/record-pipeline-event.test.ts` — helper shape + best-effort + retry_count (EVENT-01/02/03)
- [ ] `tests/unit/observability/instrumentation-presence.test.ts` — call-site presence (EVENT-02)
- [ ] `tests/unit/observability/input-type-threading.test.ts` — attemptId+inputType on photo/manual dispatch (EVENT-03)
- [ ] `tests/unit/observability/event04-regression.test.ts` — `recording_added` preserved (EVENT-04)
- [ ] Migration file `supabase/migrations/20260529000001_phase92_pipeline_events.sql`
- [ ] `types/database.types.ts` `pipeline_events` block (regen via PAT `supabase gen types --project-id`, or hand-edit fallback)

*Framework install: none — vitest already present.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Rows actually land in `pipeline_events` end-to-end | EVENT-01/02 | DB-state inspection; not unit-testable without a live DB (Supabase mocked in suite) | Trigger one capture per input type (recording, photo, manual text). Then, as a super-admin, `SELECT * FROM pipeline_events ORDER BY created_at DESC LIMIT 30` and confirm one row per step (started/terminal) with correct `attempt_id`, `input_type`, `step`, `status`, `duration_ms`. |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 15s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-05-29
