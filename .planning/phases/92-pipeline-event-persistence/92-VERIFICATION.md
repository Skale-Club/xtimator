---
phase: 92-pipeline-event-persistence
verified: 2026-05-29T21:52:00Z
status: passed
score: 4/4 requirements verified (EVENT-01..04)
re_verification:
  performed: false
gaps: []
human_verification:
  - test: "Trigger one capture per input type (recording, photo, manual text), then as super-admin SELECT * FROM pipeline_events ORDER BY created_at DESC LIMIT 30"
    expected: "One row per step (started + terminal) with correct attempt_id, input_type, step, status, duration_ms; recording_added still present in estimate_activity"
    why_human: "End-to-end DB-state inspection requires a live Supabase + Inngest run; the unit suite mocks both"
---

# Phase 92: Pipeline Event Persistence Verification Report

**Phase Goal:** A service-role-only `pipeline_events` store + backend instrumentation that durably records every step transition (save_recording, transcribe, analyze, generate_estimate, preview_redirect) for all input types (recording/photo/manual_text), capturing success+failure with timing and retry linkage. Additive observability only — no pipeline behavior change, EVENT-04 `recording_added` write untouched, no UI.

**Verified:** 2026-05-29T21:52:00Z
**Status:** passed (PHASE VERIFIED)
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (Requirements)

| #   | Requirement | Status     | Evidence |
| --- | ----------- | ---------- | -------- |
| EVENT-01 | Service-role-only `pipeline_events` store with full column set + deny-all RLS + super-admin SELECT | ✓ VERIFIED | Migration + types verified at file:line below |
| EVENT-02 | Best-effort backend instrumentation at all 5 step transitions, success+failure+timing | ✓ VERIFIED | Helper + 6 call sites verified below |
| EVENT-03 | All input types captured; retries increment retry_count linked to originating attempt | ✓ VERIFIED | Threading + retry_count verified below |
| EVENT-04 | Existing `recording_added` write preserved, additive only | ✓ VERIFIED | Insert untouched + green regression test |

**Score:** 4/4 requirements verified

---

### EVENT-01 — pipeline_events store + RLS — PASS

**Migration:** `supabase/migrations/20260529000001_phase92_pipeline_events.sql`
- All D-02 columns present (L10-30): `id` (uuid pk, L11), `attempt_id` NOT NULL (L12), `company_id` FK→companies ON DELETE CASCADE (L13), `project_id`/`estimate_id`/`user_id` nullable, not FK-constrained for forensics (L14-16), `input_type` (L17-18), `step` (L19-20), `status` (L21-22), `error_message` (L23), `error_code` (L24), `provider` (L25-26), `duration_ms` (L27), `retry_count` default 0 (L28), `created_at` default NOW() (L29).
- CHECK enums match the canonical value sets: input_type (L18), step (L20 — all 5: save_recording/transcribe/analyze/generate_estimate/preview_redirect), status (L22), provider (L26).
- RLS: `ENABLE ROW LEVEL SECURITY` (L33). Exactly one policy — a super-admin `FOR SELECT` using the `platform_admins`/`auth.uid()` predicate (L36-40). No `FOR INSERT/UPDATE/DELETE` policies anywhere → deny-all client writes; service role bypasses. (D-11 satisfied.)
- 4 named indexes (L43-46): `pipeline_events_attempt_id`, `pipeline_events_company_created` (company_id, created_at DESC), `pipeline_events_created_at` (DESC), `pipeline_events_status`.

**Types:** `types/database.types.ts:966-1027` — `pipeline_events` Row/Insert/Update block present with all 14 columns; the only relationship is the `company_id` FK to companies (L1020-1025), matching the migration.

**Static contract test:** `tests/unit/observability/pipeline-events-migration.test.ts` (8 assertions) asserts table creation, RLS enabled, super-admin SELECT predicate, NO client write policies, all 14 columns, all CHECK enum values, 4 indexes, and no `updated_at` — GREEN.

> Note (informational, not a gap): `created/updated timestamps` in the EVENT-01 wording is satisfied by `created_at`; the table is intentionally append-only (D-01) so `updated_at` is deliberately omitted (would always equal `created_at`). The migration test explicitly guards this. Within phase decisions.

---

### EVENT-02 — backend instrumentation, best-effort, success+failure+timing — PASS

**Helper:** `lib/observability/pipeline-events.ts`
- `recordPipelineEvent` (L51-74): entire body in a single try/catch; maps camelCase input → snake_case D-02 row; inserts via `requireServiceClient()` (L53, service-role/RLS-bypass). On any error → `console.warn` and returns (L70-73). NEVER throws/rejects → best-effort (D-06). The retry_count computation (L54) is inside the same try, so a count-query failure also can't break the write.
- `computeRetryCount` (L88-100): `started` → 0; otherwise counts prior `attempt_id + step + status` rows (D-09).

All 6 server-side call sites verified with correct step/status:
| Site | File | Steps/Statuses |
| ---- | ---- | -------------- |
| save_recording (audio) | `lib/actions/recording.ts` | succeeded L163-173, failed L125-135 (inputType: recording) |
| save_recording (text) | `lib/actions/recording.ts` | succeeded L83-93, failed L59-69 (inputType: manual_text) |
| transcribe | `lib/inngest/functions/transcribe-audio.ts` | started L101-109, succeeded L139-149 (provider openrouter, durationMs), failed in onFailure L62-72 |
| analyze | `lib/inngest/functions/analyze-photos.ts` | started L105-113, succeeded L170-180 (provider openrouter, durationMs), failed in onFailure L67-77 |
| generate_estimate | `lib/inngest/functions/generate-estimate.ts` | started L89-97, succeeded L122-133 (estimateId, durationMs), failed in onFailure L51-61 |
| preview_redirect | `lib/inngest/functions/generate-estimate.ts` | succeeded marker L139-150 (server-side, emitted from generate-succeeded path per D-04) |

All calls are fire-and-forget `void recordPipelineEvent(...)` off the hot path. Timing via in-memory `t0 = Date.now()` captured at step entry, `durationMs` on terminal rows (D-03). Failure capture uses existing Inngest `onFailure` handlers + the synchronous save-recording try/catch (D-05).

**Test:** `tests/unit/observability/instrumentation-presence.test.ts` (static source presence) + `record-pipeline-event.test.ts` (insert-shape, best-effort swallow + console.warn, retry_count increment) — GREEN.

---

### EVENT-03 — input types captured + retry_count linkage — PASS

**Payloads carry attemptId + inputType:** `lib/inngest/events.ts`
- `EstimateGeneratePayload`: attemptId L33, inputType L39.
- `TranscribeAudioPayload`: attemptId L50, inputType L55.
- `AnalyzePhotosPayload`: attemptId L67, inputType L72 — the Phase 91 gap (this payload previously had no attemptId) is closed.

**Entrypoints mint/set inputType** (each via a stable `ensureAttempt()` ref minting `crypto.randomUUID()` once, reused on retry — D-08):
- `components/projects/photos-input.tsx:34-37,58` → inputType 'photo'.
- `components/projects/text-describe.tsx:32-35,58` → inputType 'manual_text'.
- `components/workspace/ai-input-group/use-ai-input-submit.ts:64-67,80-81` → inputType 'manual_text'.
- `components/capture/capture-recorder.tsx:130-136,295-297,433-435,510-512` → inputType 'recording' (Phase 91 attemptId logic preserved).

**Routes forward both fields:**
- `app/api/transcribe/route.ts:46,106,108` (attemptId read; inputType 'recording').
- `app/api/analyze-photos/route.ts:36-38,100-101` (attemptId + server fallback; inputType 'photo').
- `app/api/generate-estimate/route.ts:111-122,132-133` (attemptId + server fallback; inputType validated, defaults 'manual_text').

**retry_count:** `computeRetryCount` (`pipeline-events.ts:88-100`) increments on repeat `attempt_id + step + status`. Test asserts retry_count=2 on a prior-count scenario — GREEN. Lineage links to the originating attemptId throughout.

**Tests:** `input-type-threading.test.ts` GREEN (5/5); `tests/unit/capture/capture-attempt-lineage.test.ts` GREEN (2/2, Phase 91 lineage preserved).

---

### EVENT-04 — recording_added preserved (additive only) — PASS

`lib/actions/recording.ts` — the `estimate_activity` `recording_added` insert is at L153-158 (line numbers shifted from the planning reference L105-110 only because instrumentation was added ABOVE it; the insert body itself is byte-for-byte the original: `event_type: 'recording_added'`, `metadata: { duration_seconds }`). The two `void recordPipelineEvent(...)` calls in `createRecording` (L125-135 failed branch, L163-173 success) are separate additive statements that do not read, wrap, or alter the activity insert. No return value, control flow, or error handling of the original path changed.

**Regression test:** `tests/unit/observability/event04-regression.test.ts` spies on the `estimate_activity` insert and asserts a `recording_added` row still fires from `createRecording` — GREEN.

---

## Test-Gate Result

`npx vitest run tests/unit/observability/ tests/unit/capture/capture-attempt-lineage.test.ts`
→ **6 test files passed, 24 tests passed.** (All 5 Phase-92 observability files + capture-attempt-lineage.)

| File | Status |
| ---- | ------ |
| pipeline-events-migration.test.ts | ✓ GREEN |
| record-pipeline-event.test.ts | ✓ GREEN |
| instrumentation-presence.test.ts | ✓ GREEN |
| input-type-threading.test.ts | ✓ GREEN |
| event04-regression.test.ts | ✓ GREEN |
| capture-attempt-lineage.test.ts | ✓ GREEN |

## tsc Result

`npx tsc --noEmit` → **exit 0 (clean).**

## Pre-existing failures (out of scope — confirmed not introduced by Phase 92)

`deferred-items.md` documents ~50 failures across ~22 unrelated suites caused by vitest-4's stricter mock validation (`requireServiceClient` export missing from `vi.mock('@/lib/supabase/service')` factories). Confirmed pre-existing:
- Sampled `tests/unit/admin-actions.test.ts` → fails on the documented `requireServiceClient` mock condition; operates on `platform_admins`/admin actions, references no Phase 92 file.
- `git show --stat` across all 9 Phase-92 commits (8cb154d, 12cdebd, 54a6fa1, e202c06, 584b20c, a9e98df, 7d17234, 601a155, b127308) touched NONE of the deferred-list files (admin-actions, blog-actions, seo-actions, custom-domain, theme-action, provider-factory, admin-dashboard, dashboard, auth tests).

These are NOT counted against Phase 92.

## Additive-Only Assessment — PASS

- All event writes are fire-and-forget `void recordPipelineEvent(...)`; the helper swallows all errors (`pipeline-events.ts:70-73`) → a logging failure can never fail or alter the pipeline.
- No instrumented site changed its return value, control flow, or error handling: instrumentation is inserted alongside existing logic (recording.ts success/failed branches, Inngest started/terminal/onFailure hooks), never wrapping or replacing it.
- EVENT-04 `recording_added` insert byte-for-byte unchanged (recording.ts:153-158).
- No UI added (correctly deferred to Phase 93).
- Provider intentionally `null` on generate_estimate/preview_redirect (nullable column, Open-Question 2) — by-design, not a stub.

## Anti-Patterns Found

None. No TODO/FIXME/placeholder/stub in any Phase-92 file. The Wave-0 throwing scaffold in `pipeline-events.ts` was fully replaced in Wave 1 (verified at L51-100). The Known-Stubs sections of 92-01/92-03 SUMMARYs report "None."

## Human Verification Required

1. **End-to-end row landing** — Trigger one capture per input type (recording, photo, manual text); as super-admin run `SELECT * FROM pipeline_events ORDER BY created_at DESC LIMIT 30`. Expect one terminal (and where applicable started) row per step with correct `attempt_id`, `input_type`, `step`, `status`, `duration_ms`, and `recording_added` still present in `estimate_activity`. Why human: live Supabase + Inngest DB-state inspection; mocked in the unit suite.

## Gaps Summary

No gaps. All four requirements (EVENT-01..04) are satisfied in the actual codebase with file:line evidence, the Phase-92 test gate is fully green (24/24), and `tsc` is clean. The additive-only guarantee holds. The single human-verification item is end-to-end DB inspection, which is inherently un-unit-testable and was pre-declared as manual in 92-VALIDATION.md.

---

**Overall Verdict: PHASE VERIFIED**

_Verified: 2026-05-29T21:52:00Z_
_Verifier: Claude (gsd-verifier)_
