# Phase 4: Project Creation & Workspace - Context

**Gathered:** 2026-04-10
**Status:** Ready for planning

<domain>
## Phase Boundary

3-step new project wizard (client selection with inline creation, project details with auto-name suggestion, confirmation) and the 5-tab project workspace shell with a working Overview tab showing project summary card, activity timeline, and quick stats. The other 4 tabs (Audio, Photos, AI Estimate, Preview & Send) render as placeholder shells — their content is built in Phases 5-7.

</domain>

<decisions>
## Implementation Decisions

### New Project Wizard
- **D-01:** The wizard opens as a full-page route (`/projects/new`) rather than a modal. More room for inline client creation form. Accessible via "+ New Project" button in sidebar/dashboard.
- **D-02:** Step 1 (Client Selection): Searchable dropdown of existing clients with an "Add new client" option at the top. Selecting "Add new client" reveals an inline form (name required, email/phone optional) — same fields as the client Sheet from Phase 3, but inline. No navigation away from the wizard.
- **D-03:** Step 2 (Project Details): Project name text input with auto-suggestion ("{Client Name} – {Project Type}") that fills when both client and type are selected. User can override. Project type dropdown populated from `INDUSTRIES[company.industry].projectTypes` with a "Custom" option that reveals a text input (PROJ-05). Optional target budget field (USD).
- **D-04:** Step 3 (Confirmation): Read-only summary showing client name, project name, type, budget. "Create Project" button. On submit: insert into `projects` table, log `estimate_activity` event (event_type: 'project_created'), redirect to `/projects/[id]`.
- **D-05:** Same stepper pattern as onboarding wizard (Step indicator at top, Back/Next buttons). Reuse OnboardingCard-style wider card layout (~700px max-width).
- **D-06:** react-hook-form + zod for validation, consistent with all prior forms.

### Project Workspace
- **D-07:** `/projects/[id]` uses a layout with the project name as page title in the topbar and 5 tabs below (shadcn/ui Tabs). Tabs: Overview, Audio Recording, Photos, AI Estimate, Preview & Send.
- **D-08:** Tabs render as client-side tab switches (not separate routes) for fast switching. Content for tabs 2-5 shows placeholder "Coming in Phase X" messages for now.
- **D-09:** Overview tab shows: project summary card (name, client, type, status badge, total, created date, target budget), activity timeline (from estimate_activity table), and quick stats (recording count, photo count, estimate count — all zero initially).
- **D-10:** Activity timeline is a vertical list of timestamped events. Each entry shows: icon, event description, relative time ("2 hours ago"). Initially only "Project created" event exists.
- **D-11:** Project status state machine: draft → recording → photos_added → estimate_ready → sent → accepted/declined. Status auto-updates as actions happen in later phases. For now, only 'draft' and 'project_created' activity entry matter.

### Server Actions & Queries
- **D-12:** Use server action pattern (consistent with Phase 2-3): `lib/actions/project.ts` already has `deleteProjectAction` and `duplicateProjectAction`. Add `createProjectAction` to the same file.
- **D-13:** Add `lib/queries/project.ts` for `getProjectById`, `getProjectActivity`. These are server-side Supabase queries through RLS.

### Claude's Discretion
- Exact tab icon choices (Lucide icons)
- Activity timeline visual design (simple list vs card-based entries)
- Confirmation step layout and styling
- Whether to show a "back to dashboard" breadcrumb in workspace
- Quick stats card layout in Overview tab

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project Requirements
- `.planning/REQUIREMENTS.md` — PROJ-01 through PROJ-08 (project creation), WS-01 through WS-03 (workspace)
- `.planning/PROJECT.md` — Tech stack constraints, key decisions

### Prior Phase Context
- `.planning/phases/01-foundation-auth/01-CONTEXT.md` — Auth patterns, shadcn/ui New York style
- `.planning/phases/02-company-onboarding/02-CONTEXT.md` — Wizard stepper pattern, form validation approach
- `.planning/phases/03-dashboard-client-management/03-CONTEXT.md` — App shell layout, client CRUD pattern, data layer conventions

### Database Schema
- `supabase/migrations/20260409000001_initial_schema.sql` — `projects` table (company_id, client_id, name, project_type, status, target_budget, total), `estimate_activity` table (project_id, event_type, metadata JSONB)

### Existing Code
- `lib/industries.ts` — `INDUSTRIES` config with `projectTypes` per industry (populates project type dropdown)
- `lib/actions/project.ts` — Existing `deleteProjectAction`, `duplicateProjectAction` (add `createProjectAction` here)
- `lib/queries/dashboard.ts` — Query pattern to follow for new project queries
- `lib/queries/clients.ts` — `getClients` for client selector dropdown
- `lib/schemas/client.ts` — Zod schema pattern to follow for project schema
- `components/dashboard/status-badge.tsx` — Reusable status badge component
- `components/dashboard/empty-state.tsx` — Reusable empty state component
- `components/onboarding/onboarding-wizard.tsx` — Wizard stepper pattern reference

### Roadmap
- `.planning/ROADMAP.md` §Phase 4 — Plan descriptions, success criteria

No external specs — requirements fully captured in decisions above and REQUIREMENTS.md.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `components/dashboard/status-badge.tsx` — Status badges with color coding, reuse in workspace
- `components/dashboard/empty-state.tsx` — Empty state pattern with CTA
- `lib/industries.ts` — INDUSTRIES with projectTypes array per industry
- `lib/queries/clients.ts` — getClients query for client selector
- `lib/actions/project.ts` — Existing project actions (delete, duplicate)
- All shadcn/ui components: Tabs, Card, Badge, Form, Input, Select, Command, Button, Dialog

### Established Patterns
- getClaims() for auth validation in server components
- Server actions in `lib/actions/` for mutations
- Queries in `lib/queries/` for data fetching
- Zod schemas in `lib/schemas/` for validation
- react-hook-form + zod for forms
- App shell layout at `app/(app)/layout.tsx`
- Skeleton loaders for loading states

### Integration Points
- `app/(app)/dashboard/page.tsx` — "+ New Project" button links to `/projects/new`
- `components/app-shell/nav-items.ts` — Add Projects/workspace nav items
- `lib/queries/dashboard.ts` — getProjects already queries project list (workspace adds per-project detail)
- `estimate_activity` table ready for activity log entries

</code_context>

<specifics>
## Specific Ideas

- The INDUSTRIES config already has `projectTypes` per industry — no new config needed
- `estimate_activity` table exists with event_type + metadata JSONB — use for activity timeline
- Project status field on `projects` table defaults to 'draft' — the state machine updates it in later phases
- The workspace shell with placeholder tabs is important foundation — Phases 5-7 fill in tab content

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 04-project-creation-workspace*
*Context gathered: 2026-04-10*
