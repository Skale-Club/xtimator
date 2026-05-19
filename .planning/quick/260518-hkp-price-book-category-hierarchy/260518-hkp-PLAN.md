---
quick_id: 260518-hkp
title: "Price book category hierarchy (folders) — SEED-025"
type: execute
wave_count: 3
files_modified:
  - supabase/migrations/20260518000003_price_book_folders.sql
  - types/database.types.ts
  - lib/queries/price-book.ts
  - lib/actions/price-book.ts
  - lib/schemas/price-book.ts
  - components/price-book/price-book-list.tsx
  - components/price-book/price-book-item-dialog.tsx
  - lib/csv/price-book-import.ts
  - public/price-book-template.csv
autonomous: true

must_haves:
  truths:
    - "User can create a folder (e.g. 'Labor') from the price book settings page"
    - "Items with a folder assigned are grouped under their folder header in the list"
    - "Items without a folder_id appear under a virtual 'Uncategorized' folder, rendered last"
    - "Folder header shows name, item count, collapse toggle, rename and delete inline actions"
    - "Delete folder is blocked when the folder has one or more items"
    - "Item add/edit dialog shows an optional folder combobox above the category field"
    - "CSV import accepts an optional 'folder' column; matching folder name links to existing folder, new name creates a new folder"
  artifacts:
    - path: "supabase/migrations/20260518000003_price_book_folders.sql"
      provides: "price_book_folders table + folder_id FK on company_price_book"
    - path: "lib/queries/price-book.ts"
      provides: "PriceBookFolder interface + getFolders() + getPriceBookItems() with folder join"
    - path: "lib/actions/price-book.ts"
      provides: "createFolder, updateFolder, deleteFolder, createPriceBookItem/updatePriceBookItem accept folder_id"
    - path: "lib/schemas/price-book.ts"
      provides: "priceBookItemSchema extended with optional folder_id"
    - path: "components/price-book/price-book-list.tsx"
      provides: "Collapsible folder sections wrapping category groups; Uncategorized last"
    - path: "components/price-book/price-book-item-dialog.tsx"
      provides: "Folder combobox above category field"
    - path: "lib/csv/price-book-import.ts"
      provides: "Optional folder column parse and folder upsert logic"
  key_links:
    - from: "components/price-book/price-book-list.tsx"
      to: "lib/actions/price-book.ts (createFolder/updateFolder/deleteFolder)"
      via: "direct server action calls in folder header handlers"
    - from: "components/price-book/price-book-item-dialog.tsx"
      to: "lib/queries/price-book.ts (PriceBookFolder[])"
      via: "folders prop passed from PriceBookList → item dialog"
    - from: "lib/csv/price-book-import.ts"
      to: "lib/actions/price-book.ts (importPriceBookItems)"
      via: "folder name in ParsedRow.values.folder_name; action resolves/creates folder"
---

<objective>
Add a 2-level folder → category hierarchy to the price book. Folders are a new `price_book_folders` table; items gain a nullable `folder_id` FK. The list UI wraps existing category groups inside collapsible folder sections. The item dialog adds an optional folder picker. CSV import supports a `folder` column.

Purpose: Lets service businesses with large catalogues group categories (e.g. "Labor > Electrical", "Materials > Pipe Fittings") without the cognitive overhead of a flat list.
Output: Migration file, updated queries/actions/schema, updated UI components, updated CSV import.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/quick/260518-hkp-price-book-category-hierarchy/260518-hkp-PLAN.md

<interfaces>
<!-- Existing contracts executors build against. No codebase exploration needed. -->

From lib/queries/price-book.ts (current):
```typescript
export interface PriceBookItem {
  id: string
  company_id: string
  category: string | null   // free-text, still kept after this change
  name: string
  unit: string | null
  unit_price: number
  notes: string | null
  created_at: string
  image_url: string | null
  // NEW after Task 1: folder_id?: string | null  (left-join)
  // NEW after Task 1: folder_name?: string | null
}
```

From lib/schemas/price-book.ts (current):
```typescript
export const priceBookItemSchema = z.object({
  category: z.string().optional().or(z.literal('')),
  name: z.string().min(1, 'Item name is required').max(200),
  unit: z.string().optional().or(z.literal('')),
  unit_price: z.coerce.number().min(0, 'Price must be 0 or greater'),
  notes: z.string().optional().or(z.literal('')),
  image_url: z.string().url().optional().or(z.literal('')),
})
// NEW after Task 1: add folder_id?: z.string().uuid().optional().nullable()
```

From lib/actions/price-book.ts (current):
- getAuthContext() — returns { supabase, company } or { error }
- createPriceBookItem(formData, imageFile?) — inserts company_price_book row
- updatePriceBookItem(itemId, formData, imageFile?) — updates row
- importPriceBookItems(rows) — batch insert, deduplication by category::name

From components/price-book/price-book-list.tsx (current):
- Props: { items: PriceBookItem[], companyId: string }
- Grouped by `item.category || null`; nulls rendered last as "Uncategorized"
- BulkAdjustDialog called with unfiltered items per category (Pitfall 7 pattern)

From components/price-book/price-book-item-dialog.tsx (current):
- Props: { open, onOpenChange, item, companyId, existingCategories: string[] }
- Category combobox using Popover + Command pattern

Established patterns:
- Manual TypeScript type extension (Docker unavailable) — same as Phase 19, 24, 38
- RLS subquery: company_id IN (SELECT id FROM companies WHERE user_id = (SELECT auth.uid()))
- Close dialog BEFORE router.refresh() (Pitfall 5)
- getAuthContext() duplicated per actions file (Phase 20 decision)
- z.coerce.number() for numeric inputs
- zodResolver cast as any for zod v4 react-hook-form compat
</interfaces>
</context>

<tasks>

<!-- ═══════════════════════════════════════════════════════
     TASK 1 — DB migration + TypeScript types
     Wave 1 (everything depends on this)
     ═══════════════════════════════════════════════════════ -->

<task type="auto">
  <name>Task 1: DB migration and TypeScript type extension</name>
  <files>
    supabase/migrations/20260518000003_price_book_folders.sql,
    types/database.types.ts
  </files>
  <action>
**1a. Create `supabase/migrations/20260518000003_price_book_folders.sql`:**

```sql
-- SEED-025: Price book category hierarchy (folders)
-- Adds price_book_folders table and folder_id FK to company_price_book.
-- Exactly 2 levels: folder → category. No self-referential FK — separate table.

-- ============================================================
-- TABLE: price_book_folders
-- ============================================================
CREATE TABLE public.price_book_folders (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  sort_order   INT NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- ROW LEVEL SECURITY: price_book_folders
-- ============================================================
ALTER TABLE public.price_book_folders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "price_book_folders_select" ON price_book_folders FOR SELECT TO authenticated
  USING (company_id IN (SELECT id FROM companies WHERE user_id = (SELECT auth.uid())));
CREATE POLICY "price_book_folders_insert" ON price_book_folders FOR INSERT TO authenticated
  WITH CHECK (company_id IN (SELECT id FROM companies WHERE user_id = (SELECT auth.uid())));
CREATE POLICY "price_book_folders_update" ON price_book_folders FOR UPDATE TO authenticated
  USING (company_id IN (SELECT id FROM companies WHERE user_id = (SELECT auth.uid())))
  WITH CHECK (company_id IN (SELECT id FROM companies WHERE user_id = (SELECT auth.uid())));
CREATE POLICY "price_book_folders_delete" ON price_book_folders FOR DELETE TO authenticated
  USING (company_id IN (SELECT id FROM companies WHERE user_id = (SELECT auth.uid())));

-- ============================================================
-- ALTER company_price_book: add nullable folder_id FK
-- ============================================================
ALTER TABLE public.company_price_book
  ADD COLUMN folder_id UUID REFERENCES price_book_folders(id) ON DELETE SET NULL;

COMMENT ON COLUMN company_price_book.folder_id IS
  'Optional folder grouping (level 1). NULL = uncategorized at folder level. category TEXT is level 2.';
```

Apply with: `bunx supabase db push --db-url $DATABASE_URL`

**1b. Extend `types/database.types.ts` manually** (Docker unavailable — established pattern since Phase 19):

Find the `company_price_book` table entry (Row/Insert/Update around line 259). Add `folder_id: string | null` to Row (nullable), `folder_id?: string | null` to Insert, `folder_id?: string | null` to Update.

Add a NEW table entry for `price_book_folders` immediately after `company_price_book` (before `company_whatsapp`):

```typescript
      price_book_folders: {
        Row: {
          company_id: string
          created_at: string
          id: string
          name: string
          sort_order: number
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          name: string
          sort_order?: number
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          name?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "price_book_folders_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
```

Also add `folder_id?: string | null` to `company_price_book` Relationships array — add a FK entry:
```typescript
          {
            foreignKeyName: "company_price_book_folder_id_fkey"
            columns: ["folder_id"]
            isOneToOne: false
            referencedRelation: "price_book_folders"
            referencedColumns: ["id"]
          },
```
  </action>
  <verify>
    <automated>bunx tsc --noEmit 2>&1 | head -20</automated>
  </verify>
  <done>Migration file exists with correct DDL. `database.types.ts` has `price_book_folders` table entry and `company_price_book.folder_id` in Row/Insert/Update. `tsc --noEmit` passes.</done>
</task>

<!-- ═══════════════════════════════════════════════════════
     TASK 2 — Queries, actions, schema
     Wave 2 — parallel-safe with Task 3, depends on Task 1
     ═══════════════════════════════════════════════════════ -->

<task type="auto">
  <name>Task 2: Queries, server actions, and Zod schema</name>
  <files>
    lib/queries/price-book.ts,
    lib/actions/price-book.ts,
    lib/schemas/price-book.ts
  </files>
  <action>
**2a. `lib/schemas/price-book.ts`** — add optional `folder_id` to `priceBookItemSchema`:

```typescript
export const priceBookItemSchema = z.object({
  folder_id: z.string().uuid().optional().nullable(),   // ADD THIS LINE (first field, optional)
  category: z.string().optional().or(z.literal('')),
  name: z.string().min(1, 'Item name is required').max(200),
  unit: z.string().optional().or(z.literal('')),
  unit_price: z.coerce.number().min(0, 'Price must be 0 or greater'),
  notes: z.string().optional().or(z.literal('')),
  image_url: z.string().url().optional().or(z.literal('')),
})
```

**2b. `lib/queries/price-book.ts`** — add `PriceBookFolder` interface, `getFolders()`, and extend `PriceBookItem` + `getPriceBookItems()`:

```typescript
import type { SupabaseClient } from '@supabase/supabase-js'

// --- PriceBookFolder ---

export interface PriceBookFolder {
  id: string
  company_id: string
  name: string
  sort_order: number
  created_at: string
}

export async function getFolders(
  supabase: SupabaseClient,
  companyId: string
): Promise<PriceBookFolder[]> {
  const { data } = await supabase
    .from('price_book_folders')
    .select('id, company_id, name, sort_order, created_at')
    .eq('company_id', companyId)
    .order('sort_order')
    .order('name')
  return (data as PriceBookFolder[]) ?? []
}

// --- PriceBookItem (extended) ---

export interface PriceBookItem {
  id: string
  company_id: string
  folder_id: string | null       // NEW
  folder_name: string | null     // NEW — denormalized from left-join
  category: string | null
  name: string
  unit: string | null
  unit_price: number
  notes: string | null
  created_at: string
  image_url: string | null
}

export async function getPriceBookItems(
  supabase: SupabaseClient,
  companyId: string
): Promise<PriceBookItem[]> {
  const { data } = await supabase
    .from('company_price_book')
    .select(`
      id, company_id, folder_id, category, name, unit, unit_price, notes, created_at, image_url,
      price_book_folders ( name )
    `)
    .eq('company_id', companyId)
    .order('category')
    .order('name')
  // Flatten the nested join: price_book_folders.name → folder_name
  return ((data ?? []) as any[]).map((row) => ({
    ...row,
    folder_name: (row.price_book_folders as { name: string } | null)?.name ?? null,
    price_book_folders: undefined,
  })) as PriceBookItem[]
}
```

**2c. `lib/actions/price-book.ts`** — add folder CRUD and extend item create/update/import:

Add these four new server actions after the existing `getAuthContext` helper:

```typescript
// ── Folder CRUD ────────────────────────────────────────────────

export async function createFolder(name: string) {
  const ctx = await getAuthContext()
  if ('error' in ctx) return { error: ctx.error }
  const { supabase, company } = ctx
  const { data, error } = await supabase
    .from('price_book_folders')
    .insert({ company_id: company.id, name: name.trim() })
    .select()
    .single()
  if (error) return { error: 'Failed to create folder.' }
  revalidatePath('/settings/price-book')
  return { data }
}

export async function updateFolder(folderId: string, name: string) {
  const ctx = await getAuthContext()
  if ('error' in ctx) return { error: ctx.error }
  const { supabase } = ctx
  const { error } = await supabase
    .from('price_book_folders')
    .update({ name: name.trim() })
    .eq('id', folderId)
  if (error) return { error: 'Failed to rename folder.' }
  revalidatePath('/settings/price-book')
  return { data: { updated: true } }
}

export async function deleteFolder(folderId: string) {
  const ctx = await getAuthContext()
  if ('error' in ctx) return { error: ctx.error }
  const { supabase, company } = ctx
  // Guard: deny delete if any items reference this folder
  const { count, error: countErr } = await supabase
    .from('company_price_book')
    .select('id', { count: 'exact', head: true })
    .eq('company_id', company.id)
    .eq('folder_id', folderId)
  if (countErr) return { error: 'Could not check folder contents.' }
  if ((count ?? 0) > 0) return { error: 'Remove all items from this folder before deleting it.' }
  const { error } = await supabase
    .from('price_book_folders')
    .delete()
    .eq('id', folderId)
  if (error) return { error: 'Failed to delete folder.' }
  revalidatePath('/settings/price-book')
  return { data: { deleted: true } }
}
```

Extend `createPriceBookItem` and `updatePriceBookItem` to pass `folder_id` from `formData`:
- In the `.insert({...})` call, add `folder_id: formData.folder_id ?? null`
- In the `.update({...})` call, add `folder_id: formData.folder_id ?? null`

Extend `importPriceBookItems` signature to accept optional `folderMap`:
```typescript
export async function importPriceBookItems(
  rows: PriceBookItemFormValues[],
  folderNameMap?: Map<string, string>   // folderName (lowercase) → folder_id
): Promise<{ data: { imported: number; skipped: number } } | { error: string }>
```
In the `toInsert.map()` inside `importPriceBookItems`, resolve `folder_id`:
```typescript
toInsert.map((r) => ({
  company_id: company.id,
  folder_id: (r as any).folder_name
    ? (folderNameMap?.get(((r as any).folder_name as string).toLowerCase()) ?? null)
    : null,
  category: r.category || null,
  name: r.name,
  unit: r.unit || null,
  unit_price: r.unit_price,
  notes: r.notes || null,
}))
```
Note: `folder_name` is a transient field passed via PriceBookItemFormValues extended in the CSV layer (Task 4). It is NOT in the Zod schema — cast as `any` is intentional.
  </action>
  <verify>
    <automated>bunx tsc --noEmit 2>&1 | head -20</automated>
  </verify>
  <done>
- `getFolders()` exported from `lib/queries/price-book.ts`
- `createFolder`, `updateFolder`, `deleteFolder` exported from `lib/actions/price-book.ts`
- `getPriceBookItems` left-joins `price_book_folders` and returns `folder_id` + `folder_name`
- `priceBookItemSchema` has `folder_id` optional field
- `createPriceBookItem` / `updatePriceBookItem` pass `folder_id`
- `tsc --noEmit` passes
  </done>
</task>

<!-- ═══════════════════════════════════════════════════════
     TASK 3 — List UI + Item dialog
     Wave 2 — parallel-safe with Task 2, depends on Task 1
     ═══════════════════════════════════════════════════════ -->

<task type="auto">
  <name>Task 3: List UI with collapsible folders and item dialog folder picker</name>
  <files>
    components/price-book/price-book-list.tsx,
    components/price-book/price-book-item-dialog.tsx
  </files>
  <action>
**3a. `components/price-book/price-book-list.tsx`**

The component's Props signature does NOT change for the page (`items` + `companyId`). The list will call `getFolders` inside a server component parent... but PriceBookList is a client component. Instead, pass `folders` as a prop.

**WAIT** — the existing page is a server component that fetches items and passes them down. Follow the same pattern: the page fetches folders and passes them as a prop.

Update props:
```typescript
import type { PriceBookFolder } from '@/lib/queries/price-book'

interface PriceBookListProps {
  items: PriceBookItem[]
  folders: PriceBookFolder[]   // NEW
  companyId: string
}
```

Add folder state and handlers:
```typescript
const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(new Set())
const [renamingFolderId, setRenamingFolderId] = useState<string | null>(null)
const [renamingFolderValue, setRenamingFolderValue] = useState('')
const [newFolderDialogOpen, setNewFolderDialogOpen] = useState(false)
const [newFolderName, setNewFolderName] = useState('')
const [deletingFolderId, setDeletingFolderId] = useState<string | null>(null)
const [deleteFolderDialogOpen, setDeleteFolderDialogOpen] = useState(false)
```

Add import for server actions:
```typescript
import { deletePriceBookItem, createFolder, updateFolder, deleteFolder } from '@/lib/actions/price-book'
import { FolderOpen, FolderClosed, ChevronDown, ChevronRight, Pencil, Trash2, FolderPlus } from 'lucide-react'
```

**Grouping logic** (replace current `grouped` useMemo):

Group items into virtual folder buckets using `item.folder_id`:
```typescript
const groupedByFolder = useMemo(() => {
  // Map folderId -> items (filtered)
  const map = new Map<string | null, PriceBookItem[]>()
  for (const item of filtered) {
    const key = item.folder_id ?? null
    const list = map.get(key) ?? []
    list.push(item)
    map.set(key, list)
  }
  return map
}, [filtered])
```

Build display-order folder list: named folders sorted by sort_order/name, then virtual Uncategorized last:
```typescript
const folderSections = useMemo(() => {
  const sections: Array<{
    id: string | null
    name: string
    items: PriceBookItem[]
    isVirtual: boolean
  }> = []
  // Named folders in sort_order
  for (const folder of folders) {
    const folderItems = groupedByFolder.get(folder.id) ?? []
    if (folderItems.length > 0 || true) {   // show empty folders too
      sections.push({ id: folder.id, name: folder.name, items: folderItems, isVirtual: false })
    }
  }
  // Also include folder_ids present in items but not in folders list (shouldn't happen, defensive)
  // Virtual uncategorized — items with folder_id === null
  const uncatItems = groupedByFolder.get(null) ?? []
  if (uncatItems.length > 0) {
    sections.push({ id: null, name: 'Uncategorized', items: uncatItems, isVirtual: true })
  }
  return sections
}, [folders, groupedByFolder])
```

Within each folder section, preserve existing category-group rendering. For each folder section's items, re-use the existing `grouped` logic scoped to that folder's items:
```typescript
function groupByCategory(items: PriceBookItem[]) {
  const map = new Map<string | null, PriceBookItem[]>()
  for (const item of items) {
    const key = item.category || null
    const list = map.get(key) ?? []
    list.push(item)
    map.set(key, list)
  }
  return Array.from(map.entries()).sort(([a], [b]) => {
    if (a === null) return 1
    if (b === null) return -1
    return a.localeCompare(b)
  })
}
```

**Folder header JSX** (replacing the current flat category headers outer loop):
```tsx
{folderSections.map(({ id: folderId, name: folderName, items: folderItems, isVirtual }) => {
  const isCollapsed = folderId ? collapsedFolders.has(folderId) : false
  const isRenaming = folderId === renamingFolderId

  return (
    <div key={folderId ?? '__uncategorized__'} className="space-y-4">
      {/* Folder header */}
      <div className="flex items-center gap-2 border-b pb-2">
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={() => {
            if (!folderId) return
            setCollapsedFolders((prev) => {
              const next = new Set(prev)
              next.has(folderId) ? next.delete(folderId) : next.add(folderId)
              return next
            })
          }}
          disabled={!folderId}
        >
          {isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </Button>

        {isRenaming ? (
          <Input
            autoFocus
            className="h-7 w-40 text-sm"
            value={renamingFolderValue}
            onChange={(e) => setRenamingFolderValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleRenameConfirm(folderId!)
              if (e.key === 'Escape') setRenamingFolderId(null)
            }}
            onBlur={() => handleRenameConfirm(folderId!)}
          />
        ) : (
          <span className="font-semibold text-sm flex items-center gap-1.5">
            <FolderOpen className="h-4 w-4 text-muted-foreground" />
            {folderName}
            <span className="text-muted-foreground font-normal ml-1">
              ({folderItems.length})
            </span>
          </span>
        )}

        {!isVirtual && !isRenaming && (
          <div className="ml-auto flex items-center gap-1">
            <Button
              variant="ghost" size="icon" className="h-6 w-6"
              onClick={() => { setRenamingFolderId(folderId!); setRenamingFolderValue(folderName) }}
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost" size="icon" className="h-6 w-6 text-destructive hover:text-destructive"
              onClick={() => { setDeletingFolderId(folderId!); setDeleteFolderDialogOpen(true) }}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}
      </div>

      {/* Category groups inside folder (existing logic, collapsed if folder collapsed) */}
      {!isCollapsed && (
        <div className="space-y-6 pl-4">
          {groupByCategory(folderItems).map(([category, categoryItems]) => (
            /* EXACT SAME inner JSX as current — category header + table */
            ...
          ))}
        </div>
      )}
    </div>
  )
})}
```

Copy the existing inner category section JSX unchanged into the `...` placeholder above.

**Folder action handlers:**
```typescript
function handleRenameConfirm(folderId: string) {
  const trimmed = renamingFolderValue.trim()
  setRenamingFolderId(null)
  if (!trimmed) return
  startTransition(async () => {
    const result = await updateFolder(folderId, trimmed)
    if (result.error) toast.error(result.error)
    else router.refresh()
  })
}

function handleCreateFolder() {
  const trimmed = newFolderName.trim()
  if (!trimmed) return
  startTransition(async () => {
    const result = await createFolder(trimmed)
    if (result.error) { toast.error(result.error); return }
    setNewFolderName('')
    setNewFolderDialogOpen(false)
    router.refresh()
  })
}

function handleConfirmDeleteFolder() {
  if (!deletingFolderId) return
  startTransition(async () => {
    const result = await deleteFolder(deletingFolderId)
    if (result.error) { toast.error(result.error); return }
    toast.success('Folder deleted')
    setDeleteFolderDialogOpen(false)
    setDeletingFolderId(null)
    router.refresh()
  })
}
```

**"New Folder" button** — add to the header flex row next to "Import CSV" and "Add Item":
```tsx
<Button variant="outline" onClick={() => setNewFolderDialogOpen(true)}>
  <FolderPlus className="h-4 w-4 mr-2" />
  New Folder
</Button>
```

**"New Folder" dialog** — inline `<Dialog>` at the bottom of the component JSX (alongside the existing AlertDialogs):
```tsx
<Dialog open={newFolderDialogOpen} onOpenChange={setNewFolderDialogOpen}>
  <DialogContent className="sm:max-w-xs">
    <DialogHeader>
      <DialogTitle>New Folder</DialogTitle>
    </DialogHeader>
    <Input
      placeholder="Folder name..."
      value={newFolderName}
      onChange={(e) => setNewFolderName(e.target.value)}
      onKeyDown={(e) => { if (e.key === 'Enter') handleCreateFolder() }}
      autoFocus
    />
    <DialogFooter>
      <Button variant="outline" onClick={() => setNewFolderDialogOpen(false)}>Cancel</Button>
      <Button onClick={handleCreateFolder} disabled={!newFolderName.trim() || isPending}>
        Create
      </Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

**Delete folder AlertDialog** (alongside existing delete item AlertDialog):
```tsx
<AlertDialog open={deleteFolderDialogOpen} onOpenChange={setDeleteFolderDialogOpen}>
  <AlertDialogContent>
    <AlertDialogHeader>
      <AlertDialogTitle>Delete Folder</AlertDialogTitle>
      <AlertDialogDescription>
        This will delete the folder. Items in this folder must be moved or deleted first.
      </AlertDialogDescription>
    </AlertDialogHeader>
    <AlertDialogFooter>
      <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
      <AlertDialogAction
        onClick={handleConfirmDeleteFolder}
        disabled={isPending}
        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
      >
        {isPending ? 'Deleting...' : 'Delete Folder'}
      </AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>
```

Pass `folders` prop through to `<PriceBookItemDialog>`:
```tsx
<PriceBookItemDialog
  open={dialogOpen}
  onOpenChange={handleDialogChange}
  item={editingItem}
  companyId={companyId}
  existingCategories={existingCategories}
  folders={folders}   // NEW
/>
```

Also add needed Dialog imports at the top:
```typescript
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
```

**3b. `components/price-book/price-book-item-dialog.tsx`**

Update props:
```typescript
import type { PriceBookFolder } from '@/lib/queries/price-book'

interface PriceBookItemDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  item: PriceBookItem | null
  companyId: string
  existingCategories: string[]
  folders: PriceBookFolder[]   // NEW
}
```

Add folder combobox state:
```typescript
const [folderOpen, setFolderOpen] = useState(false)
```

In `EMPTY_FORM`, add `folder_id: null` (or `undefined` — use `null` to match the schema nullable):
```typescript
const EMPTY_FORM: PriceBookItemFormValues = {
  folder_id: null,
  category: '',
  name: '',
  unit: '',
  unit_price: 0,
  notes: '',
}
```

In the `useEffect` reset, add `folder_id: item?.folder_id ?? null`.

Add the folder combobox FormField ABOVE the existing category FormField (same Popover + Command pattern already used for category):
```tsx
{/* Folder (optional) */}
<FormField
  control={form.control}
  name="folder_id"
  render={({ field }) => {
    const selectedFolder = folders.find((f) => f.id === field.value) ?? null
    return (
      <FormItem className="flex flex-col">
        <FormLabel>Folder (optional)</FormLabel>
        <Popover open={folderOpen} onOpenChange={setFolderOpen}>
          <PopoverTrigger asChild>
            <FormControl>
              <Button
                type="button"
                variant="outline"
                role="combobox"
                className="w-full justify-between font-normal"
              >
                <span className={selectedFolder ? '' : 'text-muted-foreground'}>
                  {selectedFolder?.name ?? 'No folder'}
                </span>
                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
              </Button>
            </FormControl>
          </PopoverTrigger>
          <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
            <Command>
              <CommandInput placeholder="Search folders..." />
              <CommandList>
                <CommandEmpty>No folders found.</CommandEmpty>
                <CommandGroup>
                  <CommandItem
                    value=""
                    onSelect={() => { field.onChange(null); setFolderOpen(false) }}
                  >
                    No folder
                  </CommandItem>
                  {folders.map((folder) => (
                    <CommandItem
                      key={folder.id}
                      value={folder.name}
                      onSelect={() => { field.onChange(folder.id); setFolderOpen(false) }}
                    >
                      {folder.name}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
        <FormMessage />
      </FormItem>
    )
  }}
/>
```

**Update page to pass folders prop.** The page is at `app/(app)/settings/price-book/page.tsx`. Add:
```typescript
import { getFolders } from '@/lib/queries/price-book'
// In the server component, after fetching items:
const [items, folders] = await Promise.all([
  getPriceBookItems(supabase, company.id),
  getFolders(supabase, company.id),
])
// Pass folders to PriceBookList:
<PriceBookList items={items} folders={folders} companyId={company.id} />
```

Find the existing page file. It likely does a `getPriceBookItems` call. Add the parallel `getFolders` call and pass the prop.
  </action>
  <verify>
    <automated>bunx tsc --noEmit 2>&1 | head -20</automated>
  </verify>
  <done>
- `PriceBookList` renders folder sections with collapse toggle, rename (click pencil, edit inline), and delete (blocked when items exist via toast from server)
- "New Folder" button opens inline dialog
- "Uncategorized" virtual folder appears last when items have no folder_id
- Existing category groups render unchanged inside folder sections
- `PriceBookItemDialog` shows folder combobox above category field
- `tsc --noEmit` passes
  </done>
</task>

<!-- ═══════════════════════════════════════════════════════
     TASK 4 — CSV import
     Wave 3 — depends on Task 2 (actions), Task 3 (UI flow)
     ═══════════════════════════════════════════════════════ -->

<task type="auto">
  <name>Task 4: CSV import — optional folder column</name>
  <files>
    lib/csv/price-book-import.ts,
    public/price-book-template.csv
  </files>
  <action>
**4a. `public/price-book-template.csv`** — add `folder` as the first column:

```csv
folder,category,name,unit,unit_price
Labor,Electrical,General Labor,hr,75.00
Materials,Pipe Fittings,PVC Pipe 2in,ft,3.50
```

**4b. `lib/csv/price-book-import.ts`** — extend parsing to handle optional `folder` column:

The `REQUIRED_HEADERS` stays unchanged (`['category', 'name', 'unit', 'unit_price']`). The `folder` column is optional.

Extend `ParsedRow.values` to carry `folder_name` as a transient (non-schema) field by augmenting the type:
```typescript
// Extend PriceBookItemFormValues with a transient folder_name for import
export type ImportRow = PriceBookItemFormValues & { folder_name?: string }
```

Update `ParsedRow`:
```typescript
export interface ParsedRow {
  rowNumber: number
  values: ImportRow   // changed from PriceBookItemFormValues
  errors: RowError[]
  isDuplicateInFile: boolean
}
```

In `parsePriceBookCsv`, extract `folder` column (optional — defaults to empty string):
```typescript
const rawFolder = (raw.folder ?? '').trim()
// ... after other extractions:
return {
  rowNumber: i + 2,
  values: {
    folder_name: rawFolder || undefined,   // transient — not in Zod schema
    category: rawCategory,
    name: rawName,
    unit: rawUnit,
    unit_price: Number.isNaN(priceNum) ? 0 : priceNum,
    notes: '',
  } as ImportRow,
  errors,
  isDuplicateInFile: isDup,
}
```

**The import action integration** lives in `lib/actions/price-book.ts` (`importPriceBookItems`). The CSV import UI component (`components/price-book/price-book-import-dialog.tsx`) calls this action. Update the import dialog to:

1. After parsing, collect unique folder names from valid rows:
   ```typescript
   const folderNames = [...new Set(
     rows.filter(r => r.errors.length === 0 && !r.isDuplicateInFile)
       .map(r => (r.values as ImportRow).folder_name)
       .filter(Boolean) as string[]
   )]
   ```

2. Resolve or create folders before import. Add a helper call that goes to the server. The simplest approach: add a new server action `resolveOrCreateFolders(names: string[])` in `lib/actions/price-book.ts`:
   ```typescript
   export async function resolveOrCreateFolders(
     names: string[]
   ): Promise<{ data: Map<string, string> } | { error: string }> {
     const ctx = await getAuthContext()
     if ('error' in ctx) return { error: ctx.error }
     const { supabase, company } = ctx
     if (names.length === 0) return { data: new Map() }
     // Fetch existing
     const { data: existing } = await supabase
       .from('price_book_folders')
       .select('id, name')
       .eq('company_id', company.id)
       .in('name', names)
     const map = new Map<string, string>()
     const existingNames = new Set<string>()
     for (const row of existing ?? []) {
       map.set(row.name.toLowerCase(), row.id)
       existingNames.add(row.name.toLowerCase())
     }
     // Create missing
     const toCreate = names.filter(n => !existingNames.has(n.toLowerCase()))
     if (toCreate.length > 0) {
       const { data: created } = await supabase
         .from('price_book_folders')
         .insert(toCreate.map(name => ({ company_id: company.id, name })))
         .select('id, name')
       for (const row of created ?? []) {
         map.set(row.name.toLowerCase(), row.id)
       }
     }
     return { data: map }
   }
   ```

3. In `components/price-book/price-book-import-dialog.tsx`, update the import handler to:
   - Call `resolveOrCreateFolders(folderNames)` first
   - Pass `folderNameMap` (the returned Map) to `importPriceBookItems(rows, folderNameMap)`

**Update `importPriceBookItems` in `lib/actions/price-book.ts`** to use `folder_name` from each row to look up `folder_id` from the map (already stubbed in Task 2 — confirm the transient field cast is in place).

Add `resolveOrCreateFolders` to the exports of `lib/actions/price-book.ts`.

Add import for the action in `price-book-import-dialog.tsx`:
```typescript
import { importPriceBookItems, resolveOrCreateFolders } from '@/lib/actions/price-book'
```

Find `price-book-import-dialog.tsx` (not listed in files_modified above but may need a small import/call update). Add it to the edit if needed.
  </action>
  <verify>
    <automated>bunx tsc --noEmit 2>&1 | head -20</automated>
  </verify>
  <done>
- `public/price-book-template.csv` has `folder` as first column with sample data
- `parsePriceBookCsv` reads optional `folder` column, stores as `folder_name` in `ImportRow.values`
- `resolveOrCreateFolders` action resolves existing / creates new folders by name
- Import dialog calls `resolveOrCreateFolders` then passes `folderNameMap` to `importPriceBookItems`
- Items without a folder column import cleanly with `folder_id = null`
- `tsc --noEmit` passes
  </done>
</task>

</tasks>

<verification>
After all tasks complete:

1. `bunx tsc --noEmit` — zero TypeScript errors
2. Migration file `supabase/migrations/20260518000003_price_book_folders.sql` exists and is syntactically valid SQL
3. Price book list shows folder sections (collapsible) with category groups inside
4. "New Folder" button opens dialog, creates folder, folder appears in list
5. Rename and delete actions work from folder header (delete blocked when folder has items)
6. Item dialog shows "Folder (optional)" combobox above Category field
7. CSV import with `folder` column links items to correct folders (creates new if needed)
8. Items with no folder_id appear under virtual "Uncategorized" section rendered last
</verification>

<success_criteria>
- Migration creates `price_book_folders` table with deny-all RLS + company-scoped policies
- `folder_id` FK column added to `company_price_book` (nullable, ON DELETE SET NULL)
- `getFolders()`, `createFolder()`, `updateFolder()`, `deleteFolder()`, `resolveOrCreateFolders()` exported and usable
- `deleteFolder` returns error when folder has items (guard query before delete)
- List renders 2-level hierarchy: folders (collapsible) containing category groups
- Uncategorized virtual section rendered last (no DB row)
- Item dialog folder picker is optional — existing items without folder_id still work
- CSV template has `folder` column; import creates missing folders, links existing
- All TypeScript compiles cleanly (`tsc --noEmit` passes)
</success_criteria>

<output>
After completion, create `.planning/quick/260518-hkp-price-book-category-hierarchy/260518-hkp-SUMMARY.md` with:
- What was built (bullet list of files changed + key changes)
- Migration applied (yes/no + command used)
- Any deviations from this plan
- Commit hash(es)
</output>
