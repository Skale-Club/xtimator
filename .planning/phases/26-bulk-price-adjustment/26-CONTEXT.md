# Phase 26: Bulk Price Adjustment — Context

**Gathered:** 2026-05-08
**Status:** Ready for planning

<domain>
## Phase Boundary

Deliver a bulk percentage price adjustment feature on the `/settings/price-book` page. The user clicks "Adjust %" on a category header, enters a percentage (positive or negative) in a Dialog, sees a live preview table showing current → new prices for every item in that category, then confirms. The update is applied atomically to all items in the category.

Requirements in scope: BULKPRICE-01, BULKPRICE-02, BULKPRICE-03.

This phase does **not** add bulk adjustment across all categories at once — that is a deferred v1.5 feature per REQUIREMENTS.md.

</domain>

<decisions>
## Implementation Decisions

### D-01: Entry Point — "Adjust %" Button on Category Header
- Add a small **"Adjust %"** button inline with each category name header in `PriceBookList`.
- The button sits on the right side of the category header row (category name on left, button on right).
- Clicking it opens the bulk adjustment Dialog for that specific category.
- If a category has 0 items (e.g., search filters all items out), the button is disabled.
- Button variant: `outline` with small size (`size="sm"`), consistent with other secondary actions on the page.
- Icon suggestion: `Percent` from lucide-react.

### D-02: Preview UX — Single Dialog with Live % Input + Preview Table
- One Dialog (shadcn Dialog, not AlertDialog) containing:
  1. **Header**: "Adjust prices — {Category Name}"
  2. **% input**: A number input field (react-hook-form + zod) labeled "Adjustment %" with placeholder "+10 or -5". Accepts positive and negative values. Validated: must be a number, range -100 to +500 (can't zero out or multiply beyond 6×).
  3. **Live preview table**: Updates in real time as the user types the percentage. Columns: Item name | Current price | New price. New price rendered in a muted green (positive %) or muted red (negative %) color to visually indicate direction.
  4. **Footer**: "Cancel" and "Apply to {N} items" confirm button (disabled while percentage is 0 or invalid).
- No step-back navigation — one screen only.
- The preview table is empty/placeholder when the percentage input is empty or 0.

### D-03: Atomic Update
- Single Supabase `.update({ unit_price: newPrice }).in('id', itemIds)` call — all rows in one request.
- Supabase handles this atomically per the Postgres transaction model. No RPC/function needed.
- On error, the action returns `{ error: string }` and the Dialog stays open with a toast error. No partial state.

### D-04: Price Rounding
- New prices rounded to **2 decimal places** (standard USD currency): `Math.round(price * (1 + percent / 100) * 100) / 100`.
- Prices are stored as `NUMERIC(12,2)` in Postgres — 2 decimal places matches the schema.

### D-05: New Server Action
- `bulkAdjustPriceBookCategory(category: string, adjustmentPercent: number): Promise<{ data: { updated: number } } | { error: string }>`
- Lives in `lib/actions/price-book.ts` (extend the existing file, same `getAuthContext()` pattern).
- Internally: fetch all item IDs + unit_prices for the company + category, compute new prices, run single `.update().in('id', ids)`.
- After success: `router.refresh()` in the client component (same pattern as all other price book mutations).

### Claude's Discretion
- Exact Tailwind classes for the new price color (suggest `text-green-600` for positive, `text-red-600` for negative in dark mode)
- Whether the preview table shows a "Change" column (e.g. "+$12.00") — include if trivially cheap
- Dialog width — suggest `sm:max-w-lg` to fit the preview table comfortably
- Whether to debounce the live preview input (suggest 0 debounce — pure math, no network call needed)
- Zod schema for adjustment percent: `z.number().min(-100).max(500)` with descriptive error messages

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Price Book Foundation (read before implementing)
- `components/price-book/price-book-list.tsx` — Component to modify: add "Adjust %" button to category header rows and integrate the new Dialog
- `lib/actions/price-book.ts` — File to extend with `bulkAdjustPriceBookCategory` action
- `lib/queries/price-book.ts` — `getPriceBookItems` query and `PriceBookItem` type
- `lib/schemas/price-book.ts` — Existing zod schemas to follow for the new adjustment schema

### Existing Dialog Patterns (replicate exactly)
- `components/price-book/price-book-item-dialog.tsx` — Dialog + react-hook-form + zod + useTransition pattern to replicate
- `components/price-book/price-book-import-dialog.tsx` — Multi-step dialog reference (but Phase 26 uses single-step)

### Requirements
- `.planning/REQUIREMENTS.md` — v1.4 requirements; Phase 26 scope: BULKPRICE-01, BULKPRICE-02, BULKPRICE-03

### Database
- `supabase/migrations/20260506000001_phase19_price_book.sql` — `company_price_book` schema: `unit_price NUMERIC(12,2)`. RLS policies use `company_id IN (SELECT id FROM companies WHERE user_id = auth.uid())` subquery pattern.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `components/price-book/price-book-list.tsx` — Category grouping loop at line ~201: `grouped.map(([category, categoryItems]) => ...)`. The category header is a `<h4>` — add a flex row with the category name and the "Adjust %" button.
- `components/price-book/price-book-item-dialog.tsx` — Full Dialog + react-hook-form + zod pattern. New `BulkAdjustDialog` follows this exactly.
- `lib/actions/price-book.ts` — `getAuthContext()` pattern, `supabase.from('company_price_book').update(...).in('id', ids)` approach.
- `components/ui/` — `Dialog`, `DialogContent`, `DialogHeader`, `DialogTitle`, `DialogFooter`, `Input`, `Button`, `Table`, `TableBody`, `TableCell`, `TableHead`, `TableHeader`, `TableRow` all available.

### Established Patterns
- `useTransition` + server action + `toast.success/error` + `router.refresh()` for mutations
- `react-hook-form` + `zod` (`zodResolver`) for all form validation
- Per-item state tracked with `useState` for dialog open/close
- `useMemo` for derived data (new prices computed from current prices + percentage)

### Integration Points
- Modify: `components/price-book/price-book-list.tsx` — add "Adjust %" button + dialog state + `BulkAdjustDialog` render
- New component: `components/price-book/bulk-adjust-dialog.tsx`
- Extend: `lib/actions/price-book.ts` — add `bulkAdjustPriceBookCategory`
- New schema: add `bulkAdjustSchema` to `lib/schemas/price-book.ts`

</code_context>

<specifics>
## Specific Ideas

- The confirm button label should be dynamic: "Apply to {N} items" where N is the count of items in the selected category. Makes the action clear before clicking.
- The preview table's "New Price" column should visually distinguish increase (green) vs decrease (red) — users adjust prices in bulk and need to verify direction at a glance.
- Percentage input should support both "10" and "+10" as valid positive inputs (the `+` sign prefix should be accepted by the input or stripped before validation).

</specifics>

<deferred>
## Deferred Ideas

- Bulk adjustment across ALL categories at once (apply same % to entire price book) — v1.5 per REQUIREMENTS.md
- Undo/rollback after bulk apply — future
- Preview of impact on existing estimates (which open estimates reference items in this category) — future
- Percentage adjustment by absolute dollar amount ($+5 per item) rather than % — future

</deferred>

---

*Phase: 26-bulk-price-adjustment*
*Context gathered: 2026-05-08*
