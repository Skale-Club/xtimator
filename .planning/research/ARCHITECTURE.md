# Architecture Research

**Domain:** Multi-modal project onboarding — v1.5 Zero-friction Project Onboarding
**Researched:** 2026-05-08
**Confidence:** HIGH (all findings derived from direct codebase inspection)

## Standard Architecture

### System Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                    Entry Points (Routes)                             │
│                                                                      │
│  /projects/new?clientId=   /clients/[id]   /projects/[id]/describe  │
│  (app) group               (app) group     (capture) group           │
│       │                        │                    │                │
│       ▼                        ▼                    ▼                │
│  NewProjectPage          ClientDetailPage    DescribePage (NEW)      │
│  + NewProjectWizard v2   + ClientDetailActions  + DescribeClient     │
├─────────────────────────────────────────────────────────────────────┤
│                 Wizard State Machine (client component)              │
│                                                                      │
│   Step 0 removed          Step 1 → Modal Choice (SEED-005)          │
│   (client optional)       [Audio] [Text] [Photos]                    │
│                            ↓       ↓       ↓                         │
│                        /capture /describe /photos-input              │
├─────────────────────────────────────────────────────────────────────┤
│                   Server Actions / API Routes                        │
│                                                                      │
│  createProjectAction (modified — client_id optional)                 │
│  createTextTranscriptAction (NEW — saves text as recording row)      │
│  linkClientAction (NEW — post-generation client match/create)        │
│  POST /api/generate-estimate (modified — returns detected_client)    │
├─────────────────────────────────────────────────────────────────────┤
│                     AI Layer  (lib/ai/)                              │
│                                                                      │
│  prompt-builder.ts (modified — adds detected_client_name field)      │
│  types.ts (modified — EstimateOutput gains detected_client_name)     │
│  AnthropicAdapter / GeminiAdapter (modified — extract client name)   │
├─────────────────────────────────────────────────────────────────────┤
│                   Database (Supabase PostgreSQL)                     │
│                                                                      │
│  projects.client_id — already nullable (no migration needed)        │
│  recordings.storage_path — needs to be nullable for text path        │
│  projects.input_mode TEXT — optional new column (audio/text/photos)  │
└─────────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Status |
|-----------|----------------|--------|
| `NewProjectWizard` | Multi-step wizard; step 1 now modal choice instead of client select | MODIFIED |
| `StepModalChoice` | 3-card picker (Audio / Text / Photos); mobile-first tap targets | NEW |
| `createProjectAction` | Creates project row; `clientId` becomes optional, defaults to null | MODIFIED |
| `DescribePage` + `DescribeClient` | Full-page text input route in `(capture)` group; saves transcript; fires generate | NEW |
| `PhotosInputPage` + `PhotosInputClient` | Full-page photos-first route in `(capture)` group; wraps PhotoDropZone; fires generate | NEW |
| `ClientDetailActions` | Adds "+ New Project" button alongside Edit/Delete | MODIFIED |
| `OverviewTab` | Adds "No client linked" card with link/create action when `client_id` is null | MODIFIED |
| `linkClientAction` | Post-generation server action: fuzzy-match client name, create if no match, update project | NEW |
| `generateEstimate` API route | After generation, extracts `detected_client_name` from AI response; calls linkClientAction | MODIFIED |
| `prompt-builder.ts` | Adds client-name extraction instruction to user content prompt | MODIFIED |
| `EstimateOutput` type | Adds optional `detected_client_name: string \| null` field | MODIFIED |

## Recommended Project Structure

```
app/
├── (capture)/
│   └── projects/[id]/
│       ├── capture/            # existing audio recorder (unchanged)
│       ├── describe/           # NEW — text input path
│       │   ├── page.tsx        # server: auth + project guard → DescribeClient
│       │   ├── loading.tsx     # NEW
│       │   └── describe-client.tsx  # NEW client component
│       └── photos-input/       # NEW — photos-first path
│           ├── page.tsx        # server: auth + project guard → PhotosInputClient
│           ├── loading.tsx     # NEW
│           └── photos-input-client.tsx  # NEW client component
│
├── (app)/
│   └── projects/
│       └── new/
│           └── page.tsx        # MODIFIED — reads ?clientId= searchParam

components/
├── projects/
│   ├── new-project-wizard.tsx  # MODIFIED — 2-step: modal choice (step removed: client select)
│   ├── step-modal-choice.tsx   # NEW — 3-card Audio/Text/Photos picker
│   └── step-client-select.tsx  # KEPT but now optional/skipped via clientId prop
│
├── workspace/
│   └── overview-tab.tsx        # MODIFIED — adds "No client linked" card

lib/
├── actions/
│   ├── project.ts              # MODIFIED — createProjectAction accepts optional clientId
│   └── client-link.ts          # NEW — linkClientAction server action
│
├── ai/
│   ├── types.ts                # MODIFIED — EstimateOutput.detected_client_name
│   └── prompt-builder.ts       # MODIFIED — adds client extraction instruction
│
└── schemas/
    └── project.ts              # MODIFIED — clientId optional, add inputMode field

app/api/
└── generate-estimate/
    └── route.ts                # MODIFIED — calls linkClientAction after generation
```

### Structure Rationale

- **`(capture)` route group:** The full-screen escape-from-app-shell pattern already works for audio. Both new paths (`/describe` and `/photos-input`) use the same `(capture)` layout (`fixed inset-0 z-50 bg-background`). This keeps all single-purpose input flows isolated from the workspace tabs shell.
- **`step-modal-choice.tsx` as separate component:** The wizard is already a controlled client component (`useForm`). The modal choice step is stateless UI (3 cards → callback). Keeping it in its own file makes each step independently testable and matches the existing `step-client-select.tsx` pattern.
- **`client-link.ts` as a separate action module:** Client linking is a post-generation side effect, not part of project creation. A dedicated module keeps `project.ts` focused on CRUD and keeps the matching/creation logic independently testable. It is called from the API route after estimate persistence completes.
- **No new route group needed for client association:** The `(app)` group already handles `/clients/[id]`, so the "New Project" button can simply push to `/projects/new?clientId=<id>` — no new layout required.

## Architectural Patterns

### Pattern 1: Eager Project Creation + Redirect

**What:** The project row is created with a placeholder name before the user provides any content. The wizard redirects immediately to the content-input route after creation.

**When to use:** This milestone keeps this pattern. All three branches (audio, text, photos) follow: create project → redirect to input route → user provides content → generate.

**Trade-offs:** Creates orphan draft projects if the user abandons after wizard but before generating. The codebase already has `pg_cron` + Vercel cron fallback for orphan cleanup — no new mechanism needed.

**Existing code:**
```typescript
// lib/actions/project.ts — createProjectAction
const { data: project } = await supabase
  .from('projects')
  .insert({ company_id, client_id: formData.clientId ?? null, name: placeholder, status: 'draft' })
```

**Change needed:** `formData.clientId` must change from `z.string().min(1)` to `z.string().optional()` in `lib/schemas/project.ts`.

### Pattern 2: Recording Row as Generic Transcript Carrier

**What:** The `recordings` table already stores `transcript TEXT` with `storage_path TEXT` and `duration_seconds INT` both nullable in the existing schema. The text path saves a recording row with `storage_path = null`, `duration_seconds = null`, and only `transcript` populated.

**When to use:** Text input path. The AI pipeline in `app/api/generate-estimate/route.ts` already reads `recordings.transcript` without caring how the transcript was created.

**Trade-offs:** A recording row without a storage_path is semantically odd. However, this is the lowest-friction integration — the entire downstream pipeline (estimate generation, `hasTranscript` checks) works unchanged. An `input_mode` column on `projects` (or a `type` column on `recordings`) can document the origin if needed.

**Action to create:**
```typescript
// lib/actions/recording.ts — new function
export async function createTextTranscript(projectId: string, text: string) {
  // Insert recording with storage_path = null placeholder,
  // duration_seconds = null, transcript = text
  // Then revalidatePath(`/projects/${projectId}`)
}
```

The existing `createRecording` action requires `storagePath: string` and `durationSeconds: number` — it cannot be reused as-is. A new sibling function avoids changing the existing signature.

**Schema note:** Verify that `recordings.storage_path` has a NOT NULL constraint in the actual DB migration files. If it does, a migration to make it nullable is required before the text path can ship. This is the one potential DB change.

### Pattern 3: Post-Generation Client Linking

**What:** AI client extraction happens after the estimate is persisted, not before. The `generate-estimate` API route calls a `linkClientAction` as a fire-and-forget step (or await, for reliability). The action fuzzy-matches against `clients` by name, creates a minimal client if no match, and updates `projects.client_id`.

**When to use:** Always, when `project.client_id` is null and `detected_client_name` is non-null in the AI response.

**Trade-offs:** A false-positive auto-link (wrong client matched) is worse UX than a missed link. The safest implementation: exact case-insensitive match for auto-link; anything fuzzy should surface a confirmation prompt in the Overview tab rather than silently linking. This is a product decision that must be captured in the phase plan.

**Data flow:**
```
POST /api/generate-estimate
  → AI provider.generateEstimate()
  → aiEstimate.detected_client_name (new field in EstimateOutput)
  → linkClientAction(projectId, companyId, detected_client_name)
      → SELECT clients WHERE lower(name) = lower(detected) AND company_id = ?
      → match found: UPDATE projects SET client_id = match.id
      → no match: INSERT clients (name, company_id) + UPDATE projects SET client_id = new.id
  → return { estimateId, version, clientLinked: bool, clientName: str | null }
```

### Pattern 4: SearchParam Client Pre-selection

**What:** The "New Project" button on `ClientDetailPage` navigates to `/projects/new?clientId=<id>`. The `NewProjectPage` server component reads `searchParams.clientId` and passes it to the wizard as an initial value. The wizard skips the (now-optional) client selector and uses the pre-supplied ID.

**When to use:** Any entry point that already knows the client — the client detail page today, potentially other surfaces in future.

**Trade-offs:** Minimal — this is a standard Next.js App Router `searchParams` pattern already used for `?tab=` in the workspace page. No new state mechanism needed.

**Code change in `app/(app)/projects/new/page.tsx`:**
```typescript
export default async function NewProjectPage({
  searchParams,
}: {
  searchParams: Promise<{ clientId?: string }>
}) {
  const { clientId } = await searchParams
  // pass clientId to NewProjectWizard; wizard creates project with client_id pre-filled
  // and skips directly to modal choice step
  return <NewProjectWizard clients={clients} preselectedClientId={clientId} />
}
```

## Data Flow

### Text Path Data Flow

```
User lands on /projects/new
    ↓
NewProjectWizard step 1: StepModalChoice → user picks "Text ✍️"
    ↓
createProjectAction({ clientId: null }) → project row created, status: 'draft'
    ↓
router.push(`/projects/${id}/describe`)
    ↓
DescribePage (server) → auth guard → DescribeClient
    ↓
User types description → clicks "Generate Estimate"
    ↓
createTextTranscript(projectId, text) [server action]
  → INSERT recordings (project_id, company_id, storage_path=null, transcript=text)
    ↓
fetch('/api/generate-estimate', { projectId })
    ↓
API route: recordings[0].transcript → EstimateInput.transcripts
    ↓
AI provider → EstimateOutput (with detected_client_name)
    ↓
Estimate persisted → linkClientAction called
    ↓
router.push(`/projects/${id}?tab=estimate`)
```

### Photos-First Path Data Flow

```
User lands on /projects/new
    ↓
NewProjectWizard → user picks "Photos 📸"
    ↓
createProjectAction({ clientId: null }) → project row created, status: 'draft'
    ↓
router.push(`/projects/${id}/photos-input`)
    ↓
PhotosInputPage (server) → auth guard → PhotosInputClient
    ↓
User uploads photos via PhotoDropZone (existing component, reused)
    ↓
Photos stored in Supabase Storage + photo rows created (existing pipeline)
    ↓
User clicks "Generate from Photos"
    ↓
fetch('/api/analyze-photos', { projectId })  [existing]
fetch('/api/generate-estimate', { projectId })  [existing]
    ↓
estimate-tab.tsx hasPhotos logic already handles this case
    ↓
router.push(`/projects/${id}?tab=estimate`)
```

### New Project from Client Detail

```
User on /clients/[id]
    ↓
ClientDetailActions: "+ New Project" button (new button added)
    ↓
router.push(`/projects/new?clientId=${client.id}`)
    ↓
NewProjectPage reads searchParams.clientId
    ↓
NewProjectWizard: preselectedClientId skips straight to StepModalChoice
    ↓
createProjectAction({ clientId: preselectedClientId })
    ↓
[chosen path: audio / text / photos]
```

### AI Client Extraction Data Flow

```
POST /api/generate-estimate
    ↓
buildUserContent(input) — prompt-builder adds:
  "If a client name is mentioned, extract it as detected_client_name"
    ↓
AnthropicAdapter / GeminiAdapter returns EstimateOutput:
  { ...existing fields, detected_client_name: "Maria Silva" | null }
    ↓
(After estimate persisted successfully)
linkClientAction(projectId, companyId, "Maria Silva")
    ↓
  SELECT * FROM clients
  WHERE company_id = $companyId
    AND lower(name) = lower('Maria Silva')
  ↓
  Case A — exact match found:
    UPDATE projects SET client_id = match.id WHERE id = projectId
  Case B — no match:
    INSERT INTO clients (company_id, name) VALUES (companyId, 'Maria Silva')
    UPDATE projects SET client_id = new_client.id WHERE id = projectId
  Case C — detected_client_name is null:
    no-op; project stays client_id = null
    ↓
API route response includes: { ..., clientLinked: bool, detectedClientName: string | null }
    ↓
OverviewTab: if client_id still null, show "No client linked" card
```

## Integration Points

### Files Modified vs New

| File | Change Type | What Changes |
|------|------------|--------------|
| `lib/schemas/project.ts` | MODIFIED | `clientId` → `z.string().optional()`; add `inputMode` enum |
| `lib/actions/project.ts` | MODIFIED | `createProjectAction` — `client_id` defaults to null |
| `app/(app)/projects/new/page.tsx` | MODIFIED | Read `?clientId` searchParam; pass to wizard |
| `components/projects/new-project-wizard.tsx` | MODIFIED | Add `preselectedClientId` prop; replace step 1 with StepModalChoice; redirect by mode |
| `components/projects/step-modal-choice.tsx` | NEW | 3-card Audio/Text/Photos picker |
| `app/(capture)/projects/[id]/describe/page.tsx` | NEW | Server page for text path |
| `app/(capture)/projects/[id]/describe/loading.tsx` | NEW | Loading state |
| `app/(capture)/projects/[id]/describe/describe-client.tsx` | NEW | Client component: textarea + generate |
| `app/(capture)/projects/[id]/photos-input/page.tsx` | NEW | Server page for photos-first path |
| `app/(capture)/projects/[id]/photos-input/loading.tsx` | NEW | Loading state |
| `app/(capture)/projects/[id]/photos-input/photos-input-client.tsx` | NEW | Client component: PhotoDropZone + generate button |
| `lib/actions/recording.ts` | MODIFIED | Add `createTextTranscript(projectId, text)` sibling function |
| `lib/actions/client-link.ts` | NEW | `linkClientAction(projectId, companyId, detectedName)` server action |
| `app/api/generate-estimate/route.ts` | MODIFIED | Call `linkClientAction` after estimate persisted; return `detectedClientName` |
| `lib/ai/types.ts` | MODIFIED | `EstimateOutput` gains `detected_client_name?: string \| null` |
| `lib/ai/prompt-builder.ts` | MODIFIED | `buildUserContent` adds client-name extraction instruction |
| `lib/ai/providers/anthropic.ts` | MODIFIED | Parse `detected_client_name` from tool_use response |
| `lib/ai/providers/gemini.ts` | MODIFIED | Parse `detected_client_name` from response |
| `components/clients/client-detail-actions.tsx` | MODIFIED | Add "+ New Project" button |
| `components/workspace/overview-tab.tsx` | MODIFIED | Add "No client linked" card when `client_id` is null |

### External Service Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| Text path → AI pipeline | `recordings.transcript` field populated; same `/api/generate-estimate` route | No change to API route signature |
| Photos-first → AI pipeline | Reuses `/api/analyze-photos` + `/api/generate-estimate`; `estimate-tab.tsx` `hasPhotos` logic already correct | No change needed |
| Client linking → Supabase | Direct DB queries in server action using user-scoped Supabase client (RLS enforced) | Must select only `company_id`-scoped clients |
| "New Project" button → wizard | URL searchParam `?clientId=` — no server state, no extra API call | Consistent with existing `?tab=` pattern in workspace |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| Wizard → capture/describe/photos-input | `router.push(url)` after project creation | Same as existing audio path |
| DescribeClient → recording action | `createTextTranscript` server action (new function) | Do NOT reuse `createRecording` — signature mismatch |
| PhotosInputClient → existing photo actions | `createPhoto` action + `PhotoDropZone` component reused as-is | Zero changes to photo pipeline |
| generate-estimate route → link action | Direct server-side function call (same module boundary as other actions) | Runs after estimate is persisted to avoid partial-state |
| AI adapters → EstimateOutput type | `detected_client_name` is optional — backward compatible | Null-safe everywhere downstream |

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| Current (hundreds of users) | All new paths share the existing serverless API routes. No concurrency concerns. |
| 1k-10k users | Client name matching uses a simple case-insensitive index on `clients.name`. Add `CREATE INDEX clients_name_lower_idx ON clients (lower(name))` if query latency becomes measurable. |
| 10k+ users | Client linking is a post-generation side effect. If it needs to be async, a Supabase Edge Function or Vercel background job handles it. No architectural change required at current scale. |

## Anti-Patterns

### Anti-Pattern 1: Adding Client Select Back as Optional Step

**What people do:** Keep the client select step but mark it "optional" (skip button added).

**Why it's wrong:** "Optional" steps in mobile wizards still add friction. The SEED-007 intent is zero required steps before content capture — any additional tap before the content input is a regression on the core UX goal.

**Do this instead:** Remove the client select step entirely from the wizard. Client association happens either via pre-selected `?clientId=` (entry from client detail page) or via AI inference post-generation or via the Overview tab card post-creation.

### Anti-Pattern 2: Creating a Separate `text_inputs` Table

**What people do:** Create a new DB table for text inputs to avoid "polluting" the recordings table with rows that have no audio file.

**Why it's wrong:** The entire downstream pipeline (generate-estimate route, `hasTranscript` check in estimate-tab, transcript editor) reads from `recordings.transcript`. Introducing a parallel table doubles the read paths and requires changes to every consumer.

**Do this instead:** Use the existing `recordings` table with `storage_path = null` for text entries. If `storage_path` has a NOT NULL constraint in the migration, add a DB migration to make it nullable. This is a one-line migration, not a schema redesign.

### Anti-Pattern 3: Calling `linkClientAction` Before Estimate Generation

**What people do:** Try to run client linking as part of wizard submission so the project already has a client before the workspace loads.

**Why it's wrong:** Client name extraction requires the AI to analyze the content first. There is no content at wizard time — the project is just a draft row. Pre-generation, there is nothing to extract from.

**Do this instead:** Run `linkClientAction` as a post-generation step inside `app/api/generate-estimate/route.ts`, after the estimate rows are committed. The Overview tab handles the interim state with a "No client linked" card.

### Anti-Pattern 4: Duplicating the Capture Layout

**What people do:** Create a new `(describe)` route group with its own layout file for the text and photos-first routes.

**Why it's wrong:** The `(capture)` layout provides exactly what these routes need: `fixed inset-0 z-50 bg-background flex flex-col`. Creating a second identical layout adds files for no benefit.

**Do this instead:** Place `/describe` and `/photos-input` inside the existing `app/(capture)/projects/[id]/` directory. They inherit the full-screen layout automatically.

## Build Order

Dependencies govern this order strictly:

1. **DB migration (if needed)** — Verify `recordings.storage_path` nullability. If NOT NULL, run migration first. This unblocks the text path.
2. **`lib/schemas/project.ts`** — Make `clientId` optional. This unblocks the modified `createProjectAction`.
3. **`lib/actions/project.ts`** — Accept optional `clientId`. This unblocks the wizard changes.
4. **`app/(app)/projects/new/page.tsx`** — Read `?clientId` searchParam. Unblocks client detail "New Project" button.
5. **`components/projects/step-modal-choice.tsx`** (NEW) — Pure UI, no dependencies on later steps.
6. **`components/projects/new-project-wizard.tsx`** — Wire in `StepModalChoice`, remove mandatory client select, add redirect by mode. Requires steps 2-5 complete.
7. **`lib/actions/recording.ts`** — Add `createTextTranscript`. Unblocks describe route.
8. **`app/(capture)/projects/[id]/describe/`** (NEW, 3 files) — Text input route. Requires steps 3, 6, 7.
9. **`app/(capture)/projects/[id]/photos-input/`** (NEW, 3 files) — Photos-first route. Requires steps 3, 6. (Photo actions already exist.)
10. **`components/clients/client-detail-actions.tsx`** — Add "+ New Project" button. Requires step 4.
11. **`lib/ai/types.ts`** — Add `detected_client_name` to `EstimateOutput`. Unblocks adapter changes.
12. **`lib/ai/prompt-builder.ts`** — Add client extraction instruction. Requires step 11.
13. **`lib/ai/providers/anthropic.ts` + `gemini.ts`** — Parse `detected_client_name`. Requires steps 11-12.
14. **`lib/actions/client-link.ts`** (NEW) — `linkClientAction`. Requires steps 11-13 conceptually, but can be written in parallel.
15. **`app/api/generate-estimate/route.ts`** — Wire in `linkClientAction` after estimate persist. Requires steps 11-14.
16. **`components/workspace/overview-tab.tsx`** — Add "No client linked" card. Can be built any time but most useful after step 15 is live.

## Sources

- Direct inspection of `components/projects/new-project-wizard.tsx` — 1-step wizard, `router.push` to `/capture`
- Direct inspection of `lib/actions/project.ts` — `createProjectAction` currently requires `clientId`
- Direct inspection of `lib/schemas/project.ts` — `clientId: z.string().min(1)` validation
- Direct inspection of `app/(capture)/layout.tsx` — full-screen layout reusable for new routes
- Direct inspection of `app/(capture)/projects/[id]/capture/page.tsx` + `capture-client.tsx` — server/client split pattern
- Direct inspection of `app/api/generate-estimate/route.ts` — transcript + photo description pipeline, project name patching
- Direct inspection of `lib/ai/types.ts` + `lib/ai/prompt-builder.ts` — `EstimateInput`/`EstimateOutput` type boundaries
- Direct inspection of `components/workspace/estimate/estimate-tab.tsx` — `hasTranscript || hasPhotos` gate already correct
- Direct inspection of `components/workspace/photos/photo-drop-zone.tsx` + `photos-tab.tsx` — reusable as-is
- Direct inspection of `components/clients/client-detail-actions.tsx` — Edit/Delete button pattern; "New Project" slots here
- Direct inspection of `app/(app)/clients/[id]/page.tsx` — server component structure, `ClientDetailActions` usage
- Direct inspection of `lib/queries/recording.ts` — `Recording.storage_path: string` currently (not typed as nullable)
- `.planning/seeds/SEED-005-multi-modal-project-input.md` — multi-modal UX intent
- `.planning/seeds/SEED-007-frictionless-client-project-association.md` — AI client extraction + "New Project" button intent

---
*Architecture research for: v1.5 Zero-friction Project Onboarding*
*Researched: 2026-05-08*
