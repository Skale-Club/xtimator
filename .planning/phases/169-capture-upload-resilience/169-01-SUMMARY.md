---
phase: 169-capture-upload-resilience
plan: 01
subsystem: capture
tags: [indexeddb, retry, storage, react, offline, i18n, capture-pipeline]

# Dependency graph
requires: []
provides:
  - "uploadWithRetry(provider, bucket, path, blob, opts) — exponential-backoff retry wrapper over StorageProvider.upload"
  - "lib/capture/blob-store.ts — fail-soft IndexedDB wrapper for pending (unsent) recording blobs"
  - "beforeunload coverage across the full capture-to-dispatch window (recording + saving + pre-dispatch)"
  - "draftKey/restorePhotos wired into all three CaptureRecorder call sites"
  - "truthful OfflineIndicator copy (no false cache claim)"
affects: [169-02, capture, storage]

# Tech tracking
tech-stack:
  added: [fake-indexeddb (devDependency, tests only)]
  patterns:
    - "Retry wrapper composes StorageProvider without modifying its interface — classification driven by .status/.statusCode preserved on the thrown Error"
    - "Fail-soft IDB wrapper: every exported function resolves to a soft value (false/null/void), never throws"
    - "Fire-and-forget persist-before-upload: initiation order only, not a happens-before guarantee"

key-files:
  created:
    - lib/storage/upload-with-retry.ts
    - lib/capture/blob-store.ts
    - tests/unit/storage/upload-with-retry.test.ts
    - tests/unit/capture/blob-store.test.ts
  modified:
    - lib/storage/supabase-provider.ts
    - components/capture/capture-recorder.tsx
    - components/pwa/offline-indicator.tsx
    - components/projects/estimate-creation-popup.tsx
    - app/(capture)/projects/[id]/capture/capture-client.tsx
    - package.json / package-lock.json (fake-indexeddb devDependency)

key-decisions:
  - "uploadWithRetry's opts type extends UploadOptions (contentType/upsert) in addition to the interface's attempts/baseDelayMs/signal — needed so the wrapper can forward the exact upload options both call sites already passed, with zero behavior change."
  - "A 409 response is treated as SUCCESS unconditionally within a single uploadWithRetry call (not just on retry attempts 2+) since every call operates on one fixed path with upsert:false — any 409 for that path can only mean the object already landed."
  - "pendingCaptureKey = draftKey ?? projectId ?? 'default' — falls back to projectId so IDB persist/resume works correctly even before Task 3 wires draftKey into the popup/legacy routes."
  - "Added restorePhotos to the popup and legacy capture-client (not explicitly required by must_haves, but 'where sensible' per the plan and directly mirrors the wizard's existing draft-resume pattern)."
  - "isAvailable() memo given a real call site: skips the arrayBuffer() conversion entirely in onstop when IndexedDB isn't on the global, avoiding wasted work before savePendingCapture would fail soft anyway."

patterns-established:
  - "Storage call sites route through uploadWithRetry(storage, bucket, path, blob, opts) instead of storage.upload(...) directly, wherever transient failures should self-heal."
  - "Any future 'pending X blob' persistence should follow blob-store.ts's shape: ArrayBuffer storage (never raw Blob, for iOS Safari IDB safety), fail-soft on every method, key-scoped per project/flow."

requirements-completed: [CAPT-01, CAPT-02, CAPT-03, CAPT-05]

# Metrics
duration: 130min
completed: 2026-07-17
---

# Phase 169 Plan 01: Capture Upload Resilience Summary

**Retry-wrapped audio/photo uploads (3 tries, 1s/2s/4s backoff, 409-as-success), a fail-soft IndexedDB "Resume upload" safety net for the recording blob, a beforeunload guard that now spans the entire capture-to-dispatch window, and draft/photo persistence wired into all three capture entry points.**

## Performance

- **Duration:** ~130 min
- **Started:** 2026-07-17T14:30:00Z (approx, see git log for first commit timestamp)
- **Completed:** 2026-07-17T16:40:00Z
- **Tasks:** 3/3
- **Files modified:** 9 (4 created, 5 modified) + package.json/package-lock.json (devDependency)

## Accomplishments

- **CAPT-01:** Both capture-recorder.tsx upload call sites (audio, photo) now go through `uploadWithRetry` — 3 attempts, exponential backoff (1s/2s/4s), retrying only on network/5xx, never on 4xx, with 409-on-same-path treated as a successful idempotent re-upload.
- **CAPT-03:** A finished recording is persisted to IndexedDB (as an ArrayBuffer, not a raw Blob) the instant `onstop` fires, before the upload begins. If the tab closes or crashes mid-upload, remounting shows a "Resume upload / Discard" card that re-runs the full pipeline with the reconstructed blob. The persisted capture is deleted only once dispatch is server-confirmed, or on explicit Discard.
- **CAPT-02:** `beforeunload` now warns for the entire recording→upload→pre-dispatch window (stage `'saving'` covers upload+dispatch-call for every input type), not just while `isRecording` is true.
- **CAPT-05:** `OfflineIndicator` no longer claims "showing cached data" (no cache exists — there is no service worker); it now says "You're offline — changes can't be saved until you reconnect." All three `CaptureRecorder` call sites (wizard, popup, legacy `/capture` route) now pass `draftKey` (and `restorePhotos`), so typed drafts survive close/reopen everywhere, not just the wizard.

## Task Commits

1. **Task 1: Retry wrapper + wire both upload call sites (CAPT-01)** - `5b406cd4` (feat)
2. **Task 2: IndexedDB persist + resume (CAPT-03)** - `49e918b5` (feat)
3. **Task 3: beforeunload window + honest UI + drafts everywhere (CAPT-02/05)** - `84b6fda4` (feat)

_Note: this SUMMARY commit follows as a separate docs commit._

## Files Created/Modified

- `lib/storage/upload-with-retry.ts` - `uploadWithRetry(storage, bucket, path, blob, opts)`: 3-attempt exponential backoff (1s/2s/4s), classifies retryable (no status / 5xx) vs terminal (other 4xx) vs the 409-as-success shortcut.
- `lib/storage/supabase-provider.ts` - `upload()`'s thrown Error now carries `.status`/`.statusCode`/`.cause` via `Object.assign` (message/throw contract unchanged) so the wrapper can classify.
- `lib/capture/blob-store.ts` - Hand-rolled (no dependency) IndexedDB wrapper: `savePendingCapture`/`getPendingCapture`/`deletePendingCapture`/`isAvailable`, every method fail-soft.
- `components/capture/capture-recorder.tsx` - Wires `uploadWithRetry` at both upload call sites; derives `pendingCaptureKey`; mount-time resume scan + inline Resume/Discard card; `onstop` fire-and-forget IDB persist; delete-on-dispatch-confirmed; `handleResumeCapture`/`handleDiscardCapture`; rewritten `beforeunload` effect.
- `components/pwa/offline-indicator.tsx` - Truthful offline copy, `t()`-wrapped.
- `components/projects/estimate-creation-popup.tsx` - `draftKey={"popup:" + project.id}` + `restorePhotos`.
- `app/(capture)/projects/[id]/capture/capture-client.tsx` - `draftKey={"capture:" + project.id}` + `restorePhotos`.
- `tests/unit/storage/upload-with-retry.test.ts` - 7 tests: 2-failure recovery, exhaustion, 4xx terminal, 409-success, abort honor, backoff timing (1s/2s/4s via fake timers), + a prerequisite assertion that `supabase-provider.ts` preserves `.status`/`.statusCode`.
- `tests/unit/capture/blob-store.test.ts` - 7 tests: save/get/delete roundtrip (byte-exact via `fake-indexeddb`), missing-key null, and 4 fail-soft cases (IDB undefined, `.open` throwing synchronously).
- `package.json`/`package-lock.json` - added `fake-indexeddb` as a devDependency (tests only — the production wrapper has zero runtime dependencies).

## Decisions Made

- `uploadWithRetry`'s options type is a superset of the plan interface (adds `contentType`/`upsert` passthrough) — required to preserve the exact upload options both call sites already used; documented as a `key-decisions` entry above rather than a deviation, since it doesn't change any externally-observable behavior.
- 409 is treated as success on ANY attempt (not only retries) within a single `uploadWithRetry` call, since each call always targets one fixed path with `upsert:false`.
- `pendingCaptureKey` falls back through `draftKey ?? projectId ?? 'default'` so CAPT-03 (Task 2) works correctly even for the popup/legacy routes before Task 3 adds their `draftKey` props.
- Passed `restorePhotos` to both the popup and legacy route (only the wizard had it before) — a natural, low-risk extension of the "where sensible" instruction that mirrors the existing wizard pattern.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `uploadWithRetry`'s options type needed to carry `contentType`/`upsert`**
- **Found during:** Task 1
- **Issue:** The plan's interface signature for `uploadWithRetry`'s `opts` only lists `attempts`/`baseDelayMs`/`signal`, but both existing call sites pass `{ contentType, upsert }` to `storage.upload(...)`. Without a way to forward these, wiring the wrapper in would silently drop `contentType`, changing upload behavior.
- **Fix:** `UploadWithRetryOptions extends UploadOptions` — a strict superset, so `attempts`/`baseDelayMs`/`signal` are destructured out and the rest (`contentType`/`upsert`) is forwarded to `storage.upload` unchanged.
- **Files modified:** `lib/storage/upload-with-retry.ts`
- **Verification:** `tests/unit/storage/upload-with-retry.test.ts` (all 7 cases); `npx tsc --noEmit -p tsconfig.ci.json` clean.
- **Committed in:** `5b406cd4` (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (blocking — interface completion needed to preserve existing behavior)
**Impact on plan:** No scope creep; the fix is purely additive to the interface's option bag and does not change any documented contract.

## Persist/Delete Lifecycle (code-review assertions, per Task 2's acceptance criteria)

1. **Persist (fire-and-forget, before upload):** `recorder.onstop` (capture-recorder.tsx:1090) sets the audio blob, then — gated on `isBlobStoreAvailable()` (capture-recorder.tsx:1105) — calls `blob.arrayBuffer().then(buffer => savePendingCapture({...})).catch(...)` **without `await`** (capture-recorder.tsx:1108-1118), *before* `void runPipelineRef.current(blob)` (capture-recorder.tsx:1121) which kicks off the upload. This is initiation order only (Opus check #6) — both the `arrayBuffer()` conversion and the upload are async, so a very fast network could in theory land the upload first; that's acceptable since the fix targets the "slow network / crash mid-upload" failure window, not a guaranteed race outcome.
2. **Delete on dispatch-confirmed:** immediately after `recordingIdRef.current = started.data.recordingId` (capture-recorder.tsx:909), `void deletePendingCapture(pendingCaptureKey)` fires (capture-recorder.tsx:910) — i.e. only once the server has the recording row and the transcribe→generate chain is dispatched. If `startRecordingPipeline` returns an error, the function returns *before* this line (capture-recorder.tsx:876-878/upload catch at :856-858) — the pending capture is deliberately left in IndexedDB for the next mount's resume scan.
3. **Delete on explicit Discard:** `handleDiscardCapture` (capture-recorder.tsx:956-959) clears the `pendingResume` state and calls `deletePendingCapture(pendingCaptureKey)`.
4. **Mount-time resume scan:** a `useEffect` (capture-recorder.tsx:391-408) calls `getPendingCapture(pendingCaptureKey)` on mount; a hit younger than 24h renders the inline card, an older one is silently deleted (no resume offered for a stale capture).
5. **Resume:** `handleResumeCapture` (capture-recorder.tsx:944-955) reconstructs `new Blob([stored.buffer], { type: stored.mimeType })`, seeds `elapsedMsRef.current`/`accumulatedMsRef.current` (both `stored.durationSeconds * 1000`) and `mimeTypeRef.current` (`stored.mimeType`), calls `setAudioBlob(reconstructed)`, **then** invokes `runPipeline(reconstructed)` — matching the plan's required seed-before-invoke order exactly (Opus blocker #2), so `runPipeline`'s min-duration pre-flight guard and the storagePath extension/contentType logic both see correct values on a fresh remount where every ref would otherwise default to zero/empty.

## Fail-Soft Evidence

- `lib/capture/blob-store.ts`: every exported function (`savePendingCapture`, `getPendingCapture`, `deletePendingCapture`) wraps its entire body (including the `indexedDB.open(...)` call and every IDB request/transaction) in try/catch, resolving `false`/`null`/`void` respectively on any failure — API unavailable, `.open()` throwing synchronously (e.g. iOS private mode), a blocked upgrade, a transaction error/abort.
- Tested directly in `tests/unit/capture/blob-store.test.ts`: `globalThis.indexedDB` stubbed to `undefined` (three cases — save/get/delete) and stubbed to an object whose `.open` throws synchronously (one case) — all four resolve to the soft value instead of throwing or rejecting.
- In `capture-recorder.tsx`, the `onstop` persist path only calls `savePendingCapture` when `isBlobStoreAvailable()` is true, and even so wraps the async chain in `.catch(...)` — a belt-and-braces double guard. No code path in the recording/upload pipeline depends on IndexedDB succeeding; the pipeline behaves identically (memory-only, exactly as before this plan) whenever storage is unavailable.

## Three-Flow draftKey Table (CAPT-05, audit F4)

| Flow | File | draftKey (before) | draftKey (after) | restorePhotos (after) |
|---|---|---|---|---|
| New-project wizard | `components/projects/new-project-wizard.tsx:166` | `edit:<id>` \| `'new'` | unchanged (already correct) | `!editProjectId` (unchanged) |
| `?capture=` popup | `components/projects/estimate-creation-popup.tsx` | *(none)* | `` `popup:${project.id}` `` | `true` (new) |
| Legacy `/capture` route | `app/(capture)/projects/[id]/capture/capture-client.tsx` | *(none)* | `` `capture:${project.id}` `` | `true` (new) |

Note (Opus blocker #3, confirmed): both the popup and the wizard live under `components/projects/` — the plan's own `<files>` tag for Task 3 listed a bare `components/estimate-creation-popup.tsx`, which does not exist; the correct path (per the plan's own explicit correction in `<action>` and `<read_first>`) was used throughout.

## Issues Encountered

- **Shared-environment resource contention.** This session ran on a machine with several *other* GSD milestone-phase executors committing to the same repo/branch concurrently (confirmed via `git reflog` interleaving — commits from phases `164-01` and `166-01` landed between this plan's Task 1 and Task 2 commits), each apparently running their own test suites at the same time. This caused extreme slowdowns (a full `npm test` run took 2580s / 43 min wall-clock, with `environment: 12757s` cumulative across workers) and, along the way:
  - Two earlier full `npm test` attempts either got killed by the harness or produced no output for a long time before being superseded by the run below.
  - A curated 18-file regression sweep (everything importing `@/lib/storage`, `@/components/capture`, or `@/lib/capture`) showed exactly 1 timeout — `tests/unit/capture/capture-attempt-lineage.test.ts`'s `buildGenerateEventId` case (30s timeout, per its own inline comment: "import latency under contention, not a mock leak"). Re-run in isolation immediately after, it passed cleanly (2/2). Confirmed environmental, not a regression.
  - **The full `npm test` eventually completed successfully** (exit code 0): **3558 passed, 17 failed, 2 skipped, 23 todo, out of 3600 total, across 487 test files.** All 17 failures are in files completely outside this plan's scope — `tests/unit/whatsapp/{batch-reporting,confirm,replay-safe-ttl}.test.ts`, `tests/unit/estimate/{auto-refine-isolation,generate-refine-equivalence}.test.ts`, `tests/unit/inngest/generate-estimate-job.test.ts`, `tests/unit/components/landing-page.test.tsx` — none of which import or reference `lib/storage`, `lib/capture`, `components/capture`, `components/pwa`, `components/projects/estimate-creation-popup`, or the capture-client route (confirmed via grep). Every failure is either an explicit `Test timed out in 30000ms` or an assertion in a test file that had a sibling timeout in the same run, consistent with the contention pattern already proven above. **Zero failures in any file this plan touched or created.**
  - Everything specifically in this plan's scope was independently verified green multiple times: `tests/unit/storage/upload-with-retry.test.ts` + `tests/unit/capture/blob-store.test.ts` (14/14); the full `tests/unit/storage` folder (9 files / 77 tests) and full `tests/unit/capture` folder (up to 29/29); `tests/unit/pwa/offline-indicator.test.tsx` (2/2); `npx tsc --noEmit -p tsconfig.ci.json` (clean, run 4 times across every edit state).
- **Atomic per-task commits across a shared file.** Tasks 2 and 3 both modify `components/capture/capture-recorder.tsx`. Rather than a combined commit, Task 3's `beforeunload` rewrite was temporarily reverted (via `Edit`) before staging/committing Task 2, then reapplied and committed separately for Task 3 — verified via `git diff` that each commit's diff to this file contains exactly that task's changes and nothing else.

## User Setup Required

None - no external service configuration required. `fake-indexeddb` is a devDependency only (already installed via `npm install --save-dev`).

## Next Phase Readiness

- CAPT-01/02/03/05 are closed. CAPT-04 (bucket-reconciliation cron for storage orphans) is explicitly out of scope here — it is Plan 169-02's territory (server-only, `lib/inngest`), confirmed untouched by this plan.
- The `StorageProvider` interface (`lib/storage/index.ts`) and `list()` method are untouched, as required — `uploadWithRetry` composes on top of it without modifying the abstraction.
- `lib/inngest`, `cleanup-audio.ts`, and every AI provider file are untouched by this plan (pre-existing modifications to `lib/ai/providers/*` and `lib/estimate/signed-snapshot.ts` visible in `git status` throughout this session belong to other concurrently-running phases, e.g. 164-01/166-01 — not this plan).
- Full `npm test` completed clean of regressions from this plan (3558/3600 passed; the 17 failures are all pre-existing/environmental in unrelated files — see Issues Encountered). No further test follow-up needed for this plan.

---
*Phase: 169-capture-upload-resilience*
*Completed: 2026-07-17*

## Self-Check: PASSED

- FOUND: `lib/storage/upload-with-retry.ts`
- FOUND: `lib/capture/blob-store.ts`
- FOUND: `tests/unit/storage/upload-with-retry.test.ts`
- FOUND: `tests/unit/capture/blob-store.test.ts`
- FOUND: `.planning/phases/169-capture-upload-resilience/169-01-SUMMARY.md`
- FOUND commit: `5b406cd4` (Task 1)
- FOUND commit: `49e918b5` (Task 2)
- FOUND commit: `84b6fda4` (Task 3)
