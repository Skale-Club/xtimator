# Phase 25: Plain Text Tab + Copy UI — Context

**Gathered:** 2026-05-08
**Status:** Ready for planning

<domain>
## Phase Boundary

Deliver a "Plain Text" card in the Send tab of the project workspace where users can view, edit, and copy a plain-text version of any estimate in one tap. The card renders the estimate using the company template from Phase 24 (`resolveTemplate()`), allows inline editing (local state only — does not affect the saved template), and includes a prominent Copy button with a confirmation toast plus a Reset button to revert edits.

Requirements in scope: PLAINTEXT-01, PLAINTEXT-02, PLAINTEXT-04.

This phase does **not** build or modify the template settings page — that is Phase 24 (complete).

</domain>

<decisions>
## Implementation Decisions

### D-01: Placement — Full-Width Card in Send Tab
- The Plain Text feature lives in the **Send tab** (`components/workspace/send/send-tab.tsx`) as a new full-width card **below** the existing 2-column layout (EstimatePreview on the left, SendForm on the right).
- No structural changes to `EstimatePreview` or the 2-column grid — just a third card the user scrolls to.
- No new workspace tab added. The Send tab is the right context because the user is already in "share this estimate" mode.
- The card component: `components/workspace/send/plain-text-card.tsx`
- `SendTab` props need the company template fields (`estimate_template_*`) and `owner_name` — either pass them from the workspace page or fetch them inside the card server action.

### D-02: Items Breakdown Format
- Sections and items render as:
  ```
  [Section Title]
  Item description: $120
  Item description: $85
  ```
- One blank line between section blocks.
- Format follows the SEED-004 reference example exactly: square-bracket section header, then one item per line with colon-separated price.
- The `buildItemsBreakdown(estimate: EstimateWithSections): string` utility is a pure function in `lib/utils/estimate-template.ts` (extend the existing utility file, do not create a new one).
- Price formatting reuses `formatCurrency` from `lib/utils/format.ts`.

### D-03: Reset Button
- A small `RotateCcw` icon button (from lucide-react) next to the Copy button.
- Clicking Reset reverts the textarea to the freshly generated template text (calling `resolveTemplate()` again with current data).
- No confirmation modal — the reset is immediate and reversible (user can undo by typing).
- Tooltip: "Reset to generated text".

### D-04: Copy Behavior
- `navigator.clipboard.writeText(text)` — same pattern as `EstimatePreview.handleCopyShareLink()`.
- Copy button: `Copy` label + `Copy` icon (`Copy` lucide icon). After click:
  - Button changes to `Check` icon + "Copied!" for 2 seconds.
  - `toast.success('Copied to clipboard!')` fires simultaneously.
- If clipboard API unavailable (non-HTTPS or permissions denied): `toast.error('Failed to copy')`.

### D-05: Data Required for Template Render
The Plain Text card needs data that is not all currently available in the workspace:
- `client_name` — from `project.client.name` (already in workspace)
- `company_name` — already fetched in workspace page
- `owner_name` — `company.owner_name` — NOT currently fetched in workspace page; add it to the company select in `app/(app)/projects/[id]/page.tsx`
- `total` — from `currentEstimate.total` (formatted with `formatCurrency`)
- `items_breakdown` — built by `buildItemsBreakdown(currentEstimate)`
- Template fields (`estimate_template_greeting`, etc.) — from `company` row, same select as `owner_name`

The workspace page already does a company query for `name` only. Extend that select to also include `owner_name` and the 4 `estimate_template_*` columns. Pass them down to `ProjectWorkspace` → `SendTab` → `PlainTextCard`.

### D-06: Empty State
- If `currentEstimate` is null, the Plain Text card shows an empty state with muted text: "Generate an estimate first — then come back here to copy the plain text version."
- Same empty state pattern as `SendTab` (icon + heading + description).

### Claude's Discretion
- Card header wording: suggest "Plain Text" or "Copy as Text"
- Card description: suggest "Ready to paste into WhatsApp, SMS, or email"
- Textarea rows (suggest 14–18 rows to show the full template without excessive scrolling)
- Whether to add a character count below the textarea (nice-to-have, not required)
- Loading state: if template data is loading, show a skeleton textarea

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase 24 Foundation (read before implementing)
- `.planning/phases/24-estimate-template-engine-settings-page/24-CONTEXT.md` — Locked decisions for template storage and utility function
- `lib/utils/estimate-template.ts` — `resolveTemplate()`, `TEMPLATE_DEFAULTS`, `EstimateTemplate`, `TemplateData` interfaces. Phase 25 extends this file with `buildItemsBreakdown()`.
- `lib/queries/company.ts` — `getEstimateTemplateSettings()` and `CompanySettings` interface (4 new columns)

### Requirements
- `.planning/REQUIREMENTS.md` — v1.4 requirements; Phase 25 scope: PLAINTEXT-01, PLAINTEXT-02, PLAINTEXT-04

### Send Tab Patterns (existing components to extend)
- `components/workspace/send/send-tab.tsx` — Where the new card is added (below the 2-col grid)
- `components/workspace/send/estimate-preview.tsx` — Pattern for card structure, PDF/link copy buttons, `navigator.clipboard` usage, `toast.success`
- `components/workspace/project-workspace.tsx` — Where `SendTab` is rendered; may need new props
- `app/(app)/projects/[id]/page.tsx` — Workspace page server component; company select needs extending to include `owner_name` + 4 template columns

### Utility References
- `lib/utils/format.ts` — `formatCurrency()` — reuse for price formatting in `buildItemsBreakdown()`
- SEED-004: `.planning/seeds/SEED-004-plain-text-estimate-output.md` — Reference example for the output format and tone

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `components/workspace/send/estimate-preview.tsx` — Full pattern to follow: card structure, clipboard copy with `setCopied` state + 2s timeout, `toast.success`, `Download`/`Link2`/`Check` icons. Replicate the `handleCopyShareLink` approach for the Plain Text copy.
- `lib/utils/estimate-template.ts` — `resolveTemplate()` already handles NULL-to-default fallback and variable substitution. Phase 25 extends this file (adds `buildItemsBreakdown()`).
- `lib/utils/format.ts` — `formatCurrency()` for item prices in the breakdown.
- `components/ui/` — `Textarea`, `Button`, `Card`, `Tooltip`, `TooltipContent`, `TooltipProvider`, `TooltipTrigger` all available.

### Established Patterns
- `useState` for local editable text (see existing modal/dialog patterns)
- `navigator.clipboard.writeText()` + setCopied + setTimeout(2000) for copy (see `estimate-preview.tsx`)
- `toast.success()` / `toast.error()` (sonner) for feedback
- Card with `CardHeader` + `CardContent` for new sections in the Send tab
- Server component page passes props → client component manages local state
- `RotateCcw`, `Copy`, `Check` from lucide-react (all already imported elsewhere)

### Integration Points
- Extend company select in `app/(app)/projects/[id]/page.tsx`:  
  `.select('name, owner_name, estimate_template_greeting, estimate_template_opener, estimate_template_closer, estimate_template_signature')`
- Add `estimateTemplate` and `ownerName` props to `ProjectWorkspace` component
- Pass through to `SendTab` → `PlainTextCard`
- New file: `components/workspace/send/plain-text-card.tsx`
- Extend `lib/utils/estimate-template.ts` with `buildItemsBreakdown(estimate: EstimateWithSections): string`

</code_context>

<specifics>
## Specific Ideas

- SEED-004 example output is the reference format for tone and structure. The items_breakdown block should look like:
  ```
  [Upholstery Cleaning]
  King Mattress: $120

  [Carpet Cleaning]
  Small room: $85
  ```
- The Reset button should use a `Tooltip` with "Reset to generated text" — same pattern as the `Tooltip` usage in `estimate-tab.tsx` (TooltipProvider wrapping).
- Card description (below header): "Paste into WhatsApp, SMS, or email" — short, action-oriented.

</specifics>

<deferred>
## Deferred Ideas

- Markdown variant (`**bold**` for Slack/Discord) — v1.5 per REQUIREMENTS.md
- Per-estimate template override (custom text that overrides the company template for one estimate) — future
- Character count display below textarea — Claude's discretion (can include if trivially cheap)
- Direct SMS/WhatsApp send integration — explicitly out of scope per REQUIREMENTS.md

</deferred>

---

*Phase: 25-plain-text-tab-copy-ui*
*Context gathered: 2026-05-08*
