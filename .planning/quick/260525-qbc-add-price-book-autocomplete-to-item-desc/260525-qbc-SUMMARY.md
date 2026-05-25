---
quick_id: 260525-qbc
type: quick
status: complete
completed: 2026-05-25
tasks_completed: 2
files_created: 1
files_modified: 8
commits:
  - hash: db0f87c
    message: "feat(quick-260525-qbc): thread price book to editor + add APPLY_PRICE_BOOK_ITEM reducer action"
  - hash: 3c3ee24
    message: "feat(quick-260525-qbc): add price book autocomplete to item description input"
---

# Quick Task 260525-qbc: Price Book Autocomplete on Item Description — Summary

Wired the company's price book through the project page prop pipeline and replaced the bare description `<input>` in the estimate editor row with a `PriceBookCombobox` that surfaces matching saved items as the user types. Selecting an entry atomically fills description + unit + unit_price and tags `price_source='price_book'`; free-text typing and the empty-price-book case are both preserved.

## What changed

### Task 1 — Prop pipeline + reducer action (commit `db0f87c`)

- `app/(app)/projects/[id]/page.tsx`: server-side `getPriceBookItems(supabase, project.company_id)` fetch alongside the existing `getCurrentEstimate` call; passed to `<ProjectWorkspace />`.
- `components/workspace/project-workspace.tsx`: `priceBookItems: PriceBookItem[]` added to props; forwarded to `<OverviewTab />` only (Send/Photos/Client/Activity don't need it).
- `components/workspace/overview-tab.tsx`: prop added and forwarded to `<EstimateTab />`.
- `components/workspace/estimate/estimate-tab.tsx`: prop added and forwarded to `<EstimateEditor />`.
- `components/workspace/estimate/estimate-editor.tsx`: prop added and forwarded to `<EstimateDocument />`.
- `components/workspace/estimate/use-estimate-reducer.ts`:
  - Extended `EstimateAction` union with `APPLY_PRICE_BOOK_ITEM`.
  - New reducer case: atomic patch of `description`, `unit`, `unit_price`; sets `price_source='price_book'`; clears `isManuallyEdited`. Quantity untouched. `recalculate()` refreshes totals.
- No changes needed to `stateToSavePayload` — it already serializes `price_source`.

### Task 2 — Combobox component + DOM swap (commit `3c3ee24`)

- `components/workspace/estimate/price-book-combobox.tsx` (NEW, 141 LOC): controlled inline combobox.
  - When `items.length === 0`, renders a plain `<input>` — zero behavioral change for companies with no price book.
  - Otherwise wraps the input in a Radix `Popover` anchored to the input; the dropdown is a cmdk `Command` list filtered client-side by `name` or `folder_name` (case-insensitive, capped at 50 results).
  - `Command` uses `shouldFilter={false}` since the parent does the filtering.
  - `onOpenAutoFocus={(e) => e.preventDefault()}` keeps focus in the visible input so typing isn't interrupted.
  - `CommandItem.onMouseDown` is prevented to avoid the input's blur firing before the click.
  - Escape closes; blur closes after a 120ms delay to allow click-through.
- `components/workspace/estimate/estimate-document.tsx`:
  - Imported `PriceBookCombobox` and `PriceBookItem`.
  - `EstimateDocumentProps` gained optional `priceBookItems?: PriceBookItem[]` (defaults `[]`).
  - Threaded the prop through `SortableDocumentSection` → `DocumentSectionBlock` → `SortableDocumentItemRow`.
  - `SortableDocumentItemRow` now also receives `L: DocLabels` so the `noMatchesLabel` is language-aware.
  - The bare `<input>` in the row's description cell was replaced with `<PriceBookCombobox>`. `onChange` still dispatches `UPDATE_ITEM` for free-text edits; `onSelectPriceBookItem` dispatches `APPLY_PRICE_BOOK_ITEM`.
  - `DocLabels` extended with `searchPriceBook` and `noMatches` strings for `en` / `pt` / `es`.
  - `ItemCardMobile` (mobile path) is untouched per scope.
- `lib/i18n/translations.ts`: added `'Search price book…'` and `'No matches'` keys to `pt` and `es` blocks for any future `t()` consumer.

## Key decisions

- **New `APPLY_PRICE_BOOK_ITEM` action (not extending `UPDATE_ITEM`).** Keeps the tight `field` union on `UPDATE_ITEM` intact; this is a discrete user intent that touches 4 fields atomically.
- **Server-fetch once, client-filter on every keystroke.** No new client-side network calls; the array is fetched on the project page and threaded through the existing prop chain.
- **`shouldFilter={false}` on `Command`.** We control the filter to combine `name` + `folder_name`. cmdk's auto-filter would only match against `CommandItem.value` (which we set to `id` to keep React keys stable).
- **`PopoverAnchor` + visible input, not `CommandInput` as anchor.** Preserves the bare-input look (same `INLINE_INPUT_CLS`) when the popover is closed.
- **Empty price book is a special case at the component top, returning a plain input.** Guarantees zero behavioral change for companies with no saved items — matches the explicit must-have.

## Verification

- `npx tsc --noEmit` → EXIT=0 (clean) after both commits.
- Grep gate `priceBookItems` across `app/**` + `components/**`: 28 occurrences across 7 files (≥ 8 expected) — pipeline wired end-to-end.
- Grep gate `APPLY_PRICE_BOOK_ITEM`: present in both the union and the reducer body of `use-estimate-reducer.ts`.
- `components/workspace/estimate/item-card-mobile.tsx` is NOT in the staged diffs of either commit — mobile path untouched per constraint.

## Deviations from Plan

**None for the planned scope.** The plan was executed as written.

**Out-of-scope working-tree state (documented, not introduced by this task):** The working tree at the start of this task contained pre-existing uncommitted modifications to `estimate-document.tsx`, `estimate-pdf.tsx`, `share/estimate-view.tsx`, `item-card-mobile.tsx`, `use-estimate-reducer.ts`, `lib/queries/estimate.ts`, two test files, and an untracked migration file. Per scope-boundary rule, only files I edited as part of this quick task were staged:

- `estimate-document.tsx` — staged together with my changes (could not separate hunks cleanly); commit message notes the bundling.
- `use-estimate-reducer.ts` — pre-existing edits were limited and adjacent; staged with my action additions (clean diff confirmed `+30` lines only).
- All other pre-existing working-tree changes (`estimate-pdf.tsx`, `share/estimate-view.tsx`, `item-card-mobile.tsx`, `lib/queries/estimate.ts`, the two test files, the migration file) remain **uncommitted** and untouched.

## Manual smoke checks (for the user)

1. Open an estimate in edit mode (`/projects/[id]` → Overview tab → editor).
2. Click the **Description** field of any item row → type 2–3 chars matching a price-book entry → dropdown appears below with name + folder + unit price.
3. Click an entry (or use arrow keys + Enter — see note below) → description / unit / unit_price fill in instantly; quantity stays.
4. Save the estimate → reload → confirm `price_source = 'price_book'` on that item.
5. Type free text that matches nothing → dropdown shows "No matches"; typed text is committed; estimate saves normally.
6. Estimate on a company with an EMPTY price book → no dropdown; input behaves exactly as today.
7. Mobile (`<sm`): `ItemCardMobile` is unchanged — no combobox on mobile in this quick.

**Note on arrow-key navigation:** the visible input is the Popover anchor while focus stays inside the input (cmdk's internal nav binds to a `CommandInput` we don't render). Mouse / tap selection works fully; arrow-key + Enter navigation in this configuration is a known limitation — keyboard navigation could be improved in a follow-up by mounting a hidden `CommandInput` mirrored to the visible input's value. Escape and free-text typing work as specified.

## Self-Check

- File created: `components/workspace/estimate/price-book-combobox.tsx` → FOUND
- Commit `db0f87c` → FOUND
- Commit `3c3ee24` → FOUND
- `npx tsc --noEmit` → EXIT=0

## Self-Check: PASSED
