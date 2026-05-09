---
phase: 28-unified-capture-screen
plan: 01
subsystem: ui
tags: [capture, multi-modal, audio, photos, text, ai-estimate]

# Dependency graph
requires:
  - phase: 27-capture-schema-migration
    provides: nullable storage_path, optional client_id
provides:
  - Generate Estimate accepts photos without ai_description (text-only + photos-only paths)
  - createTextRecording server action (storage_path=null, transcript=text)
  - Multi-modal capture UI: description textarea, Add Photos button, Generate button
  - Generate button disabled at empty, enabled when any input present
affects: [29-frictionless-creation, 30-ai-client-extraction]

# Tech tracking
tech-stack:
  added: []
  patterns: [text-only recording creation, photo upload inline in capture, unified generation handler]

key-files:
  created: []
  modified:
    - app/api/generate-estimate/route.ts
    - lib/actions/recording.ts
    - components/capture/capture-recorder.tsx

key-decisions:
  - "Photos without ai_description pass generate-estimate guard — AI provider receives photo URLs directly"
  - "Text-only path skips transcribing stage — directly to generating"
  - "Generate button always visible, disabled when no inputs — unified surface"

patterns-established:
  - "Text-only recording: createTextRecording(projectId, description) with storage_path=null"
  - "hasAnyInput helper: !!audioBlob || descriptionText.trim().length > 0 || uploadedPhotos.length > 0"

requirements-completed: [CAPTURE-01, CAPTURE-02, CAPTURE-04]

# Metrics
duration: 8min
completed: 2026-05-09
---

# Phase 28 Plan 01: Unified Capture Screen Summary

**Multi-modal capture screen: text description, photo upload, and Generate Estimate button as alternatives to audio recording**

## Performance

- **Duration:** 8 min
- **Started:** 2026-05-09T17:32:19Z
- **Completed:** 2026-05-09T17:40:00Z
- **Tasks:** 3
- **Files modified:** 3

## Accomplishments

- Fixed generate-estimate API guard to accept photos without ai_description (text-only + photos-only paths now work)
- Added createTextRecording server action for text-only recordings (storage_path=null, transcript=description)
- Multi-modal capture UI: description textarea, Add Photos button, and Generate Estimate button all present
- Generate button correctly disabled at empty state and enabled when any input (audio, text, or photos) is present

## Task Commits

1. **Task 1: Fix generate-estimate API guard** - `ba4df93` (feat)
2. **Task 2: Add createTextRecording server action** - `ba4df93` (feat)
3. **Task 3: Multi-modal capture UI** - `ba4df93` (feat)

All 3 tasks committed together in single commit.

## Files Created/Modified

- `app/api/generate-estimate/route.ts` - Changed prerequisite guard from `hasPhotoDescriptions` (requires ai_description) to `hasPhotos` (photos.length > 0)
- `lib/actions/recording.ts` - Added createTextRecording function with storage_path=null, transcript=description
- `components/capture/capture-recorder.tsx` - Added: descriptionText state, uploadedPhotos state, photo upload handler, handleGenerate, Generate button in UI

## Decisions Made

- Photos without ai_description pass generate-estimate guard — AI provider receives photo URLs and can analyze them directly
- Text-only path skips transcribing stage — goes directly from description to generating
- Skip button hidden when any input present (not just when no audioBlob)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None - encountered no problems during implementation.

## Next Phase Readiness

- Phase 28-01 complete: Capture screen is now multi-modal
- Phase 29 can proceed: Projects can be created without audio and estimates generated from text/photos
- Phase 30 can build on this: AI client extraction will have working multi-modal input to work with

---
*Phase: 28-unified-capture-screen*
*Completed: 2026-05-09*