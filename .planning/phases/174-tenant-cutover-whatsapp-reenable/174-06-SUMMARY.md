---
phase: 174-tenant-cutover-whatsapp-reenable
plan: 06
subsystem: notifications
tags:
  - TNT-01-sweep
  - ai-jobs
  - copy-context-seam
status: complete
completed_date: 2026-07-21
start_time: 2026-07-21T23:16:00Z
end_time: 2026-07-21T23:18:45Z
duration_minutes: ~3
completed_tasks: 2
total_tasks: 2
dependency_graph:
  requires:
    - 174-04
  provides:
    - TNT-01-completion-wave-3
  affects:
    - wave-3-completion
key_files:
  created: []
  modified:
    - lib/inngest/functions/transcribe-audio.ts
    - lib/inngest/functions/analyze-photos.ts
    - lib/inngest/functions/generate-estimate.ts
metrics:
  tests_run: 47
  tests_passed: 388
  type_checks_passed: true
  commit_count: 2
---

# Phase 174 Plan 06: AI-Job copyContext Seam Sweep Summary

**Wave 3 (TNT-01 mechanical sweep, part B):** Added `copyContext` parameter to all 6 `notify()` call sites across the 3 AI-job Inngest functions (transcribe-audio, analyze-photos, generate-estimate), following the pattern established by the shipped `buildFullCopyContext` seam in `lib/notifications/dispatch.ts`.

## One-Liner

All 6 AI-job notification call sites now pass `copyContext` with the fields already in scope per buildNotificationCopy, at zero runtime cost (events remain _dropped/undeliverable).

## Execution Summary

### Task 1: Sweep transcribe-audio.ts + analyze-photos.ts (4 call sites)

**Status:** COMPLETE

- **transcribe-audio.ts `ai_job.failed` (~line 143):** Extracted context object to `const ctx = {jobType: 'Audio transcription', errorMessage: ...}`, passed to both `buildNotificationCopy(ctx)` and `notify({..., copyContext: ctx})`.
- **transcribe-audio.ts `ai_job.completed` (~line 403):** Extracted context to `const ctx = {jobType: 'Audio transcription'}`, passed to both functions.
- **analyze-photos.ts `ai_job.failed` (~line 90):** Extracted context to `const ctx = {jobType: 'Photo analysis', errorMessage: ...}`, passed to both functions.
- **analyze-photos.ts `ai_job.completed` (~line 421):** Extracted context to `const ctx = {jobType: 'Photo analysis'}`, passed to both functions.

**Verification:**
- All 7 related test files green: `transcribe-short-circuit`, `derived-duration`, `analyze-photos-structured`, `analyze-photos-cost`, `analyze-photos-coverage`, `analyze-photos-dispatch`, `analyze-photos-quota` (54 tests).
- Both files confirmed to have ≥2 `copyContext:` occurrences.
- **Commit:** `8857f45a` (feat(174-06): add copyContext to transcribe-audio + analyze-photos notify() calls)

### Task 2: Sweep generate-estimate.ts (2 call sites) + full-directory verify

**Status:** COMPLETE

- **generate-estimate.ts `ai_job.failed` (~line 81):** Extracted context to `const ctx = {jobType: 'Estimate generation', errorMessage: ...}`, passed to both functions.
- **generate-estimate.ts `ai_job.completed` (~line 326):** Extracted context to `const ctx = {jobType: 'Estimate generation'}`, passed to both functions.

**Verification:**
- All 3 generate-estimate-related test files green: `generate-estimate-job`, `generate-estimate-quota`, `generate-estimate-dispatch` (15 tests).
- Full `tests/unit/inngest` + `tests/unit/notifications` suite: 47 test files, 388 tests, all PASS.
- `npx tsc --noEmit -p tsconfig.ci.json`: CLEAN (no type errors).
- generate-estimate.ts confirmed to have ≥2 `copyContext:` occurrences.
- **Commit:** `7237d54a` (feat(174-06): add copyContext to generate-estimate notify() calls)

## Deviations from Plan

None. Plan executed exactly as written.

- No fields invented.
- No Inngest step/idempotency logic touched.
- All 6 sites follow identical pattern: extract context → pass to both `buildNotificationCopy()` and `notify({..., copyContext: ctx})`.
- Zero behavior change: `ai_job.failed` and `ai_job.completed` remain in `_dropped` EventCategory; all channels resolve to false, `resolveChannels()` returns early with `skipped: 'channel_disabled'` before copyContext resolution ever runs.

## Verification Results

| Category            | Status |
| ------------------- | ------ |
| All 6 call sites wired | PASS  |
| Tests (54 unit)     | PASS  |
| Tests (388 inngest+notif) | PASS |
| TypeScript (tsc)    | PASS  |
| copyContext count   | PASS  |

## Known Stubs

None. All changes are structural (parameter passing) at zero runtime risk.

## Self-Check: PASSED

- transcribe-audio.ts modified ✓
- analyze-photos.ts modified ✓
- generate-estimate.ts modified ✓
- Commit 8857f45a exists ✓
- Commit 7237d54a exists ✓
- All tests pass ✓
- tsc clean ✓
