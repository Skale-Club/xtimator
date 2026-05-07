---
phase: 20-price-book-crud-ui
plan: 03
subsystem: price-book
tags: [routing, server-component, settings, app-router, wave-2]
requirements: [PB-01, PB-02, PB-03, PB-04, PB-06, PB-07]
dependency_graph:
  requires:
    - "Plan 20-01 — getPriceBookItems query, server actions, schema"
    - "Plan 20-02 — PriceBookList + PriceBookItemDialog components"
  provides:
    - "/settings/price-book — server-rendered route with auth guard, data fetch, and rendered list"
    - "/settings — Settings page now exposes Price Book entry-point card below SettingsTabs (D-02)"
    - "Phase 20 complete — full price-book CRUD UI shipped end-to-end"
  affects:
    - "app/(app)/settings/ — new sub-route directory price-book/ (sibling to appearance/)"
    - "app/(app)/settings/page.tsx — single non-breaking addition (Price Book card)"
tech_stack:
  added: []
  patterns:
    - "Sub-route auth guard: getAuthClaims → redirect('/login'), getCachedCompany → redirect('/onboarding'), then createClient + RLS-scoped query (mirrors Phase 17 pattern)"
    - "Server component fetches → passes items array + companyId to client component (established Phase 03/04 pattern)"
    - "loading.tsx skeleton mirrors PriceBookList visual layout (header + helper + search + Add button + 2 grouped category sections × 3 rows) for streaming UX"
    - "Settings entry-point card replicates SettingsTabs Appearance card markup (Link → Card → CardHeader with icon + title + description + ChevronRight) for visual consistency"
key_files:
  created:
    - "app/(app)/settings/price-book/page.tsx"
    - "app/(app)/settings/price-book/loading.tsx"
  modified:
    - "app/(app)/settings/page.tsx"
decisions:
  - "Helper paragraph near page header is conditional (items.length > 0) — empty state already conveys optionality via D-10 copy, so the secondary helper would be redundant when no items exist"
  - "Page wrapper uses w-full max-w-none space-y-6 (matches /settings parent), not mx-auto max-w-xl like /settings/appearance — price-book is a wide table-grouped list, narrow column would truncate"
  - "Settings entry-point card placed strictly below SettingsTabs in the parent space-y-6 stack (D-02) — kept SettingsTabs untouched per D-01 (price-book is a sub-route, not a tab)"
metrics:
  duration: "~3min"
  tasks_completed: 2
  files_created: 2
  files_modified: 1
  completed_date: "2026-05-07"
---

# Phase 20 Plan 03: Price-Book Route Wiring + Settings Entry Point Summary

Wired the `/settings/price-book` route into the app: created the server-rendered page with auth guard and data fetch, added the Suspense loading skeleton, and exposed the feature from the parent `/settings` page via a Price Book card below the SettingsTabs (per D-02). Phase 20 is now end-to-end functional.

## Tasks Executed

### Task 1: Price-book page server component and loading skeleton

**Commit:** `1809da7`

Created `app/(app)/settings/price-book/page.tsx` (32 lines):

- `export const metadata = { title: 'Price Book' }` for the browser tab/SEO.
- Auth guard pattern matches Phase 17 servers components: `await getAuthClaims()` → `redirect('/login')` if missing; `await getCachedCompany(claims.sub as string)` → `redirect('/onboarding')` if missing.
- Data fetch via `await createClient()` (cookie-based, RLS-scoped) → `await getPriceBookItems(supabase, company.id)` from Plan 01.
- Renders `<h1>Price Book</h1>` plus a conditional muted helper paragraph (only when `items.length > 0`) that nudges users on optionality. When empty, the `<PriceBookList>` itself owns the EmptyState and shows the D-10 messaging — so the secondary helper here would be redundant.
- Mounts `<PriceBookList items={items} companyId={company.id} />` from Plan 02.

Created `app/(app)/settings/price-book/loading.tsx` (24 lines):

- Imports shadcn `Skeleton`.
- Layout mirrors the populated list: `Skeleton` for the title, helper text, search input + "Add Item" button, then two grouped category sections each with a header skeleton and three row skeletons inside a bordered container.
- Uses `Array.from({ length: 2 }).map((_, i) => …)` and nested `Array.from({ length: 3 })` so the skeleton has stable structure without depending on data.
- Function name `PriceBookLoading` (Next.js doesn't enforce naming, but matches the `AppearanceLoading` precedent).

**Verification:** `npx tsc --noEmit` → only the 5 pre-existing `@react-pdf/renderer` errors documented in 20-01-SUMMARY.md. Zero new errors from this task.

### Task 2: Add Price Book entry card to /settings page + full suite verification

**Commit:** `ab82f59`

Modified `app/(app)/settings/page.tsx` only (D-01: SettingsTabs is NOT touched — price-book is a sibling sub-route, not a new tab):

- Added imports: `Link` from `next/link`, `BookOpen, ChevronRight` from `lucide-react`, and `Card, CardDescription, CardHeader, CardTitle` from `@/components/ui/card`.
- Inserted a `<Link href="/settings/price-book">` card below `<SettingsTabs company={company} />` in the existing `space-y-6` stack (D-02).
- Card markup is byte-for-byte structurally identical to the Appearance card pattern inside `SettingsTabs` (`Link → Card → CardHeader.flex.items-center.justify-between → div.gap-3 (Icon + CardTitle + CardDescription) + ChevronRight`) — the same hover/focus states (`hover:bg-accent/50`, `focus-visible:ring-2`) and same border-bottom on the header.
- Icon: `BookOpen` (consistent with `EmptyState` in `PriceBookList`). Title: "Price Book". Description: "Manage your standard pricing for AI-powered estimates."

**Verification:**

| Check | Command | Result |
|-------|---------|--------|
| Phase-20 tests pass | `npx vitest run tests/unit/price-book tests/unit/schemas/price-book.test.ts` | **16/16 GREEN** (10 list + 6 schema) |
| TypeScript clean | `npx tsc --noEmit` | Only 5 pre-existing `@react-pdf/renderer` errors (baseline) — zero new errors |
| Full suite — no regressions | `npx vitest run` | 327 pass / 10 fail / 2 skip / 5 todo. The 10 failures are EXACTLY the documented baseline in `deferred-items.md`: globals-brand-tokens (×5), onboarding-schema (×2), admin-gate (×2), missing-key-ux (×1). |
| Files exist | filesystem check | All 3 artifacts present |
| Routes work | manual route inspection | `/settings/price-book/page.tsx` resolves; `/settings` shows new card linking to it |

The auth-actions timeout failure listed in deferred-items.md (1 item) did not surface in this run — environment-dependent flakiness on the SignOutButton component test, unchanged by this plan.

## Deviations from Plan

None — plan executed exactly as written. The `<interfaces>` block in 20-03-PLAN.md matched the production code shapes verbatim, the auth pattern was already established in Phase 17, and the SettingsTabs Appearance card was a pixel-perfect template for the Price Book entry-point card.

## Phase 20 Completion Status

All Phase 20 success criteria satisfied:

- [x] PB-01 — Items grouped by free-form category, alphabetical sort (Plan 02 list + Plan 03 page)
- [x] PB-02 — Add item via Dialog (Plan 02 dialog, Plan 03 page mounts it)
- [x] PB-03 — Edit item via Dialog (Plan 02 dialog, Plan 03 page mounts it)
- [x] PB-04 — Delete with AlertDialog confirmation (Plan 02)
- [x] PB-06 — Empty state with D-10 copy + "Add first item" CTA (Plan 02)
- [x] PB-07 — Client-side search via `useMemo` on name + category (Plan 02)
- [x] /settings/price-book route exists and is auth-guarded (Plan 03 page.tsx)
- [x] Suspense loading.tsx provides instant skeleton during navigation (Plan 03 loading.tsx)
- [x] Settings page entry-point card visible below SettingsTabs (D-02 — Plan 03 page modification)
- [x] All 16 phase-20 unit tests GREEN
- [x] No new TypeScript errors introduced
- [x] No new vitest regressions introduced (failure count matches deferred-items.md baseline exactly)

## Pre-Existing Out-of-Scope Findings (Unchanged)

Phase 20 did not touch any of the files associated with the 10 baseline failures or the 5 `@react-pdf/renderer` errors. They remain documented in:

- `.planning/phases/20-price-book-crud-ui/deferred-items.md` (test failures)
- `.planning/phases/20-price-book-crud-ui/20-01-SUMMARY.md` (TypeScript errors)

Both are tracked for separate triage outside this milestone.

## Hand-off

Phase 20 ships a complete, user-reachable price-book CRUD UI:

- Users sign in → land on `/dashboard` → click sidebar "Settings" → see new "Price Book" card → click → reach `/settings/price-book` → see grouped items, search, add/edit/delete.
- The data path (`getPriceBookItems`), mutation path (server actions), schema (`priceBookItemSchema`), and RLS (Phase 19 migration) are all wired and verified.

Phase 21 (CSV import) consumes:

- `priceBookItemSchema` from `@/lib/schemas/price-book` to validate parsed rows
- `createPriceBookItem` from `@/lib/actions/price-book` (or a new bulk-insert action) to persist them
- `/settings/price-book` page as the natural surface for an "Import CSV" button next to "Add Item"

No API contracts in this plan need to change for Phase 21.

## Self-Check: PASSED

- FOUND: `app/(app)/settings/price-book/page.tsx`
- FOUND: `app/(app)/settings/price-book/loading.tsx`
- FOUND: `app/(app)/settings/page.tsx` (modified — contains `<CardTitle>Price Book</CardTitle>`, `<Link href="/settings/price-book"`, `BookOpen` import)
- FOUND: commit `1809da7` (Task 1)
- FOUND: commit `ab82f59` (Task 2)
- VERIFIED: `npx vitest run tests/unit/price-book tests/unit/schemas/price-book.test.ts` → 16/16 pass
- VERIFIED: `npx tsc --noEmit` → only baseline errors
- VERIFIED: `npx vitest run` (full suite) → only baseline failures (no new regressions)
