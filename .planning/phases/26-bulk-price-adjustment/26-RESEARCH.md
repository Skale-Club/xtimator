# Phase 26: Bulk Price Adjustment — Research

**Researched:** 2026-05-08
**Domain:** React/Next.js UI, shadcn Dialog, react-hook-form + zod, Supabase batch UPDATE
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**D-01: Entry Point — "Adjust %" Button on Category Header**
- Add a small "Adjust %" button inline with each category name header in `PriceBookList`.
- Button sits on the right side of the category header row (category name on left, button on right).
- Clicking it opens the bulk adjustment Dialog for that specific category.
- If a category has 0 items (e.g., search filters all items out), the button is disabled.
- Button variant: `outline` with small size (`size="sm"`), consistent with other secondary actions on the page.
- Icon suggestion: `Percent` from lucide-react.

**D-02: Preview UX — Single Dialog with Live % Input + Preview Table**
- One Dialog (shadcn Dialog, not AlertDialog) containing:
  1. Header: "Adjust prices — {Category Name}"
  2. % input: A number input field (react-hook-form + zod) labeled "Adjustment %" with placeholder "+10 or -5". Accepts positive and negative values. Validated: must be a number, range -100 to +500 (can't zero out or multiply beyond 6×).
  3. Live preview table: Updates in real time as the user types the percentage. Columns: Item name | Current price | New price. New price rendered in muted green (positive %) or muted red (negative %) color to visually indicate direction.
  4. Footer: "Cancel" and "Apply to {N} items" confirm button (disabled while percentage is 0 or invalid).
- No step-back navigation — one screen only.
- The preview table is empty/placeholder when the percentage input is empty or 0.

**D-03: Atomic Update**
- Single Supabase `.update({ unit_price: newPrice }).in('id', itemIds)` call — all rows in one request.
- Supabase handles this atomically per the Postgres transaction model. No RPC/function needed.
- On error, the action returns `{ error: string }` and the Dialog stays open with a toast error. No partial state.

**D-04: Price Rounding**
- New prices rounded to 2 decimal places (standard USD currency): `Math.round(price * (1 + percent / 100) * 100) / 100`.
- Prices are stored as `NUMERIC(12,2)` in Postgres — 2 decimal places matches the schema.

**D-05: New Server Action**
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

### Deferred Ideas (OUT OF SCOPE)
- Bulk adjustment across ALL categories at once (apply same % to entire price book) — v1.5 per REQUIREMENTS.md
- Undo/rollback after bulk apply — future
- Preview of impact on existing estimates (which open estimates reference items in this category) — future
- Percentage adjustment by absolute dollar amount ($+5 per item) rather than % — future
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| BULKPRICE-01 | User selects a price book category and applies a +/-% adjustment to all items at once | D-01 (Adjust % button) + D-02 (% input in dialog) + D-05 (server action) |
| BULKPRICE-02 | Before confirming, user sees a preview of current prices vs new prices for all affected items | D-02 (live preview table) + `useMemo` for computed prices, no network required |
| BULKPRICE-03 | Confirmed adjustment is applied atomically to all items in the category (all or nothing) | D-03 (single `.update().in()`) + D-04 (rounding) + error-path leaves dialog open |
</phase_requirements>

---

## Summary

Phase 26 is a self-contained UI + server action feature. All infrastructure already exists: the price book DB table, RLS policies, the `PriceBookList` component, the `lib/actions/price-book.ts` action file, and the shadcn Dialog/Table/Form primitives. No new dependencies are required.

The implementation has three cooperating pieces: (1) a new `BulkAdjustDialog` client component that owns the percent input and live-preview table, (2) a new `bulkAdjustPriceBookCategory` server action that performs a single batch Supabase UPDATE, and (3) modifications to `PriceBookList` to add the "Adjust %" button on each category header and wire the dialog's open/close state.

The most important constraint to uphold is BULKPRICE-03: atomicity. The locked decision (D-03) uses a single `.update({ unit_price: newPrice }).in('id', ids)` call. PostgREST maps this to a single SQL `UPDATE ... WHERE id = ANY(...)` which is atomic within a transaction. There is no need for a stored procedure. If any row fails, Supabase returns an error object and the UI must keep the dialog open with a toast error — no partial saves.

**Primary recommendation:** Follow the exact Dialog + react-hook-form + zod + useTransition pattern from `price-book-item-dialog.tsx`. Live preview is pure `useMemo` math — no debounce needed. Two files are new (`bulk-adjust-dialog.tsx`, `bulkAdjustSchema` in schemas), one file is extended (`price-book.ts` actions), one file is modified (`price-book-list.tsx`).

---

## Standard Stack

### Core (already in project — no installs needed)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| React / Next.js 14 App Router | 14+ | Component hosting, server actions | Project constraint (CLAUDE.md) |
| shadcn/ui Dialog | existing | Bulk adjust dialog container | Locked D-02; same as PriceBookItemDialog |
| react-hook-form | existing | % input form management | Locked project convention (CLAUDE.md) |
| zod | existing | Schema validation for % input | Locked project convention (CLAUDE.md) |
| @hookform/resolvers/zod | existing | Bridge react-hook-form ↔ zod | Used in every form in the codebase |
| Supabase JS client | existing | `.update().in()` batch call | Project constraint; RLS enforced |
| lucide-react `Percent` | existing | Icon for "Adjust %" button | D-01 icon suggestion; lucide already in project |
| sonner `toast` | existing | Success/error feedback | Used by all price-book mutations |
| `useMemo` / `useTransition` | React built-in | Computed preview + async action | Established codebase pattern |

**No new packages to install.** Everything required is already a project dependency.

---

## Architecture Patterns

### Recommended File Changes

```
components/price-book/
├── price-book-list.tsx          MODIFY — add "Adjust %" button + dialog state
└── bulk-adjust-dialog.tsx       NEW — full BulkAdjustDialog component

lib/
├── actions/price-book.ts        EXTEND — add bulkAdjustPriceBookCategory
└── schemas/price-book.ts        EXTEND — add bulkAdjustSchema
```

### Pattern 1: BulkAdjustDialog Component Structure

Replicate `price-book-item-dialog.tsx` exactly for the Dialog + form shell. Key difference: the preview table is driven by `useMemo`, not a form field.

```typescript
// Source: components/price-book/price-book-item-dialog.tsx (existing pattern)
'use client'

import { useTransition } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter
} from '@/components/ui/dialog'
import { bulkAdjustSchema, type BulkAdjustFormValues } from '@/lib/schemas/price-book'
import { bulkAdjustPriceBookCategory } from '@/lib/actions/price-book'
import type { PriceBookItem } from '@/lib/queries/price-book'

interface BulkAdjustDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  category: string
  items: PriceBookItem[]
}

export function BulkAdjustDialog({ open, onOpenChange, category, items }: BulkAdjustDialogProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const form = useForm<BulkAdjustFormValues>({
    resolver: zodResolver(bulkAdjustSchema) as any,
    defaultValues: { adjustmentPercent: 0 },
  })

  const adjustmentPercent = form.watch('adjustmentPercent')

  const preview = useMemo(() => {
    if (!adjustmentPercent || adjustmentPercent === 0) return []
    return items.map((item) => ({
      ...item,
      newPrice: Math.round(item.unit_price * (1 + adjustmentPercent / 100) * 100) / 100,
    }))
  }, [items, adjustmentPercent])

  function onSubmit(values: BulkAdjustFormValues) {
    startTransition(async () => {
      const result = await bulkAdjustPriceBookCategory(category, values.adjustmentPercent)
      if (result.error) {
        toast.error(result.error)
        return  // Dialog stays open on error (D-03)
      }
      toast.success(`Updated ${result.data.updated} items`)
      onOpenChange(false)
      router.refresh()
    })
  }
}
```

### Pattern 2: Zod Schema for Adjustment Percent

```typescript
// Source: lib/schemas/price-book.ts — extend existing file
export const bulkAdjustSchema = z.object({
  adjustmentPercent: z
    .number({ invalid_type_error: 'Enter a number' })
    .min(-100, 'Cannot reduce prices by more than 100%')
    .max(500, 'Maximum adjustment is 500%'),
})
export type BulkAdjustFormValues = z.infer<typeof bulkAdjustSchema>
```

Note: The HTML `<input type="number">` gives a string to react-hook-form. Use `z.coerce.number()` or `valueAsNumber` on the input. The existing pattern in the codebase uses `z.coerce.number()` for all numeric inputs (see `priceBookItemSchema.unit_price` in `lib/schemas/price-book.ts` — `z.coerce.number().min(0)`). Use the same approach.

### Pattern 3: Server Action — bulkAdjustPriceBookCategory

```typescript
// Source: lib/actions/price-book.ts — extend with same getAuthContext() pattern
export async function bulkAdjustPriceBookCategory(
  category: string,
  adjustmentPercent: number
): Promise<{ data: { updated: number } } | { error: string }> {
  const ctx = await getAuthContext()
  if ('error' in ctx) return { error: ctx.error }
  const { supabase, company } = ctx

  // 1. Fetch all items in the category for this company
  const { data: items, error: fetchErr } = await supabase
    .from('company_price_book')
    .select('id, unit_price')
    .eq('company_id', company.id)
    .eq('category', category)

  if (fetchErr || !items || items.length === 0) {
    return { error: 'No items found in that category.' }
  }

  // 2. Compute new prices (server-side, matches client preview — D-04)
  const updates = items.map((item) => ({
    id: item.id,
    unit_price: Math.round(item.unit_price * (1 + adjustmentPercent / 100) * 100) / 100,
  }))

  // 3. Single atomic batch UPDATE — D-03
  // Supabase JS doesn't support bulk different-value updates in one call;
  // must use a per-row update or a PostgreSQL RPC. See Pitfall 1 below.
  // ... (see Pitfall 1 for the correct approach)
}
```

### Pattern 4: Category Header Button in PriceBookList

The category header is currently a plain `<h3>` at line 203 of `price-book-list.tsx`. Convert it to a flex row:

```typescript
// Modify: components/price-book/price-book-list.tsx
// Before (line ~202-205):
<div key={category} className="space-y-2">
  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
    {category}
  </h3>

// After:
<div key={category} className="space-y-2">
  <div className="flex items-center justify-between">
    <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
      {category}
    </h3>
    <Button
      variant="outline"
      size="sm"
      disabled={categoryItems.length === 0}
      onClick={() => handleAdjustCategory(category)}
    >
      <Percent className="h-3.5 w-3.5 mr-1.5" />
      Adjust %
    </Button>
  </div>
```

State additions to `PriceBookList`:
```typescript
const [adjustCategory, setAdjustCategory] = useState<string | null>(null)
const [adjustDialogOpen, setAdjustDialogOpen] = useState(false)

function handleAdjustCategory(category: string) {
  setAdjustCategory(category)
  setAdjustDialogOpen(true)
}

function handleAdjustClose(open: boolean) {
  setAdjustDialogOpen(open)
  if (!open) {
    setAdjustCategory(null)
    router.refresh()
  }
}
```

The items to pass to `BulkAdjustDialog` come from the already-computed `grouped` map — no additional filtering needed. Use `grouped.find(([cat]) => cat === adjustCategory)?.[1] ?? []` or pass `categoryItems` directly from the render loop.

### Anti-Patterns to Avoid

- **Per-row UPDATE loop:** Calling `.update().eq('id', id)` in a loop for each item is NOT atomic and creates N round-trips. See Pitfall 1.
- **AlertDialog instead of Dialog:** D-02 explicitly locks to `shadcn Dialog` (not AlertDialog). AlertDialog has a different semantic (destructive confirmation) and different layout.
- **Debouncing the preview:** The preview is pure math (`useMemo`), not a network call. Debouncing adds lag with zero benefit.
- **Closing dialog before error handling:** On error, do NOT call `onOpenChange(false)`. The dialog must stay open so the user sees the error toast and can retry. On success, follow the Pitfall-5 pattern: `onOpenChange(false)` then `router.refresh()`.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Form validation for % input | Custom validation logic | zod + react-hook-form | Type-safe, established project pattern |
| Live price preview computation | useEffect + state | `useMemo` watching `form.watch()` | Pure derivation, no side effects |
| Dialog accessibility | Custom modal | shadcn `Dialog` | Focus trap, keyboard nav, aria built-in |
| Supabase batch update | N separate .update() calls | Single `.update().in('id', ids)` | Atomic, single RTT, idiomatic |
| Price formatting | Custom formatter | `.toFixed(2)` (consistent with existing table) | Matches `$${item.unit_price.toFixed(2)}` in PriceBookList line 223 |

**Key insight:** This phase is entirely within the existing stack. All primitives (Dialog, Table, Button, Form, Input) already exist in `components/ui/`. The implementation is assembly work, not new infrastructure.

---

## Critical Implementation Detail: Supabase Batch UPDATE

**BULKPRICE-03 requires atomic update of all items in a category.** There is an important gap between what D-03 describes and what Supabase JS actually supports.

**What D-03 says:** "Single Supabase `.update({ unit_price: newPrice }).in('id', itemIds)` call"

**The problem:** This syntax sets ALL matched rows to the SAME `unit_price` value. That would be wrong — each item has a different computed new price.

**What is actually needed:** Set each item to its own computed new price. Two valid approaches:

**Approach A — Promise.all over individual updates (simple, not fully atomic):**
```typescript
await Promise.all(
  updates.map(({ id, unit_price }) =>
    supabase.from('company_price_book').update({ unit_price }).eq('id', id)
  )
)
```
This is parallel but NOT a single transaction. A partial failure leaves some rows updated and others not. This VIOLATES BULKPRICE-03.

**Approach B — Postgres RPC (atomic, correct):**
```sql
-- supabase/migrations/XXXXX_phase26_bulk_adjust_rpc.sql
CREATE OR REPLACE FUNCTION bulk_update_price_book_prices(
  p_updates JSONB  -- array of {id: uuid, unit_price: numeric}
) RETURNS INTEGER AS $$
DECLARE
  v_row JSONB;
  v_count INTEGER := 0;
BEGIN
  FOR v_row IN SELECT * FROM jsonb_array_elements(p_updates)
  LOOP
    UPDATE company_price_book
    SET unit_price = (v_row->>'unit_price')::NUMERIC
    WHERE id = (v_row->>'id')::UUID;
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY INVOKER;
```
Then call: `supabase.rpc('bulk_update_price_book_prices', { p_updates: updates })`

`SECURITY INVOKER` means the function runs as the calling user — RLS on `company_price_book` remains enforced for the UPDATE.

**Recommendation:** Use Approach B (RPC with migration). This is the only approach that satisfies BULKPRICE-03 (all-or-nothing atomicity). The existing codebase already has 2 PostgreSQL migrations in `supabase/migrations/`. Adding a third for this RPC follows established patterns.

**Alternative if RPC is considered too heavy:** The planner may choose to re-scope D-03's "atomic" claim to mean "best-effort with error surfacing" and use Promise.all. This is acceptable for the UX (most price book categories have < 20 items; partial failures are rare at this scale) but should be explicitly documented as a trade-off.

---

## Common Pitfalls

### Pitfall 1: Supabase JS Cannot Set Different Values Per Row in One `.update()` Call
**What goes wrong:** `supabase.from('company_price_book').update({ unit_price: X }).in('id', ids)` sets ALL matched rows to the SAME `X`. Cannot pass a map of id → price.
**Why it happens:** PostgREST's batch update API sets a single value across all matched rows. Per-row different values require either a loop of individual updates or a stored procedure.
**How to avoid:** Use a PostgreSQL RPC (see Architecture Patterns above). If using Promise.all, acknowledge atomicity is best-effort and surface partial-failure errors clearly.
**Warning signs:** Test where items have different prices — if all end up at the same price, the `.in()` overwrite bug occurred.

### Pitfall 2: `z.coerce.number()` Required for Number Input
**What goes wrong:** Using `z.number()` with a plain `<Input type="number">` fails because HTML number inputs give string values to react-hook-form. The zod parse sees a string and rejects it.
**Why it happens:** react-hook-form gets the input's `value` as a string by default.
**How to avoid:** Use `z.coerce.number()` in `bulkAdjustSchema` (same as `priceBookItemSchema.unit_price`) OR pass `valueAsNumber` to the input's `register()`. The existing project convention is `z.coerce.number()`.
**Warning signs:** Form always shows validation error even with a valid numeric string.

### Pitfall 3: `zodResolver` Cast to `any` for zod v4 Type Mismatch
**What goes wrong:** TypeScript complains about `zodResolver(bulkAdjustSchema)` return type not matching react-hook-form's `Resolver` type.
**Why it happens:** zod v4 changed some internal types; react-hook-form's zod resolver types haven't fully caught up.
**How to avoid:** Cast: `resolver: zodResolver(bulkAdjustSchema) as any` — this is the established project pattern. See STATE.md decision `[Phase 02-company-onboarding 02-02]`.
**Warning signs:** TypeScript error on `zodResolver(...)` import line.

### Pitfall 4: `form.watch()` Returns 0 When Input Is Empty (Not `undefined`)
**What goes wrong:** When the user clears the percentage input, `form.watch('adjustmentPercent')` returns `0` (because `z.coerce.number()` coerces empty string to `0`), not `undefined`/`null`. The preview table shows "+0%" and all "new prices" equal current prices.
**Why it happens:** zod coercion of empty string → 0 is correct behavior; the preview just needs to guard for this case.
**How to avoid:** In the `useMemo` preview, guard: `if (!adjustmentPercent || adjustmentPercent === 0) return []` to show an empty/placeholder table when input is blank or zero.
**Warning signs:** Preview table always shows rows (with identical prices) even before the user types anything.

### Pitfall 5: Dialog Must Stay Open on Error
**What goes wrong:** Calling `onOpenChange(false)` in the error branch closes the dialog before the toast appears, losing the error context.
**Why it happens:** Forgetting to early-return before `onOpenChange(false)` in the server action callback.
**How to avoid:** Return immediately after `toast.error(result.error)` without closing. Only `onOpenChange(false)` then `router.refresh()` on success — this is the Pitfall-5 pattern established in Phase 20 and enforced in Phase 21.

### Pitfall 6: Dialog State Not Reset When Reopened for a Different Category
**What goes wrong:** User opens "Adjust %" for "Labor", enters 10, closes. Opens for "Materials". The input still shows 10 from the previous session.
**Why it happens:** react-hook-form's `defaultValues` only apply at mount; when `open` changes, the form doesn't auto-reset.
**How to avoid:** Add a `useEffect` that calls `form.reset({ adjustmentPercent: 0 })` when `open` becomes `true` — same pattern as `PriceBookItemDialog` lines 87-99.

### Pitfall 7: items prop passed to BulkAdjustDialog Must Use Pre-Filter Items
**What goes wrong:** Passing `filtered` (search-filtered) items to the dialog means the preview and server action only see the currently visible items, not all items in the category.
**Why it happens:** `items` (full list) and `filtered` (search-filtered list) are both available in `PriceBookList`. The button is on the category header which is inside the `grouped.map(([category, categoryItems]) => ...)` loop — `categoryItems` are from `filtered`.
**How to avoid:** When opening the dialog, derive the full category items from the unfiltered `items` prop: `items.filter(i => i.category === category)`. The server action also independently fetches all items for the category — but the preview table should show the correct full count too. Document this clearly in the implementation.

---

## Code Examples

### Live Preview with useMemo

```typescript
// Source: Derived from price-book-list.tsx useMemo pattern (lines 58-77)
const adjustmentPercent = form.watch('adjustmentPercent')

const preview = useMemo(() => {
  if (!adjustmentPercent || adjustmentPercent === 0) return []
  return items.map((item) => ({
    id: item.id,
    name: item.name,
    currentPrice: item.unit_price,
    newPrice: Math.round(item.unit_price * (1 + adjustmentPercent / 100) * 100) / 100,
  }))
}, [items, adjustmentPercent])
```

### Preview Table Row Color Logic

```typescript
// Positive adjustment → green; negative → red; zero → neutral
// Suggestion: text-green-600 dark:text-green-400 / text-red-600 dark:text-red-400
const isPositive = adjustmentPercent > 0

<TableCell className={
  preview.length === 0
    ? 'text-muted-foreground'
    : isPositive
      ? 'text-green-600 dark:text-green-400'
      : 'text-red-600 dark:text-red-400'
}>
  ${row.newPrice.toFixed(2)}
</TableCell>
```

### Dynamic Confirm Button Label

```typescript
// Source: BulkAdjustDialog pattern (D-02 locked spec)
<Button
  type="submit"
  disabled={isPending || !adjustmentPercent || adjustmentPercent === 0 || !form.formState.isValid}
>
  {isPending ? 'Applying...' : `Apply to ${items.length} items`}
</Button>
```

### getAuthContext Pattern (from lib/actions/price-book.ts)

```typescript
// Source: lib/actions/price-book.ts lines 7-22 (existing, replicate exactly)
async function getAuthContext() {
  const supabase = await createClient()
  const { data: claimsData } = await supabase.auth.getClaims()
  const claims = claimsData?.claims ?? null
  if (!claims) return { error: 'Not authenticated' as const }

  const { data: company } = await supabase
    .from('companies')
    .select('id')
    .eq('user_id', claims.sub)
    .single()

  if (!company) return { error: 'No company found' as const }

  return { supabase, company }
}
```

---

## State of the Art

| Old Approach | Current Approach | Impact |
|--------------|------------------|--------|
| Per-row loop updates | Single SQL UPDATE with RPC | Atomic, single RTT, correct for BULKPRICE-03 |
| useState + useEffect for derived data | useMemo watching form.watch() | React 18 idiom, no unnecessary re-renders |
| Server redirect after mutation | router.refresh() in client | Maintains dialog context, standard for Next.js App Router mutations |

---

## Environment Availability

Step 2.6: SKIPPED (no external dependencies identified — this phase is purely code/config changes within the existing stack; no new CLI tools, services, runtimes, or databases required)

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 2.x + React Testing Library |
| Config file | `vitest.config.ts` |
| Quick run command | `npx vitest run tests/unit/price-book/ tests/unit/schemas/price-book.test.ts` |
| Full suite command | `npx vitest run tests/unit/` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|--------------|
| BULKPRICE-01 | "Adjust %" button renders on each category header | unit (render) | `npx vitest run tests/unit/price-book/price-book-list.test.tsx` | ✅ (needs new test cases) |
| BULKPRICE-01 | Button disabled when category has 0 visible items | unit (render) | same | ✅ (needs new test case) |
| BULKPRICE-01 | Clicking button opens BulkAdjustDialog for correct category | unit (interaction) | same | ✅ (needs new test case) |
| BULKPRICE-02 | Preview table shows current vs new prices based on % input | unit (render) | `npx vitest run tests/unit/price-book/bulk-adjust-dialog.test.tsx` | ❌ Wave 0 |
| BULKPRICE-02 | Preview table empty when % is 0 or blank | unit (render) | same | ❌ Wave 0 |
| BULKPRICE-02 | New price column is green for positive %, red for negative | unit (render) | same | ❌ Wave 0 |
| BULKPRICE-03 | bulkAdjustPriceBookCategory calls correct server action | unit (action) | `npx vitest run tests/unit/price-book/bulk-adjust-action.test.ts` | ❌ Wave 0 |
| BULKPRICE-03 | Dialog stays open on server action error | unit (interaction) | `npx vitest run tests/unit/price-book/bulk-adjust-dialog.test.tsx` | ❌ Wave 0 |
| BULKPRICE-03 | bulkAdjustSchema validates range -100 to +500 | unit (schema) | `npx vitest run tests/unit/schemas/price-book.test.ts` | ✅ (needs new test cases) |

### Sampling Rate
- **Per task commit:** `npx vitest run tests/unit/price-book/ tests/unit/schemas/price-book.test.ts`
- **Per wave merge:** `npx vitest run tests/unit/`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/unit/price-book/bulk-adjust-dialog.test.tsx` — covers BULKPRICE-02 preview behavior
- [ ] `tests/unit/price-book/bulk-adjust-action.test.ts` — covers BULKPRICE-03 action correctness (auth, company fetch, RPC call, error path)
- [ ] New test cases in `tests/unit/price-book/price-book-list.test.tsx` — covers BULKPRICE-01 button render and click behavior
- [ ] New test cases in `tests/unit/schemas/price-book.test.ts` — covers `bulkAdjustSchema` range validation

---

## Open Questions

1. **RPC vs Promise.all for atomic update**
   - What we know: Supabase JS `.update().in()` sets ONE value across all matched rows — cannot set per-row different values in one call. D-03 says "no partial saves."
   - What's unclear: Whether the planner wants to add a new migration for an RPC function, or accept best-effort atomicity via Promise.all (appropriate if categories are small, partial failures are highly unlikely in practice).
   - Recommendation: Default to the RPC approach for strict BULKPRICE-03 compliance. Include a migration file `supabase/migrations/YYYYMMDD_phase26_bulk_adjust_rpc.sql`. The planner can downgrade to Promise.all if RPC feels over-engineered for this scale.

2. **Items passed to BulkAdjustDialog: filtered or unfiltered?**
   - What we know: The "Adjust %" button appears on category headers inside the `grouped.map()` loop which uses `filtered` items. If a search is active, `categoryItems` only contains items matching the search.
   - What's unclear: Should bulk adjust operate on ALL items in the category regardless of active search, or only on currently visible items?
   - Recommendation: Operate on ALL items (unfiltered). Pass `items.filter(i => i.category === category)` from the full `items` prop, not `categoryItems` from the filtered `grouped` map. The server action independently validates against all company items, so this keeps client preview consistent with server behavior. The button being disabled when `categoryItems.length === 0` only needs to guard against the fully-filtered-out case where there truly are no visible items.

---

## Sources

### Primary (HIGH confidence)
- Direct code inspection: `components/price-book/price-book-list.tsx` — category header structure, grouped map loop, state management patterns
- Direct code inspection: `components/price-book/price-book-item-dialog.tsx` — Dialog + react-hook-form + zod + useTransition pattern
- Direct code inspection: `lib/actions/price-book.ts` — getAuthContext(), Supabase mutation patterns, error return shape
- Direct code inspection: `lib/schemas/price-book.ts` — z.coerce.number() pattern for numeric inputs
- Direct code inspection: `lib/queries/price-book.ts` — PriceBookItem type definition
- Direct code inspection: `supabase/migrations/20260506000001_phase19_price_book.sql` — company_price_book schema, RLS policies
- Direct code inspection: `tests/unit/price-book/price-book-list.test.tsx` — test pattern, mock structure, vi.mock conventions
- Direct code inspection: `tests/unit/price-book/import-action.test.ts` — server action test mock pattern (chainable Supabase mock)
- Direct code inspection: `.planning/phases/26-bulk-price-adjustment/26-CONTEXT.md` — all locked decisions D-01 through D-05

### Secondary (MEDIUM confidence)
- `.planning/STATE.md` — `zodResolver as any` cast pattern (Phase 02-02 decision), `z.coerce.number()` pattern (Phase 20 decision), Pitfall-5 close-then-refresh pattern
- PostgREST documentation (knowledge): `.update().in()` maps to `UPDATE ... WHERE id = ANY(...)` — single SQL statement, atomic within Postgres transaction

### Tertiary (LOW confidence — training data)
- Supabase JS v2 `.rpc()` call syntax for PostgreSQL functions: `supabase.rpc('function_name', { param: value })` — not verified against Context7 but consistent with project's existing RPC usage in Phase 15 (`get_platform_user_count`)

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries confirmed present in codebase; no new installs
- Architecture patterns: HIGH — derived from direct code inspection of canonical files
- Pitfalls: HIGH (Pitfalls 2-7) / MEDIUM (Pitfall 1 atomicity detail) — Pitfall 1 verified against known PostgREST behavior; RPC recommendation draws on Phase 15 precedent
- Test map: HIGH — existing test infrastructure confirmed; gaps identified by absence of files

**Research date:** 2026-05-08
**Valid until:** 2026-06-08 (stable stack; only risk is Supabase JS API changes)
