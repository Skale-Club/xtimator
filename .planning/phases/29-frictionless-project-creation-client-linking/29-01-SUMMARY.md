---
phase: 29-frictionless-project-creation-client-linking
plan: "01"
subsystem: ui
tags: [project-wizard, client-linking, zod, shadcn, popover]

# Dependency graph
requires:
  - phase: 27-capture-schema-migration
    provides: projects.client_id is nullable in DB, projects table ready for optional client_id
provides:
  - Client field optional in project creation wizard (no blocking validation)
  - "No client (continue without linking)" option in wizard client selector
  - "New Project" button on client detail page for quick project creation pre-linked to client
  - "Link Client" card in project Overview tab for projects without a linked client
  - createProjectWithClientAction and linkProjectToClient server actions
affects:
  - Phase 30 (AI client extraction) — client linking infrastructure exists for AI to match against
  - Project workspace (overview-tab.tsx)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "useTransition wraps client linking for non-blocking UX"
    - "API route (/api/clients) for lazy-loading clients in LinkClientCard popover"
    - "setValue(clientId, undefined) pattern for optional zod fields"

key-files:
  created:
    - components/clients/client-new-project-button.tsx
    - components/workspace/link-client-card.tsx
    - app/api/clients/route.ts
  modified:
    - components/projects/step-client-select.tsx
    - components/projects/new-project-wizard.tsx
    - app/(app)/clients/[id]/page.tsx
    - components/workspace/overview-tab.tsx
    - lib/actions/project.ts

key-decisions:
  - "setValue(clientId, undefined) — undefined is treated as optional by zod, not empty string (which fails validation)"
  - "/api/clients lightweight endpoint for client search in LinkClientCard popover (avoids importing getClients)"
  - "LinkClientCard uses lazy fetch on popover open (client state + loaded flag pattern)"

patterns-established:
  - "No client option at top of command list with dash icon (—) to visually distinguish from real clients"
  - "ClientNewProjectButton placed alongside ClientDetailActions in client detail page header"

requirements-completed:
  - CLIENTASSOC-01
  - CLIENTASSOC-02
  - CLIENTASSOC-04

# Metrics
duration: 8min
completed: 2026-05-09
---

# Phase 29: Frictionless Project Creation & Client Linking Summary

**Client-optional project creation with linking from wizard, client detail, and project overview surfaces**

## Performance

- **Duration:** 8 min
- **Started:** 2026-05-09T17:40:12Z
- **Completed:** 2026-05-09T17:48:00Z
- **Tasks:** 3
- **Files modified:** 8

## Accomplishments
- Made client optional in project creation wizard — "No client" option at top of selector, form submits without client
- Added "New Project" button on client detail page that creates a project pre-linked to that client and navigates to capture
- Added "Link Client" card in project Overview tab shown only when project has no linked client, with popover client selector
- Implemented createProjectWithClientAction and linkProjectToClient server actions
- Created lightweight /api/clients endpoint for client search in LinkClientCard popover

## Task Commits

Each task was committed atomically:

1. **Task 1: Make client optional in wizard UI (CLIENTASSOC-01)** - `3aa13ef` (feat)
2. **Task 2: Add New Project button on client detail page (CLIENTASSOC-02)** - `2439511` (feat)
3. **Task 3: Add Link Client card in project Overview (CLIENTASSOC-04)** - `2439511` (feat)

**Plan metadata:** `2439511` (docs: complete plan)

## Files Created/Modified
- `components/projects/step-client-select.tsx` — added "No client" option, updated header to "Select a client (optional)"
- `components/projects/new-project-wizard.tsx` — removed form.trigger validation (client is optional), default clientId to undefined
- `lib/actions/project.ts` — added createProjectWithClientAction and linkProjectToClient server actions
- `components/clients/client-new-project-button.tsx` — new client component for creating pre-linked projects
- `app/(app)/clients/[id]/page.tsx` — added ClientNewProjectButton next to ClientDetailActions
- `components/workspace/link-client-card.tsx` — new card shown when project has no client, uses popover client selector
- `components/workspace/overview-tab.tsx` — render LinkClientCard when project.client is null
- `app/api/clients/route.ts` — new lightweight endpoint for client search in LinkClientCard popover

## Decisions Made
- `setValue(clientId, undefined)` pattern used for optional client field (undefined is treated as optional by zod, not empty string which fails validation)
- `/api/clients` lightweight endpoint created for client search in LinkClientCard popover to avoid importing server-side getClients
- LinkClientCard uses lazy fetch with client state + loaded flag pattern to avoid SSR issues
- "No client" option uses em-dash (—) icon to visually distinguish from real client items

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None - all three tasks completed cleanly with no blocking issues.

## Next Phase Readiness
- Client linking infrastructure complete — Phase 30 can use this as foundation for AI-powered client suggestion
- All 3 CLIENTASSOC requirements (01, 02, 04) fulfilled
- Build passes with no TypeScript errors

---
*Phase: 29-frictionless-project-creation-client-linking*
*Completed: 2026-05-09*