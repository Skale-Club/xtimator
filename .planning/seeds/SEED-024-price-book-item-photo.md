---
id: SEED-024
status: harvested
planted: 2026-05-18
planted_during: v3.1.1 — MVP Launch Prep + Future-Proofing
harvested: 2026-05-18
harvested_in: quick-260518-gxy
trigger_when: Next milestone touching price book UX, estimate quality, or media/photo features
scope: medium
---

# SEED-024: Photo attached to price book item

## Why This Matters

Business owners often work with visual materials — a specific tile, fixture, paint color, or
equipment model. Attaching a reference photo to a price book item lets them:
- Quickly identify the right item when building estimates
- Show clients exactly what's included in a line item
- Reduce errors when multiple similar items share a category

Without photos, price book items are text-only entries, which can be ambiguous for visual
trades (painting, flooring, landscaping, HVAC equipment).

## When to Surface

**Trigger:** Next milestone that touches price book features, estimate quality, or any
media/photo upload surface in the app.

This seed should be presented during `/gsd:new-milestone` when the milestone scope matches
any of these conditions:
- Milestone adds or improves price book functionality
- Milestone expands photo/media capabilities in the app
- Milestone focuses on estimate clarity or line-item detail

## Scope Estimate

**Medium** — needs new storage path, new DB column, and UI changes in two components:

1. **DB migration** — add `image_url TEXT` (nullable) to `company_price_book`
2. **Storage** — upload to existing `photos` bucket (or a dedicated `price-book` bucket) at
   path `{company_id}/price-book/{item_id}.{ext}` using the Phase 66 storage abstraction
   (`createStorage(client).upload(...)`)
3. **Schema** (`lib/schemas/price-book.ts`) — add optional `image_url` field
4. **Actions** (`lib/actions/price-book.ts`) — handle file upload in `createPriceBookItem` /
   `updatePriceBookItem` (upload first, then save URL — same pattern as logo upload in Phase 02)
5. **Dialog** (`components/price-book/price-book-item-dialog.tsx`) — add optional image picker
   with preview thumbnail (reuse existing photo input patterns from capture screen)
6. **List** (`components/price-book/price-book-list.tsx`) — show small thumbnail next to item
   name in the table row; fallback to a placeholder icon when no image set

## Breadcrumbs

| File | Relevance |
|------|-----------|
| `lib/actions/price-book.ts` | `createPriceBookItem` / `updatePriceBookItem` — add upload step before DB insert |
| `lib/schemas/price-book.ts` | Add `image_url: z.string().url().optional()` |
| `components/price-book/price-book-item-dialog.tsx` | Add image picker + preview to the form |
| `components/price-book/price-book-list.tsx` | Render thumbnail column in item rows |
| `supabase/migrations/20260506000001_phase19_price_book.sql` | Reference for table structure |
| `lib/actions/company.ts` | Logo upload pattern (create-then-update with Storage) to follow |
| `lib/storage/` | Phase 66 storage abstraction — use `createStorage(client).upload()` |

## Notes

- Follow the **create-then-update pattern** from Phase 03 (client logo): insert item first to
  get the UUID, then upload to `{company_id}/price-book/{id}.{ext}`, then update `image_url`.
- Use the Phase 66 storage abstraction — never call `supabase.storage.from()` directly.
- Image field is fully optional — existing items and CSV imports are unaffected.
- Thumbnail in the list should be small (32×32 or 40×40px) to keep the table compact.
- RLS on storage bucket must allow company-scoped reads (same pattern as `photos` bucket).
