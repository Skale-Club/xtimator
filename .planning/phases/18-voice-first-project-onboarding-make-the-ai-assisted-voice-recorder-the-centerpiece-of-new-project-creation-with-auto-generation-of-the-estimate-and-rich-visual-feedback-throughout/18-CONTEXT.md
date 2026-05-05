# Phase 18: Voice-First Project Onboarding - Context

**Gathered:** 2026-05-05
**Status:** Ready for planning

<domain>
## Phase Boundary

Restructure new-project creation so the AI voice recorder is the first surface a user sees, with auto-fire AI estimate generation, rich multi-stage progress feedback, and a 10-minute hard cap optimized for Whisper + Claude.

In scope: wizard reduction, `/projects/[id]/capture` route + full-screen layout, recorder visual upgrade, multi-stage progress stepper, auto-fire AI generation, failure/recovery UX, scheduled cleanup of orphan drafts.

Out of scope: refactoring the existing workspace tabs, photo upload UX changes, estimate editor regeneration UX, cross-browser parity for the Web Speech live preview.

</domain>

<decisions>
## Implementation Decisions

### Project Creation & Routing
- **D-01:** Eager project creation. `createProjectAction` runs on client-step submit; project row inserted with `status='draft'` before recorder loads. Recorder always has a valid `project_id` — no refactor of `lib/actions/recording.ts` needed.
- **D-02:** Recorder lives at `/projects/[id]/capture` with its own full-screen layout that escapes the app shell sidebar/topbar. Bookmarkable URL; back button returns to the client step.
- **D-03:** Scheduled cleanup job removes orphan draft projects (status='draft', 0 recordings, no estimate, created_at older than 24h). Implementation choice (pg_cron vs Supabase scheduled edge function vs Vercel cron) deferred to planner; Claude's discretion.

### Wizard Reduction
- **D-04:** New-project wizard reduces from 3 steps to 1 step: client only (existing or inline-created). Project name, type, and target_budget are removed from the wizard entirely — populated post-recording or kept editable in the estimate editor.
- **D-05:** Project name comes from AI. Extend the `generate-estimate` tool_use schema so Claude returns a suggested name (e.g. "Smith Bathroom Remodel") alongside sections/items. User edits the name in the estimate editor.

### Recording Surface
- **D-06:** 10-minute hard cap on recording, optimized for Whisper (≤5MB upload, ~$0.06/recording) and Claude (≤2K transcript tokens). Auto-stop fires at 10:00 with toast.
- **D-07:** Visible timer with color escalation: neutral 0:00–8:00 → amber 8:00–9:30 → red 9:30–10:00. Visual warning at 9:00 (60s remaining) plus toast.
- **D-08:** Visual feedback during recording: full-width waveform (existing `WaveformVisualizer` expanded), circular progress ring around the mic button (SVG stroke-dasharray), pulse on the surrounding card when active.
- **D-09:** Photos are NOT captured on the `/capture` screen. Voice-only first pass; photos remain accessible via the existing Photos tab in the workspace after estimate generation. Editor-side regeneration with photos is deferred.

### AI Processing Feedback
- **D-10:** Multi-stage progress stepper replaces the current `Loader2` spinner. Stages: (1) Saving recording → (2) Transcribing → (3) Analyzing → (4) Generating estimate. Each stage has an animated active state and a checkmark on completion. Global progress bar at top advances per stage.
- **D-11:** Whisper transcript is revealed in the stepper UI as soon as transcription completes, giving the user something to read while estimate generation runs (5–15s).
- **D-12:** Estimate generation auto-fires when the transcript is ready — no manual "Generate" click in the capture flow. On success, redirect to the estimate editor with the populated draft.
- **D-13:** Stage transitions are driven client-side by sequencing existing server actions (`createRecording` → `transcribeRecording` → `POST /api/generate-estimate`) with `setStage()` calls between awaits. No SSE/streaming required for Phase 18.

### Failure & Recovery
- **D-14:** On stage failure, the stepper shows the failed stage with a "Retry" button (max 2 retries). After 2 failures or user click on "Edit manually", redirect to the empty estimate editor with the recording attached; project preserved with `status='draft'`.
- **D-15:** Empty transcript is treated as a failure case with explicit copy: "We couldn't catch your description — please try again or edit manually."

### Escape Hatch
- **D-16:** "Skip recording" button on the `/capture` screen routes the user to `/projects/[id]` (Overview tab) for manual entry via existing workspace tabs.

### Mobile
- **D-17:** Full-screen recorder works on iOS Safari and Android Chrome. Mic button is thumb-reachable (bottom third of viewport on small screens). Timer and progress ring remain readable at 320px width.

### Claude's Discretion
- Specific cleanup mechanism (pg_cron vs Supabase edge function vs Vercel cron) — planner picks based on existing infra.
- Visual treatment details (stroke widths, animation easing, exact microcopy) — planner / UI spec.
- Toast library defaults to `sonner` (already in use).
- Cancel-mid-recording UX (discard vs save partial).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Existing code (must read)
- `components/workspace/audio/audio-recorder.tsx` — current recorder with timer, waveform, MediaRecorder + Whisper flow. Phase 18 refactors this.
- `components/workspace/audio/waveform-visualizer.tsx` — existing waveform; extend to full-width.
- `lib/actions/recording.ts` — `createRecording`, `transcribeRecording` server actions used by the recorder. Don't change signatures unless necessary.
- `app/api/generate-estimate/route.ts` — current AI generation endpoint with Claude tool_use. Phase 18 extends the tool schema to return a suggested project name (D-05).
- `app/(app)/projects/new/page.tsx` — wizard entry point being reduced to 1 step.
- `components/projects/new-project-wizard.tsx` — current wizard component to be refactored.
- `components/projects/step-client-select.tsx` — first step, kept as-is.
- `components/projects/step-project-details.tsx`, `step-confirmation.tsx` — removed from the new-project flow.
- `lib/actions/project.ts` — `createProjectAction` returns project id; called eagerly after client step.
- `lib/schemas/project.ts` — schema reduced to client-only fields for the wizard.
- `lib/industries.ts` — `INDUSTRIES.projectTypes` still used by the editor (not the wizard).
- `components/workspace/overview-tab.tsx` — destination of the "Skip recording" escape hatch.
- `lib/utils/media-format.ts` — `formatDuration`, `getSupportedAudioMimeType`, `getFileExtension` already handle MM:SS and Safari quirks.

### Patterns to follow
- Server actions return `{ data, error }` discriminated unions.
- Toasts use `sonner` (`import { toast } from 'sonner'`).
- Recordings upload to `audio/${companyId}/${projectId}/${recordingId}.${ext}` with `crypto.randomUUID()` ids.
- AI generation uses `tool_use` with `tool_choice: { type: 'tool', name: 'create_estimate' }`.

### Project specs
- `.planning/PROJECT.md` — core value: "Business owner → job site audio recording → sent professional estimate in under 5 minutes". Phase 18 directly serves this.
- `.planning/STATE.md` — Phase 18 entry under Roadmap Evolution explains the rationale.
- `.planning/ROADMAP.md` — Phase 18 goal + 9 success criteria.

### External docs
- OpenAI Whisper API limits: 25MB upload, $0.006/minute (drives D-06).
- Anthropic Claude `tool_use` schema — extend the existing `create_estimate` tool with a `name` field for D-05.
- Web MediaRecorder API + AnalyserNode (already used in audio-recorder.tsx).

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable assets
- `audio-recorder.tsx` (387 lines) already has: per-second timer, waveform via AnalyserNode, mic button with pulse, live Web Speech preview (Chrome/Edge only), upload + transcribe sequence. Most machinery is reusable; the visual treatment and time-cap logic are new work.
- `waveform-visualizer.tsx` — AnalyserNode-driven canvas; scales to full-width via prop or CSS.
- shadcn/ui `Card`, `Button`, `Skeleton` already used in workspace; reuse for stepper UI.
- `sonner` toasts everywhere — no toast library decision needed.

### Established patterns
- Server actions: `{ data } | { error }` discriminated union return.
- Auth: `getAuthContext` server helper duplicated in `lib/actions/recording.ts` (treat as known pattern).
- AI gating: `app/api/generate-estimate/route.ts` requires ≥1 transcript OR ≥1 photo with `ai_description`. Phase 18 satisfies the transcript path on first pass.
- Mobile: Phase 5 verified MediaRecorder works on iOS Safari + Android Chrome.

### Integration points
- Wizard submit → `createProjectAction` → `router.push('/projects/[id]/capture')`.
- `/capture` page → reuses recorder component → sequential awaits for save → transcribe → generate.
- `generate-estimate` route extended to return `{ name, sections, items, ... }` from tool_use.
- Existing `/projects/[id]` workspace becomes the "Skip recording" destination unchanged.

</code_context>

<specifics>
## Specific Ideas

- 10-minute cap is the optimization target — explicitly chosen over 5/15 min based on Whisper + Claude cost/token math.
- Color escalation thresholds: neutral 0:00–8:00 → amber 8:00–9:30 → red 9:30–10:00 → auto-stop at 10:00. 60s warning at 9:00 (visual + toast).
- Stepper stages use named verbs ("Saving", "Transcribing", "Analyzing", "Generating estimate"), not abstract labels.
- Auto-fire generation = no "Generate" button in the capture flow. Manual regeneration lives only in the estimate editor.

</specifics>

<deferred>
## Deferred Ideas

- Editor-side "regenerate from scratch with photos added" UX — touches Phase 6 surface; not Phase 18.
- Inline photo capture on `/capture` screen — explicitly rejected (D-09); revisit if user research shows photos are critical first-pass.
- Two-step capture (record → photos → generate) — rejected; conflicts with auto-fire philosophy.
- Web Speech live preview cross-browser parity — preserve current Chrome/Edge-only behavior.
- Mobile-specific layout beyond responsive sizing (e.g., iOS bottom-sheet) — scope guard.

</deferred>

---

*Phase: 18-voice-first-project-onboarding*
*Context gathered: 2026-05-05*
