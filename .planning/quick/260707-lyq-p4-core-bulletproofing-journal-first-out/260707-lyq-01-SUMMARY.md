---
phase: quick-260707-lyq
plan: 01
subsystem: reliability
tags: [pipeline-events, inngest, billing, credit-gate, server-actions, idempotency]

# Dependency graph
requires:
  - phase: quick-260707-hhp
    provides: "startRecordingPipeline/createTextRecording/analyze-photos server-owned dispatch chains; pipeline-watchdog cron"
provides:
  - "getAttemptOutcome(attemptId) — journal-first, company-scoped attempt outcome read (lib/actions/attempt-outcome.ts)"
  - "dispatchNonce plumbing end-to-end: startRecordingPipeline → transcribeRecording → EVENT_TRANSCRIBE_AUDIO event id"
  - "transcribe-audio.ts function-level idempotency REMOVED — genuine Retry now creates a new Inngest run"
  - "Billing v2 credit gates on every server-owned dispatch path (startRecordingPipeline, createTextRecording chain, transcribe-audio.ts + analyze-photos.ts chained generate hop)"
affects: [quick-260707-lyq Wave 2 (client-side capture UI wiring of getAttemptOutcome + Retry dispatchNonce)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Journal-first outcome read: precedence completed/needs_details BEFORE failed, so a stale client_reported (or any non-terminal) failed row never masks a real terminal success"
    - "Fail-open credit gate: checkCredits wrapped in try/catch at every NEW call site — a metering-read failure never wrongly blocks generation (mirrors credit-ledger.ts's own isByokCompany never-throw discipline)"
    - "Event-id-only dedup: idempotency now lives entirely in deterministic ids minted at dispatch sites (transcribe-${recordingId}[-r${dispatchNonce}]), not in Inngest function-level config"

key-files:
  created:
    - lib/actions/attempt-outcome.ts
    - tests/unit/actions/attempt-outcome.test.ts
  modified:
    - lib/actions/recording.ts
    - lib/inngest/events.ts
    - lib/inngest/functions/transcribe-audio.ts
    - lib/inngest/functions/analyze-photos.ts
    - lib/inngest/functions/pipeline-watchdog.ts
    - tests/unit/inngest/transcribe-audio-job.test.ts
    - tests/unit/inngest/idempotency.test.ts

key-decisions:
  - "getAttemptOutcome auth failure (no claims / no active company) returns { state: 'unauthorized' } rather than 'pending' — this is a deliberate access-denial, not a transient read failure, so it doesn't share the try/catch's fail-to-pending path."
  - "createTextRecording's credit gate lives at the TOP of the `if (options?.autoGenerateEstimate)` block (not before the recording insert) — the description is still saved even when credits are insufficient; only the generate-estimate dispatch is blocked, matching the chained-hop gates in transcribe-audio.ts/analyze-photos.ts."
  - "startRecordingPipeline's checkCredits call reuses getAuthContext() directly (a second, redundant auth pass beyond createRecording/transcribeRecording's own internal calls) — simplest correct placement satisfying the plan's 'after auth + before createRecording/transcribe dispatch' ordering; assertWritable() running 2-3x per pipeline start is a no-op cost, not a correctness issue."
  - "checkCredits called directly with requireServiceClient() inside the transcribe-audio.ts/analyze-photos.ts chained-generate steps (no request-scoped client exists in a background job) — its plain `companies` select works unchanged against the service-role client, so no fallback minimal-balance-check was needed."
  - "Every NEW checkCredits call site wraps the call in try/catch, failing OPEN on exception — protects both production (a metering hiccup must never block a paying customer) and the pre-existing recording-early-return-events.test.ts fixture (which doesn't mock a `companies` table and would otherwise throw)."

requirements-completed: [QUICK-lyq-01, QUICK-lyq-02, QUICK-lyq-03]

# Metrics
duration: ~25min
completed: 2026-07-07
---

# Phase quick-260707-lyq Plan 01: Journal outcome action + real Retry + credit gates Summary

**Server-side journal-truth read (`getAttemptOutcome`), a genuinely re-runnable Retry via `dispatchNonce` (function-level Inngest idempotency removed), and Billing v2 credit gates on every server-owned generation dispatch path — closing the three gaps found live in production (ghost-estimate race, no-op Retry, unreachable credit check).**

## Performance

- **Duration:** ~25 min
- **Completed:** 2026-07-07
- **Tasks:** 3/3 completed
- **Files modified:** 9 (2 created, 7 modified)

## Accomplishments

- **`getAttemptOutcome(attemptId)`** (`lib/actions/attempt-outcome.ts`, new): reads `pipeline_events` (service client, company-scoped) and applies the exact journal rules from the plan's `<interfaces>` — completed/needs_details evaluated BEFORE failed, `completed` requires the succeeded event's `estimate_id` row to still exist (`is_current=true`), `failed` excludes `client_reported`. Never throws — degrades to `pending` on any read failure.
- **Real Retry**: `TranscribeAudioPayload` gained `dispatchNonce?: number`; `transcribeRecording`/`startRecordingPipeline` fold it into the dispatched event id as `-r${nonce}` (0/undefined keeps the legacy `transcribe-${recordingId}` id). `transcribe-audio.ts`'s function-level `idempotency: 'event.data.recordingId'` config was REMOVED — it was absorbing genuine user Retries for a full 24h, making the capture popup's Retry button a universal no-op.
- **Credit gates on every server-owned dispatch path**: `startRecordingPipeline` and `createTextRecording`'s auto-generate chain both call `checkCredits` (mirroring `app/api/analyze-photos/route.ts`'s exact call shape) before dispatch, journaling a failed `save_recording` event (`errorCode: 'insufficient_credits'`) and returning a friendly error on insufficient balance. The chained `dispatch-generate-estimate` steps inside `transcribe-audio.ts` and `analyze-photos.ts` gained the same gate (service client, `generate_estimate` step) — transcription/analysis itself still succeeds and stays; only the generate hop is skipped.
- **`pipeline-watchdog.ts`** header comment fixed: replaced the stale "the app already has a manual retry-transcription button (260521-jx9)" claim (that UI was deleted in commit `4727359f`) with the real recovery path — the capture popup's Retry (genuine re-run via `dispatchNonce`) plus the Telegram alert.

## Task Commits

Each task was committed atomically:

1. **Task 1: getAttemptOutcome server action** - `050be24e` (feat)
2. **Task 2: Real Retry (dispatchNonce) + credit gates + watchdog comment** - `522bd2c3` (feat)
3. **Task 3: Tests** - `46815440` (test)

_No plan-metadata commit yet — pending this SUMMARY + STATE.md update (per constraints, STATE/ROADMAP are NOT updated by this execution)._

## Files Created/Modified

- `lib/actions/attempt-outcome.ts` - New: `getAttemptOutcome` + exported `AttemptOutcome` union
- `tests/unit/actions/attempt-outcome.test.ts` - New: 10 tests (6 required rule cases + unauthenticated/never-throws + dispatchNonce event-id format)
- `lib/actions/recording.ts` - `transcribeRecording`/`startRecordingPipeline` gained `dispatchNonce`; both + `createTextRecording`'s chain gained the credit gate; shared `INSUFFICIENT_CREDITS_MESSAGE` constant
- `lib/inngest/events.ts` - `TranscribeAudioPayload.dispatchNonce?: number`
- `lib/inngest/functions/transcribe-audio.ts` - Removed function-level `idempotency` config (+ rationale comment); credit gate inside `dispatch-generate-estimate` step
- `lib/inngest/functions/analyze-photos.ts` - Credit gate inside `dispatch-generate-estimate` step (mirrors transcribe-audio.ts)
- `lib/inngest/functions/pipeline-watchdog.ts` - Header comment corrected (stale retry-button claim removed)
- `tests/unit/inngest/transcribe-audio-job.test.ts` - Updated for the removed idempotency config (deviation, see below)
- `tests/unit/inngest/idempotency.test.ts` - Updated: transcribeAudioJob excluded from the "has idempotency" contract, covered by its own negative assertion (deviation, see below)

## Exact Exported Signatures (for Wave 2)

```ts
// lib/actions/attempt-outcome.ts
export type AttemptOutcome =
  | { state: 'completed'; estimateId: string }
  | { state: 'needs_details' }
  | { state: 'failed'; step: string; reason: string }
  | { state: 'pending'; lastStep: string | null; lastStatus: string | null }
  | { state: 'unauthorized' }

export async function getAttemptOutcome(attemptId: string): Promise<AttemptOutcome>
```

```ts
// lib/actions/recording.ts
export async function startRecordingPipeline(input: {
  projectId: string
  storagePath?: string       // required when recordingId is absent
  durationSeconds?: number   // required when recordingId is absent
  recordingId?: string       // Retry: reuse the existing row
  attemptId: string
  requestId: string
  estimateLanguage?: 'en' | 'pt' | 'es'
  dispatchNonce?: number     // Retry: bump so the re-dispatch gets a new event id
}): Promise<{ data: { recordingId: string; transcribeJobId: string } } | { error: string }>

export async function transcribeRecording(
  recordingId: string,
  attemptId?: string,
  options?: {
    autoGenerateEstimate?: boolean
    requestId?: string
    estimateLanguage?: 'en' | 'pt' | 'es'
    dispatchNonce?: number   // folds into event id as `-r${dispatchNonce}`
  }
)
```

Wave 2 (client): call `startRecordingPipeline({ ..., recordingId, dispatchNonce: retryCount })` on Retry
(bump the nonce each retry), and poll `getAttemptOutcome(attemptId)` instead of the current
`pollEstimateOutcome` (`lib/estimate/poll-outcome.ts`) DB-truth-by-project-id watcher — the journal
read is authoritative where the project-scoped estimate poll can be fooled by the ghost-estimate race.

## Decisions Made

See `key-decisions` in frontmatter above (auth-failure → `unauthorized` not `pending`; credit-gate placement in `createTextRecording`; fail-open `checkCredits` wrapping; service-client reuse for the chained-hop gates).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] TS2322 `string | undefined` not assignable to `string` in `startRecordingPipeline`'s new auth early-return**
- **Found during:** Task 2
- **Issue:** `getAuthContext()`'s inferred return type (no explicit annotation) widens the `error` field to `string | undefined` once narrowed via `'error' in ctx` and checked against `startRecordingPipeline`'s explicit `Promise<{ error: string }>` return annotation — a known TS quirk reproduced and root-caused via a scratch type-probe file (not committed) rather than guessed. The exact same quirk is already documented in this file at `createRecording`'s/`transcribeRecording`'s error-forwarding call sites (see the "Reconstructed (not forwarded as-is)" comment, from `260707-hhp`).
- **Fix:** `return { error: ctx.error ?? 'Not authenticated' }` — the nullish fallback is unreachable at runtime (every `getAuthContext` branch always assigns a real message); matches the existing precedent in the same file.
- **Files modified:** `lib/actions/recording.ts`
- **Verification:** `npx tsc --noEmit` clean for this file (baseline 22 pre-existing errors unchanged, none in this file).
- **Committed in:** `522bd2c3` (Task 2 commit)

**2. [Rule 1 - Bug] Removing `transcribe-audio.ts`'s function-level idempotency broke 3 pre-existing tests**
- **Found during:** Task 2 (directly caused by the plan's own required change)
- **Issue:** `tests/unit/inngest/transcribe-audio-job.test.ts` (2 assertions) and `tests/unit/inngest/idempotency.test.ts` (1 assertion, looping over all 4 Inngest functions) asserted `transcribeAudioJob`'s `idempotency` config equals `'event.data.recordingId'` — an intentional, plan-mandated removal (the whole point of Task 2's dispatchNonce work) directly broke these assertions.
- **Fix:** Updated both files: `transcribe-audio-job.test.ts` now asserts `idempotency` is `undefined` (with updated rationale comments referencing 260707-lyq); `idempotency.test.ts` now scopes its "has idempotency" loop to the 3 functions that still have it (`generateEstimateJob`, `analyzePhotosJob`, `whatsAppProcessJob`) and adds a separate negative assertion for `transcribeAudioJob`.
- **Files modified:** `tests/unit/inngest/transcribe-audio-job.test.ts`, `tests/unit/inngest/idempotency.test.ts`
- **Verification:** `npx vitest run tests/unit/inngest/transcribe-audio-job.test.ts tests/unit/inngest/idempotency.test.ts` — both green (5/5 and 2/2 respectively after the fix).
- **Committed in:** `522bd2c3` (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (1 bug — TS widening workaround, 1 bug — stale test assertions after an intentional, plan-mandated behavior change)
**Impact on plan:** Both directly caused by (and necessary consequences of) the plan's own required changes. No scope creep — no unrelated files touched, no architectural changes.

## Issues Encountered

- The `createTextRecording`/`startRecordingPipeline` credit-gate additions had to be wrapped in try/catch (fail-open) specifically because the pre-existing `tests/unit/actions/recording-early-return-events.test.ts` fixture (read-only per this plan's constraints) does not mock a `companies` table — a raw, unwrapped `checkCredits` call would throw against that fixture's table-switch mock (`{}` returned for unmatched tables) and break 2 passing tests. Fail-open is also the more defensible production behavior (a metering-read failure should never wrongly block a paying customer), so this doubles as a deliberate design choice, not just a test workaround.
- `npx vitest run tests/unit/api/analyze-photos-dispatch.test.ts` intermittently failed one timing assertion (`elapsed < 1000ms` → measured 1181ms) when run as part of a large parallel batch; confirmed unrelated to this plan (that route was NOT touched — Task 2d was verify-only) and passes reliably in isolation. Not a regression.

## Known Stubs

None — this plan is server-only (no UI); no rendering path was touched.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Wave 2 (client) can now: (1) call `getAttemptOutcome(attemptId)` from the capture popup instead of / alongside `pollEstimateOutcome` for journal-truth outcome resolution; (2) wire the Retry button to `startRecordingPipeline({ ..., recordingId, dispatchNonce })`, bumping the nonce on each retry so Inngest actually creates a new run.
- `INSUFFICIENT_CREDITS_MESSAGE` in `lib/actions/recording.ts` is the canonical user-facing credit-exhaustion copy for both `startRecordingPipeline` and `createTextRecording` — Wave 2's UI can string-match or just render the returned `{ error }` verbatim.
- No DB migration required — this plan is pure application-code (no schema changes).

## Self-Check: PASSED

All created files verified present (`lib/actions/attempt-outcome.ts`, `tests/unit/actions/attempt-outcome.test.ts`); all 3 task commit hashes (`050be24e`, `522bd2c3`, `46815440`) verified in `git log`.

---
*Phase: quick-260707-lyq*
*Completed: 2026-07-07*
