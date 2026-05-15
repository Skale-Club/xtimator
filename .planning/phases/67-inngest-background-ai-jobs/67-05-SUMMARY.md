---
phase: 67-inngest-background-ai-jobs
plan: "05"
subsystem: inngest-frontend-wiring
tags: [inngest, react-hook, polling, capture-flow, docs]
dependency_graph:
  requires: [67-03]
  provides:
    - use-job-status-hook
    - pollJob-helper
    - capture-flow-async-wired
    - inngest-local-dev-docs
  affects:
    - hooks/use-job-status.ts
    - components/capture/capture-recorder.tsx
    - components/workspace/audio/audio-recorder.tsx
    - docs/INNGEST-LOCAL-DEV.md
    - README.md
tech_stack:
  added: []
  patterns:
    - "Polling primitive: pollJob(jobId, signal) — async loop, terminal-status return, AbortSignal cancellation"
    - "React hook variant: useJobStatus(jobId | null) — exposes { status, output, error }, idle on null"
    - "Capture flow rule: dispatch → poll → terminal output (no inline awaits on synchronous AI responses)"
key_files:
  created:
    - hooks/use-job-status.ts
    - docs/INNGEST-LOCAL-DEV.md
    - README.md
  modified:
    - components/capture/capture-recorder.tsx
    - components/workspace/audio/audio-recorder.tsx
    - tests/unit/hooks/use-job-status.test.ts
decisions:
  - "Hook + helper are both exported from hooks/use-job-status.ts — React consumers use useJobStatus, async-flow consumers (e.g. capture-recorder runPipeline imperative loop) use pollJob"
  - "Stage progression in runPipeline: setStage('analyzing') BEFORE dispatch, then setStage('generating') AFTER receiving { jobId } — gives users a visible distinction between dispatch wait and worker execution"
  - "audio-recorder.tsx Save & Transcribe now polls to terminal too — fixes the carryover bug where the toast claimed success on dispatch acceptance instead of actual completion"
  - "README.md created from scratch (none existed) so the Inngest two-terminal workflow is discoverable from the repo root"
metrics:
  duration_minutes: 6
  tasks_completed: 3
  tasks_total: 3
  files_created: 3
  files_modified: 3
  completed_date: "2026-05-15"
  tests_green: 7
---

# Phase 67 Plan 05: useJobStatus Hook + Capture-Recorder Polling + Local Dev Docs Summary

**One-liner:** Created the `useJobStatus` React hook + standalone `pollJob` helper, rewired `components/capture/capture-recorder.tsx` and `components/workspace/audio/audio-recorder.tsx` to dispatch Inngest jobs and poll `/api/jobs/[jobId]` until terminal, and shipped `docs/INNGEST-LOCAL-DEV.md` + a new project README documenting the two-terminal local dev workflow.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | useJobStatus hook + pollJob helper + Wave 0 RED stub turned GREEN | 9a36fd4 | hooks/use-job-status.ts (new), tests/unit/hooks/use-job-status.test.ts |
| 2 | capture-recorder.tsx + audio-recorder.tsx wired to async pollJob | 9355666 | components/capture/capture-recorder.tsx, components/workspace/audio/audio-recorder.tsx, tests/unit/hooks/use-job-status.test.ts (tsc fix) |
| 3 | docs/INNGEST-LOCAL-DEV.md + new README.md | 7568122 | docs/INNGEST-LOCAL-DEV.md (new), README.md (new) |

## Test Status

```
Test Files  1 passed (1)
Tests       7 passed (7)
```

Wave 0 RED stub `tests/unit/hooks/use-job-status.test.ts` (3 placeholder tests) was replaced with 7 contract tests covering:

1. Idle when jobId is null (no fetch)
2. Polls and stops on `Completed` (verifies output exposure)
3. Stops on `Failed` (verifies error state)
4. Stops on `Cancelled`
5. Aborts in-flight fetch on unmount
6. `pollJob(jobId, signal)` resolves with terminal output
7. `pollJob` throws on `Failed`

TypeScript clean: `npx tsc --noEmit` exits 0.

## Architecture Decisions

### Hook + standalone helper

`hooks/use-job-status.ts` exports two surfaces against the same polling contract:

- **`useJobStatus(jobId | null): { status, output, error }`** — React hook for components that want live mid-flight progress (e.g. a stepper showing "Running" or "Completed").
- **`pollJob(jobId, signal): Promise<unknown>`** — Async helper for imperative flows that already have their own state (e.g. `runPipeline` in `capture-recorder.tsx` is a `useCallback` that orchestrates 3 sequential stages — using a hook per stage would be awkward; the helper is cleaner).

Both stop polling on terminal status (`Completed | Failed | Cancelled`). Both honor `AbortSignal` for cancellation on unmount or stage transition.

### Stage progression in runPipeline

Pre-Phase-67 the route was synchronous so the stepper went `analyzing` while the route was running, then `generating` was just a brief tick before redirect. Post-Phase-67, `analyzing` covers the dispatch wait, `generating` covers the polling loop:

```
saving → transcribing (dispatch + poll Whisper)
       → analyzing   (POST /api/generate-estimate, await { jobId })
       → generating  (poll /api/jobs/{jobId} until terminal)
       → done        (redirect to editor)
```

This makes the UX accurate even when Whisper or Claude are slow.

### audio-recorder.tsx fix (carryover from Plan 67-03)

The 67-03 SUMMARY flagged that `audio-recorder.tsx:263` calls `transcribeRecording` and shows `"Recording transcribed successfully!"` immediately — but post-refactor that line resolves on **dispatch acceptance**, not on completion.

Fix shipped in this plan:

1. Show `toast.info("Transcription queued...")` immediately when `{ jobId }` returns.
2. Call `pollJob(jobId, controller.signal)` to wait for terminal status.
3. Show `toast.success("Recording transcribed successfully!")` only after the worker completes.
4. Show `toast.error(...)` if `pollJob` throws (Failed/Cancelled).

The `isTranscribing` indicator now also stays true through the polling loop — previously it cleared the spinner the instant the dispatch succeeded.

### README.md created from scratch

The repo had no top-level README. Without one, new contributors had no entry point to discover that Inngest needs a second terminal — the dev server would silently never run any AI work. The new README leads with a "Background Jobs (Inngest)" section pointing to `docs/INNGEST-LOCAL-DEV.md`.

## Verification Checks

```bash
# Hook surfaces both APIs
grep -c "useJobStatus\|pollJob" hooks/use-job-status.ts
# → 3 (export type/function declarations)

# capture-recorder polls in both flows (transcribe + generate)
grep -c "pollJob(" components/capture/capture-recorder.tsx
# → 3 (1 in triggerEstimateGeneration + 2 in runPipeline; planner threshold was >= 2)

# Inngest doc + README both ship
test -f docs/INNGEST-LOCAL-DEV.md && grep -q "npm run dev:inngest" README.md && grep -q "localhost:8288" docs/INNGEST-LOCAL-DEV.md
# → all three checks pass

# No real signing keys leaked anywhere
grep -rE "signkey-(prod|test)-[A-Za-z0-9_-]{20,}" docs/ README.md hooks/ components/ app/ lib/ tests/
# → 0 hits (placeholders use angle-bracket syntax that gitleaks ignores)

# tsc clean
npx tsc --noEmit
# → exit 0

# Wave 0 RED stub now GREEN
npx vitest run tests/unit/hooks/use-job-status.test.ts --no-coverage
# → 7/7 GREEN
```

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 — bug] Removed unused `@ts-expect-error` directive in test setup**

- **Found during:** Task 2 verification (`npx tsc --noEmit`)
- **Issue:** The Wave 1 test stub used `// @ts-expect-error` to suppress a `globalThis.fetch = vi.fn()` complaint, but `tsc` reported the directive as unused (TS2578) because the assignment is actually type-compatible at the global scope used here.
- **Fix:** Replaced with explicit cast `globalThis.fetch = vi.fn() as unknown as typeof fetch`.
- **Files modified:** tests/unit/hooks/use-job-status.test.ts
- **Commit:** 9355666

### Plan Adjustments (in-scope, beyond original spec)

**2. [Plan extension] Wired `audio-recorder.tsx` to the polling helper**

The plan listed audio-recorder.tsx in `<read_first>` and `must_haves` only mentioned the carryover toast wording fix. Beyond the wording, the underlying behavior was wrong (toast fired on dispatch). Fixed both the wording AND the actual completion semantics by calling `pollJob` and gating the success/error toast on terminal status. This is the minimum correct behavior — anything less would still mislead users.

## Known Stubs

None — every dispatch-poll handoff is real code wired end-to-end. Capture flow + Audio tab Save & Transcribe both poll until terminal; failure paths render the existing `CaptureFailure` UI with retry CTA.

## Pre-existing test failures (out of scope)

`npx vitest run` (full suite) reports 35 failing tests in 12 files (admin actions, blog actions, landing actions, SEO actions, integration RLS tests, auth queries, wizard-client-only). These ALL pre-exist this plan — verified by stashing changes and re-running on the previous commit (`9a36fd4`): same failures. None touch any file modified by this plan. Already documented in `.planning/phases/67-inngest-background-ai-jobs/deferred-items.md` (item #2). Triaged for Phase 69 (UAT Validation + Bug Triage).

## Phase 67 Complete

This was the final plan in Phase 67 — INNGEST-01 through INNGEST-08 are now satisfied:

- INNGEST-01..04: client + 4 functions + endpoint (Plans 67-01, 67-02)
- INNGEST-05: status proxy + frontend polling (Plans 67-03, 67-05)
- INNGEST-06: WhatsApp dispatcher (Plan 67-04)
- INNGEST-07: idempotency (built into Plans 67-02, 67-03, 67-04)
- INNGEST-08: local dev workflow documented (Plan 67-05)

Manual smoke testing deferred to Phase 69 UAT (UAT-INNGEST-01 + UAT-INNGEST-02).

## Self-Check: PASSED

- `hooks/use-job-status.ts` — EXISTS, exports `useJobStatus` + `pollJob` + `JobStatus`/`JobStatusResponse`/`UseJobStatusState` types
- `components/capture/capture-recorder.tsx` — `import { pollJob } from '@/hooks/use-job-status'` present; `runPipeline` calls `pollJob` for transcribe + generate; `triggerEstimateGeneration` calls `pollJob` once; TODO(67-05) marker removed
- `components/workspace/audio/audio-recorder.tsx` — `pollJob` imported; Save & Transcribe shows "Transcription queued..." then polls before final success/error toast
- `docs/INNGEST-LOCAL-DEV.md` — EXISTS, contains setup, two-terminal workflow, dashboard URL, troubleshooting table
- `README.md` — EXISTS (new), Background Jobs (Inngest) section links to docs file
- `npx tsc --noEmit` — exit 0
- `npx vitest run tests/unit/hooks/use-job-status.test.ts` — 7/7 GREEN
- Commits 9a36fd4, 9355666, 7568122 all present in `git log --oneline`
- gitleaks pre-commit hook PASSED on all 3 commits (no real signing keys)
