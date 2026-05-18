---
id: SEED-012
status: dormant
planted: 2026-05-18
planted_during: v3.1.1 — MVP Launch Prep + Future-Proofing
trigger_when: Milestone dedicated to price book organization, catalogue management, or advanced settings UX
scope: large
---

# SEED-012: Price book category hierarchy (folders)

## Why This Matters

As a price book grows, a flat list of categories becomes hard to navigate. Service businesses
with broad catalogues (e.g. an HVAC company with equipment, labor, parts, and subcontractors)
need a way to group categories into folders — e.g. "Labor > Electrical", "Materials > Pipe
Fittings > Copper".

Today categories are free-text strings with no parent-child relationship. Two levels of
hierarchy (folder → category) would cover ~90% of real-world use cases without over-engineering.

## When to Surface

**Trigger:** Milestone dedicated to price book organization or advanced catalogue management.
Not suitable for a general UX milestone — it's a significant data model change.

This seed should be presented during `/gsd:new-milestone` when the milestone scope matches
any of these conditions:
- Milestone is explicitly about price book v2 / catalogue management
- A user research finding surfaces catalogue navigation as a top friction point
- The price book has grown past ~50 items for a meaningful number of companies (signal from
  usage analytics)

## Scope Estimate

**Large** — data model change + migration of existing data + new UI surface:

1. **New table** `price_book_categories` — `id`, `company_id`, `name`, `parent_id` (nullable,
   self-referential FK for one level of nesting), `sort_order`, `created_at`
2. **Migration** — add `category_id UUID` (nullable FK) to `company_price_book`; backfill by
   matching existing `category` text values to auto-created category rows per company
3. **RLS** — deny-all default + company-scoped policies on `price_book_categories`
4. **Queries / actions** — new CRUD for categories (create, rename, delete, reorder);
   update `getPriceBookItems` to join `price_book_categories`
5. **List UI** — collapsible folder tree replacing the current flat section headers; drag-to-
   reorder categories; inline rename on double-click
6. **Item dialog** — category picker becomes a folder-aware combobox (folder > category)
7. **CSV import** — extend template and parser to support a `folder` column (optional)
8. **Bulk adjust** — scope bulk-price-adjust to a folder or a single category

## Breadcrumbs

| File | Relevance |
|------|-----------|
| `supabase/migrations/20260506000001_phase19_price_book.sql` | Current `company_price_book` schema to extend |
| `lib/queries/price-book.ts` | `getPriceBookItems()` — needs category join |
| `lib/actions/price-book.ts` | All CRUD + bulkAdjust — category references throughout |
| `lib/schemas/price-book.ts` | Schema needs `category_id` field |
| `components/price-book/price-book-list.tsx` | Flat groupBy → folder tree render |
| `components/price-book/price-book-item-dialog.tsx` | Category combobox → folder-aware picker |
| `components/price-book/bulk-adjust-dialog.tsx` | Scope to folder or category |
| `lib/csv/price-book-import.ts` | CSV parser — optional `folder` column |
| `public/price-book-template.csv` | Template needs `folder` column added |

## Notes

- **Limit to 2 levels** (folder → category) for v1 of this feature. Three or more levels add
  UX complexity with negligible real-world benefit for service businesses.
- The `category` TEXT column on `company_price_book` can be kept as a legacy fallback during
  the migration window, then dropped in a follow-up cleanup migration.
- Self-referential FK (`parent_id`) on `price_book_categories` is simpler than a separate
  `price_book_folders` table and handles the 2-level constraint well.
- Consider whether SEED-010 (optional category) should ship first — a NULL-safe category
  layer makes the backfill migration for this seed cleaner.
- Drag-to-reorder can use `sort_order INTEGER` with gap-based numbering (e.g. 10, 20, 30)
  to avoid rewriting all rows on every move.
