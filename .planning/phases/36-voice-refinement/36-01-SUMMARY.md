---
phase: 36-voice-refinement
plan: "01"
subsystem: estimate-editor
tags: [REFINE-04, voice, refinement, whisper, transcription]
dependency_graph:
  requires: []
  provides:
    - path: "components/workspace/estimate/voice-refine-recorder.tsx"
      provides: "Inline voice recorder (~30s cap, waveform, transcribing state)"
    - path: "app/api/estimates/[id]/refine/voice/route.ts"
      provides: "Voice refinement API: transcribes via Whisper, creates new estimate version"
  affects:
    - "components/workspace/estimate/refine-estimate-panel.tsx"
    - "app/api/estimates/[id]/refine/route.ts"
tech_stack:
  added: []
  patterns:
    - "MediaRecorder + AudioContext + AnalyserNode for waveform visualization"
    - "getSupportedAudioMimeType for cross-browser audio format support"
    - "FormData upload to Supabase Storage for Whisper transcription"
    - "VoiceRefineRecorder as collapsible section within text refinement panel"
key_files:
  created:
    - "components/workspace/estimate/voice-refine-recorder.tsx"
    - "app/api/estimates/[id]/refine/voice/route.ts"
  modified:
    - "components/workspace/estimate/refine-estimate-panel.tsx"
decisions:
  - "VoiceRefineRecorder uses 30s hard cap (vs 10min in capture-recorder) for short instruction capture"
  - "Voice recorder lives in collapsible section below textarea, expands on 'Or record your instruction' click"
  - "Voice path calls /api/estimates/[id]/refine (text pipeline) after transcription, not the voice API directly — keeps version management in one place"
  - "Storage cleanup is non-blocking (cleanupPromise.catch(() => {})) after Whisper transcription"
metrics:
  duration: 145s (~2.4min)
  completed: "2026-05-09T22:43:45Z"
  tasks: 3
  files: 4
---

# Phase 36 Plan 01: Inline Voice Recorder for Refinement Panel — Summary

One-liner: Inline voice recorder (~30s cap, waveform, Whisper transcription) wired into the estimate refinement panel — speech-to-refined-estimate in one tap.

## What Was Built

### 1. VoiceRefineRecorder Component
**File:** `components/workspace/estimate/voice-refine-recorder.tsx`

Compact voice recorder designed for short instruction capture inside the refinement panel:
- **30-second hard cap** with live elapsed timer (`Xs / 30s`)
- **WaveformVisualizer** integration for real-time audio level display (same `AnalyserNode` pattern as capture-recorder)
- **3 states:** `idle` → `recording` → `transcribing`
- **Auto-stops** at 30s via `setInterval` tick tracking `performance.now()`
- **Cross-browser MediaRecorder support** via `getSupportedAudioMimeType()`
- **Permission denial handling** with targeted toast errors (`NotAllowedError` vs `NotFoundError`)
- **Sends audio blob to `/api/estimates/{id}/refine/voice`** via `FormData`
- **Returns transcript via `onRecorded` callback** after successful transcription

### 2. Voice Refinement API Route
**File:** `app/api/estimates/[id]/refine/voice/route.ts`

Endpoint: `POST /api/estimates/[id]/refine/voice`

Full pipeline from audio blob to new estimate version:
1. **Auth check** via `getClaims()` + company lookup
2. **Estimate validation** via `getEstimateById`, ownership + `is_current` checks
3. **Audio validation** from `FormData` (`audio` field, size > 0, `audio/*` type)
4. **Storage upload** to `{companyId}/refine-voice/{estimateId}-{timestamp}.webm` via service role client
5. **Whisper transcription** via `https://api.openai.com/v1/audio/transcriptions` with `whisper-1` model
6. **Storage cleanup** (non-blocking) after transcription
7. **RefineEstimate pipeline** — exact same AI provider call + version management as text refinement
8. **Returns** `{ success, newVersion, estimateId, transcript }`

Uses `requireServiceClient()` for non-nullable service role client.

### 3. RefineEstimatePanel Integration
**File:** `components/workspace/estimate/refine-estimate-panel.tsx`

Voice input toggled as a collapsible section:
- **"Or record your instruction"** link below textarea expands the voice recorder section
- **VoiceRefineRecorder** renders inside dashed-border container with collapse chevron
- **`onRecorded` callback** receives transcript, calls `/api/estimates/{id}/refine` (text pipeline)
- **Mirrors loading/success/error pattern** as text refinement: `setIsLoading(true)` → spinner → `toast.success` → `router.refresh()`
- **Disabled while `isLoading`** to prevent double-submission
- **Collapses on success** (`setVoiceExpanded(false)`) alongside panel close

## Verification Checklist

- [x] VoiceRefineRecorder file exists with correct props interface
- [x] ~30s cap (MAX_DURATION_MS = 30000) with auto-stop
- [x] WaveformVisualizer renders during recording
- [x] Transcribing state shows Loader2 spinner
- [x] Voice refinement API route file exists at correct path
- [x] Route receives FormData with audio, validates blob
- [x] Route transcribes via Whisper, returns transcript
- [x] Route creates new estimate version via same pipeline as text refinement
- [x] VoiceRefineRecorder imported in refine-estimate-panel.tsx
- [x] Voice recorder renders in collapsible section below textarea
- [x] `onRecorded` callback wired to refinement API
- [x] Success path mirrors text refinement (toast, router.refresh)

## Commits

| Hash | Message | Files |
|------|---------|-------|
| `83b81a7` | feat(36-voice-refinement): add VoiceRefineRecorder component for inline voice refinement | `voice-refine-recorder.tsx` |
| `0602d29` | feat(36-voice-refinement): add POST /api/estimates/[id]/refine/voice route | `route.ts` |
| `4eee7ff` | feat(36-voice-refinement): wire VoiceRefineRecorder into RefineEstimatePanel | `refine-estimate-panel.tsx` |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Removed unused cleanup code from VoiceRefineRecorder**
- **Found during:** Task 1
- **Issue:** `stopRecording` and `setIsRecording` were defined but never wired; dead code caused `setIsRecording` to reference an undefined variable
- **Fix:** Removed unused `stopRecording` callback, `isRecording` constant, and `setIsRecording` helper — all recording state managed via `recordingState` enum directly
- **Commit:** `83b81a7`

**2. [Rule 3 - Blocking] TypeScript error — serviceClient possibly null**
- **Found during:** Task 2
- **Issue:** `createServiceClient()` returns `null` when env vars absent; TypeScript flagged 5 usages as "possibly null"
- **Fix:** Switched to `requireServiceClient()` which is non-nullable and throws at runtime if env vars are missing (appropriate for API routes at runtime)
- **Commit:** `0602d29`

## Success Criteria

**Status: ✅ COMPLETE**

User can tap the mic, speak "Add gutter cleaning", and see the estimate updated to v+1 with gutter cleaning added — same result as typing "Add gutter cleaning" in the text field.
