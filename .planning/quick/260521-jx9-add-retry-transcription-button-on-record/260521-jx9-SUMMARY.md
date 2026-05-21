---
phase: quick-260521-jx9
plan: 01
subsystem: workspace.audio
tags: [audio, transcription, inngest, retry, ux]
requires:
  - lib/actions/recording.ts::transcribeRecording (Phase 67 — returns { jobId })
  - hooks/use-job-status.ts::pollJob (Phase 67 — terminal status polling)
  - components/workspace/audio/transcript-editor.tsx (existing isTranscribing branch repaints on initialTranscript change)
provides:
  - "Retry transcription affordance on every recording row with an audio file (storage_path !== null)"
  - "Same dispatch+poll UX as audio-recorder.tsx initial transcription path"
affects:
  - components/workspace/audio/audio-tab.tsx
  - components/workspace/audio/recording-list.tsx
  - components/workspace/audio/recording-item.tsx
  - lib/i18n/translations.ts
tech_stack:
  added: []
  patterns:
    - "Dispatch+poll mirrored from audio-recorder.tsx lines 265-288: setTranscribingId(id) → transcribeRecording(id) → pollJob → handleTranscriptUpdate → finally setTranscribingId(null)"
    - "Lifted transcribingId state remains the single source of truth — RecordingItem stays presentational, no local isRetrying state"
key_files:
  created:
    - .planning/quick/260521-jx9-add-retry-transcription-button-on-record/deferred-items.md
  modified:
    - components/workspace/audio/audio-tab.tsx
    - components/workspace/audio/recording-list.tsx
    - components/workspace/audio/recording-item.tsx
    - lib/i18n/translations.ts
decisions:
  - "Retry handler lives in AudioTab (not RecordingItem) — keeps transcribingId as the canonical 'Transcribing...' source of truth for both the initial flow and the retry flow"
  - "Retry button hidden when recording.storage_path === null — text-only recordings cannot be transcribed (transcribeRecording short-circuits with 'This recording has no audio file to transcribe.')"
  - "No confirm dialog on retry — operation is idempotent (Inngest worker overwrites transcript); unlike delete which destroys data"
  - "Reused existing pollJob exception semantics (throws 'Job Failed'|'Job Cancelled') — toast.error fires for any non-AbortError from poll, matching audio-recorder.tsx exactly"
metrics:
  duration_seconds: 233
  tasks_completed: 2
  files_changed: 4
  completed: 2026-05-21
---

# Quick 260521-jx9: Add Retry Transcription Button on RecordingItem — Summary

One-liner: Added a per-row "Retry transcription" icon button (RotateCw) to RecordingItem, dispatching via the existing Phase 67 Inngest pipeline (transcribeRecording → pollJob) with no new server actions or API routes.

## Implementation

### `components/workspace/audio/audio-tab.tsx`

Added `handleRetryTranscribe` callback:

```ts
const handleRetryTranscribe = useCallback(
  async (recordingId: string): Promise<void> => {
    setTranscribingId(recordingId)
    const transcribeResult = await transcribeRecording(recordingId)
    if ('error' in transcribeResult) {
      setTranscribingId(null)
      toast.error(t('Transcription failed. You can retry from the recording.'))
      return
    }
    toast.info(t('Transcription queued...'))
    try {
      const controller = new AbortController()
      const output = (await pollJob(
        transcribeResult.data.jobId,
        controller.signal,
      )) as { transcript: string } | null
      if (output && typeof output.transcript === 'string') {
        handleTranscriptUpdate(recordingId, output.transcript)
      }
      toast.success(t('Recording transcribed successfully!'))
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        toast.error(t('Transcription failed. You can retry from the recording.'))
      }
    } finally {
      setTranscribingId(null)
    }
  },
  [handleTranscriptUpdate, t],
)
```

Imports added: `toast` from `sonner`, `transcribeRecording` from `@/lib/actions/recording`, `pollJob` from `@/hooks/use-job-status`, `useTranslation` from `@/lib/i18n/use-translation`.

Threaded into `<RecordingList onRetryTranscribe={handleRetryTranscribe} ... />`.

### `components/workspace/audio/recording-list.tsx`

Extended `RecordingListProps` with `onRetryTranscribe: (recordingId: string) => void | Promise<void>` and forwarded it to every `<RecordingItem ... />`.

### `components/workspace/audio/recording-item.tsx`

- Imported `RotateCw` from `lucide-react` alongside existing icons.
- Extended `RecordingItemProps` with `onRetryTranscribe`.
- Added local `handleRetry = useCallback(() => void onRetryTranscribe(recording.id), [onRetryTranscribe, recording.id])`.
- Wrapped the right-side controls in `<div className="flex items-center gap-1">`.
- Inserted a conditional `{recording.storage_path && <Button variant="ghost" size="icon" ... onClick={handleRetry} disabled={isTranscribing || isDeleting} aria-label={t('Retry transcription')} title={t('Retry transcription')}><RotateCw className="h-4 w-4" /></Button>}` before the Delete button.

### `lib/i18n/translations.ts`

Added `'Retry transcription'` key alongside the existing `'Retry'` entry:

- `pt`: `'Retry transcription': 'Tentar transcrição novamente'`
- `es`: `'Retry transcription': 'Reintentar transcripción'`

English uses the key directly via the project's i18n convention.

## Handler / Prop Summary

| Surface           | Name                  | Signature                                                |
| ----------------- | --------------------- | -------------------------------------------------------- |
| `AudioTab`        | `handleRetryTranscribe` | `(recordingId: string) => Promise<void>`               |
| `RecordingList`   | `onRetryTranscribe`   | `(recordingId: string) => void \| Promise<void>` (prop) |
| `RecordingItem`   | `onRetryTranscribe`   | `(recordingId: string) => void \| Promise<void>` (prop) |
| i18n             | `Retry transcription` | added to pt + es dictionaries                            |

## No Server-Side Changes

Confirmed: no edits to `lib/actions/recording.ts`, no new API routes, no DB migrations, no schema changes. The retry path is 100% client-side wiring on top of the existing Phase 67 (Inngest) infrastructure.

## Verification

- `npx tsc --noEmit` — passed (no output, exit 0).
- `npx eslint` on the four modified files — clean on `audio-tab.tsx`, `recording-list.tsx`, `translations.ts`. One pre-existing error reported on `recording-item.tsx` line 79 (`handleDelete` useCallback dependency mismatch) — present in HEAD before this task, untouched by the diff, logged to `deferred-items.md`.

## Deviations from Plan

None for Rules 1-3. All work executed as written.

Pre-existing lint issue on `handleDelete` in `recording-item.tsx` (missing `t` in deps array) was discovered but NOT auto-fixed — out of scope per GSD deviation rules' SCOPE BOUNDARY (issue not introduced by this task; lives outside the diff). Documented in `.planning/quick/260521-jx9-add-retry-transcription-button-on-record/deferred-items.md`.

## Authentication Gates

None.

## Known Stubs

None. All retry UI wires to real data:

- The Retry button is gated on real `recording.storage_path`.
- Dispatch goes through the real `transcribeRecording` server action.
- Polling consumes the real `/api/jobs/[jobId]` endpoint via `pollJob`.
- Transcript repaints from real `pollJob` output via the existing `handleTranscriptUpdate` chain.

## Commits

- `81e3c0f` — feat(quick-260521-jx9): wire retry-transcribe handler in AudioTab and thread to RecordingList
- `4cacf98` — feat(quick-260521-jx9): render Retry transcription icon button on RecordingItem

## Self-Check: PASSED

Verified all 4 modified source files, both new docs files (SUMMARY.md + deferred-items.md), and both per-task commit hashes exist on the branch:

- FOUND: components/workspace/audio/audio-tab.tsx
- FOUND: components/workspace/audio/recording-list.tsx
- FOUND: components/workspace/audio/recording-item.tsx
- FOUND: lib/i18n/translations.ts
- FOUND: .planning/quick/260521-jx9-add-retry-transcription-button-on-record/260521-jx9-SUMMARY.md
- FOUND: .planning/quick/260521-jx9-add-retry-transcription-button-on-record/deferred-items.md
- FOUND commit: 81e3c0f
- FOUND commit: 4cacf98
