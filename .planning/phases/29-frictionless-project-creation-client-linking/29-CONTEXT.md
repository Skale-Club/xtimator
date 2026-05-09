# Phase 29: Frictionless Project Creation & Client Linking — Context

**Gathered:** 2026-05-09
**Status:** Ready for planning

<domain>
## Phase Boundary

Remove the mandatory client step from project creation. Users can create projects without selecting a client, and can link a client later from multiple surfaces.

**Phase 27 prerequisite completed:**
- `projects.client_id` is optional in schema (nullable in DB)
- Phase 27 migration made client_id nullable

**Phase 28 prerequisite completed:**
- Multi-modal capture screen works without client
- Users can generate estimates from text/photos without client

**This phase scope:**
- Make client field optional in wizard UI (currently displays as required)
- Add "New Project" button on client detail page
- Add "Link client" card in project Overview when no client linked
- (No changes needed to createProjectAction - already handles optional clientId)

**Phase 30 context:** After this phase, users can link clients manually. Phase 30 adds AI-powered client detection toast after estimate generation.

</domain>

<decisions>
## Implementation Decisions

### D-01: Wizard "Skip Client" option
- StepClientSelect needs a "No client" or "Skip" option
- Add an option in the combobox: "No client (continue without)" 
- When selected, set clientId to undefined (not empty string, which fails validation)
- Update button label from "Select a Client" to "Select a client (optional)" or add helper text

### D-02: Client Detail "New Project" button
- Add a Button component at top of client detail page (above Client info card or in the header)
- On click: call createProjectAction with that clientId pre-filled and navigate to capture screen
- Use a direct redirect pattern: server action returns project → client router.push to `/projects/{id}/capture`
- Button text: "New Project"

### D-03: Overview "Link Client" card
- In OverviewTab, conditionally render a card when `project.client` is null
- Card: "Link this project to a client" with a button to open a client selector
- Reuse the client selector pattern from StepClientSelect (popover with search + create inline)
- After linking: revalidatePath to refresh project data and hide the card
- Server action: linkProjectToClient(projectId, clientId) - simple UPDATE query

### D-04: linkProjectToClient server action
- Add to lib/actions/project.ts
- Takes projectId and clientId
- UPDATE projects SET client_id = clientId WHERE id = projectId
- Returns { data: { updated: true } } on success

</decisions>

<canonical_refs>
## Canonical References

### Files to modify
- `components/projects/step-client-select.tsx` — add "No client" option, update UI to show optional
- `components/projects/new-project-wizard.tsx` — change "Select a Client" header to indicate optional
- `app/(app)/clients/[id]/page.tsx` — add "New Project" button
- `components/workspace/overview-tab.tsx` — add Link Client card when no client
- `lib/actions/project.ts` — add linkProjectToClient action

### Files to create
- None needed (reuse existing patterns)

### Existing patterns
- StepClientSelect already has client search + inline create
- createProjectAction already handles optional clientId
- ClientDetailActions already shows in client detail header

</canonical_refs>

<code_context>

## Existing Code Insights

### StepClientSelect — current structure
```
- Popover with combobox showing client list
- "Add new client" option at top
- Inline create form with name/email/phone
- No "skip" or "no client" option
- Form validates clientId as required (form.trigger(['clientId']))
```

### NewProjectWizard — current flow
```
- form.trigger(['clientId']) validates before submit
- Error if clientId is empty string (falsy but not undefined)
```

### Client detail page — current header
```
- Back link
- Client info card (with ClientDetailActions for edit/delete)
- Projects list below
- No "New Project" button currently
```

### OverviewTab — current structure
```
- Project Summary Card (shows client name or "No client")
- QuickStats
- ActivityTimeline
- No link client UI
```

### What needs to change

1. **StepClientSelect:** Add "No client" CommandItem at top of list
2. **StepClientSelect:** When selected, set clientId to undefined (not empty string)
3. **NewProjectWizard:** Change validation trigger - maybe allow no client
4. **Client detail page:** Add "New Project" button that creates project with this client and navigates to capture
5. **OverviewTab:** Add LinkClientCard component, show when !project.client
6. **linkProjectToClient:** New server action for updating client_id

</code_context>

<specifics>
## Specific Ideas

- **"No client" UX:** Add CommandItem with value="no-client" that sets clientId to undefined (zod treats undefined as optional). Display text: "No client (continue without linking)"
- **Client detail new project:** Button placement - inside the Client info card header, next to ClientDetailActions. Or as a standalone button above the card.
- **Link client in Overview:** Use a Card with "Link Client" button. Clicking opens Popover with client selector (reuse StepClientSelect pattern but simplified - just search + select, no inline create).
- **Navigation after link:** After linking, the card should disappear. Use router.refresh() to revalidate or pass a callback to refetch data.

</specifics>

<deferred>
## Deferred Ideas

- "Create new client" inline form in Overview link card - deferred to future (just search existing clients)
- Auto-suggest client based on project name or content - that's Phase 30 (AI client extraction)
- Client quick-create in the link card - use existing /clients/new route instead

</deferred>

---

*Phase: 29-frictionless-project-creation-client-linking*
*Context gathered: 2026-05-09*