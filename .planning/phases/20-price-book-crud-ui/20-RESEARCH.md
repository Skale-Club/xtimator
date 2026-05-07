# Phase 20: Price Book CRUD UI - Research

**Researched:** 2026-05-07
**Domain:** Next.js 16 App Router, shadcn/ui, react-hook-form + zod, Supabase server actions, client-side search/filter
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Price Book is a standalone page at `/settings/price-book` — not a new tab in `SettingsTabs`. Follows the same sub-route pattern as `/settings/appearance`.
- **D-02:** Entry point from Settings: add a visible card or link section below the existing SettingsTabs on the `/settings` page pointing to "Price Book". Not added to sidebar `NAV_ITEMS` directly — Settings is the parent.
- **D-03:** Items are displayed in always-expanded sections with a category header — one section per distinct category value. No accordion/collapse. Works correctly when only one category exists.
- **D-04:** Categories sorted alphabetically; items within each category sorted by name. No drag-reorder.
- **D-05:** Both add and edit use a Dialog (shadcn Dialog, same pattern as `ClientSheet`). Form fields: category (free text with autocomplete from existing categories), name, unit, unit price, notes (optional). react-hook-form + zod schema.
- **D-06:** After save, list updates immediately via `router.refresh()` — consistent with existing mutation patterns. No optimistic update needed for a settings page.
- **D-07:** Edit is accessible via a `DropdownMenu` (⋯) per item row — same `MoreHorizontal` pattern as `ClientList`.
- **D-08:** Delete uses `AlertDialog` for confirmation — same pattern as `ClientList`. Destructive action button inside AlertDialog.
- **D-09:** Client-side search with `useMemo` filtering on both name and category fields — same pattern as `ClientList`. Search input at the top, instant filter. No server roundtrip.
- **D-10:** Empty state uses the existing `EmptyState` component. Title: "No price book items yet". Description: "Add your pricing standards and the AI will use them as anchors when generating estimates. Leaving this empty is fine — the AI will use market estimates instead." Single CTA: "Add first item" button that opens the add Dialog.

### Claude's Discretion

- Table rows vs card rows within each category section — either works; table rows are consistent with `ClientList`.
- Exact zod schema validations (unit_price min, name maxLength) — follow conventions from `clientSchema`.
- Loading skeleton for the page — follow existing `loading.tsx` pattern from other settings sub-routes.
- Whether to use shadcn `Sheet` (slide-over) or `Dialog` (modal) for the add/edit form — Dialog is consistent with existing CRUD forms.

### Deferred Ideas (OUT OF SCOPE)

- CSV import (PB-05) — Phase 21
- Bulk delete / bulk edit — out of scope per REQUIREMENTS.md
- Percentage bulk adjustment by category — v1.4 per REQUIREMENTS.md
- Price book as a direct sidebar NAV_ITEMS link — deferred; Settings is the parent
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| PB-01 | User can see all price book items grouped by category at `/settings/price-book` | Category grouping pattern: derive distinct categories, sort alphabetically, render always-expanded sections |
| PB-02 | User can add a new item (free category, name, unit, unit price, optional notes) | Dialog + react-hook-form + zod schema; `createPriceBookItem` server action writing to `company_price_book` |
| PB-03 | User can edit an existing item | Same Dialog component; `updatePriceBookItem` server action; pre-populate form with existing values |
| PB-04 | User can delete an item (with confirmation) | `AlertDialog` confirmation; `deletePriceBookItem` server action; hard-delete (schema has no `deleted_at`) |
| PB-06 | Page displays clear empty state communicating price book is optional | `EmptyState` component with D-10 copy; secondary helper text on header when items exist |
| PB-07 | User can search items by name or category | `useMemo` filter on `name` and `category` fields; instant client-side, no server roundtrip |
</phase_requirements>

---

## Summary

Phase 20 delivers the Price Book CRUD UI as a standalone settings sub-route (`/settings/price-book`). The codebase already has fully established, tested patterns for every UI primitive needed — the work is almost entirely pattern-following, not pattern-invention.

The database schema is fully deployed from Phase 19. The `company_price_book` table has 7 columns (id, company_id, category, name, unit, unit_price, notes, created_at) with 4 RLS policies covering all CRUD operations. No schema changes are needed.

The primary complexity is in the category grouping display (derive distinct categories from the fetched items, sort alphabetically, render expanded sections) and the category autocomplete in the Dialog (Popover + Command pattern). Both are well-understood patterns. All other pieces — Dialog, AlertDialog, DropdownMenu, Table, EmptyState, server actions, queries — have direct precedents in the existing codebase.

**Primary recommendation:** Clone the `ClientList` + `ClientSheet` structure verbatim, adapt column definitions and form fields, add the category-grouping rendering layer, and wire to new `lib/queries/price-book.ts` + `lib/actions/price-book.ts` files.

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Next.js | 16.2.3 | App Router page + loading.tsx | Project foundation |
| React | 19.2.4 | Client components | Project foundation |
| TypeScript strict | ^5 | All files typed | Project constraint |
| Tailwind CSS | ^4 | Styling | Project constraint |
| shadcn/ui | (installed) | Dialog, AlertDialog, Table, DropdownMenu, Input, Button, Badge, Textarea, Skeleton | Project constraint |
| react-hook-form | ^7.72.1 | Form state management | Project constraint |
| zod | ^4.3.6 | Schema validation | Project constraint |
| @hookform/resolvers | ^5.2.2 | zodResolver bridge | Project constraint |
| @supabase/supabase-js | ^2.103.0 | Supabase client for server actions | Project foundation |
| sonner | ^2.0.7 | Toast notifications | Established pattern |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| cmdk | ^1.1.1 | Command palette (powers shadcn Command) | Category autocomplete Combobox |
| lucide-react | ^1.8.0 | Icons (MoreHorizontal, Search, Plus, BookOpen) | All icon usage |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Popover + Command for autocomplete | HTML `<datalist>` | datalist simpler but unstyled; Command matches shadcn design system — use Command |
| Table rows | Card rows | Cards used in mobile fallback (ClientList pattern); Table rows are desktop default — keep Table for desktop |

**Installation:** No new packages required. All dependencies already installed.

---

## Architecture Patterns

### Recommended Project Structure

```
app/(app)/settings/price-book/
├── page.tsx           # Server component: fetch items, pass to PriceBookList
├── loading.tsx        # Skeleton matching appearance/loading.tsx pattern

components/price-book/
├── price-book-list.tsx        # 'use client' — search, grouping, DropdownMenu, AlertDialog delete, opens Dialog
├── price-book-item-dialog.tsx # 'use client' — Dialog + react-hook-form + zod for add/edit

lib/
├── queries/price-book.ts      # getPriceBookItems(supabase, companyId) → PriceBookItem[]
├── actions/price-book.ts      # createPriceBookItem, updatePriceBookItem, deletePriceBookItem
└── schemas/price-book.ts      # priceBookItemSchema (zod) + PriceBookItemFormValues
```

### Pattern 1: Server Component Page with Auth Guard

Follow `app/(app)/settings/appearance/page.tsx` + `app/(app)/settings/page.tsx` exactly:

```typescript
// app/(app)/settings/price-book/page.tsx
import { redirect } from 'next/navigation'
import { getAuthClaims, getCachedCompany } from '@/lib/queries/auth'
import { createClient } from '@/lib/supabase/server'
import { getPriceBookItems } from '@/lib/queries/price-book'
import { PriceBookList } from '@/components/price-book/price-book-list'

export const metadata = { title: 'Price Book' }

export default async function PriceBookPage() {
  const claims = await getAuthClaims()
  if (!claims) redirect('/login')

  const company = await getCachedCompany(claims.sub as string)
  if (!company) redirect('/onboarding')

  const supabase = await createClient()
  const items = await getPriceBookItems(supabase, company.id)

  return (
    <div className="w-full max-w-none space-y-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight">Price Book</h1>
        {items.length > 0 && (
          <p className="text-sm text-muted-foreground">
            The AI uses your listed prices as anchors when generating estimates.
            Leaving items out is fine — it falls back to market estimates.
          </p>
        )}
      </div>
      <PriceBookList items={items} companyId={company.id} />
    </div>
  )
}
```

**Source:** Verified against `app/(app)/settings/page.tsx` and `app/(app)/settings/appearance/page.tsx` in codebase.

### Pattern 2: Query Function

Follow `lib/queries/clients.ts` structure:

```typescript
// lib/queries/price-book.ts
import type { SupabaseClient } from '@supabase/supabase-js'

export interface PriceBookItem {
  id: string
  company_id: string
  category: string
  name: string
  unit: string | null
  unit_price: number
  notes: string | null
  created_at: string
}

export async function getPriceBookItems(
  supabase: SupabaseClient,
  companyId: string
): Promise<PriceBookItem[]> {
  const { data } = await supabase
    .from('company_price_book')
    .select('id, company_id, category, name, unit, unit_price, notes, created_at')
    .eq('company_id', companyId)
    .order('category')
    .order('name')
  return (data as PriceBookItem[]) ?? []
}
```

Note: `unit` column in the migration is nullable (no `NOT NULL`), so `unit: string | null`.

### Pattern 3: Server Actions

Follow `lib/actions/client.ts` verbatim — same `getAuthContext()` helper, same discriminated-union return `{ error }` or `{ data }`:

```typescript
// lib/actions/price-book.ts
'use server'
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import type { PriceBookItemFormValues } from '@/lib/schemas/price-book'

async function getAuthContext() {
  const supabase = await createClient()
  const { data: claimsData } = await supabase.auth.getClaims()
  const claims = claimsData?.claims ?? null
  if (!claims) return { error: 'Not authenticated' as const }
  const { data: company } = await supabase
    .from('companies').select('id').eq('user_id', claims.sub).single()
  if (!company) return { error: 'No company found' as const }
  return { supabase, company }
}

export async function createPriceBookItem(formData: PriceBookItemFormValues) {
  const ctx = await getAuthContext()
  if ('error' in ctx) return { error: ctx.error }
  const { supabase, company } = ctx
  const { data, error } = await supabase
    .from('company_price_book')
    .insert({ company_id: company.id, ...formData })
    .select().single()
  if (error) return { error: 'Failed to create item. Please try again.' }
  revalidatePath('/settings/price-book')
  return { data }
}
// updatePriceBookItem and deletePriceBookItem follow the same shape
```

### Pattern 4: Zod Schema

Follow `lib/schemas/client.ts` conventions — `optional().or(z.literal(''))` for optional text, `zodResolver cast to any` for zod v4 compat:

```typescript
// lib/schemas/price-book.ts
import { z } from 'zod'

export const priceBookItemSchema = z.object({
  category: z.string().min(1, 'Category is required'),
  name: z.string().min(1, 'Item name is required').max(200),
  unit: z.string().optional().or(z.literal('')),
  unit_price: z.number({ invalid_type_error: 'Unit price must be a number' }).min(0, 'Price must be 0 or greater'),
  notes: z.string().optional().or(z.literal('')),
})

export type PriceBookItemFormValues = z.infer<typeof priceBookItemSchema>
```

Note: `unit_price` is a `number` in the form (Input type="number"), not a string, so the schema uses `z.number()`. This differs from `targetBudget` pattern (which was stored as string then parsed). The DB column is NUMERIC(12,2) — parse the input value to float before passing to server action if using a text input.

### Pattern 5: Category Grouping in PriceBookList

Derive grouped categories client-side from the items array using `useMemo`:

```typescript
const grouped = useMemo(() => {
  const map = new Map<string, PriceBookItem[]>()
  for (const item of filtered) {
    const list = map.get(item.category) ?? []
    list.push(item)
    map.set(item.category, list)
  }
  // Sort category keys alphabetically; items already sorted by name from query
  return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b))
}, [filtered])
```

Render as always-expanded sections:
```tsx
{grouped.map(([category, items]) => (
  <div key={category}>
    <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-2">
      {category}
    </h3>
    <div className="rounded-md border">
      <Table>
        {/* ... rows ... */}
      </Table>
    </div>
  </div>
))}
```

### Pattern 6: Category Autocomplete (Combobox)

Use the existing `Popover` + `Command` components (both installed). This is the standard shadcn Combobox pattern:

```tsx
// Inside PriceBookItemDialog for the category field
<Popover open={categoryOpen} onOpenChange={setCategoryOpen}>
  <PopoverTrigger asChild>
    <Button variant="outline" role="combobox" className="w-full justify-between">
      {field.value || 'Select or type category...'}
      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
    </Button>
  </PopoverTrigger>
  <PopoverContent className="w-full p-0">
    <Command>
      <CommandInput
        placeholder="Search or create category..."
        value={field.value}
        onValueChange={field.onChange}
      />
      <CommandList>
        <CommandEmpty>No existing category. Will create "{field.value}".</CommandEmpty>
        <CommandGroup>
          {existingCategories.map((cat) => (
            <CommandItem key={cat} value={cat} onSelect={(v) => { field.onChange(v); setCategoryOpen(false) }}>
              {cat}
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </Command>
  </PopoverContent>
</Popover>
```

`existingCategories` is derived from the `items` prop — deduplicated sorted list of category strings. No extra fetch required.

### Pattern 7: Settings Entry Point

Add a Price Book card/link to `app/(app)/settings/page.tsx` following the existing Appearance card pattern in `SettingsTabs` (a Card wrapping a Link with ChevronRight). Place it BELOW the SettingsTabs component in the Settings page markup since D-02 says it is NOT added as a tab:

```tsx
// In app/(app)/settings/page.tsx — after <SettingsTabs>
import Link from 'next/link'
import { BookOpen, ChevronRight } from 'lucide-react'
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'

<Link href="/settings/price-book" className="block rounded-[var(--radius-md)] ...">
  <Card>
    <CardHeader className="flex flex-row items-center justify-between">
      <div className="flex items-start gap-3">
        <BookOpen className="mt-0.5 h-5 w-5 text-muted-foreground" />
        <div>
          <CardTitle>Price Book</CardTitle>
          <CardDescription>Manage your standard pricing for AI-powered estimates.</CardDescription>
        </div>
      </div>
      <ChevronRight className="h-4 w-4 text-muted-foreground" />
    </CardHeader>
  </Card>
</Link>
```

### Anti-Patterns to Avoid

- **Creating a new tab in SettingsTabs:** D-01 explicitly prohibits this. The page is a standalone sub-route.
- **Server-side search:** D-09 mandates client-side `useMemo` filter. No roundtrip.
- **Optimistic updates:** D-06 says `router.refresh()` is sufficient. Don't add complexity.
- **Accordion/collapse for categories:** D-03 mandates always-expanded sections.
- **Drag reorder of categories or items:** D-04 explicitly excluded even though `@dnd-kit` is installed.
- **Fetching categories separately:** Derive them from the items array already fetched for the page.
- **Using `zodResolver` without the `as any` cast:** The established pattern (STATE.md Phase 02) is `zodResolver(schema) as any` to handle zod v4 type mismatch with react-hook-form.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Confirmation dialog for delete | Custom modal | shadcn `AlertDialog` | Keyboard accessible, focus-trapped, established in ClientList |
| Form field validation | Manual validate functions | zod + react-hook-form `FormMessage` | Already wired in project; error messages auto-display |
| Dropdown action menu per row | Custom hover menu | shadcn `DropdownMenu` | MoreHorizontal pattern established in ClientList |
| Category autocomplete | Custom input+list | Popover + Command (cmdk) | Both components installed; handles keyboard navigation, empty state |
| Toast notifications | Custom alert | sonner `toast` | Established in all existing mutation handlers |
| Auth guard in server component | Manual session check | `getAuthClaims()` + `getCachedCompany()` | Established in auth.ts, used in appearance page |

**Key insight:** Every UI primitive and server pattern needed for this phase is already installed and tested in the codebase. Zero new packages required.

---

## Common Pitfalls

### Pitfall 1: unit_price as string in form

**What goes wrong:** HTML `<Input type="number">` returns a string from the `onChange` event. If `priceBookItemSchema` uses `z.number()`, the `zodResolver` will produce a type mismatch error at runtime.

**Why it happens:** react-hook-form registers inputs as string by default; zod `z.number()` expects a JS number.

**How to avoid:** Two options — (a) use `z.coerce.number()` in the schema to auto-coerce, or (b) keep `z.number()` and set `valueAsNumber: true` in the `register` call / `<FormField>` render prop. Option (b) is the react-hook-form-idiomatic approach. Confirm which pattern is cleaner for the codebase — no prior example exists for numeric inputs.

**Recommendation:** Use `z.coerce.number().min(0)` — simplest, no special input prop required.

### Pitfall 2: zodResolver cast missing for zod v4

**What goes wrong:** TypeScript compile error on `zodResolver(priceBookItemSchema)` — zod v4 types don't satisfy react-hook-form's expected resolver signature.

**Why it happens:** Known incompatibility (STATE.md Phase 02-02). The project's established workaround is `zodResolver(schema) as any`.

**How to avoid:** Always use `resolver: zodResolver(priceBookItemSchema) as any` in `useForm`.

### Pitfall 3: useEffect form.reset on dialog open

**What goes wrong:** Opening the edit dialog shows stale values from a previous edit if `useEffect` is not wired to the `open` or `item` prop.

**Why it happens:** `useForm` persists its internal state across re-renders. `ClientSheet` solves this with `useEffect([client, form])` that calls `form.reset()`.

**How to avoid:** Wire `useEffect` in `PriceBookItemDialog` on `[item, form]` — reset to item values when editing, reset to defaults when adding.

### Pitfall 4: Category grouping breaks on search

**What goes wrong:** If grouping is computed from `items` directly (not from `filtered`), searching returns no visible items but category headers still appear.

**Why it happens:** Grouping and filtering are two separate `useMemo` derivations and must be chained in the right order.

**How to avoid:** Compute `filtered` first (from `items + search`), then compute `grouped` from `filtered`. Both as separate `useMemo` calls where `grouped` depends on `filtered`.

### Pitfall 5: router.refresh() before dialog close

**What goes wrong:** Calling `router.refresh()` before `onOpenChange(false)` can cause a flash where the dialog briefly shows stale data.

**Why it happens:** `router.refresh()` triggers a re-render that may unmount/remount the dialog while it's still animating.

**How to avoid:** Call `onOpenChange(false)` first, then `router.refresh()` — same order as `ClientSheet` line 164-167.

### Pitfall 6: revalidatePath path mismatch

**What goes wrong:** `revalidatePath('/settings/price-book')` does not refresh the page if the route is served under an App Router route group.

**Why it happens:** Route groups (parenthetical folder names) are invisible in URLs but present in the file system. `revalidatePath` uses the URL path, not the file path.

**How to avoid:** Use `revalidatePath('/settings/price-book')` — this matches the URL, not `app/(app)/settings/price-book`. This is consistent with how `revalidatePath('/clients')` works in client actions.

---

## Code Examples

### Loading Skeleton (follows appearance/loading.tsx)

```typescript
// app/(app)/settings/price-book/loading.tsx
import { Skeleton } from '@/components/ui/skeleton'

export default function PriceBookLoading() {
  return (
    <div className="w-full max-w-none space-y-6">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-4 w-96" />
      <div className="flex justify-between items-center">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-9 w-28" />
      </div>
      {Array.from({ length: 2 }).map((_, i) => (
        <div key={i} className="space-y-2">
          <Skeleton className="h-5 w-32" />
          <div className="rounded-md border p-4 space-y-3">
            {Array.from({ length: 3 }).map((_, j) => (
              <Skeleton key={j} className="h-8 w-full" />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
```

### Empty State (D-10 exact copy)

```tsx
<EmptyState
  icon={BookOpen}
  title="No price book items yet"
  description="Add your pricing standards and the AI will use them as anchors when generating estimates. Leaving this empty is fine — the AI will use market estimates instead."
  actionLabel="Add first item"
  onAction={handleAddItem}
/>
```

### useMemo Filter + Group Chain

```typescript
const filtered = useMemo(() => {
  if (!search.trim()) return items
  const q = search.toLowerCase()
  return items.filter(
    (item) =>
      item.name.toLowerCase().includes(q) ||
      item.category.toLowerCase().includes(q)
  )
}, [items, search])

const grouped = useMemo(() => {
  const map = new Map<string, PriceBookItem[]>()
  for (const item of filtered) {
    const list = map.get(item.category) ?? []
    list.push(item)
    map.set(item.category, list)
  }
  return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b))
}, [filtered])
```

---

## Environment Availability

Step 2.6: SKIPPED — This is a pure code/config phase. No external services, CLI tools, or runtimes beyond the running Next.js dev server are required. The Supabase database schema is already deployed from Phase 19.

---

## Validation Architecture

nyquist_validation is enabled (config.json `workflow.nyquist_validation: true`).

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.4 + @testing-library/react 16.3.2 |
| Config file | `vitest.config.ts` |
| Quick run command | `npx vitest run tests/unit/price-book` |
| Full suite command | `npx vitest run` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PB-01 | Items grouped by category, alphabetically sorted | unit | `npx vitest run tests/unit/price-book/price-book-list.test.tsx` | ❌ Wave 0 |
| PB-02 | Add item — dialog opens, form submits, list updates | unit | `npx vitest run tests/unit/price-book/price-book-list.test.tsx` | ❌ Wave 0 |
| PB-03 | Edit item — dialog pre-populated, saves correctly | unit | `npx vitest run tests/unit/price-book/price-book-list.test.tsx` | ❌ Wave 0 |
| PB-04 | Delete item — AlertDialog shown, item removed on confirm | unit | `npx vitest run tests/unit/price-book/price-book-list.test.tsx` | ❌ Wave 0 |
| PB-06 | Empty state renders with correct copy | unit | `npx vitest run tests/unit/price-book/price-book-list.test.tsx` | ❌ Wave 0 |
| PB-07 | Search filters by name and category, "no results" state | unit | `npx vitest run tests/unit/price-book/price-book-list.test.tsx` | ❌ Wave 0 |
| PB-02/03 | priceBookItemSchema validates required fields, coerces unit_price | unit | `npx vitest run tests/unit/schemas/price-book.test.ts` | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `npx vitest run tests/unit/price-book`
- **Per wave merge:** `npx vitest run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `tests/unit/price-book/price-book-list.test.tsx` — covers PB-01, PB-02, PB-03, PB-04, PB-06, PB-07 (follow `tests/unit/clients/client-list.test.tsx` as template)
- [ ] `tests/unit/schemas/price-book.test.ts` — covers priceBookItemSchema validations (follow `tests/unit/schemas/client.test.ts` as template)
- [ ] Directory `tests/unit/price-book/` does not exist yet — Wave 0 must create it

---

## Project Constraints (from CLAUDE.md)

| Constraint | Directive |
|------------|-----------|
| Tech Stack | Next.js 14+ App Router, TypeScript strict, Tailwind CSS, shadcn/ui, react-hook-form + zod |
| Database | Supabase PostgreSQL with RLS on all tables |
| Security | Service role key never exposed to browser; all AI calls server-side |
| GSD Workflow | No direct repo edits outside GSD workflow |
| Conventions | zodResolver cast to any for zod v4 compat (STATE.md Phase 02-02) |
| Conventions | router.refresh() after mutations (STATE.md Phase 17) |
| Conventions | useTransition + startTransition for server action calls |
| Conventions | toast (sonner) for user feedback on mutations |
| Conventions | getAuthClaims() + getCachedCompany() in server components |

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| getSession() for JWT validation | getClaims() — re-validates against Supabase servers | Phase 01 | All server components use getClaims/getAuthClaims |
| Single settings page with all content | Sub-routes for complex settings sections | Phase 09 | Price book follows /settings/appearance sub-route pattern |
| Module-level SDK client instances | Per-request createClient() / createServiceClient() | Phase 08 | All server actions create client inside function body |
| unstable_cache with cookie reads | createServiceClient() inside unstable_cache | Phase 17 | getCachedCompany uses service client |

---

## Open Questions

1. **unit_price numeric coercion in form**
   - What we know: The DB column is NUMERIC(12,2). react-hook-form `<Input>` returns strings. `z.coerce.number()` handles this transparently.
   - What's unclear: Whether `<Input type="number">` + `valueAsNumber` or `z.coerce.number()` is preferred — no prior numeric form field in the codebase.
   - Recommendation: Use `z.coerce.number().min(0)` in the schema. This is the simplest, most explicit approach and avoids special Input props. If the value is empty string, `z.coerce.number()` coerces to `0` — which is valid per the schema constraint.

2. **Settings entry point: modify page.tsx vs settings-tabs.tsx**
   - What we know: D-02 says add below SettingsTabs. The settings page server component renders `<SettingsTabs>`. SettingsTabs is a client component that manages tabs state.
   - What's unclear: Whether to add the Price Book link card in `app/(app)/settings/page.tsx` (after `<SettingsTabs />`) or inside `components/settings/settings-tabs.tsx` (below the tab content area).
   - Recommendation: Add it in `app/(app)/settings/page.tsx` directly after `<SettingsTabs company={company} />`. This keeps the settings server component as the layout parent and avoids coupling the Price Book link into the tab component itself.

---

## Sources

### Primary (HIGH confidence)

- Codebase: `components/clients/client-list.tsx` — Table + search + DropdownMenu + AlertDialog pattern
- Codebase: `components/clients/client-sheet.tsx` — Dialog + react-hook-form + zod + zodResolver cast pattern
- Codebase: `lib/actions/client.ts` — Server action pattern with getAuthContext + discriminated return
- Codebase: `lib/queries/clients.ts` — Query function shape, interface definitions
- Codebase: `lib/queries/auth.ts` — getAuthClaims + getCachedCompany
- Codebase: `lib/schemas/client.ts` — zod schema conventions
- Codebase: `app/(app)/settings/page.tsx` — Settings page server component
- Codebase: `app/(app)/settings/appearance/page.tsx` + `loading.tsx` — Sub-route pattern
- Codebase: `components/settings/settings-tabs.tsx` — SettingsTabs with appearance card link pattern
- Codebase: `components/dashboard/empty-state.tsx` — EmptyState component interface
- Codebase: `components/ui/command.tsx` + `components/ui/popover.tsx` — Available Combobox primitives
- Codebase: `supabase/migrations/20260506000001_phase19_price_book.sql` — Exact schema, RLS policies, nullable columns
- Codebase: `tests/unit/clients/client-list.test.tsx` + `tests/unit/schemas/client.test.ts` — Test template patterns
- Codebase: `.planning/STATE.md` — Established decisions (zodResolver cast, router.refresh, useTransition)
- Codebase: `vitest.config.ts` + `package.json` — Test framework versions

### Secondary (MEDIUM confidence)

- Context: CONTEXT.md decisions D-01 through D-10 — all phase design decisions are locked and documented

---

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH — all verified from codebase and package.json
- Architecture: HIGH — direct pattern-clone from existing components with known working patterns
- Pitfalls: HIGH — derived from actual codebase patterns and documented STATE.md decisions
- Test patterns: HIGH — existing test files used as templates

**Research date:** 2026-05-07
**Valid until:** 2026-08-07 (stable stack)
