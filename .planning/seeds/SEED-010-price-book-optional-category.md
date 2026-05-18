---
id: SEED-010
status: dormant
planted: 2026-05-18
planted_during: v3.1.1 — MVP Launch Prep + Future-Proofing
trigger_when: Next milestone touching price book UX or general data-entry friction reduction
scope: small
---

# SEED-010: Make price book category optional

## Why This Matters

Currently, registering a price book item requires a category — the Zod schema enforces
`min(1)` and the DB column is `NOT NULL`. This forces users to invent a category on the spot
just to save a single item, adding unnecessary friction to quick registrations.

Making category optional lets users capture an item immediately and organize it later when
they have a clearer sense of their catalogue structure.

## When to Surface

**Trigger:** Next milestone that touches price book UX, general settings UX, or any
"reduce data-entry friction" theme.

This seed should be presented during `/gsd:new-milestone` when the milestone scope matches
any of these conditions:
- Milestone involves price book improvements or new price book features
- Milestone focuses on reducing friction in item/data registration flows
- Milestone is a general UX polish pass on the settings area

## Scope Estimate

**Small** — 3 targeted changes, no new components:

1. **Zod schema** (`lib/schemas/price-book.ts`) — change `category` from `z.string().min(1)` to
   `z.string().optional().or(z.literal(''))` (same pattern as `unit` / `notes`)
2. **DB migration** — `ALTER TABLE company_price_book ALTER COLUMN category DROP NOT NULL`
3. **List component** (`components/price-book/price-book-list.tsx`) — handle `null`/`''` category
   in the grouping logic: items without a category fall into an "Uncategorized" bucket, rendered
   last in the list

CSV import parser (`lib/csv/price-book-import.ts`) may also need a minor update to allow blank
category column without raising a validation error.

## Breadcrumbs

| File | Relevance |
|------|-----------|
| `lib/schemas/price-book.ts:4` | `category: z.string().min(1, 'Category is required')` — the Zod guard to relax |
| `supabase/migrations/20260506000001_phase19_price_book.sql:12` | `category TEXT NOT NULL` — the DB constraint to drop |
| `components/price-book/price-book-list.tsx` | In-memory groupBy uses `category` string as Map key; needs null-safe fallback |
| `lib/actions/price-book.ts:33,59,121,127,141` | Multiple category references in create/update/import/bulkAdjust actions |
| `lib/csv/price-book-import.ts` | CSV parser validates headers and row fields — may need to allow blank category |
| `lib/queries/price-book.ts` | `getPriceBookItems()` — no change needed (already selects all columns) |

## Notes

- Pattern for optional string fields already established in this codebase:
  `z.string().optional().or(z.literal(''))` — see `unit` and `notes` in the same schema file.
- The `bulkAdjustPriceBookCategory` action takes `category: string` — should still work for
  named categories; uncategorized items can be excluded from bulk adjust (or handled separately).
- "Uncategorized" group should render **last** in the list so it doesn't clutter the top of a
  well-organized price book.
