# Phase 24: Estimate Template Engine + Settings Page — Context

**Gathered:** 2026-05-08
**Status:** Ready for planning

<domain>
## Phase Boundary

Deliver a `/settings/estimate-templates` page where the authenticated company owner can define and save a plain-text estimate template (greeting, opener, items breakdown, closer, signature). Template is persisted per-company and drives the plain-text output that Phase 25 will render and copy.

Requirements in scope: PLAINTEXT-03, PLAINTEXT-05.

This phase does **not** build the Plain Text tab or copy-to-clipboard UI — that is Phase 25.

</domain>

<decisions>
## Implementation Decisions

### D-01: Template Storage
- **Store template as 5 new columns on the `companies` table** — no new table.
- Column names:
  - `estimate_template_greeting` TEXT (e.g. `Hey {client_name},`)
  - `estimate_template_opener` TEXT (e.g. `Thank you for reaching out to {company_name}! Here is your estimate:`)
  - `estimate_template_closer` TEXT (e.g. `Let me know if you have any questions or would like to schedule an appointment.`)
  - `estimate_template_signature` TEXT (e.g. `Best regards,\n{owner_name}\n{company_name}`)
- `{items_breakdown}` and `{total}` are **injected automatically at render time** — not stored as a column (they come from the estimate data, not a template field).
- All 4 columns default to `NULL`. A `NULL` column means "use the sensible default" — defaults are resolved at render time in a pure function, NOT at insert time. This keeps the DB clean and allows future default changes without a migration.
- Rationale: estimates data already lives in companies; joining a separate table for 4 text fields adds complexity with no benefit at this scale.

### D-02: Settings Entry Point
- **Card below SettingsTabs** on `/settings`, same pattern as Price Book (Phase 20 D-02).
- New card: icon `FileText`, title "Estimate Templates", description "Customize the greeting, opener, and signature for your plain-text estimates."
- Links to `/settings/estimate-templates` sub-route.
- No change to `NAV_ITEMS` (Settings is the parent entry point).

### D-03: Page Layout and Form
- Standalone page at `/settings/estimate-templates` — same sub-route pattern as `/settings/price-book` and `/settings/appearance`.
- Single-page form (no tabs, no accordion) with 4 textarea fields: Greeting, Opening, Closing, Signature.
- Each field includes:
  - A label and a short helper text describing its purpose
  - A list of which variables are valid for that field (inline, subtle muted text)
- Variable list: `{client_name}`, `{company_name}`, `{owner_name}`, `{total}`, `{items_breakdown}` — documented below each relevant field.
- No live variable highlighting (syntax highlighting is deferred). Just show the variable list as static helper text below each field.
- Save button at the bottom (single Save action for the whole form). `useTransition` + `router.refresh()` pattern.

### D-04: Default Template Values
Resolved in a pure `lib/utils/estimate-template.ts` utility function (not in DB). Defaults:

```
greeting:   "Hey {client_name},"
opener:     "Thank you for reaching out to {company_name}! Here is your estimate:"
closer:     "Let me know if you have any questions or would like to schedule an appointment. I'd be happy to assist you!"
signature:  "Best regards,\n{owner_name}\n{company_name}"
```

The function `resolveTemplate(template, data)` takes the 4 stored columns (or defaults when NULL) plus `data: { client_name, company_name, owner_name, total, items_breakdown }` and returns the final plain-text string. Phase 25 calls this function.

### D-05: Migration Approach
- New Supabase migration: `supabase/migrations/20260508000001_phase24_estimate_templates.sql`
- Adds 4 nullable TEXT columns to `companies` with no default (NULL = "use app default").
- No backfill needed — NULL is the intended state for existing companies.
- TypeScript types: regenerate `lib/database.types.ts` after migration.

### Claude's Discretion
- Exact textarea row count per field (suggest 3 rows for greeting/opener, 4 for closer/signature).
- Placeholder text in each textarea (suggest showing the default value as placeholder).
- Form validation: allow empty (saving empty = revert to default); no required fields.
- Whether to show a read-only preview of the assembled template on the settings page — only add if it's lightweight (a simple concatenation display). Do not build a full render engine here; that belongs to Phase 25.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Database Schema
- `supabase/migrations/20260409000001_initial_schema.sql` — `companies` table definition (all existing columns). New columns go in a new migration file.
- `lib/database.types.ts` — TypeScript types. Must be regenerated after migration.

### Requirements
- `.planning/REQUIREMENTS.md` — v1.4 requirements; Phase 24 scope: PLAINTEXT-03, PLAINTEXT-05.

### Existing Patterns to Follow
- `app/(app)/settings/page.tsx` — Settings page where the new "Estimate Templates" card will be added (below the existing Price Book card).
- `app/(app)/settings/price-book/page.tsx` — Sub-route page pattern to follow for `/settings/estimate-templates`.
- `app/(app)/settings/appearance/` — Another sub-route example.
- `components/settings/settings-tabs.tsx` — SettingsTabs (not modified; card goes on the parent settings page).
- `lib/queries/auth.ts` — `getAuthClaims()` + `getCachedCompany()` for server components.
- `lib/queries/company.ts` — `getCompanySettings()` — may need to include new template columns.
- `lib/actions/company.ts` — Existing company update actions; new `saveEstimateTemplate` action goes here or in a new `lib/actions/estimate-template.ts`.
- Phase 20 CONTEXT: `.planning/phases/20-price-book-crud-ui/20-CONTEXT.md` — D-02 entry point pattern to replicate.

### Integration Points for Phase 25
- `lib/utils/estimate-template.ts` (new) — `resolveTemplate(template, data)` pure function. Phase 25 imports this to generate the plain-text output.
- Template columns on `companies`: Phase 25 reads them via `getCachedCompany()` or a lightweight query.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `app/(app)/settings/page.tsx` — Already has Price Book card. Add Estimate Templates card below it using the same Link + Card pattern.
- `components/ui/` — Textarea, Card, Button, Label all available.
- `lib/queries/auth.ts` — `getAuthClaims()` — already used across settings pages.
- `lib/queries/company.ts` — `getCompanySettings()` — extend to include new template columns.

### Established Patterns
- Server component page fetches company data → passes to client form component
- `useTransition` + server action + `toast` (sonner) + `router.refresh()` for form saves
- `react-hook-form` + `zod` for form validation (even simple forms)
- Sub-route pages live at `app/(app)/settings/[sub-route]/page.tsx` + optional `loading.tsx`

### Integration Points
- New migration: `supabase/migrations/20260508000001_phase24_estimate_templates.sql`
- New utility: `lib/utils/estimate-template.ts` (pure, testable, no DB calls)
- New server action: `saveEstimateTemplate` in `lib/actions/estimate-template.ts` (or `lib/actions/company.ts`)
- Modified: `app/(app)/settings/page.tsx` — add Estimate Templates card
- Modified: `lib/queries/company.ts` — include template columns in `getCompanySettings()`
- New page: `app/(app)/settings/estimate-templates/page.tsx` + `loading.tsx`

</code_context>

<specifics>
## Specific Ideas

- The `resolveTemplate` utility should handle missing variables gracefully (e.g., if `owner_name` is null in the company, render as empty string or company name fallback).
- The settings page description should mention that changes apply to all future estimates, not retroactively to already-generated text.
- "Estimate Templates" page header should have a back link or breadcrumb to Settings (consistent with price-book page header).

</specifics>

<deferred>
## Deferred Ideas

- Live syntax highlighting / variable colorization in the textarea — Phase 25 or later
- Per-estimate template override (a company-wide template only) — future
- i18n of template (EN/PT-BR/ES variants of the template) — v1.5 per REQUIREMENTS.md
- Markdown variant of the template (for Slack/Discord bold) — v1.5 per REQUIREMENTS.md
- Preview of the assembled template in the settings page (only if trivially cheap) — Claude's discretion

</deferred>

---

*Phase: 24-estimate-template-engine-settings-page*
*Context gathered: 2026-05-08*
