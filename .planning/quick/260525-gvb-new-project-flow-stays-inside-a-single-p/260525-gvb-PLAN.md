---
phase: quick-260525-gvb
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - lib/actions/project.ts
  - components/projects/new-project-dialog.tsx
  - components/projects/new-project-wizard.tsx
autonomous: false
requirements:
  - QUICK-GVB-01  # Single-modal new-project flow: capture renders inside the dialog
  - QUICK-GVB-02  # Modal stays sm:max-w-lg, mobile (iOS Safari + Android Chrome) keeps working
  - QUICK-GVB-03  # Optional "Back to modality picker" affordance without discarding the created project
must_haves:
  truths:
    - "Opening the New Project dialog shows the modality picker (Audio / Text / Photos) — unchanged from today"
    - "Clicking 'Start <Modality> capture' creates the project but DOES NOT call router.push to a /projects/[id]/<route> URL"
    - "After project creation, the same dialog instance swaps its body to the matching capture component (CaptureRecorder | TextDescribe | PhotosInput)"
    - "The dialog stays open at sm:max-w-lg through the capture step"
    - "Dialog title/description update to reflect the active capture stage (e.g. 'Record audio', 'Describe the job', 'Add photos')"
    - "User can press a 'Back to modality picker' button to return to the picker step without losing the already-created project (no new project is created if they pick a different modality and click Start again — the existing project is re-used)"
    - "Closing the dialog (X / overlay click / ESC) still works mid-capture as the existing escape hatch"
    - "On iOS Safari and Android Chrome the dialog scrolls internally when the capture component overflows — sm:max-w-lg width is NOT widened"
    - "CaptureRecorder, TextDescribe, PhotosInput component source files are NOT modified"
  artifacts:
    - path: lib/actions/project.ts
      provides: "createProjectAction returns companyId alongside the inserted project row so the wizard can build ProjectDetail in-modal without a second fetch"
    - path: components/projects/new-project-wizard.tsx
      provides: "Stateful wizard with two stages — 'picker' and 'capture' — that mounts the corresponding capture component in-place after createProjectAction succeeds"
    - path: components/projects/new-project-dialog.tsx
      provides: "Dialog header bound to wizard stage (title + description swap per stage), DialogContent scrolls internally on overflow"
  key_links:
    - from: components/projects/new-project-wizard.tsx
      to: lib/actions/project.ts (createProjectAction)
      via: "Wizard awaits result, then transitions to stage='capture' with project + companyId held in local state — no router.push"
      pattern: "setStage\\('capture'\\)"
    - from: components/projects/new-project-wizard.tsx
      to: "components/capture/capture-recorder.tsx | components/projects/text-describe.tsx | components/projects/photos-input.tsx"
      via: "Direct import + render with { project, companyId, projectId } props — same contract as the (capture) route clients"
      pattern: "<(CaptureRecorder|TextDescribe|PhotosInput)\\s"
    - from: components/projects/new-project-dialog.tsx
      to: components/projects/new-project-wizard.tsx
      via: "Wizard exposes stage + selectedMode via render-prop OR the dialog header text moves INTO the wizard body; either way header reflects current stage"
      pattern: "stage\\s*===\\s*'capture'"
---

<objective>
Make the New Project flow live entirely inside a single modal. Today the wizard creates the project and then `router.push('/projects/<id>/<capture|describe|photos-input>')` to a full-page route — leaving the modal. Change it so after the user selects a modality and clicks Start, the project is still created, but the dialog content swaps INLINE to render the corresponding capture component (`CaptureRecorder`, `TextDescribe`, `PhotosInput`). The user stays inside the same dialog from picker to capture.

Purpose: one continuous, modal-contained creation flow — fewer route transitions, fewer chances to lose context, better feel on mobile. Capture pages (`/projects/[id]/capture|describe|photos-input`) continue to exist for direct deep-link use; we only stop NAVIGATING to them from the new-project flow.

Output:
- `lib/actions/project.ts`: `createProjectAction` returns `{ data: { project, companyId } }`
- `components/projects/new-project-wizard.tsx`: two-stage state machine (`picker` → `capture`) mounting the right capture component inline
- `components/projects/new-project-dialog.tsx`: stage-aware title/description, scrollable content
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
</execution_context>

<context>
@CLAUDE.md
@components/projects/new-project-dialog.tsx
@components/projects/new-project-wizard.tsx
@components/projects/step-modality-select.tsx
@lib/actions/project.ts
@lib/queries/project.ts
@app/(capture)/projects/[id]/capture/page.tsx
@app/(capture)/projects/[id]/capture/capture-client.tsx
@app/(capture)/projects/[id]/describe/describe-client.tsx
@app/(capture)/projects/[id]/photos-input/photos-input-client.tsx
@components/capture/capture-recorder.tsx
@components/projects/text-describe.tsx
@components/projects/photos-input.tsx

<interfaces>
<!-- Contracts the executor needs — extracted from codebase so no exploration is required. -->

From lib/queries/project.ts:
```typescript
export interface ProjectDetail {
  id: string
  company_id: string
  name: string
  project_type: string | null
  status: string
  target_budget: number | null
  total: number
  created_at: string
  client: {
    id: string
    name: string
    email: string | null
    phone: string | null
  } | null
}
```

From lib/actions/project.ts (current return shape — line 61):
```typescript
// createProjectAction currently returns { data: project } where `project` is the
// raw `.insert(...).select().single()` row — same columns as ProjectDetail EXCEPT
// no `client` join. Since the wizard always inserts with client_id: null (line 37),
// the matching ProjectDetail.client is always null in this flow.
return { data: project }   // → CHANGES TO: { data: { project, companyId: company.id } }
```

From the three capture clients (capture-client.tsx, describe-client.tsx, photos-input-client.tsx):
```typescript
// All three accept the SAME prop shape and we will use that contract unchanged.
interface CaptureClientProps   { project: ProjectDetail; companyId: string }
interface DescribeClientProps  { project: ProjectDetail; companyId: string }
interface PhotosInputClientProps { project: ProjectDetail; companyId: string }

// The underlying components (capture-recorder.tsx line 43-47, text-describe.tsx line 18-22,
// photos-input.tsx line 19-23) accept:
//   { project: ProjectDetail; companyId: string; projectId: string }
// projectId is just project.id — they take both because that's how the route clients
// forward them. We will do the same.
```

From CLAUDE.md (relevant constraint):
- Mobile constraint: must work on iOS Safari + Android Chrome.
- Tech stack: shadcn/ui Dialog (Radix under the hood); `<DialogContent>` is the scroll container.
</interfaces>

<design_decision>
<!-- Locked: smallest blast radius for feeding ProjectDetail into the capture components in-modal. -->

Three options were considered:

(a) Wizard re-fetches via getProjectById after createProjectAction returns. Adds a network round-trip and a `'use server'` query wrapper just to re-read the row we just wrote. REJECTED — pure waste.

(b) Introduce a new server action `createProjectAndLoadDetail` that wraps insert + join + return. Adds a sibling action. REJECTED — duplicates createProjectAction.

(c) Extend `createProjectAction` to also return `companyId` (it already has `company.id` in scope). The wizard then projects the insert row into `ProjectDetail` shape (`client: null` is guaranteed because the wizard always inserts with `clientId: undefined → null`). CHOSEN — one-line server change, zero extra query, zero new files.

Rationale: `createProjectAction` already returns the inserted projects row, which is structurally `Omit<ProjectDetail, 'client'>`. We just need `companyId` to satisfy the capture components' second prop. The `client: null` fact is locally provable (line 37 of `project.ts` hard-codes `client_id: formData.clientId ?? null`, and `formData.clientId` is always `undefined` in this flow per `new-project-wizard.tsx` defaultValues line 49).

Backwards compatibility: only one caller of `createProjectAction` exists (`new-project-wizard.tsx` line 65). Safe to change the return shape in lockstep.
</design_decision>
</context>

<tasks>

<task type="auto" tdd="false">
  <name>Task 1: createProjectAction returns companyId alongside project</name>
  <files>lib/actions/project.ts</files>
  <action>
Change `createProjectAction` return shape from `{ data: project }` to `{ data: { project, companyId: company.id } }` so the wizard can construct `ProjectDetail` in-modal without a second round-trip.

Exact change (lib/actions/project.ts):
- Line 61: replace `return { data: project }` with `return { data: { project, companyId: company.id } }`.
- Do NOT touch `createProjectWithClientAction` (line 155) — different flow, different caller surface; out of scope.
- Do NOT touch any other action.

This action is only consumed by `components/projects/new-project-wizard.tsx` (grep confirmed: one production caller). The wizard is updated in Task 2 to consume the new shape, so the two changes ship together.

WHY: capture components need `companyId` and a `ProjectDetail`. The action already has `company.id` in scope (line 29). Adding it to the return is the smallest change that avoids (a) a refetch round-trip or (b) a new sibling action. The inserted `project` row is structurally `Omit&lt;ProjectDetail, 'client'&gt;` — the wizard adds `client: null` (which is the truth here because line 37 inserts `client_id: formData.clientId ?? null` and the wizard never sets `clientId`).

Do NOT add a new helper, do NOT change `getProjectById`, do NOT widen `ProjectFormValues`.
  </action>
  <verify>
    <automated>npx tsc --noEmit</automated>
  </verify>
  <done>
- `lib/actions/project.ts` line 61 returns `{ data: { project, companyId: company.id } }`.
- TypeScript compiles (after Task 2 updates the only caller). If Task 2 is not yet applied, expect ONE type error at `new-project-wizard.tsx` line 71 — that's expected; both tasks ship together.
- No other server action changed.
  </done>
</task>

<task type="auto" tdd="false">
  <name>Task 2: NewProjectWizard becomes a two-stage modal (picker → capture) with in-dialog capture mounting</name>
  <files>components/projects/new-project-wizard.tsx, components/projects/new-project-dialog.tsx</files>
  <action>
Convert `NewProjectWizard` into a two-stage component that, after `createProjectAction` succeeds, renders the matching capture component INLINE instead of calling `router.push`.

### 2a. `components/projects/new-project-wizard.tsx`

Add local stage state:
```typescript
type Stage =
  | { kind: 'picker' }
  | { kind: 'capture'; project: ProjectDetail; companyId: string; mode: InputMode }
const [stage, setStage] = useState<Stage>({ kind: 'picker' })
```

Imports to ADD (top of file):
- `useState` from 'react' (already imports useTransition — extend)
- `import type { ProjectDetail } from '@/lib/queries/project'`
- `import { CaptureRecorder } from '@/components/capture/capture-recorder'`
- `import { TextDescribe } from '@/components/projects/text-describe'`
- `import { PhotosInput } from '@/components/projects/photos-input'`
- `import { ArrowLeft } from 'lucide-react'`

Imports to REMOVE:
- `useRouter` import (no longer navigates out of the modal). Drop the `const router = useRouter()` line too.
- `MODALITY_ROUTES` constant (lines 28-33) — dead code after this change.

Rewrite `handleSubmit` so it transitions stage instead of navigating:
```typescript
function handleSubmit() {
  if (!selectedMode) {
    form.setError('inputMode', { message: 'Please select a modality to continue.' })
    return
  }

  // If we already have a project from a previous Start (user went Back and re-picked
  // a different modality), do NOT create another one — just switch stages.
  if (createdProject) {
    setStage({ kind: 'capture', project: createdProject, companyId: createdCompanyId!, mode: selectedMode })
    return
  }

  startTransition(async () => {
    const values = form.getValues()
    const result = await createProjectAction(values)
    if ('error' in result) {
      toast.error(result.error)
      return
    }
    // result.data is now { project, companyId } (see Task 1).
    // Build a ProjectDetail from the inserted row. client is guaranteed null in this
    // flow because createProjectAction inserts client_id: formData.clientId ?? null
    // and the wizard never sets clientId (defaultValues.clientId is undefined).
    const project: ProjectDetail = { ...result.data.project, client: null }
    setCreatedProject(project)
    setCreatedCompanyId(result.data.companyId)
    setStage({ kind: 'capture', project, companyId: result.data.companyId, mode: values.inputMode! })
  })
}
```

Add the two persisted state holders (above `handleSubmit`):
```typescript
const [createdProject, setCreatedProject] = useState<ProjectDetail | null>(null)
const [createdCompanyId, setCreatedCompanyId] = useState<string | null>(null)
```

NOTE on the cast `{ ...result.data.project, client: null }`: the inserted row from Supabase is typed as the database row. To satisfy `ProjectDetail` precisely, use:
```typescript
const project: ProjectDetail = {
  id: result.data.project.id,
  company_id: result.data.project.company_id,
  name: result.data.project.name,
  project_type: result.data.project.project_type,
  status: result.data.project.status,
  target_budget: result.data.project.target_budget,
  total: result.data.project.total,
  created_at: result.data.project.created_at,
  client: null,
}
```
Use the explicit field projection (no `as` cast) — keeps TypeScript honest and surfaces any future schema drift at compile time.

Render branches inside the existing `<Card variant="glass">` body (replace the current single `<StepModalitySelect ...>` render):

```tsx
{stage.kind === 'picker' && (
  <>
    <StepModalitySelect form={form} />
    <Separator className="my-6" />
    <div className="flex justify-between items-center">
      {onClose ? (
        <Button type="button" variant="ghost" className="min-h-[44px]" onClick={onClose}>
          Cancel
        </Button>
      ) : (
        <Button asChild type="button" variant="ghost" className="min-h-[44px]">
          <Link href="/dashboard">Cancel</Link>
        </Button>
      )}
      <Button
        type="button"
        variant="primary"
        className="min-h-[44px]"
        onClick={handleSubmit}
        disabled={isPending || !selectedMode}
      >
        {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        {submitLabel}
      </Button>
    </div>
  </>
)}

{stage.kind === 'capture' && (
  <div className="space-y-3">
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="min-h-[36px] -ml-2 text-muted-foreground"
      onClick={() => setStage({ kind: 'picker' })}
    >
      <ArrowLeft className="mr-1 h-4 w-4" />
      Back to modality picker
    </Button>
    {stage.mode === 'audio' && (
      <CaptureRecorder project={stage.project} companyId={stage.companyId} projectId={stage.project.id} />
    )}
    {stage.mode === 'text' && (
      <TextDescribe project={stage.project} companyId={stage.companyId} projectId={stage.project.id} />
    )}
    {stage.mode === 'photos' && (
      <PhotosInput project={stage.project} companyId={stage.companyId} projectId={stage.project.id} />
    )}
    {stage.mode === 'mixed' && (
      <CaptureRecorder project={stage.project} companyId={stage.companyId} projectId={stage.project.id} />
    )}
  </div>
)}
```

Expose stage information to the dialog so it can update its header. Add a new optional prop to the wizard:

```typescript
interface NewProjectWizardProps {
  onClose?: () => void
  onStageChange?: (stage: 'picker' | 'capture', mode: InputMode | null) => void
}
```

Add a `useEffect` that fires `onStageChange?.(stage.kind, stage.kind === 'capture' ? stage.mode : null)` whenever stage changes.

Do NOT remove the existing `'use client'` directive, do NOT change `useTransition`/`useForm` setup, do NOT change `StepModalitySelect`.

Do NOT modify `CaptureRecorder`, `TextDescribe`, or `PhotosInput` — they continue to call `router.push` after success, which is their existing behavior; that pushes the user from the modal-hosted instance to the workspace page, which is the expected hand-off.

### 2b. `components/projects/new-project-dialog.tsx`

Add stage-aware title/description. Replace the static `<DialogTitle>` / `<DialogDescription>` with values driven by local state synced from the wizard:

```tsx
function NewProjectDialogInner() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  const [stage, setStage] = useState<'picker' | 'capture'>('picker')
  const [mode, setMode] = useState<InputMode | null>(null)

  const isOpen = searchParams.get(NEW_PROJECT_MODAL_PARAM) === NEW_PROJECT_MODAL_VALUE

  function onClose() {
    const params = new URLSearchParams(searchParams.toString())
    params.delete(NEW_PROJECT_MODAL_PARAM)
    const q = params.toString()
    router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false })
    // Reset stage so reopening starts fresh.
    setStage('picker')
    setMode(null)
  }

  const { title, description } = headerFor(stage, mode)

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold">
            <T>{title}</T>
          </DialogTitle>
          <DialogDescription>
            <T>{description}</T>
          </DialogDescription>
        </DialogHeader>

        {isOpen && (
          <NewProjectWizard
            onClose={onClose}
            onStageChange={(nextStage, nextMode) => {
              setStage(nextStage)
              setMode(nextMode)
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

function headerFor(stage: 'picker' | 'capture', mode: InputMode | null): { title: string; description: string } {
  if (stage === 'picker') {
    return {
      title: 'New project',
      description: 'Pick how you want to describe the job | audio, text, or photos.',
    }
  }
  if (mode === 'audio')  return { title: 'Record audio',     description: 'Describe the job out loud. We will transcribe and draft your estimate.' }
  if (mode === 'text')   return { title: 'Describe the job', description: 'Type a short description. We will generate the estimate from it.' }
  if (mode === 'photos') return { title: 'Add photos',       description: 'Upload site photos. We will analyze them to draft your estimate.' }
  return { title: 'New project', description: 'Pick how you want to describe the job | audio, text, or photos.' }
}
```

Required imports to ADD: `useState` from 'react', `import type { InputMode } from '@/lib/schemas/project'`.

KEY DIALOG CLASS CHANGE: `sm:max-w-lg` is preserved (D-locked — do not widen). Added `max-h-[90vh] overflow-y-auto` so the dialog scrolls internally when the audio recorder UI overflows on small screens (iPhone SE / mid-range Android). This satisfies the "content scrolls inside DialogContent if needed (do not redesign)" constraint.

Do NOT change `newProjectHref`, `NEW_PROJECT_MODAL_PARAM`, `NEW_PROJECT_MODAL_VALUE`, the `Suspense` wrapper, or the search-param URL behavior.

### Out-of-scope guardrails (do NOT touch)
- `components/capture/capture-recorder.tsx`
- `components/projects/text-describe.tsx`
- `components/projects/photos-input.tsx`
- `app/(capture)/projects/[id]/{capture,describe,photos-input}/*` — these full-page routes remain functional for deep-link access; we only stop NAVIGATING to them from the new-project flow.
- `components/projects/step-modality-select.tsx`
- `lib/queries/project.ts`
  </action>
  <verify>
    <automated>npx tsc --noEmit</automated>
  </verify>
  <done>
- `npx tsc --noEmit` passes (Task 1 + Task 2 together).
- Grep `router\.push\(.*projects/.*\$\{` inside `components/projects/new-project-wizard.tsx` returns nothing — modal flow no longer navigates out.
- `components/projects/new-project-wizard.tsx` imports `CaptureRecorder`, `TextDescribe`, `PhotosInput`.
- `components/projects/new-project-dialog.tsx` `<DialogContent>` className contains both `sm:max-w-lg` AND `overflow-y-auto` — width preserved, internal scroll added.
- `MODALITY_ROUTES` constant removed from `new-project-wizard.tsx`.
- `createProjectAction` is called at most once per dialog open even if the user toggles Back ↔ Start with a different modality.
  </done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 3: Verify single-modal flow end-to-end on desktop + mobile</name>
  <what-built>
The New Project flow now stays in one dialog. Picker → Start → capture component mounts inside the same dialog. Modal width unchanged (sm:max-w-lg). Mobile keeps working. Dialog title/description swap per stage. "Back to modality picker" affordance returns to picker without losing the created project.
  </what-built>
  <how-to-verify>
Run `npm run dev` (or the project's dev script) and on `http://localhost:3000/dashboard`:

DESKTOP CHROME:
1. Click the New Project button. Dialog opens. Title: "New project". Description mentions audio/text/photos.
2. Click the **Text** modality card → click **Start Text capture**.
   - Expected: URL bar stays on `/dashboard` (NO navigation to `/projects/<id>/describe`).
   - Expected: dialog body swaps to the `TextDescribe` textarea. Title becomes "Describe the job".
   - Expected: a "Back to modality picker" button is visible at the top of the dialog body.
3. Click **Back to modality picker**. Dialog returns to the picker step. Verify the same project is reused (no second project appears in the sidebar / dashboard).
4. Pick **Photos** → **Start Photos capture**. Dialog swaps to `PhotosInput`. Title: "Add photos".
5. Pick **Audio** → **Start Audio capture**. Dialog swaps to `CaptureRecorder` (the big mic UI). Title: "Record audio".
   - Expected: dialog scrolls internally if the recorder UI is taller than the viewport. Width is unchanged.
6. Close the dialog (X). Reopen via the New Project button — it starts fresh at the picker (no leaked stage).
7. Confirm `git log` since this session shows NO modifications to `components/capture/capture-recorder.tsx`, `components/projects/text-describe.tsx`, `components/projects/photos-input.tsx`, or any file under `app/(capture)/projects/[id]/`.

MOBILE (iOS Safari + Android Chrome via real device or DevTools device toolbar at 390x844 + 360x800):
8. Repeat steps 1, 2, 5 (audio is the worst case for height). Confirm:
   - Dialog content scrolls inside the modal (not the page body).
   - sm:max-w-lg width is respected (no horizontal jitter).
   - The mic record button is reachable without overflow clipping.
   - Closing via the X works; the page-level scroll position is preserved.

REGRESSION — direct-deep-link routes still work:
9. Manually navigate to `/projects/<some-existing-project-id>/capture` (or `/describe`, `/photos-input`). The full-page capture screen still renders as before — we did not break those routes; we only changed who navigates to them.
  </how-to-verify>
  <resume-signal>Type "approved" or describe issues (with screen + browser).</resume-signal>
</task>

</tasks>

<verification>
- TypeScript: `npx tsc --noEmit` (entire repo).
- Lint: `npm run lint` should be clean for the three modified files (no new warnings on `lib/actions/project.ts`, `components/projects/new-project-wizard.tsx`, `components/projects/new-project-dialog.tsx`).
- Grep guardrails:
  - `grep -n "router\.push" components/projects/new-project-wizard.tsx` returns nothing.
  - `grep -n "MODALITY_ROUTES" components/projects/new-project-wizard.tsx` returns nothing (constant removed).
  - `grep -n "sm:max-w-lg" components/projects/new-project-dialog.tsx` returns exactly one hit on `<DialogContent>`.
  - `grep -rn "createProjectAction" lib components app` shows only ONE caller of the action (the wizard) — confirms the return-shape change has no other consumers.
- Manual: Task 3 checkpoint.
</verification>

<success_criteria>
- After clicking Start in the New Project dialog, NO `router.push('/projects/<id>/...')` fires. URL bar stays on the page that opened the modal.
- The same dialog swaps body in-place to render `CaptureRecorder` | `TextDescribe` | `PhotosInput` based on selection.
- Dialog width remains `sm:max-w-lg` on all stages; `overflow-y-auto` allows internal scroll on small viewports.
- Title and description update per stage.
- "Back to modality picker" returns to the picker without creating a second project (the existing project is re-used).
- Closing the dialog mid-capture still works (existing escape hatch preserved).
- `CaptureRecorder`, `TextDescribe`, `PhotosInput` source files unchanged.
- `/projects/[id]/capture`, `/describe`, `/photos-input` routes still render fine when visited directly.
</success_criteria>

<output>
After completion, the executor commits and writes `.planning/quick/260525-gvb-new-project-flow-stays-inside-a-single-p/260525-gvb-SUMMARY.md` per the quick-task convention.
</output>
