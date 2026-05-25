---
quick_id: 260525-mim
type: execute
wave: 1
depends_on: []
files_modified:
  - components/projects/estimate-creation-popup.tsx
  - components/capture/capture-recorder.tsx
autonomous: false
requirements:
  - QUICK-260525-mim-01
must_haves:
  truths:
    - "When the user picks Record Audio in StepModalitySelect, the popup shows ONLY the voice recorder UI (waveform + timer + mic button); no textarea, no Add Photos button."
    - "When the user picks Describe, the popup shows ONLY the textarea; no VoiceRecorder, no Add Photos button, no OR divider."
    - "When the user picks Photos, the popup shows ONLY the Add Photos input/button; no VoiceRecorder, no textarea, no OR divider."
    - "In all three single-mode popup paths, EstimateLanguageSelector and the Generate Estimate button remain visible at the bottom."
    - "When CaptureRecorder is rendered without a mode prop (legacy fullscreen /capture route), the existing all-three-inputs-with-OR-divider layout renders unchanged."
    - "The OR divider is rendered only in legacy fullscreen mode (mode === undefined); in single-mode popup paths it is fully omitted."
  artifacts:
    - path: "components/projects/estimate-creation-popup.tsx"
      provides: "Passes parsed CaptureMode from URL into <CaptureRecorder mode={mode} ... />"
      contains: "mode={mode}"
    - path: "components/capture/capture-recorder.tsx"
      provides: "Optional mode?: CaptureMode prop on CaptureRecorder + RecorderBody; conditional rendering of audio/text/photos blocks; OR divider only when mode is undefined"
      contains: "mode?:"
  key_links:
    - from: "components/projects/estimate-creation-popup.tsx"
      to: "components/capture/capture-recorder.tsx"
      via: "mode prop"
      pattern: "mode=\\{mode\\}"
    - from: "RecorderBody (inside capture-recorder.tsx)"
      to: "JSX render branches"
      via: "mode prop drives conditional visibility of VoiceRecorder/textarea/photo input/OR-divider"
      pattern: "mode === 'audio'|mode === 'text'|mode === 'photos'|mode === undefined"
---

<objective>
In the estimate-creation popup (`<EstimateCreationPopup />` driven by `?capture=audio|text|photos&projectId=<id>`), render only the input UI matching the modality selected in `StepModalitySelect`.

Today `RecorderBody` (inside `components/capture/capture-recorder.tsx`) unconditionally renders all three inputs (voice recorder + textarea + photos) joined by an "OR" divider. The chosen mode is already parsed from the URL in `estimate-creation-popup.tsx` (typed `CaptureMode = 'audio' | 'text' | 'photos'`). We just need to thread that mode into `<CaptureRecorder />` and use it inside `RecorderBody` to gate the three input blocks.

Purpose: Reduce cognitive friction — the user explicitly picked a single modality on the previous step; the popup should honor that choice instead of re-presenting the other two options. UX refinement only. NO pipeline / actions / schema / lib changes.

Output: A single PR-shaped commit modifying exactly two files, with the legacy fullscreen `/capture` route (`app/(capture)/projects/[id]/capture/capture-client.tsx`) rendering unchanged because it does not pass a `mode` prop.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@CLAUDE.md
@components/projects/step-modality-select.tsx
@components/projects/new-project-wizard.tsx
@components/projects/estimate-creation-popup.tsx
@components/capture/capture-recorder.tsx

<interfaces>
<!-- Key types and call-site shapes the executor needs. Extracted from the codebase. -->

From components/projects/estimate-creation-popup.tsx (already exists):
```typescript
export const CAPTURE_PARAM = 'capture'
export const PROJECT_ID_PARAM = 'projectId'
export type CaptureMode = 'audio' | 'text' | 'photos'

function isCaptureMode(value: string | null): value is CaptureMode { ... }

// Inside EstimateCreationPopupInner():
const mode = searchParams.get(CAPTURE_PARAM)            // type: string | null
const projectId = searchParams.get(PROJECT_ID_PARAM)
const isOpen = isCaptureMode(mode) && !!projectId

// Current render (the line we'll change):
<CaptureRecorder
  project={project}
  companyId={project.company_id}
  projectId={project.id}
  variant="popup"
  onComplete={handleComplete}
  onCancel={handleCancel}
/>
```

From components/capture/capture-recorder.tsx (current shape):
```typescript
interface CaptureRecorderProps {
  project: ProjectDetail
  companyId: string
  projectId: string
  variant?: 'fullscreen' | 'popup'
  onComplete?: (estimateId: string) => void
  onCancel?: () => void
}

// RecorderBody currently renders unconditionally:
//   1. <VoiceRecorder ... belowWaveform={<CaptureTimer .../>} />
//   2. OR divider (px-4 flex items-center gap-3 with "or" label)
//   3. <textarea ... data-testid="capture-description" />
//   4. Add Photos <Button data-testid="capture-add-photos">
//   5. <EstimateLanguageSelector value={estimateLanguage} onChange={setEstimateLanguage} />
//   6. Generate <Button data-testid="generate-estimate-btn">
```

State that MUST be preserved (used by handleGenerate / runPipeline / triggerEstimateGeneration — DO NOT remove):
- `audioBlob`, `descriptionText`, `uploadedPhotos`, `hasAnyInput`
- `handleGenerate`, `triggerEstimateGeneration`, `runPipeline`
- All recording lifecycle effects, photo upload handler, language state

handleGenerate already dispatches on which input is populated:
```typescript
if (descriptionText.trim() && !audioBlob && uploadedPhotos.length === 0) { /* text path */ }
else if (audioBlob) { /* audio path */ }
else if (uploadedPhotos.length > 0) { /* photos-only path */ }
```
This logic stays correct because the user can only populate the visible input in each mode.
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Thread CaptureMode prop from popup into CaptureRecorder and gate inputs in RecorderBody</name>
  <files>
    components/projects/estimate-creation-popup.tsx,
    components/capture/capture-recorder.tsx
  </files>
  <action>
**File A — `components/projects/estimate-creation-popup.tsx`:**

In `EstimateCreationPopupInner()`, after the existing line `const mode = searchParams.get(CAPTURE_PARAM)`, the runtime value at the point of rendering `<CaptureRecorder />` is guaranteed by `isOpen` to satisfy `isCaptureMode(mode)`. Compute a narrowed value and pass it through:

```tsx
// Narrow the URL param to CaptureMode for the recorder. `isOpen` guarantees
// `isCaptureMode(mode) === true` at this render path, so the cast is safe.
const captureMode = mode as CaptureMode

// ... inside the existing <CaptureRecorder ... /> JSX, add the new prop:
<CaptureRecorder
  project={project}
  companyId={project.company_id}
  projectId={project.id}
  variant="popup"
  mode={captureMode}
  onComplete={handleComplete}
  onCancel={handleCancel}
/>
```

Do not change anything else in this file. Do not touch `clearParams`, `useEffect`, the Dialog wrapper, or types.

**File B — `components/capture/capture-recorder.tsx`:**

1. Import `CaptureMode` from the popup file (it is already exported there). Add to the existing import block:

```tsx
import type { CaptureMode } from '@/components/projects/estimate-creation-popup'
```

2. Extend `CaptureRecorderProps`:

```tsx
interface CaptureRecorderProps {
  project: ProjectDetail
  companyId: string
  projectId: string
  variant?: 'fullscreen' | 'popup'
  /**
   * Single-modality lock for the popup flow. When set, RecorderBody renders
   * ONLY the matching input (audio | text | photos). When undefined (legacy
   * fullscreen /capture route), the original all-three-inputs-with-OR layout
   * renders unchanged for backward compatibility.
   */
  mode?: CaptureMode
  onComplete?: (estimateId: string) => void
  onCancel?: () => void
}
```

3. Accept `mode` in the `CaptureRecorder` function signature and forward it to `<RecorderBody mode={mode} ... />`:

```tsx
export function CaptureRecorder({
  project,
  companyId,
  projectId,
  variant = 'fullscreen',
  mode,
  onComplete,
  onCancel,
}: CaptureRecorderProps) {
  // ... existing body ...

  // In the JSX where <RecorderBody ... /> is rendered, add `mode={mode}` to the prop list.
}
```

4. Extend `RecorderBodyProps`:

```tsx
interface RecorderBodyProps {
  analyser: AnalyserNode | null
  isRecording: boolean
  elapsedMs: number
  ringColorClass: string
  progress: number
  onToggle: () => void
  descriptionText: string
  setDescriptionText: React.Dispatch<React.SetStateAction<string>>
  uploadedPhotos: Photo[]
  isUploadingPhotos: boolean
  photoInputRef: React.RefObject<HTMLInputElement | null>
  onPhotoFileChange: (e: React.ChangeEvent<HTMLInputElement>) => Promise<void>
  hasAnyInput: boolean
  onGenerate: () => Promise<void>
  estimateLanguage: EstimateLanguage
  setEstimateLanguage: (lang: EstimateLanguage) => void
  mode?: CaptureMode
}
```

5. Rewrite the `RecorderBody` JSX to gate the three input blocks on `mode`. The structure becomes (in this order, inside the existing `<div className="flex-1 flex flex-col overflow-y-auto min-h-0">`):

   - **Audio block** (the entire `<div className="px-4 pt-4 pb-2">…<VoiceRecorder ... belowWaveform={<CaptureTimer />} />…</div>`): render only when `mode === 'audio' || mode === undefined`.

   - **OR divider** (`<div className="px-4 flex items-center gap-3">…<span>or</span>…</div>`): render only when `mode === undefined`. In every single-mode popup path the divider is fully removed (do NOT keep the surrounding `px-4` wrapper either — drop the whole node).

   - **Text block** (the `<div className="px-4 pt-4"><textarea ... /></div>`): render only when `mode === 'text' || mode === undefined`.

   - **Photos block** (the `<div className="px-4 pt-3">…input ref + Add Photos Button…</div>`): render only when `mode === 'photos' || mode === undefined`.

   - **Language selector block** (`<div className="px-4 pt-4 pb-2"><EstimateLanguageSelector ... /></div>`): ALWAYS render — visible in all three modes and in legacy mode.

   - **Generate Estimate block** (`<div className="px-4 pt-2 pb-6 sm:pb-8 mt-auto"><Button onClick={onGenerate} disabled={!hasAnyInput} …>Generate Estimate</Button></div>`): ALWAYS render — visible in all three modes and in legacy mode. Keep `disabled={!hasAnyInput}` as-is (the visible input is the only one the user can populate, so `hasAnyInput` naturally reflects the right state per mode).

   Use plain JSX conditional expressions: `{(mode === 'audio' || mode === undefined) && (<div>…</div>)}`. Do not introduce a helper component or reshape any other props. Do not change the className strings inside the blocks (spacing/padding stays identical — we are only adding visibility gates).

6. Do NOT touch any of:
   - `useState`, `useRef`, `useEffect`, `useCallback` blocks
   - `runPipeline`, `handleGenerate`, `triggerEstimateGeneration`, `handlePhotoFileChange`, `startRecording`, `stopRecording`, `handleToggleRecording`, `tick`, `failAt`
   - `hasAnyInput` (it stays correct because only the visible input can be populated per mode)
   - The header / failure / stepper branch (`showRecorderUI ? <RecorderBody …/> : <div …Stepper…/>`)
   - Any pipeline-stage state, polling, or routing logic
   - Any lib/, actions/, schema, or API code (we're not touching any of those)

**Backward compatibility check:** Open `app/(capture)/projects/[id]/capture/capture-client.tsx` mentally — it renders `<CaptureRecorder ... />` WITHOUT a `mode` prop. With our change, `mode === undefined` → all three input blocks AND the OR divider render → identical behavior to before this PR. Confirmed.

**No-op for typing:** Since `mode` is optional, no existing call site breaks. The narrow `mode as CaptureMode` in the popup file is safe because the popup only renders when `isOpen === true`, which already implies `isCaptureMode(mode)`.
  </action>
  <verify>
    <automated>npm run typecheck</automated>
  </verify>
  <done>
- `components/projects/estimate-creation-popup.tsx` passes `mode={captureMode}` (narrowed `CaptureMode`) into `<CaptureRecorder />`.
- `components/capture/capture-recorder.tsx` declares optional `mode?: CaptureMode` on both `CaptureRecorderProps` and `RecorderBodyProps`, forwards it through, and `RecorderBody` renders the audio block only when `mode === 'audio' || mode === undefined`, the textarea block only when `mode === 'text' || mode === undefined`, the photos block only when `mode === 'photos' || mode === undefined`, the OR divider only when `mode === undefined`, and the language selector + Generate Estimate button always.
- `npm run typecheck` passes (no new TypeScript errors).
- All existing state, callbacks, pipeline logic, and the legacy fullscreen route render path are untouched.
  </done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 2: Manual UX verification of the three single-mode popup paths and the legacy fullscreen route</name>
  <what-built>
The estimate-creation popup now renders only the input matching the modality picked on `StepModalitySelect`. The legacy `/capture` fullscreen route still shows all three inputs.
  </what-built>
  <how-to-verify>
Run the dev server (`npm run dev`) and walk through these four scenarios:

1. **Audio mode (popup):**
   - On `/dashboard` (or any signed-in page), click "New Project" → in the modal pick the **Record Audio** card.
   - Expect: NewProjectDialog closes; the estimate-creation popup opens; the body shows ONLY the voice recorder (waveform + timer + mic button). NO textarea visible. NO "Add Photos" button visible. NO "OR" divider visible.
   - At the bottom: EstimateLanguageSelector and the "Generate Estimate" button are both visible.

2. **Describe mode (popup):**
   - From the same starting point, pick the **Describe** card.
   - Expect: popup body shows ONLY the textarea ("Or describe the job here…"). NO VoiceRecorder. NO "Add Photos" button. NO "OR" divider.
   - EstimateLanguageSelector + "Generate Estimate" button still visible at the bottom.

3. **Photos mode (popup):**
   - Pick the **Photos** card.
   - Expect: popup body shows ONLY the "Add Photos" button (and the hidden file input). NO VoiceRecorder. NO textarea. NO "OR" divider.
   - EstimateLanguageSelector + "Generate Estimate" button still visible at the bottom.

4. **Legacy fullscreen route (regression check):**
   - Open an existing project at `/projects/<id>/capture` directly in the URL bar.
   - Expect: the full-screen recorder still shows the original layout — VoiceRecorder, an "OR" divider, the textarea, AND the "Add Photos" button, all together — exactly as before this change. EstimateLanguageSelector + Generate Estimate visible at the bottom.

If any of the four scenarios renders the wrong set of inputs, the change is incorrect.
  </how-to-verify>
  <resume-signal>Type "approved" if all four scenarios behave as described, or describe which scenario rendered incorrectly.</resume-signal>
</task>

</tasks>

<verification>
- `npm run typecheck` passes with no new errors.
- Manual UX walk-through (Task 2) confirms audio/text/photos popup modes render only their matching input, while `/projects/<id>/capture` renders unchanged.
- `git diff --stat` shows exactly two files changed: `components/projects/estimate-creation-popup.tsx` and `components/capture/capture-recorder.tsx`. No changes under `lib/`, `app/api/`, schemas, or migrations.
</verification>

<success_criteria>
- Each popup modality (`?capture=audio|text|photos`) renders ONLY its matching input UI inside `RecorderBody`.
- The "OR" divider appears ONLY in the legacy fullscreen route (where `mode` is undefined).
- `EstimateLanguageSelector` and the "Generate Estimate" button are visible in every popup mode AND in legacy mode.
- Legacy `/projects/[id]/capture` fullscreen route renders identically to before this change.
- No changes to pipeline logic, server actions, lib/, schemas, or migrations.
- TypeScript compile clean.
</success_criteria>

<output>
After completion, create `.planning/quick/260525-mim-popup-capture-recorder-render-only-the-i/260525-mim-SUMMARY.md` documenting:
- The new optional `mode?: CaptureMode` prop on `CaptureRecorder` and `RecorderBody`.
- The narrow-cast pattern in `estimate-creation-popup.tsx` (`mode as CaptureMode` guarded by `isOpen`).
- The conditional render structure inside `RecorderBody` (audio | text | photos | divider | always-visible language+generate).
- Confirmation that the legacy fullscreen `/capture` route is unaffected because it does not pass `mode`.
</output>
