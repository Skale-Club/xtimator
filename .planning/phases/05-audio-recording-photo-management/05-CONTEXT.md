# Phase 5: Audio Recording & Photo Management - Context

**Gathered:** 2026-04-10
**Status:** Ready for planning

<domain>
## Phase Boundary

Job-site media capture: audio recording with waveform visualization and live transcript preview, Whisper API transcription with editable results, multi-photo upload with camera capture on mobile, client-side compression, grid display with lightbox/captions/reorder/delete, 20-photo limit. All media stored in Supabase Storage. This phase replaces the placeholder Audio and Photos tabs in the workspace.

</domain>

<decisions>
## Implementation Decisions

### Audio Recording
- **D-01:** Audio tab replaces the PlaceholderTab in `project-workspace.tsx`. The component is a client component using `navigator.mediaDevices.getUserMedia()` with `MediaRecorder` API.
- **D-02:** Large circular mic button as primary CTA. When recording: button pulses red, MM:SS timer counts up (AUDIO-02), waveform visualization animates below (Web Audio API AnalyserNode, AUDIO-03).
- **D-03:** Web Speech API (`SpeechRecognition`) provides live transcript preview during recording (AUDIO-04). This is best-effort — only works in Chrome/Edge. On unsupported browsers, show "Live preview not available" message. The real transcript comes from Whisper.
- **D-04:** Recording format: `audio/webm;codecs=opus` as first choice (smallest file, supported on Chrome/Edge/Android). Fallback to `audio/mp4` for iOS Safari. Check `MediaRecorder.isTypeSupported()` at runtime.
- **D-05:** Controls: Start/Stop toggle on the mic button. After stop: Play, Delete, Re-record buttons appear below the waveform. Delete removes the recording. Re-record overwrites.
- **D-06:** Multiple recordings per project (AUDIO-09). Each recording is a separate row in the `recordings` table. UI shows a list of recordings with play/delete per item, plus "New Recording" button.

### Whisper Transcription Pipeline
- **D-07:** On recording stop: (1) upload audio blob to Supabase Storage `audio` bucket at `{companyId}/{projectId}/{recordingId}.webm`, (2) insert recording row in DB, (3) call server action that sends the file to OpenAI Whisper API, (4) persist transcript to `recordings.transcript`, (5) display below recorder.
- **D-08:** Server action `transcribeRecording` in `lib/actions/recording.ts` downloads audio from Storage using service role key, sends to Whisper API (`POST https://api.openai.com/v1/audio/transcriptions` with model `whisper-1`), updates the recording row.
- **D-09:** Transcript is displayed in a `<Textarea>` — user can edit manually (AUDIO-07). Edits saved via debounced server action `updateTranscript`.
- **D-10:** While transcription is processing, show a loading spinner with "Transcribing..." text. If Whisper fails, show error with retry button.

### Photo Upload & Management
- **D-11:** Photos tab replaces the PlaceholderTab. Uses a drop zone component with `<input type="file" accept="image/*" multiple>` for file selection and `capture="environment"` for mobile camera (PHOTO-02).
- **D-12:** Drag-and-drop zone on desktop (PHOTO-03) using native HTML5 drag events (no library needed). Shows dashed border area with "Drop photos here" text.
- **D-13:** Client-side compression before upload: use `canvas.drawImage()` + `canvas.toBlob()` to resize to max 2000px width while maintaining aspect ratio (PHOTO-11). Quality 0.85 for JPEG.
- **D-14:** Photo grid: responsive grid (2 cols mobile, 3-4 cols desktop). Each thumbnail shows the image with a caption overlay at bottom and delete icon at top-right corner (PHOTO-04, PHOTO-06).
- **D-15:** Full-size lightbox on tap/click (PHOTO-05): use shadcn/ui Dialog with the full image inside. Navigation arrows for prev/next.
- **D-16:** Caption editing (PHOTO-08): click caption area on the thumbnail card to edit inline. Saved via debounced server action.
- **D-17:** Reorder via drag-and-drop (PHOTO-07): use `@dnd-kit/core` + `@dnd-kit/sortable` for the photo grid. Updates `sort_order` on each photo row.
- **D-18:** 20-photo maximum enforced client-side (PHOTO-10). If user tries to upload beyond 20, show toast error "Maximum 20 photos per project".
- **D-19:** Photos stored in `photos` bucket at `{companyId}/{projectId}/{photoId}.jpg`. Insert row in `photos` table with `storage_path`, `sort_order`, and optional `caption`.

### Project Status Updates
- **D-20:** After first recording is saved, update project status from 'draft' to 'recording'. After first photo is uploaded, update to 'photos_added' (if not already further along). Log activity events for both.

### Claude's Discretion
- Exact waveform visualization style (bars vs line vs circular)
- Waveform colors and animation timing
- Exact lightbox transition animation
- Photo grid gap spacing and thumbnail aspect ratio
- Whether to show recording duration on the recordings list
- Drag-and-drop visual feedback style (ghost, opacity, etc.)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project Requirements
- `.planning/REQUIREMENTS.md` — AUDIO-01 through AUDIO-10, PHOTO-01 through PHOTO-11
- `.planning/PROJECT.md` — Tech stack constraints (Whisper API, mobile browser support)

### Prior Phase Context
- `.planning/phases/04-project-creation-workspace/04-CONTEXT.md` — Workspace tab structure, project queries
- `.planning/phases/03-dashboard-client-management/03-CONTEXT.md` — App shell, data layer conventions

### Database Schema
- `supabase/migrations/20260409000001_initial_schema.sql` — `recordings` table (project_id, company_id, storage_path, duration_seconds, transcript), `photos` table (project_id, company_id, storage_path, caption, ai_description, sort_order), Storage bucket configs (audio: 50MB webm/mp4/mpeg/ogg/wav, photos: 10MB jpeg/png/webp/gif), company-scoped RLS policies

### Existing Code
- `components/workspace/project-workspace.tsx` — Tab structure where Audio/Photos tabs replace PlaceholderTab
- `components/workspace/placeholder-tab.tsx` — Placeholder to be replaced
- `lib/queries/project.ts` — getProjectById, getProjectQuickStats (counts recordings/photos)
- `lib/actions/project.ts` — Server action pattern with getAuthContext
- `lib/supabase/client.ts` — Browser-side Supabase client for Storage uploads
- `lib/supabase/server.ts` — Server-side Supabase client for Whisper pipeline
- `app/(app)/projects/[id]/page.tsx` — Workspace page server component

### Roadmap
- `.planning/ROADMAP.md` §Phase 5 — Plan descriptions, success criteria

No external specs — requirements fully captured in decisions above and REQUIREMENTS.md.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `components/workspace/project-workspace.tsx` — Already has Audio/Photos TabsTrigger + TabsContent (replace PlaceholderTab)
- `lib/supabase/client.ts` — Browser Supabase client for Storage uploads (used in onboarding logo upload)
- `components/onboarding/logo-uploader.tsx` / `components/clients/client-logo-uploader.tsx` — File upload pattern reference
- `lib/actions/project.ts` — `getAuthContext()` helper for auth in server actions
- All shadcn/ui components: Dialog (lightbox), Textarea (transcript), Button, Card, Progress, Skeleton

### Established Patterns
- getClaims() / getAuthContext() for auth
- Server actions in `lib/actions/` for mutations
- Queries in `lib/queries/` for data fetching
- Browser-side Supabase Storage upload (established in Phase 2 logo upload)
- Storage path: `{companyId}/{...scoped path}` (first segment = company_id for RLS)
- Toast notifications via sonner for errors/success

### Integration Points
- `components/workspace/project-workspace.tsx` — Replace PlaceholderTab imports with real Audio/Photos components
- `lib/queries/project.ts` — getProjectQuickStats already counts recordings/photos (will show real numbers after this phase)
- `estimate_activity` table — Log recording/photo events for the activity timeline
- `OPENAI_API_KEY` env var needed for Whisper API calls (server-side only)

</code_context>

<specifics>
## Specific Ideas

- Storage buckets and RLS policies already exist from Phase 1 migration — no new migration needed
- The `photos.ai_description` column will be populated in Phase 6 when Claude Vision analyzes photos — leave null for now
- `@dnd-kit/core` and `@dnd-kit/sortable` need to be installed for photo reorder drag-and-drop
- iOS Safari doesn't support MediaRecorder with webm — must use `audio/mp4` fallback
- Web Speech API for live preview is Chrome/Edge only — graceful degradation required
- OPENAI_API_KEY must be added to `.env.local` for Whisper API

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 05-audio-recording-photo-management*
*Context gathered: 2026-04-10*
