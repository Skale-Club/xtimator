---
phase: quick-260718-d2f
status: complete
date: 2026-07-18
commit: bfabe3f9
files_modified:
  - lib/actions/price-book.ts
  - components/price-book/price-book-list.tsx
  - tests/unit/price-book/price-book-list.test.tsx
---

# Summary: Category trash button dual function (trash selection / delete category with items)

## What changed

- **price-book-list.tsx**: the category-header trash icon now branches — if any items are selected (`selected.size > 0`) it opens the existing bulk-delete dialog (same flow as the floating bar → `trashPriceBookItems`); if nothing is selected it opens the Delete Category dialog, which no longer refuses on non-empty categories. New `deletingFolderItemCount` memo (from UNFILTERED `items`, not the search-filtered view) drives the dialog copy: "This will delete the category and move its N item(s) to Trash. You can restore them later from Trash." (or "…the empty category." at 0). Confirm calls the new `deleteFolderWithItems`; success toast distinguishes the two cases. Button gained `data-testid="delete-folder-btn-{folderId}"`.
- **lib/actions/price-book.ts**: new `deleteFolderWithItems(folderId)` — `assertWritable` + auth context; soft-deletes (deleted_at=now) all ACTIVE items of the folder (company-scoped), then deletes the folder row. The folder FK is `ON DELETE SET NULL` (migration 20260518000003), so remaining already-trashed rows are auto-un-categorized — everything stays restorable from /trash and restores into Uncategorized. `deleteFolder` (guarded refusal) kept exported but no longer used by the UI.
- **tests**: mock for `deleteFolderWithItems` + 3 new tests: selection → bulk dialog + `trashPriceBookItems` with the selected ids (folder action NOT called); no selection → category dialog shows the item count and "to Trash" copy; confirm → `deleteFolderWithItems('folder-labor')` (bulk trash NOT called).

Scope note: "delete whatever was selected" is implemented globally — the trash icon acts on the current selection even if it spans categories; the confirm dialog states the exact count before anything happens.

## Verification

- `npx tsc --noEmit -p tsconfig.ci.json` — clean
- `tests/unit/price-book/ + tests/unit/trash/` — 57/57 green (6 files), including the 3 new dual-function tests
- Live browser check skipped: price-book requires an authenticated session (same blocker as k3f) and a second `next dev` dies on the shared `.next` dir while another chat's server holds it (documented in h4l); both button branches are exercised by component tests instead.

## Notes

- No translations.ts entries added — `t()` live-translates unlisted strings via /api/translate (same approach t7d shipped with). The old static entry for the removed "must be moved or deleted first" copy remains in translations.ts as an inert dead key.
- No migration needed; hard-delete paths untouched (still only reachable for rows already in Trash).
