---
phase: 91
slug: recording-pipeline-reliability
status: planned
nyquist_compliant: true
wave_0_complete: false
created: 2026-05-28
---

# Phase 91 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (unit) + Playwright (E2E) — detected in repo |
| **Config file** | `vitest.config.ts` / `playwright.config.ts` |
| **Quick run command** | `npx vitest run` |
| **Full suite command** | `npx vitest run && npx playwright test` |
| **Estimated runtime** | ~60 seconds (unit) |

---

## Sampling Rate

- **After every task commit:** Run the touched test file(s) (see map below)
- **After every plan wave:** Run `npx vitest run` + `npx tsc --noEmit`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 60 seconds

---

## Per-Task Verification Map

> Each task that produces verifiable behavior maps to an automated command here.

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 91-01 T1 | 01 | 1 | REC-01/02/05 | unit (Wave 0, RED) | `npx vitest run tests/unit/api/jobs-status.test.ts tests/unit/hooks/use-job-status.test.ts tests/unit/components/capture-failure.test.ts` | ⚠️ jobs-status exists (update); hook+failure NEW | ⬜ pending |
| 91-01 T2 | 01 | 1 | REC-01 | unit | `npx vitest run tests/unit/api/jobs-status.test.ts` | ✅ (updated in T1) | ⬜ pending |
| 91-01 T3 | 01 | 1 | REC-05, REC-02 | unit | `npx vitest run tests/unit/hooks/use-job-status.test.ts tests/unit/components/capture-failure.test.ts` | ✅ (created in T1) | ⬜ pending |
| 91-02 T1 | 02 | 2 | REC-04, REC-03 | unit (Wave 0, RED) | `npx vitest run tests/unit/inngest/transcribe-audio-job.test.ts tests/unit/capture/capture-attempt-lineage.test.ts` | ⚠️ transcribe exists (repair stale); lineage NEW | ⬜ pending |
| 91-02 T2 | 02 | 2 | REC-03, REC-04 | unit | `npx vitest run tests/unit/capture/capture-attempt-lineage.test.ts tests/unit/inngest/transcribe-audio-job.test.ts` | ✅ (created/repaired in T1) | ⬜ pending |
| 91-02 T3 | 02 | 2 | REC-03, REC-04, REC-02 | unit + tsc | `npx vitest run tests/unit/capture/capture-attempt-lineage.test.ts && npx tsc --noEmit` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

> Wave 0 lives inside each plan's Task 1 (failing-test scaffolds). Confirmed additions:

- [ ] **(Plan 01 T1)** `tests/unit/api/jobs-status.test.ts` — UPDATE the `returns 503` case (lines 66-77) to assert 200 `{ state: 'config_unavailable' }`; fold 404→`not_found`, 502→`failed`; add a `Failed`-run→`{ state:'failed', reason }` case. (REC-01)
- [ ] **(Plan 01 T1)** `tests/unit/hooks/use-job-status.test.ts` — NEW. `pollJob` resolves a typed `JobResult` discriminant (completed/failed/config_unavailable/not_found) without throwing; `useJobStatus` sets a discriminated state, never `{status:'Failed',error:'Status 503'}`. (REC-05)
- [ ] **(Plan 01 T1)** `tests/unit/components/capture-failure.test.ts` — NEW. Renders the friendly reason + Retry/Edit-manually with `t()`-wrapped labels (no hardcoded English). (REC-02)
- [ ] **(Plan 02 T1)** `tests/unit/inngest/transcribe-audio-job.test.ts` — REPAIR the stale OpenAI-URL assertion; add an idempotency-key assertion (keyed on `recordingId`, `step.run`-wrapped). (REC-04)
- [ ] **(Plan 02 T1)** `tests/unit/capture/capture-attempt-lineage.test.ts` — NEW. Stable `requestId` on Retry yields a stable event id `estimate-${projectId}-${requestId}`; route honors a client-supplied requestId (no re-mint). (REC-03/REC-04)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Capture popup shows human-readable failure + Retry + Edit-manually | REC-02 | Requires real recorder UI + browser media APIs | Record audio with Inngest unconfigured; confirm popup shows plain-language reason and both buttons, no raw 503/stack |
| Retry continues same attempt lineage, no double-charge | REC-03/REC-04 | End-to-end across UI + Inngest dispatch + provider billing | Trigger a failure, tap Retry; confirm only one `usage_events` row / one OpenRouter charge for an already-successful step (a still-failing step may legitimately re-run) |
| Edit-manually preserves context | REC-03 | Requires browser navigation + DB state | Trigger failure, tap Edit manually; confirm landing on `/projects/[id]` with the recording + transcript attached |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 60s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** planned — ready for `/gsd:execute-phase 91`
