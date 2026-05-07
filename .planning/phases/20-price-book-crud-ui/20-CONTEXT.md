# Phase 20: Price Book CRUD UI - Context

**Gathered:** 2026-05-07
**Status:** Ready for planning

<domain>
## Phase Boundary

Deliver a `/settings/price-book` page where authenticated company users can view, add, edit, delete, and search their price book items. Items are grouped by free-form category. Page includes a clear empty state communicating optionality. CSV import is **not** in this phase — that is Phase 21.

Requirements in scope: PB-01, PB-02, PB-03, PB-04, PB-06, PB-07.

</domain>

<decisions>
## Implementation Decisions

### Page Navigation
- **D-01:** Price Book is a **standalone page at `/settings/price-book`** — not a new tab in `SettingsTabs`. Follows the same sub-route pattern as `/settings/appearance`.
- **D-02:** Entry point from Settings: add a visible card or link section below the existing SettingsTabs on the `/settings` page pointing to "Price Book". Not added to sidebar `NAV_ITEMS` directly — Settings is the parent.

### Category Grouping Display
- **D-03:** Items are displayed in **always-expanded sections with a category header** — one section per distinct category value. No accordion/collapse. Works correctly when only one category exists.
- **D-04:** Categories sorted alphabetically; items within each category sorted by name. No drag-reorder.

### Add / Edit Interaction
- **D-05:** Both add and edit use a **Dialog** (shadcn Dialog, same pattern as `ClientSheet`). Form fields: category (free text with autocomplete from existing categories), name, unit, unit price, notes (optional). react-hook-form + zod schema.
- **D-06:** After save, list updates immediately via `router.refresh()` — consistent with existing mutation patterns. No optimistic update needed for a settings page.
- **D-07:** Edit is accessible via a `DropdownMenu` (⋯) per item row — same `MoreHorizontal` pattern as `ClientList`.

### Delete Interaction
- **D-08:** Delete uses `AlertDialog` for confirmation — same pattern as `ClientList`. Destructive action button inside AlertDialog.

### Search
- **D-09:** Client-side search with `useMemo` filtering on both name and category fields — same pattern as `ClientList`. Search input at the top, instant filter. No server roundtrip.

### Empty State
- **D-10:** Empty state uses the existing `EmptyState` component. Title: "No price book items yet". Description: "Add your pricing standards and the AI will use them as anchors when generating estimates. Leaving this empty is fine — the AI will use market estimates instead." Single CTA: "Add first item" button that opens the add Dialog.

### Claude's Discretion
- Table rows vs card rows within each category section — either works; table rows are consistent with `ClientList`.
- Exact zod schema validations (unit_price min, name maxLength) — follow conventions from `clientSchema`.
- Loading skeleton for the page — follow existing `loading.tsx` pattern from other settings sub-routes.
- Whether to use shadcn `Sheet` (slide-over) or `Dialog` (modal) for the add/edit form — Dialog is consistent with existing CRUD forms.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Database Schema
- `supabase/migrations/20260506000001_phase19_price_book.sql` — DDL for `company_price_book` (id UUID, company_id UUID FK, category TEXT, name TEXT, unit TEXT NOT NULL, unit_price NUMERIC(12,2) NOT NULL, notes TEXT, created_at TIMESTAMPTZ). RLS: 4 policies using `company_id IN (SELECT id FROM companies WHERE user_id = auth.uid())` subquery.
- `lib/database.types.ts` — TypeScript types regenerated in Phase 19. `Database['public']['Tables']['company_price_book']`

### Requirements
- `.planning/REQUIREMENTS.md` — v1.3 requirements PB-01 through PB-07 (Phase 20 scope: PB-01, PB-02, PB-03, PB-04, PB-06, PB-07)

### Existing Patterns to Follow
- `components/clients/client-list.tsx` — Table + search + DropdownMenu + AlertDialog delete pattern
- `components/clients/client-sheet.tsx` — Dialog + react-hook-form + zod add/edit pattern
- `components/app-shell/nav-items.ts` — NAV_ITEMS (Settings href: `/settings`)
- `components/settings/settings-tabs.tsx` — SettingsTabs component (where to add price-book link/card)
- `app/(app)/settings/page.tsx` — Settings page server component (entry point to add price-book link)
- `app/(app)/settings/appearance/` — Sub-route pattern to follow for `/settings/price-book`
- `lib/queries/auth.ts` — `getAuthClaims()` + `getCachedCompany()` (use in server component)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `components/clients/client-sheet.tsx` — Dialog + react-hook-form + zod pattern. Reuse structure for `PriceBookItemDialog`.
- `components/clients/client-list.tsx` — Table + `useMemo` search + DropdownMenu + AlertDialog. Reuse pattern for `PriceBookList`.
- `components/dashboard/empty-state.tsx` — `EmptyState` component. Use for empty price book state.
- `components/ui/` — Dialog, AlertDialog, Table, Input, Button, DropdownMenu, Badge, Card, Textarea all available.
- `lib/queries/auth.ts` — `getAuthClaims()` + `getCachedCompany()` — use in page server component.

### Established Patterns
- Server component page (`async function`) fetches data → passes to client component for interactivity
- `getAuthClaims()` + `getCachedCompany()` for auth/company in RSC
- `createClient()` (cookie-based) for RLS-scoped queries in server components
- react-hook-form + zod (`zodResolver`) for all forms — `zodResolver cast to any` for zod v4 compat
- `useTransition` + `startTransition` for server action calls, `toast` (sonner) for feedback
- `router.refresh()` after mutations to revalidate server data

### Integration Points
- New route: `app/(app)/settings/price-book/page.tsx` + `loading.tsx`
- New server actions: `lib/actions/price-book.ts` (createPriceBookItem, updatePriceBookItem, deletePriceBookItem)
- New queries: `lib/queries/price-book.ts` (getPriceBookItems)
- Settings page modification: add link/card to `/settings/price-book` from `app/(app)/settings/page.tsx` or `components/settings/settings-tabs.tsx`
- Nav: no change to `NAV_ITEMS` — entry via `/settings`

</code_context>

<specifics>
## Specific Ideas

- The category field in the add/edit dialog should show autocomplete suggestions from existing categories to prevent duplicate-from-typo entries. A `datalist` HTML element or a `Combobox` (shadcn Command) is appropriate.
- "Price book is optional" messaging in two places: (1) the empty state (primary), and (2) a small helper text near the page header when items exist (secondary, subtle muted text).

</specifics>

<deferred>
## Deferred Ideas

- CSV import (PB-05) — Phase 21
- Bulk delete / bulk edit — out of scope per REQUIREMENTS.md
- Percentage bulk adjustment by category — v1.4 per REQUIREMENTS.md
- Price book as a direct sidebar NAV_ITEMS link — deferred; Settings is the parent

</deferred>

---

*Phase: 20-price-book-crud-ui*
*Context gathered: 2026-05-07*
