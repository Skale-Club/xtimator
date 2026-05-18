---
quick_id: 260518-gxy
subsystem: price-book
tags: [price-book, storage, image-upload, ui]
dependency_graph:
  requires: [Phase 66 Storage Abstraction, Phase 19 price_book DB]
  provides: [image_url on company_price_book, price book item photo picker]
  affects: [price-book-item-dialog, price-book-list, price-book server actions]
tech_stack:
  added: []
  patterns: [create-then-update upload, createStorage Phase 66 abstraction, buildStorageKey, getPublicUrl photos bucket]
key_files:
  created:
    - supabase/migrations/20260518000001_seed024_price_book_image.sql
  modified:
    - types/database.types.ts
    - lib/schemas/price-book.ts
    - lib/queries/price-book.ts
    - lib/actions/price-book.ts
    - components/price-book/price-book-item-dialog.tsx
    - components/price-book/price-book-list.tsx
    - tests/unit/price-book/bulk-adjust-dialog.test.tsx
    - tests/unit/price-book/price-book-list.test.tsx
decisions:
  - image_url stored via create-then-update pattern (Phase 03 logo convention) — insert item first to get UUID, then upload and patch image_url
  - Upload to photos bucket under {company_id}/price-book/{timestamp}-{item_id}.{ext} key via Phase 66 buildStorageKey
  - getPublicUrl used (not getSignedUrl) — photos bucket is public
  - Upload failure is non-fatal try/catch — item always saved, image is optional
  - Dialog image state (imageFile, imagePreview) reset on item/open change, preserving existing image_url as initial preview
  - company destructured from ctx in updatePriceBookItem to support upload key building
metrics:
  duration: 16min
  completed: 2026-05-18
  tasks: 3
  files: 8
---

# Quick Task 260518-gxy: Price Book Item Photo Summary

## One-Liner

Optional reference photo on price book items with dialog picker preview, create-then-update upload to photos bucket, and 32x32 thumbnail in list rows.

## What Was Built

**Task 1 — DB migration + type extension + schema + query:**
- Migration `20260518000001_seed024_price_book_image.sql`: `ALTER TABLE company_price_book ADD COLUMN image_url TEXT` (nullable, applied and verified in DB)
- `types/database.types.ts`: added `image_url: string | null` to `company_price_book` Row/Insert/Update (manual extension — Docker unavailable, established pattern from Phase 19)
- `lib/schemas/price-book.ts`: added `image_url: z.string().url().optional().or(z.literal(''))` to `priceBookItemSchema`
- `lib/queries/price-book.ts`: added `image_url: string | null` to `PriceBookItem` interface and `image_url` to the select string
- Test fixtures in `bulk-adjust-dialog.test.tsx` and `price-book-list.test.tsx` updated with `image_url: null` (Rule 1 auto-fix)

**Task 2 — Server action upload (create-then-update):**
- `lib/actions/price-book.ts`:
  - Added `import { createStorage, buildStorageKey } from '@/lib/storage'`
  - `createPriceBookItem` accepts optional `imageFile?: File | null`; after insert, uploads via `createStorage(supabase).upload('photos', key, imageFile, { upsert: true })` then patches `image_url` with `storage.getPublicUrl('photos', key)`
  - `updatePriceBookItem` accepts optional `imageFile?: File | null`; destructures `company` from ctx; same upload+patch pattern after update
  - Both actions include `image_url: formData.image_url || null` in DB insert/update objects
  - Upload failures are non-fatal (silent try/catch)

**Task 3 — Dialog image picker + list thumbnail:**
- `components/price-book/price-book-item-dialog.tsx`:
  - Added `ImageIcon` to lucide imports
  - Added `imageFile` (File | null) and `imagePreview` (string | null) state
  - `useEffect` resets image state on item/open change; populates `imagePreview` from `item?.image_url`
  - Photo picker section (below Notes, above submit): 40x40 thumbnail or dashed placeholder icon, "Add photo"/"Change photo" label-wrapped file input, "Remove" button when preview exists
  - `onSubmit` passes `imageFile` as third arg to both server actions
- `components/price-book/price-book-list.tsx`:
  - Added `ImageIcon` to lucide imports
  - Item name cell replaced with flex container: 32x32 `<img>` (if `image_url`) or muted placeholder `<div>` with `ImageIcon`, then item name

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Test fixtures missing image_url field**
- **Found during:** Task 1 TypeScript verification
- **Issue:** `bulk-adjust-dialog.test.tsx` and `price-book-list.test.tsx` mock `PriceBookItem` objects lacked `image_url` field after interface extension, causing TS2741 errors
- **Fix:** Added `image_url: null` to all mock item objects in both test files
- **Files modified:** `tests/unit/price-book/bulk-adjust-dialog.test.tsx`, `tests/unit/price-book/price-book-list.test.tsx`
- **Commit:** 55c1288

## Known Stubs

None — all image_url fields are wired from DB through query → interface → actions → UI.

## Commits

| Task | Commit | Message |
|------|--------|---------|
| 1 | 55c1288 | feat(260518-gxy): DB migration + type extension + schema + query for price book image |
| 2 | 150c92e | feat(260518-gxy): server action upload for price book item photo |
| 3 | 3cacc15 | feat(260518-gxy): dialog image picker and list thumbnail for price book items |

## Self-Check: PASSED

- Migration file exists: `supabase/migrations/20260518000001_seed024_price_book_image.sql` — confirmed
- DB column verified: `image_url TEXT nullable` confirmed via pg query
- `types/database.types.ts` company_price_book Row includes `image_url: string | null` — confirmed
- `lib/schemas/price-book.ts` has `image_url` optional field — confirmed
- `lib/queries/price-book.ts` has `image_url: string | null` in interface and select — confirmed
- `lib/actions/price-book.ts` has upload logic with createStorage — confirmed
- `components/price-book/price-book-item-dialog.tsx` has image picker — confirmed
- `components/price-book/price-book-list.tsx` has thumbnail in item rows — confirmed
- `npx tsc --noEmit` passes with zero errors on new files — confirmed
- All 3 task commits (55c1288, 150c92e, 3cacc15) in git log — confirmed
