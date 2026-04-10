# Phase 4: Project Creation & Workspace - Research

**Researched:** 2026-04-10
**Domain:** Multi-step wizard UI, tabbed workspace layout, Supabase CRUD, activity logging
**Confidence:** HIGH

## Summary

Phase 4 builds two main features: a 3-step new project wizard at `/projects/new` and a 5-tab project workspace at `/projects/[id]`. The codebase already has all the patterns needed -- the onboarding wizard (Phase 2) provides the stepper pattern, the client CRUD (Phase 3) provides the server action and query patterns, and all required shadcn/ui components (Tabs, Card, Form, Command, Select, etc.) are already installed.

The database schema is fully ready -- `projects` table has all required columns (name, project_type, status, target_budget, total, client_id) and `estimate_activity` table exists with event_type + metadata JSONB for the activity timeline. RLS policies are already in place for both tables. No new migrations are needed.

**Primary recommendation:** Reuse the wizard stepper pattern from `OnboardingWizard`, reuse `getAuthContext()` from `lib/actions/project.ts`, add `createProjectAction` to the existing file, create `lib/queries/project.ts` following the `getClients`/`getDashboardStats` query pattern, and build the workspace as a dynamic route with client-side shadcn/ui Tabs.

<user_constraints>

## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Wizard is a full-page route (`/projects/new`), not a modal
- **D-02:** Step 1 is searchable dropdown of existing clients with inline "Add new client" form (name required, email/phone optional)
- **D-03:** Step 2 has project name with auto-suggestion ("{Client Name} - {Project Type}"), project type from `INDUSTRIES[company.industry].projectTypes` with "Custom" option, optional target budget
- **D-04:** Step 3 is read-only confirmation summary, "Create Project" inserts to `projects`, logs `estimate_activity` event, redirects to `/projects/[id]`
- **D-05:** Same stepper pattern as onboarding wizard, ~700px max-width card
- **D-06:** react-hook-form + zod for validation
- **D-07:** Workspace at `/projects/[id]` with project name in topbar and 5 shadcn/ui Tabs
- **D-08:** Tabs are client-side switches (not separate routes); tabs 2-5 show placeholder messages
- **D-09:** Overview tab shows: project summary card, activity timeline, quick stats
- **D-10:** Activity timeline is vertical list with icon, description, relative time
- **D-11:** Project status state machine: draft -> recording -> photos_added -> estimate_ready -> sent -> accepted/declined
- **D-12:** Add `createProjectAction` to existing `lib/actions/project.ts`
- **D-13:** Add `lib/queries/project.ts` for `getProjectById`, `getProjectActivity`

### Claude's Discretion
- Tab icon choices (Lucide icons)
- Activity timeline visual design
- Confirmation step layout and styling
- Whether to show "back to dashboard" breadcrumb in workspace
- Quick stats card layout in Overview tab

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope.

</user_constraints>

<phase_requirements>

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| PROJ-01 | New project wizard has 3 steps: client selection, project details, confirmation | Reuse OnboardingWizard stepper pattern, StepIndicator component |
| PROJ-02 | User can select existing client or create new one inline | shadcn/ui Command (combobox) for search + inline form; `getClients` query exists, `createClientAction` exists |
| PROJ-03 | Project name auto-suggests based on client name + project type | Client-side logic: watch client + type fields, compute suggestion |
| PROJ-04 | Project type dropdown populated from company's industry config | `INDUSTRIES` config with `projectTypes` per industry already exists; need company.industry from server |
| PROJ-05 | User can enter custom project type if "Custom" selected | Conditional text input revealed when "Custom" selected in dropdown |
| PROJ-06 | User can optionally enter target budget (USD) | `target_budget NUMERIC(12,2)` column exists on projects table |
| PROJ-07 | Confirmation step shows summary before creating | Read-only card with all collected data |
| PROJ-08 | After creation, user redirected to Project Workspace | `redirect('/projects/${id}')` after successful insert |
| WS-01 | Project workspace has 5 tabs: Overview, Audio Recording, Photos, AI Estimate, Preview & Send | shadcn/ui Tabs component already installed |
| WS-02 | Overview tab shows project summary card, activity timeline, quick stats | `getProjectById` + `getProjectActivity` queries, count queries for stats |
| WS-03 | Project status displayed and updates automatically | `StatusBadge` component exists; status field on projects table |

</phase_requirements>

## Project Constraints (from CLAUDE.md)

- **Tech Stack**: Next.js 14+ (App Router), TypeScript strict, Tailwind CSS, shadcn/ui, react-hook-form + zod
- **Database**: Supabase PostgreSQL with RLS on all tables
- **Security**: Service role key never exposed to browser; all mutations via server actions
- **Mobile**: All screens must be responsive (UX-01), 44px touch targets (UX-02)

## Standard Stack

### Core (Already Installed)
| Library | Purpose | Why Standard |
|---------|---------|--------------|
| next | App Router, server components, server actions | Project foundation |
| @supabase/supabase-js | Database queries via RLS | Project database layer |
| react-hook-form | Form state management | Project standard (D-06) |
| zod | Schema validation | Project standard (D-06) |
| @hookform/resolvers | Zod-to-RHF bridge | Already used in all forms |
| sonner | Toast notifications | Already used project-wide |
| lucide-react | Icons | Already used project-wide |

### shadcn/ui Components (Already Installed)
| Component | Purpose in Phase 4 |
|-----------|---------------------|
| Tabs | 5-tab workspace layout (WS-01) |
| Card | Summary cards, wizard card |
| Command | Searchable client combobox (PROJ-02) |
| Popover | Command dropdown wrapper |
| Select | Project type dropdown (PROJ-04) |
| Form | Form field wrappers |
| Input | Text inputs |
| Button | Actions |
| Badge | Status badges |
| Separator | Visual dividers |
| Skeleton | Loading states |

**No new packages needed.** Everything is already installed.

## Architecture Patterns

### New File Structure
```
app/(app)/projects/
  new/
    page.tsx                    # Server component: fetch company + clients, render wizard
  [id]/
    page.tsx                    # Server component: fetch project + activity, render workspace
    loading.tsx                 # Skeleton loader for workspace
lib/
  schemas/
    project.ts                 # Zod schema for project creation form
  queries/
    project.ts                 # getProjectById, getProjectActivity
  actions/
    project.ts                 # ADD createProjectAction (file exists)
components/
  projects/
    new-project-wizard.tsx      # Client component: 3-step wizard
    step-client-select.tsx      # Step 1: client search + inline create
    step-project-details.tsx    # Step 2: name, type, budget
    step-confirmation.tsx       # Step 3: read-only summary
    project-step-indicator.tsx  # Reusable step indicator (adapt from onboarding)
  workspace/
    project-workspace.tsx       # Client component: tab container
    overview-tab.tsx            # Overview tab content
    activity-timeline.tsx       # Activity timeline list
    quick-stats.tsx             # Stats cards (recordings, photos, estimates)
    placeholder-tab.tsx         # Generic "Coming in Phase X" placeholder
```

### Pattern 1: Wizard with Shared useForm (from OnboardingWizard)
**What:** Single `useForm` instance shared across all wizard steps. Step validation uses `form.trigger(fields)` before advancing.
**When to use:** Multi-step forms where data must persist across steps.
**Example (from existing code):**
```typescript
// From onboarding-wizard.tsx -- same pattern applies
const form = useForm<ProjectFormValues>({
  resolver: zodResolver(projectSchema) as any,
  mode: 'onBlur',
  defaultValues: { clientId: '', clientName: '', ... },
})

async function handleNext() {
  const fields = STEP_FIELDS[currentStep]
  const valid = await form.trigger(fields as (keyof ProjectFormValues)[])
  if (valid && currentStep < 3) setCurrentStep(prev => prev + 1)
}
```

### Pattern 2: Server Action with getAuthContext (from existing project.ts)
**What:** Server actions call `getAuthContext()` to validate auth and get company_id. Return `{ data }` or `{ error }`.
**When to use:** All mutations.
**Example (from existing code):**
```typescript
export async function createProjectAction(formData: ProjectFormValues) {
  const ctx = await getAuthContext()
  if ('error' in ctx) return { error: ctx.error }
  const { supabase, company } = ctx

  // Insert project
  const { data: project, error } = await supabase
    .from('projects')
    .insert({ company_id: company.id, ... })
    .select()
    .single()

  // Log activity
  await supabase.from('estimate_activity').insert({
    project_id: project.id,
    company_id: company.id,
    event_type: 'project_created',
    metadata: { project_name: formData.name },
  })

  revalidatePath('/dashboard')
  return { data: project }
}
```

### Pattern 3: Query Functions with Typed Returns (from existing queries/)
**What:** Query functions take `supabase` client + `companyId`, return typed data. Called from server components.
**When to use:** All data fetching.
**Example:**
```typescript
export interface ProjectDetail {
  id: string
  name: string
  project_type: string | null
  status: string
  target_budget: number | null
  total: number
  created_at: string
  client: { id: string; name: string } | null
}

export async function getProjectById(
  supabase: SupabaseClient,
  projectId: string
): Promise<ProjectDetail | null> {
  const { data } = await supabase
    .from('projects')
    .select('*, client:clients(id, name)')
    .eq('id', projectId)
    .single()
  return data
}
```

### Pattern 4: Client-Side Tabs (D-08)
**What:** shadcn/ui Tabs component with `defaultValue="overview"`. No URL routing per tab.
**When to use:** Fast switching between content panels within a single page.
**Example:**
```typescript
<Tabs defaultValue="overview" className="w-full">
  <TabsList>
    <TabsTrigger value="overview"><ClipboardList /> Overview</TabsTrigger>
    <TabsTrigger value="audio"><Mic /> Audio</TabsTrigger>
    ...
  </TabsList>
  <TabsContent value="overview"><OverviewTab project={project} ... /></TabsContent>
  <TabsContent value="audio"><PlaceholderTab phase={5} title="Audio Recording" /></TabsContent>
  ...
</Tabs>
```

### Pattern 5: Client Combobox with Inline Create (PROJ-02)
**What:** shadcn/ui Command inside a Popover for searchable client selection. "Add new client" option at top opens inline form fields.
**When to use:** Entity selection with creation fallback.
**Key detail:** The Command component is already installed. Use `CommandInput` for search, `CommandItem` for each client, and a special item that toggles inline form visibility.

### Anti-Patterns to Avoid
- **Separate route per tab:** D-08 explicitly says client-side tab switching. Do NOT create `/projects/[id]/audio`, `/projects/[id]/photos`, etc.
- **Separate useForm per step:** The onboarding pattern uses a single `useForm`. Don't create three separate form instances.
- **Fetching company industry client-side:** The wizard page is a server component. Fetch `company.industry` server-side and pass it as a prop.
- **Duplicating getAuthContext:** Both `lib/actions/client.ts` and `lib/actions/project.ts` define their own `getAuthContext()`. Don't create a third copy. Use the one already in `project.ts`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Searchable dropdown | Custom dropdown with filter | shadcn/ui Command + Popover | Keyboard nav, accessibility, ARIA |
| Step indicator | Custom stepper from scratch | Adapt existing StepIndicator pattern | Already proven in Phase 2 |
| Relative time display | Custom time formatting | `Intl.RelativeTimeFormat` or simple helper | Built-in browser API |
| Tab navigation | Custom tab state | shadcn/ui Tabs | Accessible, keyboard-navigable |
| Form validation | Manual validation | react-hook-form + zod | Project standard |

## Common Pitfalls

### Pitfall 1: zodResolver Type Mismatch with Zod v4
**What goes wrong:** TypeScript errors when passing zodResolver to useForm with optional fields.
**Why it happens:** Known zod v4 + react-hook-form type incompatibility.
**How to avoid:** Cast resolver to `any` as established in Phase 2: `resolver: zodResolver(schema) as any`
**Warning signs:** Type errors on `resolver` prop.

### Pitfall 2: Inline Client Creation Must Return Client ID
**What goes wrong:** After creating a client inline, the wizard needs the new client's ID to associate with the project.
**Why it happens:** `createClientAction` returns `{ data: client }` with the full record including ID.
**How to avoid:** After inline creation succeeds, set the form's `clientId` field to `client.id` and auto-close the inline form. Store both `clientId` (for submission) and `clientName` (for display/auto-suggestion).
**Warning signs:** Project created without client association.

### Pitfall 3: Auto-Suggestion Must Not Override User Edits
**What goes wrong:** Project name auto-suggestion overwrites user's manual edit every time client or type changes.
**Why it happens:** Naive implementation watches client + type and always sets name.
**How to avoid:** Track a `nameManuallyEdited` boolean. Only auto-suggest when the user hasn't manually typed in the name field. Reset the flag when client/type changes AND name matches the previous auto-suggestion.
**Warning signs:** User types custom name, selects different type, name gets overwritten.

### Pitfall 4: Next.js 16 Dynamic Route Params Are Promises
**What goes wrong:** `params.id` is undefined or errors in server components.
**Why it happens:** Next.js 16 changed params to `Promise<{ id: string }>`.
**How to avoid:** Use `const { id } = await params` pattern as established in Phase 3 decision.
**Warning signs:** Runtime error about params being a Promise.

### Pitfall 5: estimate_activity Insert Needs company_id
**What goes wrong:** RLS blocks the activity insert.
**Why it happens:** The `estimate_activity` table has `company_id NOT NULL` with RLS checking company ownership.
**How to avoid:** Always include `company_id` when inserting activity records.
**Warning signs:** Activity not appearing, silent Supabase error.

### Pitfall 6: Redirect After Server Action
**What goes wrong:** `redirect()` inside a server action throws `NEXT_REDIRECT` error.
**Why it happens:** Next.js uses throw-based redirects internally.
**How to avoid:** Either (a) return the project ID from the server action and call `router.push()` client-side, or (b) wrap the server action call in try/catch that ignores NEXT_REDIRECT. Pattern (a) is cleaner for wizards since you need the ID.
**Warning signs:** Uncaught error in console.

## Code Examples

### Project Zod Schema
```typescript
// lib/schemas/project.ts
import { z } from 'zod'

export const projectSchema = z.object({
  clientId: z.string().min(1, 'Please select a client'),
  name: z.string().min(1, 'Project name is required'),
  projectType: z.string().min(1, 'Please select a project type'),
  customProjectType: z.string().optional().or(z.literal('')),
  targetBudget: z.string().optional().or(z.literal('')),
})

export type ProjectFormValues = z.infer<typeof projectSchema>
```

### Activity Timeline Query
```typescript
// lib/queries/project.ts
export interface ActivityEvent {
  id: string
  event_type: string
  metadata: Record<string, unknown> | null
  created_at: string
}

export async function getProjectActivity(
  supabase: SupabaseClient,
  projectId: string
): Promise<ActivityEvent[]> {
  const { data } = await supabase
    .from('estimate_activity')
    .select('id, event_type, metadata, created_at')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })
  return data ?? []
}
```

### Quick Stats Query
```typescript
export async function getProjectQuickStats(
  supabase: SupabaseClient,
  projectId: string
) {
  const [recordings, photos, estimates] = await Promise.all([
    supabase.from('recordings').select('*', { count: 'exact', head: true }).eq('project_id', projectId),
    supabase.from('photos').select('*', { count: 'exact', head: true }).eq('project_id', projectId),
    supabase.from('estimates').select('*', { count: 'exact', head: true }).eq('project_id', projectId),
  ])
  return {
    recordingCount: recordings.count ?? 0,
    photoCount: photos.count ?? 0,
    estimateCount: estimates.count ?? 0,
  }
}
```

### Relative Time Helper
```typescript
// lib/utils/relative-time.ts
export function relativeTime(dateString: string): string {
  const now = Date.now()
  const then = new Date(dateString).getTime()
  const diffMs = now - then
  const diffSec = Math.floor(diffMs / 1000)
  const diffMin = Math.floor(diffSec / 60)
  const diffHr = Math.floor(diffMin / 60)
  const diffDay = Math.floor(diffHr / 24)

  if (diffSec < 60) return 'just now'
  if (diffMin < 60) return `${diffMin} minute${diffMin === 1 ? '' : 's'} ago`
  if (diffHr < 24) return `${diffHr} hour${diffHr === 1 ? '' : 's'} ago`
  if (diffDay < 30) return `${diffDay} day${diffDay === 1 ? '' : 's'} ago`
  return new Date(dateString).toLocaleDateString()
}
```

### Recommended Tab Icons
```typescript
import {
  ClipboardList,  // Overview
  Mic,            // Audio Recording
  Camera,         // Photos
  Sparkles,       // AI Estimate
  Send,           // Preview & Send
} from 'lucide-react'
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Pages Router dynamic routes | App Router `[id]` with Promise params | Next.js 15/16 | Must await params |
| useRouter from next/router | useRouter from next/navigation | Next.js 13+ | Different API |
| API routes for mutations | Server Actions ('use server') | Next.js 14+ | Project uses this pattern |

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest + jsdom |
| Config file | `vitest.config.ts` |
| Quick run command | `npx vitest run --reporter verbose` |
| Full suite command | `npx vitest run --reporter verbose` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PROJ-01 | 3-step wizard flow | unit | `npx vitest run tests/unit/components/new-project-wizard.test.tsx -x` | Wave 0 |
| PROJ-02 | Client selection + inline create | unit | `npx vitest run tests/unit/components/step-client-select.test.tsx -x` | Wave 0 |
| PROJ-03 | Project name auto-suggestion | unit | `npx vitest run tests/unit/schemas/project-schema.test.ts -x` | Wave 0 |
| PROJ-04 | Project type from industry config | unit | `npx vitest run tests/unit/components/step-project-details.test.tsx -x` | Wave 0 |
| PROJ-05 | Custom project type input | unit | (covered in step-project-details test) | Wave 0 |
| PROJ-06 | Optional target budget | unit | (covered in schema test) | Wave 0 |
| PROJ-07 | Confirmation summary display | unit | `npx vitest run tests/unit/components/step-confirmation.test.tsx -x` | Wave 0 |
| PROJ-08 | Redirect after creation | unit | `npx vitest run tests/unit/actions/project-actions.test.ts -x` | Wave 0 |
| WS-01 | 5-tab workspace layout | unit | `npx vitest run tests/unit/components/project-workspace.test.tsx -x` | Wave 0 |
| WS-02 | Overview tab content | unit | `npx vitest run tests/unit/components/overview-tab.test.tsx -x` | Wave 0 |
| WS-03 | Status display | unit | (covered in workspace test) | Wave 0 |

### Sampling Rate
- **Per task commit:** `npx vitest run --reporter verbose`
- **Per wave merge:** `npx vitest run --reporter verbose`
- **Phase gate:** Full suite green before verification

### Wave 0 Gaps
- [ ] `tests/unit/schemas/project-schema.test.ts` -- covers PROJ-03, PROJ-06 (schema validation)
- [ ] `tests/unit/actions/project-actions.test.ts` -- covers PROJ-08 (createProjectAction)
- [ ] `tests/unit/queries/project-queries.test.ts` -- covers WS-02 (getProjectById, getProjectActivity)

## Open Questions

1. **getAuthContext Duplication**
   - What we know: Both `lib/actions/client.ts` and `lib/actions/project.ts` define identical `getAuthContext()` functions.
   - What's unclear: Whether to extract to a shared utility or leave duplicated.
   - Recommendation: Leave as-is for now (established pattern). Can be refactored later. Not blocking.

2. **Company Industry for Project Type Dropdown**
   - What we know: The wizard needs `company.industry` to look up `INDUSTRIES[industry].projectTypes`. The `(app)/layout.tsx` fetches company but only passes `id, name, logo_url, owner_name`.
   - What's unclear: Whether to fetch industry in the layout or in the wizard page server component.
   - Recommendation: Fetch in the wizard page server component (keep layout fetch minimal). Pass `company.industry` as a prop to the wizard client component.

## Sources

### Primary (HIGH confidence)
- Existing codebase: `lib/actions/project.ts`, `lib/actions/client.ts`, `lib/queries/clients.ts`, `lib/queries/dashboard.ts` -- established patterns
- Existing codebase: `components/onboarding/onboarding-wizard.tsx`, `components/onboarding/step-indicator.tsx` -- wizard stepper pattern
- Existing codebase: `supabase/migrations/20260409000001_initial_schema.sql` -- database schema with projects + estimate_activity tables
- Existing codebase: `lib/industries.ts` -- INDUSTRIES config with projectTypes
- Existing codebase: `components/ui/tabs.tsx`, `components/ui/command.tsx` -- shadcn/ui components installed

### Secondary (MEDIUM confidence)
- STATE.md decisions -- Next.js 16 params pattern, zodResolver cast, established conventions

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all libraries already installed and used in Phases 1-3
- Architecture: HIGH -- all patterns directly observable in existing codebase
- Pitfalls: HIGH -- derived from actual issues encountered in prior phases (zodResolver cast, NEXT_REDIRECT, params Promise)

**Research date:** 2026-04-10
**Valid until:** 2026-05-10 (stable -- no external dependencies, all internal patterns)
