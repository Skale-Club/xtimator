---
phase: 260522-lpf-responsividade-mobile-da-tela-de-price-b
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - app/(app)/price-book/page.tsx
  - components/price-book/price-book-list.tsx
  - tests/unit/price-book/price-book-list.test.tsx
autonomous: true
requirements:
  - PB-MOBILE-01
  - PB-MOBILE-02
  - PB-MOBILE-03

must_haves:
  truths:
    - "On a 390px viewport, the Price Book page has no horizontal overflow on the page body."
    - "On mobile, page wrapper and surrounding Card use compact padding (px-4 / p-4) instead of px-6 py-8 / p-6 md:p-8."
    - "On mobile, the page header (h1 + New Folder + Import CSV + Add Item) stacks vertically and no button is truncated or off-screen."
    - "On mobile, each folder header shows chevron + folder name + count on the top row; Pencil / Trash / Adjust % actions wrap below without overlapping the folder name."
    - "On mobile, items inside a folder render as a vertical list of Cards (one Card per item) instead of a horizontally-scrollable Table — image thumb, name, unit, formatted price, and the MoreHorizontal dropdown are all visible inside the Card."
    - "On viewports md (>=768px), the existing desktop Table layout is preserved unchanged (look, columns, dropdown column)."
    - "All existing behavior is preserved on both layouts: search, folder collapse/expand (chevron), folder rename, folder delete, folder Adjust %, item edit, item delete, image thumbnails, formatMoney currency formatting, the Add/Edit/Import/New-Folder/Delete dialogs, and the data-testid `adjust-btn-folder-{id|uncategorized}`."
    - "`bun run test tests/unit/price-book/price-book-list.test.tsx` passes."
  artifacts:
    - path: "components/price-book/price-book-list.tsx"
      provides: "Responsive desktop Table + mobile Card list split for each folder section, mobile-friendly page header, mobile-friendly folder header."
      contains: "hidden md:block"
    - path: "components/price-book/price-book-list.tsx"
      provides: "Mobile Card list (md:hidden) per folder section"
      contains: "md:hidden"
    - path: "app/(app)/price-book/page.tsx"
      provides: "Mobile-compact padding for page wrapper and Card"
      contains: "px-4"
    - path: "tests/unit/price-book/price-book-list.test.tsx"
      provides: "Updated assertions tolerating duplicated DOM (desktop + mobile) where applicable"
      contains: "getAllByText"
  key_links:
    - from: "components/price-book/price-book-list.tsx (desktop table block)"
      to: "components/price-book/price-book-list.tsx (mobile card list block)"
      via: "shared folderItems array per folder section + identical handlers (handleEditItem, handleDeletePrompt)"
      pattern: "hidden md:block.*md:hidden"
    - from: "components/price-book/price-book-list.tsx (folder header action group)"
      to: "JSX layout"
      via: "flex-wrap or sm: utilities so actions wrap below header text on narrow screens"
      pattern: "flex-wrap|flex-col sm:flex-row"
    - from: "app/(app)/price-book/page.tsx wrapper"
      to: "PriceBookList content"
      via: "px-4 py-4 md:px-6 md:py-8 + Card p-4 md:p-8"
      pattern: "px-4 py-4 md:px-6 md:py-8"
---

<objective>
Make the Price Book screen usable on mobile (390px viewport) by replicating the desktop/mobile split pattern already used in `components/clients/client-list.tsx`: keep the existing `<Table>` for `md+` and add a `<Card>` list for `<md`. Also reduce padding on the page wrapper and surrounding Card on mobile, stack the 3-button header vertically, and make the folder-header action group wrap so the chevron + folder name aren't squeezed.

Purpose: today, on a phone, the Price Book page has the 3 header buttons overflowing, folder headers with no room for the folder name, and a Table with 4 columns squeezed below readability. Adopting the proven client-list pattern fixes all three.

Output: a fully responsive Price Book screen, with desktop unchanged (md+) and a clean mobile layout (<md), no functional changes, all existing dialogs/handlers/testids preserved, existing unit tests still green (with minimal `getAllByText` / scoping adjustments where the new mobile DOM duplicates content).
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@./CLAUDE.md
@app/(app)/price-book/page.tsx
@components/price-book/price-book-list.tsx
@components/clients/client-list.tsx
@components/ui/card.tsx
@components/ui/table.tsx
@tests/unit/price-book/price-book-list.test.tsx

<interfaces>
<!-- Key types and contracts the executor needs. Extracted from codebase. -->
<!-- Executor should use these directly — no codebase exploration needed. -->

From components/ui/card.tsx (exports):
```typescript
export function Card(props: React.ComponentProps<"div"> & VariantProps<typeof cardVariants>): JSX.Element
// Variants: default | glass | glass-strong | stat
export function CardContent(props: React.ComponentProps<"div">): JSX.Element
// Card has default `py-6` and gap. CardContent has default `px-6` (we will override with `p-4`).
```

From components/ui/table.tsx:
```typescript
// Table wraps in a div with `overflow-x-auto` — that is the current source of pain on phones.
// Solution is NOT to fix Table; it is to render Card list instead on <md.
```

From components/price-book/price-book-list.tsx (relevant types — already in scope):
```typescript
import type { PriceBookItem, PriceBookFolder } from '@/lib/queries/price-book'
// Existing handlers reused by the new mobile block (DO NOT duplicate logic):
//   handleEditItem(item)         -> opens PriceBookItemDialog (edit mode)
//   handleDeletePrompt(item)     -> opens AlertDialog (delete confirm)
//   handleAdjustFolder(id, name) -> opens BulkAdjustDialog
//   formatMoney(unit_price, currency_code)
//   Existing testid contract: data-testid={`adjust-btn-folder-${folderId ?? 'uncategorized'}`}
```

From components/clients/client-list.tsx (REFERENCE PATTERN — copy this split exactly):
```tsx
{/* Desktop table */}
{filtered.length > 0 && (
  <div className="hidden md:block rounded-md border">
    <Table>...</Table>
  </div>
)}

{/* Mobile card list */}
{filtered.length > 0 && (
  <div className="md:hidden space-y-3">
    {filtered.map((x) => (
      <Card key={x.id}>
        <CardContent className="flex items-center justify-between p-4">
          ... left side (name, secondary line) ...
          ... right side (badge / dropdown) ...
        </CardContent>
      </Card>
    ))}
  </div>
)}
```
</interfaces>

<constraints>
- Pure layout / responsive change. NO logic changes. NO query changes. NO server-action changes.
- Follow the exact pattern from `components/clients/client-list.tsx`: `<div className="hidden md:block ...">` wrapping the Table, `<div className="md:hidden space-y-3">` wrapping the Card list. Apply this PER folder section (because items live inside folder sections).
- Reuse existing handlers (`handleEditItem`, `handleDeletePrompt`, `formatMoney`). DO NOT duplicate them.
- Preserve `data-testid={`adjust-btn-folder-${folderId ?? 'uncategorized'}`}` exactly.
- Preserve `formatMoney(item.unit_price, item.currency_code)` formatting in both layouts.
- Preserve image thumbnail behavior (img if `image_url`, otherwise `ImageIcon` placeholder) in both layouts.
- Page wrapper padding: `px-6 py-8` → `px-4 py-4 md:px-6 md:py-8`. Card padding: `p-6 md:p-8` → `p-4 md:p-8`.
- Page header (h1 + 3 buttons) on mobile: stack vertically (e.g. `flex-col gap-3 sm:flex-row sm:items-center sm:justify-between`); the 3-button group itself should also use `flex-wrap` so labels remain visible. Keep button labels (do not switch to icon-only) so existing `getByRole('button', { name: /Import CSV/i })` and `name: /Add Item/i` queries continue to match.
- Folder header (current `flex items-center gap-2 border-b pb-2`): wrap action group below on mobile. Acceptable approaches: (a) make the row `flex-wrap` and let the action `div` (`ml-auto`) flow to the next line, or (b) split into two rows with `flex-col sm:flex-row sm:items-center` on the outer container. Either is fine — pick the one that yields the cleanest visual on a 390px viewport. The chevron + folder name + count must stay on the top row.
- Existing test queries that hit element CONTENT shared between desktop table and mobile cards (e.g. item names like `General Labor`, `Supervisor`, `PVC Pipe 2in`) WILL break under `getByText` because both branches render in jsdom. Fix by switching those assertions to `getAllByText(...).length).toBeGreaterThan(0)` — this is the exact same fix already used in `tests/unit/clients/client-list.test.tsx` (which has the same desktop+mobile split). Folder header content (folder name like `Labor`, `Uncategorized` label, testid `adjust-btn-folder-*`) is rendered ONCE per section regardless of viewport (it lives outside both blocks), so those assertions stay as-is.
- Test queries that hit dropdown triggers via `buttons.filter((b) => b.className.includes('h-8 w-8'))` — the count will roughly double (desktop dropdown + mobile dropdown per row). Existing test uses `dropdownTriggers[0]`, so it still works (first item still belongs to the first folder section's first item). DO NOT change that filter; just verify the test still passes.
- Do NOT change `page.tsx` queries, props, or order of operations. Only modify the wrapper className and Card className.
- Do NOT touch `lib/`, `lib/actions/price-book.ts`, `lib/queries/price-book.ts`, or any other file outside the 3 listed in `files_modified`.
</constraints>

<tasks>

<task type="auto">
  <name>Task 1: Mobile-compact page padding wrapper (price-book/page.tsx)</name>
  <files>app/(app)/price-book/page.tsx</files>
  <action>
Edit `app/(app)/price-book/page.tsx`:

1. Change the outer `<div className="w-full max-w-none space-y-8 px-6 py-8">` to:
   `<div className="w-full max-w-none space-y-6 px-4 py-4 md:space-y-8 md:px-6 md:py-8">`
   (Tightens horizontal + vertical padding on mobile; restores original spacing at `md+`.)

2. Change the `<Card variant="glass" className="p-6 md:p-8">` to:
   `<Card variant="glass" className="p-4 md:p-8">`

Do not touch anything else in the file (imports, Promise.all, redirects, props, T helper).
  </action>
  <verify>
    <automated>cd "C:/Users/User/Desktop/projetos_skale/xtimator/xtimator" && bun run test tests/unit/price-book/price-book-list.test.tsx</automated>
  </verify>
  <done>
  - `app/(app)/price-book/page.tsx` outer div className contains `px-4 py-4 md:px-6 md:py-8`.
  - Surrounding `<Card variant="glass">` className contains `p-4 md:p-8`.
  - No other lines in the file changed.
  - Existing unit tests still pass (this file isn't covered by them, just sanity-check).
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Responsive header + folder-header + desktop/mobile split inside price-book-list.tsx</name>
  <files>components/price-book/price-book-list.tsx, tests/unit/price-book/price-book-list.test.tsx</files>
  <behavior>
  Behavior (acceptance — verified via existing test suite + visual on 390px viewport):
  - Test: existing `getByText('General Labor')` / `getByText('Supervisor')` / `getByText('PVC Pipe 2in')` assertions are updated to `getAllByText(...).length).toBeGreaterThan(0)` (because both desktop Table row AND mobile Card now render those names in jsdom). All other existing test queries continue to pass unchanged.
  - Test: `getByTestId('adjust-btn-folder-folder-labor')` and `getByTestId('adjust-btn-folder-uncategorized')` continue to resolve (folder header rendered once).
  - Test: `getByRole('button', { name: /Add Item/i })`, `name: /Import CSV/i`, `name: /Add first item/i`, `getByPlaceholderText('Search items...')`, `getByText('No price book items yet')`, `getByText('No items match your search')`, `getByText('Delete Item')`, `getByText('Bulk Adjust: Labor')`, `getByText('Bulk Adjust: Uncategorized')` all continue to pass (these elements render once each).
  - Test: dropdown open via `buttons.filter((b) => b.className.includes('h-8 w-8'))[0]` still opens an item dropdown whose Edit/Delete items work (Radix uses portals, so menu items aren't duplicated).
  </behavior>
  <action>
Edit `components/price-book/price-book-list.tsx`:

A) Imports — add `Card` and `CardContent` to the existing UI imports block (alongside Input, Button, Table, etc.):
   `import { Card, CardContent } from '@/components/ui/card'`

B) Page header row (currently `<div className="flex items-center justify-between">` containing `<h1>Price Book</h1>` and the 3-button `<div className="flex items-center gap-2">`):
   - Change outer to: `<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">`
   - Change inner button group to: `<div className="flex flex-wrap items-center gap-2">`
   - KEEP all 3 buttons exactly as-is (variant, icon, label). Do NOT switch to icon-only.

C) Folder header row (currently `<div className="flex items-center gap-2 border-b pb-2">`):
   - Change to: `<div className="flex flex-wrap items-center gap-2 border-b pb-2">`
   - The `<div className="ml-auto flex items-center gap-1">` (action group) stays as-is; with `flex-wrap` on the parent, it will wrap to the next line on narrow screens while keeping `ml-auto` to push it right when there IS room. Inside that group, the existing buttons (Pencil, Trash, Adjust %) stay unchanged.

D) Per-folder body — currently:
```tsx
{!isCollapsed && folderItems.length > 0 && (
  <div className="pl-4">
    <div className="rounded-md border">
      <Table>...</Table>
    </div>
  </div>
)}
```
   Replace with TWO siblings inside the same conditional — desktop table and mobile card list:

```tsx
{!isCollapsed && folderItems.length > 0 && (
  <>
    {/* Desktop: existing table, gated to md+ */}
    <div className="hidden md:block pl-4">
      <div className="rounded-md border">
        <Table>
          {/* identical content to current Table — DO NOT change columns, rows, dropdown, or formatting */}
          ...
        </Table>
      </div>
    </div>

    {/* Mobile: card list, gated to <md, no left indent (already tight on phones) */}
    <div className="md:hidden space-y-2">
      {folderItems.map((item) => (
        <Card key={item.id}>
          <CardContent className="flex items-center justify-between gap-3 p-3">
            {/* Left: thumb + name + unit/price */}
            <div className="flex items-center gap-3 min-w-0 flex-1">
              {item.image_url ? (
                <img
                  src={item.image_url}
                  alt={item.name}
                  className="h-10 w-10 rounded object-cover shrink-0"
                />
              ) : (
                <div className="h-10 w-10 rounded bg-muted flex items-center justify-center shrink-0">
                  <ImageIcon className="h-4 w-4 text-muted-foreground" />
                </div>
              )}
              <div className="min-w-0">
                <p className="font-medium truncate">{item.name}</p>
                <p className="text-sm text-muted-foreground">
                  {formatMoney(item.unit_price, item.currency_code)}
                  {item.unit ? ` / ${item.unit}` : ''}
                </p>
              </div>
            </div>

            {/* Right: dropdown (reuse the SAME handlers as desktop) */}
            <div className="shrink-0">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8">
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => handleEditItem(item)}>
                    Edit
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="text-destructive"
                    onClick={() => handleDeletePrompt(item)}
                  >
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  </>
)}
```

   IMPORTANT — the desktop Table block (the `...` above) must keep its CURRENT JSX byte-for-byte: same TableHeader columns (`Item`, `Unit`, `Unit Price`, empty 50px), same `<TableCell>` cells, same image thumb 8x8 + ImageIcon fallback, same `formatMoney(item.unit_price, item.currency_code)`, same DropdownMenu (`h-8 w-8` ghost trigger) with the SAME `handleEditItem` / `handleDeletePrompt` onClick handlers. Only the wrapping `<div className="pl-4">` becomes `<div className="hidden md:block pl-4">`.

E) Empty state (`items.length === 0 && folders.length === 0`) — leave AS-IS. EmptyState already renders centered and the surrounding wrapper is fine; no mobile adjustment needed here (this state is rarely seen and already vertical).

F) Dialogs at the bottom (PriceBookItemDialog, AlertDialog x2, Dialog for New Folder, PriceBookImportWizard, BulkAdjustDialog) — leave AS-IS. They are already responsive via shadcn's `sm:max-w-*` and overlay.

G) Update `tests/unit/price-book/price-book-list.test.tsx`:
   - In the test `'items in same folder render in folder section'` (the 3 `screen.getByText(...)` lines for item names): change EACH to `expect(screen.getAllByText('NAME').length).toBeGreaterThan(0)` to tolerate the new mobile Card duplicating the same names in the rendered DOM. Pattern is identical to `tests/unit/clients/client-list.test.tsx` line ~98 ("renders client names when clients provided").
   - In the test `'search filters items by name'`: after typing `'PVC'`, change `expect(screen.getByText('PVC Pipe 2in')).toBeDefined()` to `expect(screen.getAllByText('PVC Pipe 2in').length).toBeGreaterThan(0)`. The two `queryByText(null)` assertions for the filtered-out names STAY AS-IS (`queryByText` returning `null` works whether 0 or many would-match; but here filtering removes them entirely from both layouts).
   - In the test `'search filters items by folder name'`: change `screen.getByText('General Labor')` and `screen.getByText('Supervisor')` to `getAllByText(...).length).toBeGreaterThan(0)`. `queryByText('PVC Pipe 2in')` for the filtered-out one stays.
   - DO NOT touch any other test. In particular: dropdown filter test (`dropdownTriggers[0]`) remains valid because Radix portals menu content (no duplication of `Edit`/`Delete` menu items), and the first dropdown trigger still belongs to the first item.

DO NOT modify any other component file. DO NOT modify lib/actions/price-book.ts. DO NOT change query shape, types, props, or order of operations.
  </action>
  <verify>
    <automated>cd "C:/Users/User/Desktop/projetos_skale/xtimator/xtimator" && bun run test tests/unit/price-book/price-book-list.test.tsx</automated>
  </verify>
  <done>
  - `components/price-book/price-book-list.tsx` imports `Card, CardContent` from `@/components/ui/card`.
  - Page header outer container uses `flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between`; button group uses `flex flex-wrap items-center gap-2`.
  - Folder header outer container uses `flex flex-wrap items-center gap-2 border-b pb-2`.
  - Per-folder body has TWO siblings: a `<div className="hidden md:block pl-4">` wrapping the EXISTING `<Table>` block byte-for-byte, and a `<div className="md:hidden space-y-2">` rendering one `<Card>` per item with image thumb, name, `formatMoney + unit`, and the same `MoreHorizontal` dropdown wired to `handleEditItem` / `handleDeletePrompt`.
  - Mobile Card dropdown uses the same `className="h-8 w-8"` ghost button so it still triggers the same Radix-menu interaction in tests if encountered.
  - `tests/unit/price-book/price-book-list.test.tsx` updated: 6 `getByText(...)` assertions for item names switched to `getAllByText(...).length).toBeGreaterThan(0)`. All other test code unchanged.
  - `bun run test tests/unit/price-book/price-book-list.test.tsx` passes (all 16 tests green).
  - No file outside `files_modified` is touched.
  </done>
</task>

</tasks>

<verification>
1. **Automated tests (binding gate):**
   `cd "C:/Users/User/Desktop/projetos_skale/xtimator/xtimator" && bun run test tests/unit/price-book/price-book-list.test.tsx`
   All 16 tests pass.

2. **Type / build sanity (optional, light):**
   `bun run lint` and/or `bun run typecheck` if defined — no new TS errors introduced.

3. **Visual smoke (manual, post-merge):** open `/price-book` on a phone (or Chrome DevTools 390x844 iPhone 12 viewport):
   - Page padding feels comfortable (not edge-hugging, not luxuriously wasteful).
   - Header: title on top, 3 buttons below — all visible, no overflow.
   - Folder header: chevron + name + count on first row; Pencil / Trash / Adjust % wrap to the next row without overlapping or being cut off.
   - Folder body: items render as cards with image thumb + name + price/unit + a "..." button. Tapping "..." opens Edit / Delete.
   - Resize past 768px (md): desktop Table reappears, mobile Card list disappears. Page header and folder header collapse back to single-row layout.
   - All dialogs (Add Item, Edit, Delete, New Folder, Delete Folder, Import CSV wizard, Bulk Adjust %) open and close correctly on both viewports.
</verification>

<success_criteria>
- [ ] On <md (mobile), Price Book page has no horizontal page overflow at 390px.
- [ ] On <md, page header stacks (title on top, buttons below with `flex-wrap`).
- [ ] On <md, folder header chevron + name stays on top row; action buttons (Pencil / Trash / Adjust %) wrap to a second row when needed.
- [ ] On <md, items render as Cards (one per row), not a 4-column horizontally-scrollable Table.
- [ ] On md+ (desktop), the existing Table layout is preserved byte-for-byte (columns, rows, dropdown, formatting).
- [ ] All existing functionality preserved on both layouts: search, folder collapse/expand, folder rename, folder delete, folder Adjust %, item edit, item delete, image thumbnails, currency formatting, dialogs.
- [ ] `data-testid="adjust-btn-folder-..."` selectors still resolve.
- [ ] `bun run test tests/unit/price-book/price-book-list.test.tsx` passes (16/16).
- [ ] Only files listed in `files_modified` were changed.
- [ ] No imports / queries / server actions changed.
</success_criteria>

<output>
After completion, create `.planning/quick/260522-lpf-responsividade-mobile-da-tela-de-price-b/260522-lpf-SUMMARY.md` with: files changed, exact className diffs for the 3 layout containers (page wrapper, page header, folder header), the new mobile Card block JSX (~30 lines for reference), test-file diff (which 6 assertions switched to `getAllByText`), and the final `bun run test ...` output showing 16/16 green.
</output>
