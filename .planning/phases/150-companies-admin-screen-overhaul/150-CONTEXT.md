# Phase 150: Companies Admin Screen Overhaul - Context

**Gathered:** 2026-07-05
**Status:** Ready for planning
**Mode:** Autonomous run (discuss skipped per explicit user authorization to execute unattended — decisions below are Claude's best judgment, mirroring "Accept all" on every grey area, anchored to an existing in-codebase precedent rather than invented from scratch)

<domain>
## Phase Boundary

The super admin can find and manage any company quickly on `app/admin/companies/page.tsx` — search by name/email, filter by tier/AI-override/demo-vs-real, and page through server-side-paginated results with a visible total count — while every existing action (Demo Accounts grouping, HandoffButton, Configure →) keeps working exactly as before. This phase does NOT touch `app/admin/companies/[id]/page.tsx` (the detail page) or add Support Mode (that is Phase 151).

</domain>

<decisions>
## Implementation Decisions

### Reuse the Phase-93 Event Log pattern verbatim (do not invent a new pagination approach)

`app/admin/events/page.tsx` + `app/admin/events/events-controls.tsx` (Phase 93, ADMINLOG-01..05) is an EXISTING admin surface solving the exact same shape of problem (server-side search + multi-filter + pagination on an admin list). Mirror it:
- Server component reads `searchParams` (Next 14 Promise), builds a chainable Supabase query, applies `.eq()` per active filter, `.or()` for free-text search, then `.order().range(from, from+PAGE_SIZE-1)` with `{count:'exact'}`.
- A separate `'use client'` `CompaniesControls` component (mirroring `EventsControls`) owns the search input (Enter/blur commits) + `Select` filter dropdowns, pushing to `router.replace()` via `useSearchParams`, resetting `page` on any filter change.
- Prev/Next links built via a `pageUrl(p)` helper preserving all active params — no client-side pagination library.
- `PAGE_SIZE = 25` (smaller than the 50 used for events — companies rows are denser/wider; 25 keeps the table scannable). Claude's discretion if research finds a stronger reason to match 50.

### Email search resolution

Companies have no `email` column. Mirror the Phase-93 `resolvedUserId` pattern: when the search term contains `@`, resolve it via `svc.auth.admin.listUsers()` → matching user id → look up that user's company ids via `company_members` → filter the companies query to those ids. When the term does NOT contain `@`, search `name` via `ilike`. Do not attempt a combined name-or-email single `.or()` — the two paths need different resolution steps first (mirrors why Phase 93 branches on `resolvedUserId` instead of folding email into `buildSearchOr`).

### Filters (ADMINCO-02) combine with AND

- **Tier**: `Select` dropdown, options sourced from existing tier values (free/pro/business) — reuse whatever tier list constant the codebase already has (check `lib/entitlements.ts` / `BillingTier` in `lib/billing/billing-config.ts`), do not hardcode a duplicate list.
- **AI override**: a 3-state `Select` — "Any" / "Has override" / "Platform default" — maps to `.not('ai_model_override', 'is', null)` vs `.is('ai_model_override', null)`.
- **Demo vs real**: a 3-state `Select` — "Any" / "Demo" / "Real" — maps to `.not('demo_estimate_quota', 'is', null)` vs `.is('demo_estimate_quota', null)` (mirrors the existing `demoCompanies` filter already computed client-side in the current page — now pushed server-side into the query).

### Demo Accounts section stays OUTSIDE pagination

The existing "Demo Accounts" grouping (Phase 149) stays as its own always-visible, unpaginated mini-table above the main list — it's a small, bounded set (street-sales demo accounts) and existing tests/UX depend on it appearing separately. Only the "All Companies" table below it gets search/filter/pagination. Do not fold demo accounts into the same paginated query — that would change existing behavior (ADMINCO-04 requires it keeps working unchanged).

### Claude's Discretion

- Exact column widths / responsive breakpoints for the table — follow existing admin table Tailwind conventions already in the file (`overflow-x-auto`, `text-sm`, `divide-y divide-border`).
- Whether to add a "clear filters" affordance (Phase 93 gates it behind `EmptyState actionLabel="Clear filters"` only when zero results) — reuse that exact pattern, do not add a separate always-visible clear button.
- i18n: wrap all new copy in `<T>`/`t()` per the rest of the admin panel (English source strings — admin panel is English-only, no locale toggle there).

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- [`app/admin/events/page.tsx`](../../../app/admin/events/page.tsx) — THE reference implementation: `searchParams` Promise, `.range()`+`count:'exact'` pagination, email→user_id resolution, `pageUrl()` helper, `EmptyState` on zero-results.
- [`app/admin/events/events-controls.tsx`](../../../app/admin/events/events-controls.tsx) — THE reference client controls: `useSearchParams`+`router.replace`, debounce-by-Enter/blur search input, `Select` filter dropdowns resetting page on change.
- [`lib/admin/events-helpers.ts`](../../../lib/admin/events-helpers.ts) — `buildSearchOr()` — a pure helper building a safe `.or()` filter string; check whether it's reusable as-is for the `name ilike` branch or needs a Companies-specific sibling.
- [`app/admin/companies/page.tsx`](../../../app/admin/companies/page.tsx) — the CURRENT flat implementation being overhauled; keep its Demo Accounts section + `HandoffButton` + Configure-link rendering, replace only the "All Companies" table's data-fetch + add controls.
- [`app/admin/companies/handoff-button.tsx`](../../../app/admin/companies/handoff-button.tsx) — untouched, reused as-is in the new paginated rows.

### Established Patterns
- Every admin page starts with `await requireAdmin()` BEFORE any data read (load-bearing authz — see Phase 93's index-position tests).
- `export const dynamic = 'force-dynamic'` on admin list pages reading live filter/pagination state from `searchParams`.
- Server-side `.range()` pagination + `{count:'exact'}` is the house style for admin lists — never a client-side pagination library, never "load all rows then paginate in JS".

### Integration Points
- No new routes — this is `app/admin/companies/page.tsx` + a new sibling `companies-controls.tsx` (mirroring `events-controls.tsx`'s file placement).
- No schema change — `companies.tier`, `companies.ai_model_override`, `companies.demo_estimate_quota` already exist and are already selected today.

</code_context>

<specifics>
## Specific Ideas

No specific visual reference beyond "reuse the Event Log admin surface's exact interaction pattern" — that IS the specific idea; do not design a new pagination/filter UI language for this one page.

</specifics>

<deferred>
## Deferred Ideas

- Bulk actions (bulk tier change, bulk export) — captured as ADMINCOX-01 in REQUIREMENTS.md v2, out of scope here.
- Sortable columns beyond the current name-ascending order — not in the locked requirements (ADMINCO-01..04); if trivial to add via the same `.order()` call, Claude's discretion to include, but not required for phase completion.

</deferred>
