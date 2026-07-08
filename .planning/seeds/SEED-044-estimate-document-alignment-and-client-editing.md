---
id: SEED-044
status: dormant
planted: 2026-07-08
planted_during: v4.17 shipped / no active milestone
trigger_when: When polishing the estimate document editor, project/client header fields, or estimate layout alignment.
scope: Medium
---

# SEED-044: Estimate Document Alignment and Client Editing

Do a complete visual and interaction review of the estimate document interior: company header, estimate title band, project/bill-to grid, summary, section headers, line item table, and inline editable fields.

The desktop estimate is close, but there are still several visible alignment and organization problems. Two specific issues must be fixed as part of the pass:

1. The editable project name underline currently looks serrated/dotted. It should be a thin, clean underline consistent with other inline edit affordances in the app.
2. The `Bill To` client block should be editable from inside the estimate document. When hovering or focusing the client name/details, an edit icon should appear beside it. Clicking should open a client picker/editor flow so the user can change the linked client without leaving the estimate.

## Why This Matters

This document is the product's central artifact. It is what the owner reviews before sending, what the client sees online/PDF, and what represents the company. Small alignment issues make the estimate feel less polished even when the generated content is correct.

The current screenshots show:

- The project name edit affordance uses a dotted underline (`decoration-dotted`) that looks like a jagged/serrated line under the text.
- The `Bill To` block is read-only once a client exists, even though the project can already be linked to a client elsewhere.
- Project and `Bill To` blocks should feel like matching editable document fields, but only the project name currently has click-to-edit behavior.
- The interior grid/padding needs a full pass so company header, estimate band, info grid, summary, section header, and table columns feel deliberately aligned.
- Some editable affordances are visually louder or less refined than the rest of the site.

The outcome should be a document that feels precise, quiet, and aligned, while still being obviously editable in edit mode.

## Current State

Relevant implementation notes:

- `EstimateDocument` renders the main document shell.
- The project/bill-to grid is inside `estimate-document.tsx` near the `Info grid: PROJECT | BILL TO` section.
- `InlineProjectName` handles click-to-edit for the project name.
- `InlineProjectName` currently uses `hover:underline decoration-dotted underline-offset-2`, which creates the jagged underline in the screenshot.
- Existing linked clients render as static text under `Bill To`.
- `LinkClientInline` exists inside `estimate-document.tsx`, but only covers the "No client linked" case.
- `linkProjectToClient(projectId, clientId)` already exists in `lib/actions/project.ts`.
- `unlinkProjectFromClient(projectId)` also exists.
- `EstimateEditor` already passes `projectId`, `client`, and `onRenameProject` into `EstimateDocument`.

This means most of the project/client data plumbing exists, but the document UI does not yet expose a polished edit flow for changing an existing client.

## Desired Direction

### 1. Full Alignment Audit

Review the full document interior as one system:

- Outer document border/radius/shadow.
- Company header top spacing and logo alignment.
- Estimate title band height, text centering, and horizontal alignment.
- Project/Bill To grid columns and gutters.
- Label sizing/tracking across `PROJECT`, `BILL TO`, `SUMMARY`, section header, and table header.
- Baseline rhythm between project name, type, date, estimate number, client name, contact fields, and address.
- Summary padding and line length.
- Section header alignment with document padding and line item table.
- Table header and item row column alignment.
- Mobile and desktop parity for the same regions.

This pass should remove accidental offsets and one-off spacing that make the document feel slightly assembled rather than designed.

### 2. Thin Inline Edit Affordance

Replace the dotted project-name underline with a cleaner inline-edit style.

Preferred direction:

- Default: plain text, maybe no underline until hover/focus.
- Hover/focus: thin `border-bottom` or `underline` with `decoration-solid`, not dotted.
- Underline should be subtle, aligned to the text baseline, and match the app's existing fine border language.
- Add a small edit icon only if it improves discoverability without making the document noisy.

Avoid:

- Dotted/serrated underline.
- Heavy black underlines.
- Large input boxes around document text.
- Layout shift when entering edit mode.

### 3. Editable Bill To Block

The `Bill To` block should be editable in document edit mode.

Suggested behavior:

- When the estimate is editable and a client exists, hovering/focusing the `Bill To` name/details reveals a small `Pencil` icon beside the client name or aligned to the block header.
- Clicking the client name or icon opens a compact popover/search command, similar to existing client linking flows.
- Selecting a different client calls `linkProjectToClient(projectId, clientId)`, refreshes the router, and updates the document.
- If no client is linked, preserve the existing "No client linked" affordance, but make its visual style match the polished `Bill To` edit affordance.
- Consider an optional "Unlink client" action in the popover, using `unlinkProjectFromClient(projectId)`.

The client edit control should not look like a global project setting. It should feel like editing the `Bill To` field inside the document.

### 4. Shared Client Picker Pattern

Avoid duplicating three separate client picker implementations.

Candidates to consolidate:

- `LinkClientInline` in `estimate-document.tsx`.
- `LinkClientButton` in the floating action bar.
- `LinkClientCard` in the client tab/no-client state.
- Client picker logic in the projects table if useful.

The document likely needs a compact inline variant, but the fetch/search/select behavior should be shared or extracted so future client-linking fixes happen in one place.

## Scope Estimate

**Medium.** This is a design-polish and interaction phase, with low data-model risk because project-client linking actions already exist. The risk is visual regression in the estimate document and duplicating client picker logic.

Likely tasks:

1. **Audit and Screenshot Baseline**
   - Capture desktop and mobile screenshots of the same estimate.
   - Mark alignment issues across company header, title band, info grid, summary, sections, and line item table.

2. **Inline Edit Polish**
   - Replace dotted/serrated project-name underline.
   - Ensure edit mode and read mode have no layout jump.
   - Consider shared inline editable text styles for project name, estimate number, dates, and future client field editing.

3. **Bill To Editing**
   - Build a compact `BillToClientEditor` or generalized `ClientLinkPopover`.
   - Support changing the linked client from the document.
   - Keep the no-client link flow.
   - Optionally support unlinking.

4. **Layout Pass**
   - Normalize spacing, labels, gutters, table/section alignment, and responsive behavior.
   - Verify desktop remains close to the current strong direction.
   - Verify mobile does not introduce a separate design language.

5. **Tests and Verification**
   - Unit or component tests for client select action where practical.
   - Manual/Playwright screenshot checks for desktop and mobile.
   - Verify client changes update share/PDF/send data after refresh.

## Breadcrumbs

- [`components/workspace/estimate/estimate-document.tsx`](components/workspace/estimate/estimate-document.tsx) - main estimate document shell, `InlineProjectName`, `LinkClientInline`, project/bill-to grid, summary, section/table layout.
- [`components/workspace/estimate/estimate-editor.tsx`](components/workspace/estimate/estimate-editor.tsx) - passes `projectId`, `client`, and `onRenameProject` into `EstimateDocument`; handles project rename with `renameProjectAction`.
- [`lib/actions/project.ts`](lib/actions/project.ts) - existing `linkProjectToClient`, `unlinkProjectFromClient`, and `renameProjectAction` server actions.
- [`components/workspace/link-client-button.tsx`](components/workspace/link-client-button.tsx) - floating action bar client-link popover; possible reusable picker behavior.
- [`components/workspace/link-client-card.tsx`](components/workspace/link-client-card.tsx) - card-based client linking flow; useful behavior reference, too heavy for document inline UI.
- [`components/workspace/client-tab.tsx`](components/workspace/client-tab.tsx) - client management context outside the document.
- [`components/workspace/project-title.tsx`](components/workspace/project-title.tsx) - another project name editing pattern to compare against for underline/focus behavior.
- [`components/projects/project-table.tsx`](components/projects/project-table.tsx) - has project/client linking and client edit affordances in table/mobile contexts.
- [`lib/queries/estimate.ts`](lib/queries/estimate.ts) - estimate query joins project client fields consumed by the editor.
- [`lib/queries/share.ts`](lib/queries/share.ts) and PDF/share renderers - client changes must flow to share/PDF after project-client update.

## Decisions to Lock Before Planning

1. Should the project name display an edit icon, or only use a thin hover underline?
2. Should the `Bill To` edit icon sit beside the `BILL TO` label, beside the client name, or appear on hover at the right edge of the block?
3. Should changing client happen through a compact popover, a command dialog, or the existing ClientSheet?
4. Should the document support unlinking the client from `Bill To`, or only switching to another client?
5. Should the inline client picker allow creating a new client, or only selecting existing clients for the first pass?
6. Should this phase also normalize mobile line item styling from `SEED-043`, or stay focused on header/info-grid alignment?

## Notes

This seed is about making the estimate feel deliberately composed. The best implementation will probably remove more visual noise than it adds: fine lines, subtle hover states, stable alignment, and small edit affordances only where they help.

The `Bill To` field should become a real editable document field, not a static consequence of another tab.
