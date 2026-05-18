---
phase: quick
plan: 260518-hkp
subsystem: price-book
tags: [price-book, folder-hierarchy, csv-import, schema, ui, seed-025]
dependency_graph:
  requires: [optional-price-book-category]
  provides: [price-book-folder-hierarchy]
  affects: [price-book-list, price-book-item-dialog, price-book-import, settings-price-book-page]
tech_stack:
  added: []
  patterns: [2-level-folder-category-hierarchy, virtual-uncategorized-bucket, left-join-flatten, transient-csv-field]
key_files:
  created:
    - supabase/migrations/20260518000003_price_book_folders.sql
  modified:
    - types/database.types.ts
    - lib/queries/price-book.ts
    - lib/actions/price-book.ts
    - lib/schemas/price-book.ts
    - components/price-book/price-book-list.tsx
    - components/price-book/price-book-item-dialog.tsx
    - lib/csv/price-book-import.ts
    - components/price-book/price-book-import-dialog.tsx
    - app/(app)/settings/price-book/page.tsx
    - public/price-book-template.csv
    - tests/unit/price-book/price-book-list.test.tsx
    - tests/unit/price-book/bulk-adjust-dialog.test.tsx
decisions:
  - "Folders passed as prop to PriceBookList (server component fetches via Promise.all alongside items) — consistent with established RSC pattern"
  - "Virtual Uncategorized folder rendered last via null-check in folderSections useMemo — no DB row needed"
  - "folder_name transient field cast as any in importPriceBookItems — intentionally not in Zod schema, only needed in CSV import path"
  - "resolveOrCreateFolders called client-side before importPriceBookItems — keeps single-server-action import action clean; folder upsert is a separate concern"
  - "deleteFolder guard queries company_price_book with .eq('folder_id', folderId) before delete — server-enforced even when client already shows folder is empty (defensive)"
  - "Empty state triggers when both items.length === 0 AND folders.length === 0 — allows folder-only state (no items yet) to show the main UI"
metrics:
  duration: 10min
  completed: 2026-05-18
---

# Quick Task 260518-hkp: Price Book Category Hierarchy (Folders) — SEED-025

**One-liner:** 2-level folder → category hierarchy with collapsible folder sections, inline rename/delete, New Folder dialog, folder picker in item dialog, and optional folder column in CSV import.

## What Was Built

- **Migration** `20260518000003_price_book_folders.sql`: Creates `price_book_folders` table (id, company_id, name, sort_order, created_at) with full company-scoped RLS (4 policies). Adds nullable `folder_id` FK to `company_price_book` (ON DELETE SET NULL).
- **TypeScript types**: Extended `database.types.ts` manually — added `price_book_folders` table entry and `folder_id` to `company_price_book` Row/Insert/Update. Also fixed `category` nullability (string | null) to match migration from quick task gf3.
- **`lib/queries/price-book.ts`**: Added `PriceBookFolder` interface and `getFolders()`. Extended `PriceBookItem` with `folder_id` + `folder_name` (denormalized via left-join flatten). Updated `getPriceBookItems()` to join `price_book_folders(name)` and flatten to `folder_name`.
- **`lib/schemas/price-book.ts`**: Added `folder_id: z.string().uuid().optional().nullable()` as first field in `priceBookItemSchema`.
- **`lib/actions/price-book.ts`**: Added `createFolder`, `updateFolder`, `deleteFolder` (with item-count guard), and `resolveOrCreateFolders` (fetch-existing + create-missing in batch). Extended `createPriceBookItem`, `updatePriceBookItem` with `folder_id`. Extended `importPriceBookItems` to accept optional `folderNameMap` and resolve `folder_id` per row.
- **`components/price-book/price-book-list.tsx`**: Full rewrite — 2-level grouping (folder sections → category groups), collapsible folders, inline rename (click Pencil, type, Enter/Escape/blur), delete via AlertDialog (server-enforced guard), New Folder dialog. "Uncategorized" virtual bucket rendered last. "New Folder" button added to header alongside Import CSV and Add Item.
- **`components/price-book/price-book-item-dialog.tsx`**: Added `folders: PriceBookFolder[]` prop. Added folder combobox (Popover + Command) above category field, matching existing category picker pattern. `EMPTY_FORM` includes `folder_id: null`. `useEffect` reset includes `folder_id: item?.folder_id ?? null`.
- **`app/(app)/settings/price-book/page.tsx`**: Added `getFolders` import, `Promise.all` for parallel items+folders fetch, passes `folders` prop to `PriceBookList`.
- **`lib/csv/price-book-import.ts`**: Added `ImportRow` type (`PriceBookItemFormValues & { folder_name?: string }`). Updated `ParsedRow.values` to use `ImportRow`. `parsePriceBookCsv` extracts optional `folder` column and stores as `folder_name` transient field.
- **`components/price-book/price-book-import-dialog.tsx`**: Updated `handleConfirm` to collect unique folder names from valid rows, call `resolveOrCreateFolders`, pass `folderNameMap` to `importPriceBookItems`.
- **`public/price-book-template.csv`**: Added `folder` as first column with sample data (Labor/Electrical and Materials/Pipe Fittings).
- **Test fixtures**: Updated `price-book-list.test.tsx` and `bulk-adjust-dialog.test.tsx` to add `folder_id: null, folder_name: null` to mock `PriceBookItem` objects and `folders={mockFolders}` prop.

## Migration

Migration NOT applied (no DB connection available locally — apply with `bunx supabase db push --db-url $DATABASE_URL` per established pattern since Phase 19).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed test fixtures for extended PriceBookItem interface**
- **Found during:** Task 2/3 verification (tsc --noEmit)
- **Issue:** `price-book-list.test.tsx` and `bulk-adjust-dialog.test.tsx` mock items missing `folder_id` and `folder_name` fields; `PriceBookList` render calls missing `folders` prop
- **Fix:** Added `folder_id: null, folder_name: null` to all mock `PriceBookItem` objects; added `mockFolders: PriceBookFolder[] = []` constant; passed `folders={mockFolders}` to all `<PriceBookList>` renders
- **Files modified:** `tests/unit/price-book/price-book-list.test.tsx`, `tests/unit/price-book/bulk-adjust-dialog.test.tsx`
- **Commit:** 2f8e524

**2. [Rule 2 - Missing functionality] Fixed category nullability in database.types.ts**
- **Found during:** Task 1 type extension
- **Issue:** `company_price_book.category` still typed as `string` (non-nullable) in `database.types.ts` despite the gf3 migration making it nullable
- **Fix:** Changed Row.category to `string | null`, Insert.category to `string | null` with `?` optional, Update.category to `string | null`
- **Files modified:** `types/database.types.ts`
- **Commit:** cc7b74e

**3. [Rule 2 - Missing functionality] Empty state guard includes folders.length === 0**
- **Found during:** Task 3 implementation
- **Issue:** Plan's empty state check was `items.length === 0` only — but with folders, a company could have folders with no items and should see the main list UI (not the empty state)
- **Fix:** Changed empty state condition to `items.length === 0 && folders.length === 0`
- **Files modified:** `components/price-book/price-book-list.tsx`

## Commits

| Task | Commit | Message |
|------|--------|---------|
| 1 | cc7b74e | feat(260518-hkp): DB migration + TypeScript types for price_book_folders |
| 2+3 | 2f8e524 | feat(260518-hkp): queries, actions, schema, UI for folder hierarchy |
| 4 | 3a79b52 | feat(260518-hkp): CSV import — optional folder column + resolveOrCreateFolders |

## Self-Check

Checked below.
