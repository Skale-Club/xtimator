# Phase 6: AI Estimate Generation & Editor - Context

**Gathered:** 2026-04-10
**Status:** Ready for planning

<domain>
## Phase Boundary

AI-powered estimate generation from project audio transcripts and photos: Claude Vision photo analysis, Claude API estimate generation with structured JSON output, multi-step progress indicator, full inline editor with real-time math recalculation, auto-save, section/item CRUD, discount/tax support, version history. Replaces the PlaceholderTab for the "AI Estimate" tab in the workspace.

</domain>

<decisions>
## Implementation Decisions

### Photo Analysis Pipeline
- **D-01:** Server route `POST /api/analyze-photos` (Next.js Route Handler in `app/api/analyze-photos/route.ts`). Receives `{ projectId }` in JSON body. Fetches all project photos from DB, downloads each from Supabase Storage via service role client, sends to Claude Vision API (`claude-sonnet-4-20250514`), stores returned description in `photos.ai_description` column.
- **D-02:** Photos analyzed in parallel using `Promise.allSettled()` — individual failures don't block others. Each photo's status returned to client for progress tracking.
- **D-03:** Photo analysis uses the Anthropic SDK (`@anthropic-ai/sdk`). System prompt instructs Claude to describe the photo from a contractor's perspective: materials, conditions, measurements, damage, areas needing work. Max 200 tokens per photo.

### Estimate Generation Pipeline
- **D-04:** Server route `POST /api/generate-estimate` (Next.js Route Handler in `app/api/generate-estimate/route.ts`). Receives `{ projectId }` in JSON body. Auth via `createClient()` server-side.
- **D-05:** Prompt construction: (1) system prompt with estimator persona, (2) all recording transcripts concatenated, (3) all photo ai_descriptions, (4) project metadata (type, target_budget), (5) company context (industry, default terms, tax rate). Instruct Claude to return structured JSON.
- **D-06:** Claude API call uses `claude-sonnet-4-20250514` with `response_format: { type: "json" }` style — actually use tool_use with a defined schema to force structured JSON output. The tool schema defines: `{ summary, notes, timeline, payment_terms, warranty_terms, sections: [{ title, items: [{ description, quantity, unit, unit_price }] }] }`.
- **D-07:** Server validates all math after receiving response: `item.total = qty * unit_price`, `section.subtotal = sum(items.total)`, `subtotal = sum(sections.subtotal)`. Recalculates rather than trusting AI math.
- **D-08:** Persistence: insert `estimates` row (with version number, company defaults for tax_rate/payment_terms/warranty_terms), then `estimate_sections` rows, then `estimate_items` rows. All in a logical sequence (not a DB transaction since Supabase JS doesn't support transactions — rely on cascade deletes if partial failure).
- **D-09:** Version management: on re-generation, set `is_current = false` on all existing estimates for the project, then insert new estimate with `version = max(version) + 1` and `is_current = true` (AI-10).
- **D-10:** Update project status to `estimate_ready` and project `total` to the estimate grand total. Log activity event.
- **D-11:** On failure: return error to client, client shows retry button. Manual creation fallback: user clicks "Create Blank Estimate" which inserts an empty estimate with one section and one item (AI-09).

### Multi-Step Progress Indicator
- **D-12:** The AI Estimate tab shows a progress stepper during generation: (1) "Analyzing photos..." (2) "Generating estimate..." (3) "Saving..." (4) "Done!". Each step updates via client-side state as the fetch calls complete sequentially.
- **D-13:** The "Generate Estimate" button is disabled when no transcripts AND no photos exist (AI-01). Show tooltip explaining why.

### Estimate Editor UI
- **D-14:** The AI Estimate tab has two states: (a) No estimate — show "Generate Estimate" CTA with prerequisites check, (b) Has estimate — show the full editor.
- **D-15:** Editor layout: top section with summary, notes, timeline, terms (each editable via Textarea or inline). Below: sections list. Each section is a Card with title (editable), items table, section subtotal. At bottom: subtotal, discount row, tax row, grand total.
- **D-16:** Line items displayed in a table per section: Description | Qty | Unit | Unit Price | Total. Each cell is editable inline (click to edit or always editable input fields). Total cell is calculated, not editable.
- **D-17:** Real-time recalculation (EDIT-03, EDIT-11): use React state (or Zustand) to hold the full estimate tree in memory. On any field change: recalculate item total → section subtotal → overall subtotal → discount → tax → grand total. All recalc happens client-side instantly.
- **D-18:** Add/remove items (EDIT-04, EDIT-05): "Add Item" button at bottom of each section. Delete icon on each item row. Add/remove sections (EDIT-07): "Add Section" button at bottom, delete icon on section header.
- **D-19:** Reorder items and sections (EDIT-06): use drag handles with @dnd-kit (already installed from Phase 5). Update sort_order on reorder.
- **D-20:** Discount (EDIT-09): dropdown for type (percentage/fixed), input for value. If percentage: `discount_amount = subtotal * value / 100`. If fixed: `discount_amount = value`. Grand total = subtotal - discount_amount + tax_amount.
- **D-21:** Tax (EDIT-10): auto-populated from company `default_tax_rate`. Editable per estimate. `tax_amount = (subtotal - discount_amount) * tax_rate`.
- **D-22:** Auto-save (EDIT-12): debounced save (2000ms) after any edit. Save updates `estimates` row (summary, notes, terms, discount, tax, total), then upserts sections and items. Manual "Save" button also available. Show "Saving..." / "Saved" indicator.
- **D-23:** Version history (AI-10): dropdown selector at top of editor showing "Version 1", "Version 2", etc. Selecting a version loads that estimate (read-only if not current). "Regenerate" button creates new version.

### Environment & Dependencies
- **D-24:** `ANTHROPIC_API_KEY` env var required (server-side only). Add to `.env.example`.
- **D-25:** Install `@anthropic-ai/sdk` for Claude API calls.
- **D-26:** No new database migrations — all tables already exist from Phase 1.

### Claude's Discretion
- Progress indicator animation style
- Editor card styling and spacing
- Exact inline edit interaction (click-to-edit vs always-input)
- Version selector UI treatment
- Empty state illustration for "no estimate yet"

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project Requirements
- `.planning/REQUIREMENTS.md` — AI-01 through AI-10, EDIT-01 through EDIT-12
- `.planning/PROJECT.md` — Tech stack constraints (Claude API, structured output)

### Prior Phase Context
- `.planning/phases/05-audio-recording-photo-management/05-CONTEXT.md` — Audio/photo components, Storage patterns, server actions
- `.planning/phases/04-project-creation-workspace/04-CONTEXT.md` — Workspace tab structure

### Database Schema
- `supabase/migrations/20260409000001_initial_schema.sql` — `estimates` table (project_id, company_id, version, is_current, share_token, status, summary, notes, timeline, terms, subtotal, discount_type/value/amount, tax_rate/amount, total), `estimate_sections` table (estimate_id, company_id, title, sort_order, subtotal), `estimate_items` table (section_id, company_id, description, quantity, unit, unit_price, total, sort_order), `photos.ai_description` column, company default fields (default_tax_rate, default_payment_terms, default_warranty_terms)

### Existing Code
- `components/workspace/project-workspace.tsx` — Tab structure where AI Estimate tab replaces PlaceholderTab
- `lib/actions/recording.ts` — Server action pattern with getAuthContext
- `lib/actions/photo.ts` — Photo CRUD pattern
- `lib/supabase/service.ts` — Service role client for server-side operations
- `lib/supabase/server.ts` — Server-side Supabase client
- `lib/queries/project.ts` — getProjectById with company_id
- `lib/queries/recording.ts` — getProjectRecordings (for transcripts)
- `lib/queries/photo.ts` — getProjectPhotos (for ai_descriptions)
- `app/(app)/projects/[id]/page.tsx` — Workspace page server component with Promise.all

### Roadmap
- `.planning/ROADMAP.md` §Phase 6 — Plan descriptions, success criteria

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `lib/supabase/service.ts` — Service role client for downloading Storage files server-side
- `lib/supabase/server.ts` — Server-side Supabase client with auth
- `lib/actions/recording.ts` — getAuthContext() pattern, activity logging
- `components/workspace/project-workspace.tsx` — TabsContent for "estimate" currently has PlaceholderTab
- `@dnd-kit/core` + `@dnd-kit/sortable` — Already installed for section/item reorder
- All shadcn/ui components: Card, Button, Input, Textarea, Dialog, Select, Skeleton, Progress, DropdownMenu, Badge, Tooltip

### Established Patterns
- getClaims() / getAuthContext() for auth in server actions
- Next.js Route Handlers in `app/api/` for API routes (new pattern for this project, needed for streaming/complex operations)
- Server actions in `lib/actions/` for simple mutations
- Queries in `lib/queries/` for data fetching
- Toast notifications via sonner
- Debounced save pattern (established in Phase 5 transcript editor — 1000ms)

### Integration Points
- `components/workspace/project-workspace.tsx` — Replace PlaceholderTab for estimate tab with EstimateTab component
- `app/(app)/projects/[id]/page.tsx` — Load current estimate server-side and pass to workspace
- `estimate_activity` table — Log generation/save events
- `projects.status` — Update to 'estimate_ready' after generation
- `projects.total` — Update to estimate grand total
- `photos.ai_description` — Populated by photo analysis, read during generation

</code_context>

<specifics>
## Specific Ideas

- The `estimates`, `estimate_sections`, and `estimate_items` tables already exist from Phase 1 migration — no new migration needed
- `photos.ai_description` column already exists — Phase 5 left it null, Phase 6 populates it
- `@anthropic-ai/sdk` needs to be installed
- `ANTHROPIC_API_KEY` needs to be added to `.env.example` (and user's `.env.local`)
- The estimate editor is the most complex UI in the app — keep state management simple with useState/useReducer rather than introducing Zustand for just this component
- Tool use (function calling) with Claude gives the most reliable structured JSON output
- Math validation server-side is critical — never trust AI-generated arithmetic

</specifics>

<deferred>
## Deferred Ideas

None — all requirements map to Phase 6 scope.

</deferred>

---

*Phase: 06-ai-estimate-generation-editor*
*Context gathered: 2026-04-10*
