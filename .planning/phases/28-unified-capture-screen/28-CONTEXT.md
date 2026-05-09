# Phase 28: Unified Capture Screen — Context

**Gathered:** 2026-05-09
**Status:** Ready for planning

<domain>
## Phase Boundary

Redesign the capture screen from an audio-only experience to a multi-modal input surface. Audio recorder stays dominant; text description and photo upload become co-equal alternatives. Generate Estimate button is always visible, enabled when any input is present.

**Phase 27 prerequisite already completed:**
- `recordings.storage_path` is nullable (can insert recording with null storage_path)
- `projects.client_id` is optional in schema (wizard step 1 has no required fields)
- `transcribeRecording` already guards against null storage_path
- `createRecording` requires `storagePath: string` — need a text-only variant

**Phase 29 context:** After this phase, users can create projects without audio and generate estimates from text or photos alone. Phase 29 removes the mandatory client step from the wizard and adds client linking UI.

</domain>

<decisions>
## Implementation Decisions

### D-01: Capture Screen Layout
- Full-screen capture shell unchanged (`app/(capture)/layout.tsx`, `app/(capture)/projects/[id]/capture/page.tsx`)
- Audio recorder stays as the dominant visual element — waveform, timer, circular progress ring remain unchanged
- **Text description** appears below waveform as a labeled `<textarea>` with `placeholder="Describe the job..."`
- **Photos section** below text — a compact button labeled "Add Photos" that opens a file input (reuses PhotoDropZone upload logic)
- **Generate Estimate button** pinned at bottom of body — `disabled` at idle, enabled when any input is present

### D-02: generate-estimate API — no changes needed
- Already checks `recordings.some(r => r.transcript)` AND `photos.some(p => p.ai_description)` 
- Passes transcripts + photoDescriptions to AI provider
- If user uploads photos without descriptions, the route returns 400 "At least one transcript or analyzed photo is required" — **this must be fixed in this phase**
- Solution: After photo upload on capture screen, trigger photo analysis (AI description generation) OR allow photos to trigger estimate generation with placeholder descriptions

### D-03: Text-only Recording Creation
- `createTextRecording(projectId, description)` server action — inserts recording row with `transcript: description, storage_path: null`
- No audio upload, no Whisper transcription — transcript is the typed description directly

### D-04: Photo Upload on Capture Screen
- Reuse `createPhoto` from `lib/actions/photo.ts` — already exists, works with `companyId + projectId`
- After upload, photos exist in `photos` table with `ai_description: null`
- For estimate generation with photos-only: need to either (a) add AI photo analysis step before generate, or (b) pass photos without descriptions to generate-estimate API and let AI analyze them during generation
- **Decision:** Pass photos without descriptions to generate-estimate API; the AI will process photo URLs from storage directly (Phase 28 scope does not include photo AI analysis — defer to future phase)

### D-05: generate-estimate API modification for photos-only path
- When photos exist with no `ai_description`, the current guard at line 79-81 `photos.some(p => p.ai_description)` blocks photos-only generation
- Fix: Change guard to also accept photos that exist in the DB (`photos.length > 0`) even without AI descriptions
- The AI provider (`lib/ai/index.ts`) will receive photo URLs and can analyze them directly

### D-06: Pipeline branching in capture-recorder.tsx
Current flow: audio blob → upload → createRecording → transcribe → generate-estimate
New flows:
1. **Audio path (existing):** audio blob → upload → createRecording → transcribe → generate
2. **Text path (new):** typed description → createTextRecording → generate
3. **Photos path (new):** photos uploaded → generate (no transcript needed if photos exist)
4. **Mixed path:** any combination → all inputs present → generate

Stage tracking: stages = ['saving', 'analyzing', 'generating'] for text/photos (no transcribing), ['saving', 'transcribing', 'analyzing', 'generating'] for audio
Or simpler: use same stages, skip 'transcribing' for non-audio paths

### D-07: Generate Estimate button placement and state
- Visible at all times (idle, recording, processing)
- `disabled` when: no audio blob, no typed description, and no photos uploaded
- `enabled` when: any one of those three is truthy
- For photos-only: photo upload happens via separate action, photos array state tracks them

### D-08: Photo state management in capture-recorder
- `photos: Photo[]` state (import from `@/lib/queries/photo`)
- Uploaded photos stored locally until generate — or uploaded immediately to DB
- Decision: Upload to DB immediately (same as current PhotoDropZone pattern) so `/api/generate-estimate` can find them
- `onPhotosUploaded` callback adds to local `photos` state for tracking

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Files to modify
- `components/capture/capture-recorder.tsx` — main UI, ~377 lines, add text/photo/button, rewire pipeline
- `app/api/generate-estimate/route.ts` — fix photos-only guard (line 79-81)
- `lib/actions/recording.ts` — add `createTextRecording` action

### Files to create
- `lib/actions/text-recording.ts` — new server action for text-only recordings
- New capture UI components as needed

### Existing patterns
- `lib/actions/photo.ts` — `createPhoto` action, reuse existing
- `components/workspace/photos/photo-drop-zone.tsx` — file processing logic, reuse upload pattern
- `components/capture/capture-stepper.tsx` — `STAGES`, `StageKey` types, label text
- `components/capture/capture-failure.tsx` — retry/edit-manually actions
- `CaptureRecorderProps` interface — project, companyId, projectId

### Estimate generation flow
- `app/api/generate-estimate/route.ts` — POST with `{ projectId }`, returns `{ estimateId, version }`
- Currently checks `recordings.some(r => r.transcript)` and `photos.some(p => p.ai_description)`
- Photos-only path blocked because `ai_description` is null after upload without analysis

</canonical_refs>

<code_context>
## Existing Code Insights

### CaptureRecorder — current structure

```
State:
  isRecording, audioBlob, elapsedMs, analyser  (audio)
  stage, failedAt, errorMessage, transcript, retriesUsed  (pipeline)
  
Pipeline (runPipeline):
  1. Upload audio to storage (storagePath = company/project/recordingId.ext)
  2. createRecording(projectId, storagePath, elapsed)
  3. transcribeRecording(recordingId)
  4. fetch /api/generate-estimate
  5. router.push to estimate tab

UI:
  - Header with project name + skip button
  - RecorderBody: waveform + timer + mic ring
  - CaptureStepper (when not idle/done)
  - CaptureFailure (when failedAt)
```

### What needs to change

1. **Add descriptionText state** — `useState<string>('')`
2. **Add photos state** — `useState<Photo[]>([])`
3. **Add hasAnyInput helper** — truthy when audioBlob OR descriptionText.trim() OR photos.length > 0
4. **Add text input** — `<textarea>` below waveform, placeholder, auto-resize
5. **Add photos section** — button "Add Photos" opens file input, processFiles adds to photos state
6. **Add GenerateEstimate button** — below body, disabled when !hasAnyInput
7. **Add generateFromText and generateFromPhotos** — new pipeline variants
8. **Fix generate-estimate route** — accept photos with no ai_description

### Photo upload reuse
- `PhotoDropZone.processFiles` already does: compress → upload to storage → call createPhoto → call onPhotosUploaded callback
- Can extract the file processing logic into a reusable `uploadPhotos(projectId, companyId, files)` helper
- Or wrap `PhotoDropZone` in a minimal shell within capture screen

### generate-estimate API — lines to change

Line 79-81 (current):
```typescript
const hasPhotoDescriptions = photos.some(
  (p) => p.ai_description && p.ai_description.trim().length > 0
)
if (!hasTranscripts && !hasPhotoDescriptions) {
  return NextResponse.json({ error: '...' }, { status: 400 })
}
```

Change to:
```typescript
const hasPhotos = photos.length > 0
if (!hasTranscripts && !hasPhotos) {
  return NextResponse.json({ error: '...' }, { status: 400 })
}
```

This allows photos-only generation. The AI provider can then process photo storage paths directly.

</code_context>

<specifics>
## Specific Ideas

- **Text description only:** No audio, no photos. User types description → Generate Estimate → API gets empty recordings, photos arrays → fails with current guard. **Must fix in Plan 01.**
- **Photos only:** Photos uploaded without AI descriptions → current guard blocks. **Must fix in Plan 01.**
- **Audio + text:** Both recorded and typed. Both transcripts and photos (if any) feed into generate. Works with minor pipeline tweaks.
- **Photo upload UI:** Instead of embedding full PhotoDropZone, create a lightweight `<input type="file" accept="image/*" multiple>` handler that mirrors PhotoDropZone's upload flow. Keep it minimal — just the button + upload logic.
- **Stage stepper for text/photos path:** Uses same CaptureStepper component with 'idle' → 'saving' → 'generating' (no 'transcribing' since no audio). Modify STAGES mapping or pass a filtered list.

</specifics>

<deferred>
## Deferred Ideas

- Photo AI description analysis (let AI describe photos during generate-estimate) — deferred to future phase
- Photo editing/captioning on capture screen — deferred to Phase 29
- Audio + text mixed pipeline optimization — implement as separate paths, not combined pipeline
- Camera capture directly on capture screen (vs. "Add Photos" button) — deferred to Phase 29
- Client detection toast (Phase 30) — separate phase, depends on Phase 28

</deferred>

---

*Phase: 28-unified-capture-screen*
*Context gathered: 2026-05-09*