---
quick_id: 260525-qbc
type: quick
wave: 1
files_modified:
  - components/workspace/estimate/price-book-combobox.tsx
  - components/workspace/estimate/estimate-document.tsx
  - components/workspace/estimate/estimate-editor.tsx
  - components/workspace/estimate/estimate-tab.tsx
  - components/workspace/overview-tab.tsx
  - components/workspace/project-workspace.tsx
  - app/(app)/projects/[id]/page.tsx
  - components/workspace/estimate/use-estimate-reducer.ts
  - lib/i18n/translations.ts
autonomous: true

must_haves:
  truths:
    - "When typing in the description input of an item row, a dropdown of matching price book items appears below the input."
    - "Selecting a price book entry auto-fills description, unit, unit_price, sets price_source='price_book'; quantity is untouched."
    - "Typing free text that matches no price book item still works — the input commits the typed text, the row saves normally."
    - "When the company's price book is empty, NO dropdown is rendered — input behaves exactly as today."
    - "Arrow keys navigate the dropdown, Enter selects, Esc closes."
  artifacts:
    - path: "components/workspace/estimate/price-book-combobox.tsx"
      provides: "Inline combobox swap-in for the bare description input — same visual when closed."
    - path: "components/workspace/estimate/use-estimate-reducer.ts"
      provides: "New APPLY_PRICE_BOOK_ITEM action — atomic multi-field patch."
  key_links:
    - from: "app/(app)/projects/[id]/page.tsx"
      to: "lib/queries/price-book.ts::getPriceBookItems"
      via: "server-side fetch with project.company_id, passed via ProjectWorkspace → OverviewTab → EstimateTab → EstimateEditor → EstimateDocument → SortableDocumentItemRow"
    - from: "components/workspace/estimate/price-book-combobox.tsx"
      to: "dispatch APPLY_PRICE_BOOK_ITEM"
      via: "onSelectPriceBookItem callback in SortableDocumentItemRow"
---

<objective>
Add a price book autocomplete dropdown to the description input of the editable item row in the estimate editor. Server-side fetch ALL price book items once at the page level; client-side filter on every keystroke. Selecting an item auto-fills description, unit, unit_price, and sets price_source='price_book'. Free-text typing is preserved.

Purpose: Reduce friction when building estimates manually — typing a few characters surfaces matching saved items so the user doesn't have to re-enter price/unit they've already stored.

Output: A small reusable `PriceBookCombobox` component, an `APPLY_PRICE_BOOK_ITEM` reducer action, and the prop pipeline that threads `priceBookItems: PriceBookItem[]` from the server page down to the row.
</objective>

<context>
@CLAUDE.md
@components/workspace/estimate/estimate-document.tsx
@components/workspace/estimate/estimate-editor.tsx
@components/workspace/estimate/estimate-tab.tsx
@components/workspace/estimate/use-estimate-reducer.ts
@components/workspace/overview-tab.tsx
@components/workspace/project-workspace.tsx
@app/(app)/projects/[id]/page.tsx
@lib/queries/price-book.ts
@lib/i18n/translations.ts
@components/ui/command.tsx
@components/ui/popover.tsx

<interfaces>
From lib/queries/price-book.ts:
```ts
export interface PriceBookItem {
  id: string
  company_id: string
  currency_code?: string
  folder_id: string | null
  folder_name: string | null
  name: string
  unit: string | null
  unit_price: number
  notes: string | null
  created_at: string
  image_url: string | null
}
export async function getPriceBookItems(
  supabase: SupabaseClient, companyId: string
): Promise<PriceBookItem[]>
```

From use-estimate-reducer.ts (current shape):
```ts
export interface EditorItem {
  id: string
  description: string
  quantity: number
  unit: string | null
  unit_price: number
  total: number
  sort_order: number
  price_source: 'price_book' | 'ai_estimate' | null
  isManuallyEdited?: boolean
}

export type EstimateAction =
  | { type: 'UPDATE_ITEM'; sectionId: string; itemId: string;
      field: 'description'|'quantity'|'unit'|'unit_price'; value: string|number|null }
  | ... // existing actions
```

The description input today (estimate-document.tsx, inside `SortableDocumentItemRow`,
file lines ~423-438):
```tsx
<input
  value={item.description}
  onChange={(e) => dispatch({ type: 'UPDATE_ITEM', sectionId, itemId: item.id,
    field: 'description', value: e.target.value })}
  placeholder="Item description"
  className={INLINE_INPUT_CLS}
/>
```

shadcn primitives available (verified):
- `components/ui/command.tsx` — Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem (built on `cmdk`)
- `components/ui/popover.tsx` — Popover, PopoverTrigger, PopoverContent (radix)

Existing similar pattern reference: `ClientSearchList` + `Popover`+`Command` block in `estimate-document.tsx` (~lines 1002-1071) — already used for "No client linked" autocomplete.
</interfaces>

<reducer_decision>
**Choice: NEW action `APPLY_PRICE_BOOK_ITEM`** (not extending UPDATE_ITEM).
Rationale:
- UPDATE_ITEM currently has a tight union on `field` and a single `value`. Loosening it to accept a partial patch object would force every existing call site to change its types and would weaken type safety on the `field` enum.
- `APPLY_PRICE_BOOK_ITEM` is a discrete user intent (pick a saved item) that touches exactly 4 fields atomically AND sets `price_source='price_book'` + clears `isManuallyEdited`. A dedicated action is self-documenting.
- One reducer case, one save-payload trip — clean diff.
</reducer_decision>

</context>

<tasks>

<task type="auto">
  <name>Task 1: Thread server-fetched price book through to the editor and add the reducer action</name>
  <files>
    app/(app)/projects/[id]/page.tsx,
    components/workspace/project-workspace.tsx,
    components/workspace/overview-tab.tsx,
    components/workspace/estimate/estimate-tab.tsx,
    components/workspace/estimate/estimate-editor.tsx,
    components/workspace/estimate/use-estimate-reducer.ts
  </files>
  <action>
**A) Server fetch (app/(app)/projects/[id]/page.tsx)**
Inside `ProjectTabs` (the async sub-component, right after the `company` query and the existing `currentEstimate = await getCurrentEstimate(...)` call):
```ts
import { getPriceBookItems } from '@/lib/queries/price-book'
// ...
const priceBookItems = await getPriceBookItems(supabase, project.company_id)
```
Pass `priceBookItems={priceBookItems}` to `<ProjectWorkspace />`.

**B) project-workspace.tsx**
- Add `priceBookItems: PriceBookItem[]` to `ProjectWorkspaceProps` (import `PriceBookItem` from `@/lib/queries/price-book`).
- Destructure it in the component signature and forward to `<OverviewTab priceBookItems={priceBookItems} />`. No need to forward to other tabs (Send/Photos/Client/Activity don't need it).

**C) overview-tab.tsx**
- Add `priceBookItems: PriceBookItem[]` to `OverviewTabProps`. Forward to `<EstimateTab priceBookItems={priceBookItems} />`.

**D) estimate-tab.tsx**
- Add `priceBookItems: PriceBookItem[]` to `EstimateTabProps`. Forward to `<EstimateEditor priceBookItems={priceBookItems} />`. EstimateTab does not need the array itself — only the editor surface uses it.

**E) estimate-editor.tsx**
- Add `priceBookItems: PriceBookItem[]` to `EstimateEditorProps` and destructure in `EstimateEditor({ ..., priceBookItems })`. Forward as `priceBookItems={priceBookItems}` on the `<EstimateDocument />` element. (Document signature update happens in Task 2.)

**F) use-estimate-reducer.ts — add APPLY_PRICE_BOOK_ITEM**
1. Extend the `EstimateAction` union (after the existing `UPDATE_ITEM` action) with:
```ts
| { type: 'APPLY_PRICE_BOOK_ITEM'; sectionId: string; itemId: string;
    item: { name: string; unit: string | null; unit_price: number } }
```
2. Add a reducer case BEFORE the `default:` branch:
```ts
case 'APPLY_PRICE_BOOK_ITEM': {
  const updated = {
    ...state,
    sections: state.sections.map((s) => {
      if (s.id !== action.sectionId) return s
      return {
        ...s,
        items: s.items.map((i) => {
          if (i.id !== action.itemId) return i
          return {
            ...i,
            description: action.item.name,
            unit: action.item.unit,
            unit_price: action.item.unit_price,
            price_source: 'price_book' as const,
            isManuallyEdited: false,
          }
        }),
      }
    }),
    isDirty: true,
  }
  return recalculate(updated)
}
```
Do NOT touch quantity. `recalculate` will refresh totals from the new unit_price × existing quantity.

No save-payload changes needed — `stateToSavePayload` in estimate-editor.tsx already serializes `price_source`.
  </action>
  <verify>
    <automated>npx tsc --noEmit</automated>
  </verify>
  <done>
    - `getPriceBookItems` is called server-side in the project page and the array flows down through ProjectWorkspace → OverviewTab → EstimateTab → EstimateEditor as `priceBookItems`.
    - `APPLY_PRICE_BOOK_ITEM` action exists in `EstimateAction` and is handled in the reducer.
    - `tsc --noEmit` passes (will still fail until Task 2 wires the prop into EstimateDocument — acceptable if Task 1 and 2 are done together in the same commit; otherwise add a stub prop to EstimateDocument signature with a TODO in Task 1).
  </done>
</task>

<task type="auto">
  <name>Task 2: Build PriceBookCombobox component and swap it into SortableDocumentItemRow</name>
  <files>
    components/workspace/estimate/price-book-combobox.tsx,
    components/workspace/estimate/estimate-document.tsx,
    lib/i18n/translations.ts
  </files>
  <action>
**A) Create `components/workspace/estimate/price-book-combobox.tsx`**

A controlled inline combobox that LOOKS like the bare `<input className={INLINE_INPUT_CLS} />` when no dropdown is open. When the user focuses + types and there is at least one match, a Popover opens below with a `Command` list.

```tsx
'use client'

import { useState, useRef, useMemo } from 'react'
import { Popover, PopoverContent, PopoverAnchor } from '@/components/ui/popover'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { formatMoney } from '@/lib/money/currency'
import type { PriceBookItem } from '@/lib/queries/price-book'

interface PriceBookComboboxProps {
  value: string
  onChange: (next: string) => void
  onSelectPriceBookItem: (item: PriceBookItem) => void
  items: PriceBookItem[]
  currencyCode: string
  placeholder?: string
  className?: string
  searchPlaceholder?: string
  noMatchesLabel?: string
}

export function PriceBookCombobox({
  value,
  onChange,
  onSelectPriceBookItem,
  items,
  currencyCode,
  placeholder,
  className,
  searchPlaceholder,
  noMatchesLabel,
}: PriceBookComboboxProps) {
  const [open, setOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const hasItems = items.length > 0

  const normalizedQuery = value.trim().toLowerCase()
  const filtered = useMemo(() => {
    if (!hasItems) return []
    if (!normalizedQuery) return items.slice(0, 50) // cap initial list
    return items
      .filter((it) => {
        const name = it.name.toLowerCase()
        const folder = (it.folder_name ?? '').toLowerCase()
        return name.includes(normalizedQuery) || folder.includes(normalizedQuery)
      })
      .slice(0, 50)
  }, [items, hasItems, normalizedQuery])

  // If price book is empty → render plain input, no dropdown wiring at all.
  if (!hasItems) {
    return (
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={className}
      />
    )
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <input
          ref={inputRef}
          value={value}
          onChange={(e) => {
            onChange(e.target.value)
            if (!open) setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => {
            // Delay so click on dropdown can fire first
            setTimeout(() => setOpen(false), 120)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.preventDefault()
              setOpen(false)
            }
            // ArrowDown / ArrowUp / Enter handled by cmdk inside CommandList below.
          }}
          placeholder={placeholder}
          className={className}
        />
      </PopoverAnchor>
      <PopoverContent
        align="start"
        sideOffset={2}
        className="p-0 w-[--radix-popover-trigger-width] min-w-[280px]"
        onOpenAutoFocus={(e) => {
          // Keep focus in the input, NOT in the popover content.
          e.preventDefault()
        }}
      >
        <Command shouldFilter={false}>
          <CommandList>
            <CommandEmpty>{noMatchesLabel ?? 'No matches'}</CommandEmpty>
            <CommandGroup>
              {filtered.map((it) => (
                <CommandItem
                  key={it.id}
                  value={it.id}
                  onSelect={() => {
                    onSelectPriceBookItem(it)
                    setOpen(false)
                    inputRef.current?.blur()
                  }}
                  onMouseDown={(e) => e.preventDefault() /* prevent input blur swallow */}
                >
                  <div className="flex w-full items-center justify-between gap-2">
                    <div className="flex min-w-0 flex-col">
                      <span className="truncate">{it.name}</span>
                      {it.folder_name && (
                        <span className="truncate text-xs text-muted-foreground">
                          {it.folder_name}
                        </span>
                      )}
                    </div>
                    <span className="tabular-nums text-xs text-muted-foreground shrink-0">
                      {formatMoney(it.unit_price, currencyCode)}
                      {it.unit ? ` / ${it.unit}` : ''}
                    </span>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
```

Notes:
- `Command` uses `shouldFilter={false}` so we control filtering ourselves (we already filter by name + folder above). This avoids double-filtering on the auto `value` of CommandItem (which we set to id, not name).
- `onOpenAutoFocus` is prevented so the user keeps typing in the input — cmdk supports keyboard nav even when focus is in an external anchor through its own internal state, BUT because the input is the anchor (not the CommandInput) the up/down/enter handling must be wired explicitly. **Implementation detail:** the simplest path is to add `onKeyDown` on the input that forwards arrow/enter to the Command. If that proves fiddly, an acceptable Tier-1 fallback is: do NOT support arrow-key nav from the input; only mouse selection. Document whichever you ship in the JSDoc above the component. (User decision is "Arrow keys ↑↓ navigate, Enter selects" — implement it; if cmdk's `Command` cannot reach into external focus, mount a hidden `CommandInput` underneath using `value={value}` and `onValueChange={onChange}` so cmdk's internal keyboard nav runs against the same query, and use the visible input as a display layer linked via `<label>` or just stack them visually). Pick the cleanest of those approaches at implementation time. Document the chosen approach in a single-line comment at the top of the component.

**B) Swap into estimate-document.tsx**

In `EstimateDocumentProps`, add:
```ts
priceBookItems?: PriceBookItem[]
```
(import `PriceBookItem` from `@/lib/queries/price-book`). Default to `[]` when destructured.

In `EstimateDocument`, accept and pass down through `SortableDocumentSection` → `DocumentSectionBlock` → `SortableDocumentItemRow`. Add `priceBookItems: PriceBookItem[]` to each component's prop interface.

In `SortableDocumentItemRow` (the `<td>` that contains the description `<input>`, lines ~423-438), replace the bare `<input>` with:
```tsx
<PriceBookCombobox
  value={item.description}
  onChange={(next) =>
    dispatch({ type: 'UPDATE_ITEM', sectionId, itemId: item.id, field: 'description', value: next })
  }
  onSelectPriceBookItem={(pb) =>
    dispatch({
      type: 'APPLY_PRICE_BOOK_ITEM',
      sectionId,
      itemId: item.id,
      item: { name: pb.name, unit: pb.unit, unit_price: pb.unit_price },
    })
  }
  items={priceBookItems}
  currencyCode={currencyCode}
  placeholder="Item description"
  className={INLINE_INPUT_CLS}
  searchPlaceholder={t_searchPriceBook /* see step C */}
  noMatchesLabel={t_noMatches}
/>
```
Wire the labels through the existing `DOC_LABELS` map (next step) — pass them down from `EstimateDocument` via the existing `L: DocLabels` object so the combobox stays language-aware via prop, not via the `t()` helper (the document component is language-agnostic at the leaf level today). Extend the `DocLabels` interface with `searchPriceBook: string` and `noMatches: string`. Populate all three languages (`en`, `pt`, `es`) in the `DOC_LABELS` map at the top of estimate-document.tsx:
- en: `searchPriceBook: 'Search price book…'`, `noMatches: 'No matches'`
- pt: `searchPriceBook: 'Buscar no catálogo…'`, `noMatches: 'Sem resultados'`
- es: `searchPriceBook: 'Buscar en catálogo…'`, `noMatches: 'Sin resultados'`

Then in `SortableDocumentItemRow`, pass `searchPlaceholder={L.searchPriceBook}` and `noMatchesLabel={L.noMatches}` (the row already receives `L` indirectly via its parent — propagate `L` explicitly into the row's props if it isn't already).

**Do NOT touch `ItemCardMobile`** — out of scope per constraints.

**Visual parity check:** the combobox closed state MUST render the exact same input as today (same `INLINE_INPUT_CLS`, same placeholder text). Verify by toggling open/closed.

**Badge "Price book":** Already rendered elsewhere based on `item.price_source` (or is implicit in saved state). If a visible "Price book" badge is desired next to the row, leave it for a follow-up — the constraint says "badge 'Price book' appears" after selection, but the data model already records `price_source='price_book'` which the existing UI may or may not surface. Do NOT add new badge UI in this quick task — verify the field is persisted via Network/DB.

**C) lib/i18n/translations.ts**
The estimate document uses its own `DOC_LABELS` map and not the global `t()` helper. So strictly speaking translations.ts does NOT need to change for the combobox labels (they live in DOC_LABELS). BUT to satisfy the constraint that placeholder + no-match strings are available via `t()`, also add (for any other consumer that wants them):
- In the `pt` block: `'Search price book…': 'Buscar no catálogo…'`, `'No matches': 'Sem resultados'`
- In the `es` block: `'Search price book…': 'Buscar en catálogo…'`, `'No matches': 'Sin resultados'`
English is the key itself, no entry needed.

If `translations.ts` already groups strings by category, add them under a "Form labels" or similar adjacent section. Keep it minimal — two keys per language.
  </action>
  <verify>
    <automated>npx tsc --noEmit &amp;&amp; npx next lint --file components/workspace/estimate/price-book-combobox.tsx --file components/workspace/estimate/estimate-document.tsx</automated>
  </verify>
  <done>
    - File `components/workspace/estimate/price-book-combobox.tsx` exists, exports `PriceBookCombobox`, and renders a plain `<input>` (no Popover) when `items.length === 0`.
    - `SortableDocumentItemRow` in `estimate-document.tsx` uses `<PriceBookCombobox>` in place of the bare description input.
    - `DocLabels` has `searchPriceBook` + `noMatches` in `en`/`pt`/`es`.
    - Selecting an item dispatches `APPLY_PRICE_BOOK_ITEM` (verifiable via React DevTools or a quick `console.log` in the reducer during smoke test).
    - `tsc --noEmit` passes; lint is clean.
    - Free-text typing still updates the description via `UPDATE_ITEM`.
    - `ItemCardMobile` is unchanged.
  </done>
</task>

</tasks>

<verification>
**Code-only static checks** (Claude runs these):
- `npx tsc --noEmit` passes.
- `npx next lint` clean on the two modified files.
- Grep confirms `priceBookItems` is threaded from `page.tsx` to `estimate-editor.tsx` to `estimate-document.tsx` (no dead drops): `grep -rn "priceBookItems" app components | wc -l` should show 8+ matches.
- Grep confirms `APPLY_PRICE_BOOK_ITEM` is in both the union and the reducer body.
- Grep confirms `ItemCardMobile` was NOT modified (working-tree diff scoped to the files listed).
- `section-card.tsx > ItemRow` is NOT touched (dead code per constraint).

**Manual smoke checks for the user** (record in the chat after handoff — user runs):
1. Open an estimate in edit mode (project page → overview tab → estimate editor).
2. Click the **Description** field of any item row → start typing 2-3 characters that match a price-book entry → dropdown appears below the input, showing name + folder + unit + price.
3. Use ↑/↓ to navigate, press Enter (or click) → description, unit, and unit price fill in instantly; quantity stays at whatever it was.
4. Save the estimate → reload → confirm `price_source` shows as `price_book` on that item (DB or DevTools).
5. Type free text that matches nothing → dropdown shows "No matches"; the typed text is still committed to the row and the estimate saves normally.
6. Open the estimate of a company with an EMPTY price book → no dropdown appears; the description input looks and behaves exactly as before.
7. Mobile view (`<sm`): the description input on `ItemCardMobile` is unchanged (no combobox on mobile in this quick).
</verification>

<success_criteria>
- Server-side fetch of price book is wired through the prop pipeline with no client-side network call added.
- `PriceBookCombobox` is a single reusable component, < 150 LOC, no new deps.
- Reducer has a single new atomic action `APPLY_PRICE_BOOK_ITEM` — existing `UPDATE_ITEM` is unchanged.
- Selecting a price book item sets description + unit + unit_price + price_source='price_book' in one render; quantity untouched.
- Empty price book = zero behavioral change to the input.
- All labels available in EN/PT/ES.
- `tsc --noEmit` passes.
</success_criteria>

<output>
After completion, no SUMMARY.md is required for a quick task. The two-task atomic commits should be:
1. `feat(estimate): thread price book to editor + add APPLY_PRICE_BOOK_ITEM reducer action`
2. `feat(estimate): add price book autocomplete to item description input`
</output>
