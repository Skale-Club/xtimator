---
phase: 20-price-book-crud-ui
plan: 02
subsystem: price-book
tags: [ui, client-components, react-hook-form, combobox, alert-dialog, wave-1, tdd-green]
requirements: [PB-01, PB-02, PB-03, PB-04, PB-06, PB-07]
dependency_graph:
  requires:
    - "Plan 20-01 — priceBookItemSchema, PriceBookItemFormValues, PriceBookItem, server actions, RED test stubs"
  provides:
    - "components/price-book/price-book-list.tsx — search + grouped list + delete flow"
    - "components/price-book/price-book-item-dialog.tsx — add/edit form with category Combobox"
    - "16/16 phase-20 unit tests GREEN (10 list + 6 schema)"
  affects:
    - "components/price-book/ — new directory under existing components/ pattern"
tech_stack:
  added: []
  patterns:
    - "Radix DropdownMenu in jsdom requires pointerdown (not click) — helper added in tests"
    - "useEffect resets form on item/open prop change (Pitfall 3 — stale form values when dialog reopens with different item)"
    - "onSubmit closes dialog FIRST then router.refresh() (Pitfall 5 — avoids flash of stale data)"
    - "zodResolver(priceBookItemSchema) cast to any (Pitfall 2 — zod v4 + react-hook-form type mismatch, Phase 02 precedent)"
    - "Combobox built from Popover + Command (cmdk) with CommandEmpty fallback for new categories"
    - "Native <input type='number'> + z.coerce.number — no react-hook-form valueAsNumber prop needed"
    - "AlertDialog confirm-then-execute for destructive delete (PB-04)"
key_files:
  created:
    - "components/price-book/price-book-list.tsx"
    - "components/price-book/price-book-item-dialog.tsx"
    - ".planning/phases/20-price-book-crud-ui/deferred-items.md"
  modified:
    - "tests/unit/price-book/price-book-list.test.tsx (RED stubs → GREEN assertions)"
    - "tests/unit/schemas/price-book.test.ts (RED stubs → GREEN assertions)"
decisions:
  - "Radix DropdownMenu test interaction uses pointerdown helper because jsdom doesn't dispatch synthesized pointer events from .click()"
  - "Dialog state lifted into PriceBookList — single PriceBookItemDialog instance toggled with editingItem state (vs per-row dialog) to avoid mounting N dialogs"
  - "Combobox uses internal local state for the search query, commits the typed value verbatim if user submits without selecting an existing option (lets users add new categories inline per PB-01)"
  - "Stub dialog (Task 1, 18 lines) committed before full implementation (Task 2) so PriceBookList import resolves and Wave 0 list tests can pass with the dialog mocked"
  - "Pre-existing test failures in 4 unrelated files documented in deferred-items.md and NOT touched (Scope Boundary rule)"
metrics:
  duration: "~25min (incl. timeout cleanup)"
  tasks_completed: 2
  files_created: 3
  files_modified: 2
  completed_date: "2026-05-07"
---

# Phase 20 Plan 02: PriceBookList + PriceBookItemDialog Summary

Built the two client components that turn Plan 01's RED stubs GREEN: `PriceBookList` (search, alphabetical category grouping, per-row dropdown, AlertDialog delete flow, EmptyState) and `PriceBookItemDialog` (add/edit form with Combobox category autocomplete via Popover + Command, react-hook-form + zodResolver). All 16 phase-20 unit tests pass.

## Tasks Executed

### Task 1: PriceBookList with search, grouping, and delete flow

**Commit:** `e73af2e`

Created `components/price-book/price-book-list.tsx` (269 lines):

- Header: search `Input` + "Add Item" button that opens `PriceBookItemDialog` with `editingItem={null}`.
- Filter pipeline: case-insensitive substring match on `name` and `category` (PB-07).
- Grouping: `groupBy(category)` → alphabetical category array → items pre-sorted by `getPriceBookItems` query (PB-01).
- Empty state: `EmptyState` component with D-10 copy + "Add first item" CTA when `items.length === 0`.
- No-results state: rendered when `items.length > 0 && filtered.length === 0` (PB-07).
- Per-row `DropdownMenu` (⋯) with Edit (opens dialog with `editingItem={item}`) and Delete (opens `AlertDialog`).
- Delete flow: `AlertDialog` with item name in description → calls `deletePriceBookItem(itemId)` → `toast.success/error` → `router.refresh()` (PB-04).

Stubbed `components/price-book/price-book-item-dialog.tsx` (18 lines, returns `null` when closed) so the list import resolves; full implementation lands in Task 2.

Wave 0 → Wave 1 transition: turned the 10 RED `expect.fail('not implemented')` stubs into real assertions. The list tests required a `pointerdown` helper because Radix `DropdownMenu` listens on pointer events — `.click()` from `@testing-library/user-event` does not trigger the menu in jsdom.

Schema tests (`tests/unit/schemas/price-book.test.ts`) turned GREEN automatically — `priceBookItemSchema` already shipped in Plan 01.

**Verification:** `npx vitest run tests/unit/price-book tests/unit/schemas/price-book.test.ts` → 16/16 pass.

### Task 2: PriceBookItemDialog with Combobox category autocomplete

**Commit:** `8ac507f`

Replaced the stub with the full implementation (280 lines):

- `Dialog` from shadcn/ui with conditional title (`{editingItem ? 'Edit' : 'Add'} item`) and submit button label.
- `useForm<PriceBookItemFormValues>({ resolver: zodResolver(priceBookItemSchema) as any, defaultValues: editingItem ?? EMPTY_FORM })` — the `as any` cast resolves the zod-v4/react-hook-form type mismatch first encountered in Phase 02 (Pitfall 2).
- `useEffect` resets the form whenever `item` or `open` change so reopening the dialog with a different item never shows stale values (Pitfall 3).
- Category field: Combobox via `Popover` + `Command` (cmdk). `CommandEmpty` shows "Press enter to add «X»" fallback when the typed query has no matches — letting users inline-create new categories per PB-01.
- `unit_price`: native `<input type="number" step="0.01" min="0">` with `z.coerce.number()` handling string→number coercion at submit (Pitfall 1, no `valueAsNumber` needed).
- `unit` and `notes`: plain `Input` and `Textarea`, both `.optional().or(z.literal(''))` per Plan 01 schema.
- `onSubmit`: calls `createPriceBookItem` or `updatePriceBookItem`, surfaces `toast.error(error)` on failure, `toast.success(...)` on success, **closes the dialog FIRST** then calls `router.refresh()` to avoid a flash of stale list data (Pitfall 5).

Also recorded `.planning/phases/20-price-book-crud-ui/deferred-items.md` cataloging 10 pre-existing test failures across 4 unrelated files (globals-brand-tokens, onboarding-schema, admin-gate, auth-actions, missing-key-ux). These exist on `main` before this plan and are out of scope per the Scope Boundary rule. Phase 20 work itself is fully GREEN.

**Verification:**
- `npx vitest run tests/unit/price-book tests/unit/schemas/price-book.test.ts` → 16/16 pass.
- `npx tsc --noEmit` → only pre-existing `@react-pdf/renderer` errors (already documented in 20-01 SUMMARY); no new errors from this plan.

## Self-Check

- [x] All Plan 02 must-have truths verified
- [x] PriceBookList renders grouped items, search, Add button, EmptyState/no-results
- [x] DropdownMenu Edit/Delete options wire to dialog and AlertDialog
- [x] PriceBookItemDialog opens for add (empty) and edit (pre-populated)
- [x] AlertDialog confirms before deletePriceBookItem
- [x] All 16 unit tests GREEN (10 list + 6 schema)
- [x] PriceBookList ≥180 lines (actual: 269)
- [x] PriceBookItemDialog ≥150 lines (actual: 280)
- [x] Both task commits atomic with --no-verify
- [x] Out-of-scope pre-existing failures documented in deferred-items.md, not patched

## Notable Deviations

None. Plan executed as designed.

## Hand-off to Plan 03

Plan 03 will:
- Create `app/(app)/settings/price-book/page.tsx` server component → fetch with `getPriceBookItems(supabase, company.id)` → render `<PriceBookList items={items} companyId={company.id} />`.
- Add `app/(app)/settings/price-book/loading.tsx` skeleton.
- Add Price Book card to `app/(app)/settings/page.tsx` after `SettingsTabs` (per D-02).

Both components in this plan accept their props as documented in the plan frontmatter — no API changes needed in Plan 03.
