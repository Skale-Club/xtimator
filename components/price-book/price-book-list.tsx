'use client'

import { useState, useMemo, useRef, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  BookOpen,
  Search,
  MoreHorizontal,
  Percent,
  Plus,
  Upload,
  Pencil,
  Trash2,
  FolderPlus,
  ListChecks,
  CheckSquare,
  ArrowUp,
  ArrowDown,
  LayoutList,
} from 'lucide-react'
import { toast } from 'sonner'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { BottomSheetCloseButton, BottomSheetContent } from '@/components/ui/bottom-sheet'
import { ListSearch, TOOLBAR_CONTROL } from '@/components/ui/list-toolbar'
import {
  SidePanelColumn,
  SidePanelMobilePicker,
  type SidePanelGroup,
} from '@/components/ui/side-panel'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useListUrlState } from '@/components/ui/list-url-state'
import { cn } from '@/lib/utils'
import { EmptyState } from '@/components/dashboard/empty-state'
import { PriceBookItemDialog } from '@/components/price-book/price-book-item-dialog'
import { PriceBookImportWizard } from '@/components/price-book/import-wizard'
import { BulkAdjustDialog } from '@/components/price-book/bulk-adjust-dialog'
import {
  deletePriceBookItem,
  deletePriceBookItems,
  createFolder,
  updateFolder,
  deleteFolderWithItems,
  reorderFolders,
} from '@/lib/actions/price-book'
import type { PriceBookItem, PriceBookFolder } from '@/lib/queries/price-book'
import { DEFAULT_CURRENCY_CODE, formatMoney } from '@/lib/money/currency'
import { useTranslation } from '@/lib/i18n/use-translation'
import { usePaywallReadOnly } from '@/components/billing/paywall-read-only'

interface PriceBookListProps {
  items: PriceBookItem[]
  folders: PriceBookFolder[]
  companyId?: string
  currencyCode?: string
}

/** Category filter values: every category, one folder id, or the virtual Uncategorized. */
const ALL_KEY = 'all'
const UNCATEGORIZED_KEY = 'uncategorized'

/** The category list gets a filter box once it no longer fits at a glance
 *  (counted over the real categories; the "All" row does not count). */
const CATEGORY_FILTER_MIN = 7

type Category = {
  key: string
  id: string | null
  name: string
  count: number
  isVirtual: boolean
}

type Section = Category & { items: PriceBookItem[] }

/** Desktop row grid: checkbox · service · unit · price. */
const ROW_GRID = 'md:grid md:grid-cols-[20px_minmax(0,1fr)_7.5rem_7.5rem] md:gap-4'

/**
 * The Price Book: one responsive layout for phone and desktop.
 *
 * Desktop: a panel with the categories in a sticky column on the left (with a
 * filter once there are many) and the selected category's services on the
 * right. Phone: the same list full width, with a category picker in a bottom
 * sheet next to the search. Each service is ONE row element on every screen
 * (no duplicated table + card trees); tapping it opens the editor, and in
 * selection mode it toggles the checkbox instead.
 */
export function PriceBookList({
  items,
  folders,
  currencyCode = DEFAULT_CURRENCY_CODE,
}: PriceBookListProps) {
  const router = useRouter()
  const { t } = useTranslation()
  // Paywalled: the server refuses every price-book write, so the list is for
  // reading only (no add, import, adjust, rename, delete or selection).
  const readOnly = usePaywallReadOnly()
  // Search and the category filter live in the URL like every list (Back and
  // reload keep them). The category rides on the shared `tab` param.
  const url = useListUrlState()
  const [search, setSearchState] = useState(() => url.read('q') ?? '')
  function setSearch(value: string) {
    setSearchState(value)
    url.write({ q: value.trim() || null })
  }
  const [activeKeyState, setActiveKeyState] = useState(() => url.read('tab') ?? ALL_KEY)
  function selectCategory(key: string) {
    setActiveKeyState(key)
    url.write({ tab: key === ALL_KEY ? null : key })
    // Desktop: the services column is the only scroller; start the new category at its top.
    if (servicesRef.current) servicesRef.current.scrollTop = 0
  }
  // The desktop services column (the only scroller on md+).
  const servicesRef = useRef<HTMLDivElement>(null)

  // Folders as shown: the server order, reordered optimistically on a drop and
  // re-synced whenever the server sends a new list.
  const [folderState, setFolderState] = useState({ source: folders, list: folders })
  if (folderState.source !== folders) setFolderState({ source: folders, list: folders })
  const orderedFolders = folderState.list

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingItem, setEditingItem] = useState<PriceBookItem | null>(null)
  const [importDialogOpen, setImportDialogOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deletingItem, setDeletingItem] = useState<{
    id: string
    name: string
  } | null>(null)
  const [isPending, startTransition] = useTransition()
  const [adjustFolder, setAdjustFolder] = useState<{ id: string | null; name: string } | null>(null)
  const [adjustDialogOpen, setAdjustDialogOpen] = useState(false)

  // Bulk selection (quick-260718-t7d) — item ids selected for bulk delete.
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulkDeleteDialogOpen, setBulkDeleteDialogOpen] = useState(false)
  // Phone: checkboxes only show in selection mode (desktop shows them on hover).
  const [selectMode, setSelectMode] = useState(false)
  const selecting = selectMode || selected.size > 0

  // Folder state
  const [renamingFolderId, setRenamingFolderId] = useState<string | null>(null)
  const [renamingFolderValue, setRenamingFolderValue] = useState('')
  const [newFolderDialogOpen, setNewFolderDialogOpen] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const [deletingFolderId, setDeletingFolderId] = useState<string | null>(null)
  const [deleteFolderDialogOpen, setDeleteFolderDialogOpen] = useState(false)

  // Folders with a repeated name (case-insensitive, e.g. a seed that ran twice)
  // show once: the first one is kept and the repeats map to it, so their items
  // show and count under the kept category instead of vanishing.
  const { keptFolders, folderAlias, duplicateIds } = useMemo(() => {
    const byName = new Map<string, PriceBookFolder>()
    const alias = new Map<string, string>()
    const dupes = new Map<string, string[]>()
    const kept: PriceBookFolder[] = []
    for (const folder of orderedFolders) {
      const name = folder.name.toLowerCase()
      const first = byName.get(name)
      if (first) {
        alias.set(folder.id, first.id)
        dupes.set(first.id, [...(dupes.get(first.id) ?? []), folder.id])
      } else {
        byName.set(name, folder)
        kept.push(folder)
      }
    }
    return { keptFolders: kept, folderAlias: alias, duplicateIds: dupes }
  }, [orderedFolders])

  /** An item's category id, with a dropped duplicate folder mapped to the kept one. */
  const folderOf = (item: PriceBookItem): string | null => {
    const id = item.folder_id ?? null
    return id ? (folderAlias.get(id) ?? id) : null
  }

  // Every category with its UNFILTERED item count (the sidebar and the picker).
  const categories = useMemo<Category[]>(() => {
    const counts = new Map<string | null, number>()
    for (const item of items) {
      const id = item.folder_id ?? null
      const key = id ? (folderAlias.get(id) ?? id) : null
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
    const list: Category[] = keptFolders.map((folder) => ({
      key: folder.id,
      id: folder.id,
      name: folder.name,
      count: counts.get(folder.id) ?? 0,
      isVirtual: false,
    }))
    const uncategorized = counts.get(null) ?? 0
    if (uncategorized > 0) {
      list.push({ key: UNCATEGORIZED_KEY, id: null, name: 'Uncategorized', count: uncategorized, isVirtual: true })
    }
    return list
  }, [items, keptFolders, folderAlias])

  // A category that no longer exists (deleted, stale link) falls back to All.
  const activeKey = categories.some((c) => c.key === activeKeyState) ? activeKeyState : ALL_KEY
  const activeCategory = categories.find((c) => c.key === activeKey) ?? null

  // Filter FIRST (Pitfall 4: order matters — group depends on filtered)
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return items
    return items.filter(
      (item) =>
        item.name.toLowerCase().includes(q) ||
        (item.folder_name ?? '').toLowerCase().includes(q)
    )
  }, [items, search])

  // The sections on screen: the active category, or every category that has
  // something to show (an empty category only appears when it is selected).
  const sections = useMemo<Section[]>(() => {
    const byFolder = new Map<string | null, PriceBookItem[]>()
    for (const item of filtered) {
      const key = folderOf(item)
      const list = byFolder.get(key) ?? []
      list.push(item)
      byFolder.set(key, list)
    }
    const all = categories.map((c) => ({ ...c, items: byFolder.get(c.id) ?? [] }))
    if (activeKey !== ALL_KEY) return all.filter((s) => s.key === activeKey)
    return all.filter((s) => s.items.length > 0)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- folderOf only reads folderAlias
  }, [filtered, categories, activeKey, folderAlias])

  const visibleCount = sections.reduce((n, s) => n + s.items.length, 0)

  // Total (UNFILTERED) items in the category pending deletion — drives the
  // Delete Category dialog copy (quick-260718-d2f).
  const deletingFolderItemCount = useMemo(
    () => (deletingFolderId ? items.filter((i) => i.folder_id === deletingFolderId).length : 0),
    [items, deletingFolderId]
  )

  function handleAddItem() {
    setEditingItem(null)
    setDialogOpen(true)
  }

  function handleEditItem(item: PriceBookItem) {
    setEditingItem(item)
    setDialogOpen(true)
  }

  function handleRowTap(item: PriceBookItem) {
    if (selecting) toggleItemSelected(item.id, !selected.has(item.id))
    else handleEditItem(item)
  }

  function handleDialogChange(open: boolean) {
    setDialogOpen(open)
    if (!open) {
      setEditingItem(null)
      router.refresh()
    }
  }

  function handleImportClose(open: boolean) {
    setImportDialogOpen(open)
    if (!open) router.refresh()
  }

  function handleAdjustFolder(folderId: string | null, folderName: string) {
    setAdjustFolder({ id: folderId, name: folderName })
    setAdjustDialogOpen(true)
  }

  function handleAdjustClose(open: boolean) {
    setAdjustDialogOpen(open)
    if (!open) setAdjustFolder(null)
  }

  function handleDeletePrompt(item: PriceBookItem) {
    setDeletingItem({ id: item.id, name: item.name })
    setDeleteDialogOpen(true)
  }

  /** Delete from inside the editor: close it, then confirm. */
  function handleDeleteFromDialog(item: PriceBookItem) {
    setDialogOpen(false)
    setEditingItem(null)
    handleDeletePrompt(item)
  }

  function handleDeleteCategory(folderId: string) {
    // Dual function (quick-260718-d2f): with a selection, delete the selected
    // items; with none, delete the category together with all its items.
    if (selected.size > 0) {
      setBulkDeleteDialogOpen(true)
    } else {
      setDeletingFolderId(folderId)
      setDeleteFolderDialogOpen(true)
    }
  }

  function startRename(folderId: string, folderName: string) {
    setRenamingFolderId(folderId)
    setRenamingFolderValue(folderName)
  }

  // --- Bulk selection handlers (quick-260718-t7d) ---

  function toggleItemSelected(itemId: string, checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (checked) next.add(itemId)
      else next.delete(itemId)
      return next
    })
  }

  /** Select/deselect every VISIBLE (search-filtered) item of one category. */
  function toggleFolderSelected(folderItems: PriceBookItem[], checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev)
      for (const item of folderItems) {
        if (checked) next.add(item.id)
        else next.delete(item.id)
      }
      return next
    })
  }

  function folderSelectionState(folderItems: PriceBookItem[]): boolean | 'indeterminate' {
    if (folderItems.length === 0) return false
    const count = folderItems.reduce((n, i) => n + (selected.has(i.id) ? 1 : 0), 0)
    if (count === 0) return false
    if (count === folderItems.length) return true
    return 'indeterminate'
  }

  function clearSelection() {
    setSelected(new Set())
    setSelectMode(false)
  }

  function handleConfirmBulkDelete() {
    const ids = Array.from(selected)
    if (ids.length === 0) return
    startTransition(async () => {
      const result = await deletePriceBookItems(ids)
      if ('error' in result && result.error) {
        toast.error(result.error)
      } else {
        toast.success(t('Deleted'))
        clearSelection()
        router.refresh()
      }
      setBulkDeleteDialogOpen(false)
    })
  }

  function handleConfirmDelete() {
    if (!deletingItem) return
    const target = deletingItem
    startTransition(async () => {
      const result = await deletePriceBookItem(target.id)
      if (result.error) {
        toast.error(result.error)
      } else {
        toast.success(`"${target.name}" ${t('deleted')}`)
        setSelected((prev) => {
          if (!prev.has(target.id)) return prev
          const next = new Set(prev)
          next.delete(target.id)
          return next
        })
        router.refresh()
      }
      setDeleteDialogOpen(false)
      setDeletingItem(null)
    })
  }

  /**
   * Save a new category order. `orderedKeys` are the kept real categories in
   * their new order; folders hidden as duplicates ride along right after the
   * folder they were merged into, so the server gets every folder id.
   */
  function applyCategoryOrder(orderedKeys: string[]) {
    const previous = orderedFolders
    const byId = new Map(orderedFolders.map((f) => [f.id, f]))
    const ids = orderedKeys.flatMap((id) => [id, ...(duplicateIds.get(id) ?? [])])
    const next = ids.map((id) => byId.get(id)).filter((f): f is PriceBookFolder => !!f)
    if (next.length !== orderedFolders.length) return
    setFolderState((state) => ({ ...state, list: next }))
    startTransition(async () => {
      const result = await reorderFolders(ids)
      if ('error' in result && result.error) {
        setFolderState((state) => ({ ...state, list: previous }))
        toast.error(t('Could not reorder the categories.'))
      } else {
        router.refresh()
      }
    })
  }

  function moveCategory(key: string, direction: -1 | 1) {
    const keys = categories.filter((c) => !c.isVirtual).map((c) => c.key)
    const from = keys.indexOf(key)
    const to = from + direction
    if (from < 0 || to < 0 || to >= keys.length) return
    ;[keys[from], keys[to]] = [keys[to], keys[from]]
    applyCategoryOrder(keys)
  }

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
    const hadItems = deletingFolderItemCount > 0
    startTransition(async () => {
      const result = await deleteFolderWithItems(deletingFolderId)
      if (result.error) { toast.error(result.error); return }
      toast.success(hadItems ? t('Category and its items deleted') : t('Category deleted'))
      setDeleteFolderDialogOpen(false)
      setDeletingFolderId(null)
      router.refresh()
    })
  }

  // Empty state — no items at all
  if (items.length === 0 && folders.length === 0) {
    return (
      <>
        <EmptyState
          icon={BookOpen}
          title={t('No price book items yet')}
          description={t('Add your pricing standards and the AI will use them as anchors when generating estimates. Leaving this empty is fine | the AI will use market estimates instead.')}
          actionLabel={readOnly ? undefined : t('Add first item')}
          onAction={readOnly ? undefined : handleAddItem}
        />
        {!readOnly && (
          <div className="flex justify-center -mt-4">
            <Button variant="outline" onClick={() => setImportDialogOpen(true)}>
              <Upload className="h-4 w-4 mr-2" />
              {t('Import CSV')}
            </Button>
          </div>
        )}
        <PriceBookItemDialog
          open={dialogOpen}
          onOpenChange={handleDialogChange}
          item={editingItem}
          currencyCode={currencyCode}
          folders={folders}
        />
        <PriceBookImportWizard
          open={importDialogOpen}
          onOpenChange={handleImportClose}
          currencyCode={currencyCode}
        />
      </>
    )
  }

  const realCategoryCount = categories.filter((c) => !c.isVirtual).length
  const realCategoryKeys = categories.filter((c) => !c.isVirtual).map((c) => c.key)

  const categoryGroups: SidePanelGroup[] = [
    {
      key: 'categories',
      items: [
        { key: ALL_KEY, label: t('All categories'), icon: LayoutList, count: items.length },
        ...categories.map((c) => ({
          key: c.key,
          label: c.isVirtual ? t(c.name) : c.name,
          count: c.count,
        })),
      ],
    },
  ]
  const categoryTestId = (key: string) => `category-filter-${key}`
  const categoryReorder = readOnly
    ? undefined
    : { fixedKeys: [ALL_KEY, UNCATEGORIZED_KEY], onReorder: applyCategoryOrder }
  const filterThreshold = CATEGORY_FILTER_MIN + 1

  const newCategoryButton = (after?: () => void) =>
    readOnly ? undefined : (
      <button
        type="button"
        onClick={() => { after?.(); setNewFolderDialogOpen(true) }}
        className="flex min-h-11 w-full items-center gap-2 rounded-[var(--radius-md)] px-3 text-sm text-muted-foreground transition-colors hover:bg-[var(--glass-bg-light)] hover:text-foreground md:min-h-9"
      >
        <FolderPlus className="h-4 w-4" aria-hidden />
        {t('New Category')}
      </button>
    )

  return (
    <>
      {/* Desktop: one panel (header, then categories | services). Phone: the
          same content flat on the page, so the list gets the full width. No
          backdrop blur anywhere: a blurred element as tall as the list inside
          the scrolling <main> froze scrolling on phones. */}
      <div className="md:flex md:min-h-0 md:flex-1 md:flex-col md:overflow-hidden md:rounded-[var(--radius-lg)] md:border md:border-[var(--glass-border)] md:bg-[var(--glass-bg)] md:shadow-[var(--shadow-glass)]">
        {/* Header: fixed on desktop (only the services column scrolls). */}
        <div className="flex flex-wrap items-center gap-x-2 gap-y-3 md:shrink-0 md:border-b md:border-[var(--glass-border)] md:px-5 md:py-4">
          <div className="min-w-0 flex-1">
            <h2 className="text-xl font-semibold tracking-[-0.015em] sm:text-2xl">{t('Price Book')}</h2>
            <p className="text-sm text-muted-foreground" data-testid="price-book-summary">
              {items.length} {items.length === 1 ? t('service') : t('services')}
              {' · '}
              {realCategoryCount} {realCategoryCount === 1 ? t('category') : t('categories')}
            </p>
          </div>

          {/* Search: own full-width line on a phone (with the category picker),
              inline in the header from md up. */}
          <div className="order-last flex w-full min-w-0 items-center gap-2 md:order-none md:w-64">
            <ListSearch
              className="min-w-0 flex-1"
              value={search}
              onChange={setSearch}
              placeholder={t('Search items...')}
            />
            <SidePanelMobilePicker
              title={t('Categories')}
              fallbackLabel={t('All categories')}
              description={t('Show the services of one category.')}
              groups={categoryGroups}
              activeKey={activeKey}
              onSelect={selectCategory}
              pinnedKeys={[ALL_KEY]}
              filterThreshold={filterThreshold}
              filterLabel={t('Filter categories')}
              noMatchesLabel={t('No categories match')}
              getItemTestId={categoryTestId}
              testId="category-picker-btn"
              footer={(close) => newCategoryButton(close)}
            />
          </div>

          {!readOnly && (
          <div className="flex shrink-0 items-center gap-2">
            <Button variant="outline" size="sm" className={cn(TOOLBAR_CONTROL, 'hidden md:inline-flex')} onClick={() => setImportDialogOpen(true)}>
              <Upload className="h-4 w-4" />
              {t('Import CSV')}
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon-sm" className={cn(TOOLBAR_CONTROL, 'size-9 md:hidden')} aria-label={t('More actions')}>
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => setSelectMode(true)}>
                  <CheckSquare className="h-4 w-4" />
                  {t('Select items')}
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setNewFolderDialogOpen(true)}>
                  <FolderPlus className="h-4 w-4" />
                  {t('New Category')}
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setImportDialogOpen(true)}>
                  <Upload className="h-4 w-4" />
                  {t('Import CSV')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            {/* Round "+" on a phone, labelled button from sm up (one element, so
                the accessible name is always "Add Service"). */}
            <Button variant="primary" size="sm" className="size-9 rounded-full p-0 sm:h-9 sm:w-auto sm:rounded-lg sm:px-3" onClick={handleAddItem}>
              <Plus className="h-4 w-4" />
              <span className="sr-only sm:not-sr-only">{t('Add Service')}</span>
            </Button>
          </div>
          )}
        </div>

        <div className="mt-4 md:mt-0 md:flex md:min-h-0 md:flex-1">
          {/* Desktop category column: full height, never moves; collapses to a rail. */}
          <SidePanelColumn
            id="price-book"
            title={t('Categories')}
            groups={categoryGroups}
            activeKey={activeKey}
            onSelect={selectCategory}
            pinnedKeys={[ALL_KEY]}
            filterThreshold={filterThreshold}
            filterLabel={t('Filter categories')}
            noMatchesLabel={t('No categories match')}
            getItemTestId={categoryTestId}
            reorder={categoryReorder}
            footer={newCategoryButton()}
            footerCollapsed={
              readOnly ? undefined : (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={() => setNewFolderDialogOpen(true)}
                      aria-label={t('New Category')}
                      className="flex size-8 items-center justify-center rounded-[var(--radius-md)] text-muted-foreground transition-colors hover:bg-[var(--glass-bg-light)] hover:text-foreground"
                    >
                      <FolderPlus className="size-4" aria-hidden />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="right">{t('New Category')}</TooltipContent>
                </Tooltip>
              )
            }
          />

          {/* The services: the only scroller on md+. On a phone the page scrolls. */}
          <div ref={servicesRef} className="min-w-0 space-y-6 md:min-h-0 md:flex-1 md:overflow-y-auto md:p-5">
            {/* No results from search */}
            {search.trim() && visibleCount === 0 && (
              <EmptyState
                icon={Search}
                title={t('No items match your search')}
                description={t('Try a different search term')}
                onClearFilter={() => setSearch('')}
              />
            )}

            {sections.map((section) => {
              const folderId = section.id
              const folderName = section.name
              const folderItems = section.items
              const testKey = folderId ?? 'uncategorized'
              const isRenaming = folderId !== null && folderId === renamingFolderId
              const selState = folderSelectionState(folderItems)

              return (
                <section key={section.key} aria-label={folderName} className="space-y-2">
                  {/* Category header — sticky on a phone so you always know where you are. */}
                  <div className="sticky top-0 z-10 -mx-4 flex min-h-11 items-center gap-2 bg-background px-4 py-1.5 md:static md:mx-0 md:min-h-9 md:bg-transparent md:px-0 md:py-0">
                    {isRenaming ? (
                      <Input
                        autoFocus
                        enterKeyHint="done"
                        className="h-8 max-w-60 text-sm"
                        value={renamingFolderValue}
                        onChange={(e) => setRenamingFolderValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleRenameConfirm(folderId!)
                          if (e.key === 'Escape') setRenamingFolderId(null)
                        }}
                        onBlur={() => handleRenameConfirm(folderId!)}
                      />
                    ) : (
                      <h3 className="flex min-w-0 flex-1 items-baseline gap-2 text-sm font-semibold md:text-base" title={folderName}>
                        <span className="truncate">{folderName}</span>
                        <span className="shrink-0 text-xs font-normal text-muted-foreground tabular-nums md:text-sm">
                          {folderItems.length}
                        </span>
                      </h3>
                    )}

                    {/* Desktop: the category's actions inline. */}
                    {!readOnly && (
                    <div className="ml-auto hidden shrink-0 items-center gap-1 md:flex">
                      {folderItems.length > 0 && (
                        // Select-all for this category's VISIBLE items — icon button,
                        // not a checkbox (quick-260718-s8a): click selects all; when
                        // everything is already selected, click deselects.
                        <Button
                          variant="ghost"
                          size="icon"
                          className={cn('size-8 rounded-lg', selState === false ? 'text-muted-foreground hover:text-foreground' : 'text-primary hover:text-primary')}
                          onClick={() => toggleFolderSelected(folderItems, selState !== true)}
                          aria-label={`${t('Select all in')} ${folderName}`}
                          aria-pressed={selState === true}
                          title={selState === true ? t('Deselect all') : t('Select all')}
                          data-testid={`select-all-folder-${testKey}`}
                        >
                          <ListChecks className="h-4 w-4" />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 gap-1 rounded-lg px-2 text-muted-foreground hover:text-foreground"
                        disabled={folderItems.length === 0}
                        onClick={() => handleAdjustFolder(folderId, folderName)}
                        data-testid={`adjust-btn-folder-${testKey}`}
                        aria-label={t('Adjust prices by %')}
                      >
                        <Percent className="h-3.5 w-3.5" />
                        {t('Adjust %')}
                      </Button>
                      {!section.isVirtual && !isRenaming && (
                        <>
                          <Button
                            variant="ghost" size="icon" className="size-8 rounded-lg text-muted-foreground hover:text-foreground"
                            aria-label={t('Rename category')}
                            title={t('Rename category')}
                            onClick={() => startRename(folderId!, folderName)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost" size="icon" className="size-8 rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                            aria-label={selected.size > 0 ? t('Delete selected items') : t('Delete category')}
                            title={selected.size > 0 ? t('Delete selected items') : t('Delete category')}
                            data-testid={`delete-folder-btn-${folderId}`}
                            onClick={() => handleDeleteCategory(folderId!)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </>
                      )}
                    </div>

                    )}

                    {/* Phone: the same actions behind one ⋯. */}
                    {!isRenaming && !readOnly && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="-mr-2 ml-auto size-10 shrink-0 rounded-lg text-muted-foreground md:hidden" aria-label={`${t('Category actions')}: ${folderName}`}>
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {folderItems.length > 0 && (
                            <DropdownMenuItem onSelect={() => { setSelectMode(true); toggleFolderSelected(folderItems, selState !== true) }}>
                              <ListChecks className="h-4 w-4" />
                              {selState === true ? t('Deselect all') : t('Select all')}
                            </DropdownMenuItem>
                          )}
                          {folderItems.length > 0 && (
                            <DropdownMenuItem onSelect={() => handleAdjustFolder(folderId, folderName)}>
                              <Percent className="h-4 w-4" />
                              {t('Adjust prices by %')}
                            </DropdownMenuItem>
                          )}
                          {!section.isVirtual && (
                            <>
                              <DropdownMenuItem
                                disabled={realCategoryKeys.indexOf(section.key) <= 0}
                                onSelect={() => moveCategory(section.key, -1)}
                              >
                                <ArrowUp className="h-4 w-4" />
                                {t('Move up')}
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                disabled={realCategoryKeys.indexOf(section.key) >= realCategoryKeys.length - 1}
                                onSelect={() => moveCategory(section.key, 1)}
                              >
                                <ArrowDown className="h-4 w-4" />
                                {t('Move down')}
                              </DropdownMenuItem>
                              <DropdownMenuItem onSelect={() => startRename(folderId!, folderName)}>
                                <Pencil className="h-4 w-4" />
                                {t('Rename category')}
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem variant="destructive" onSelect={() => handleDeleteCategory(folderId!)}>
                                <Trash2 className="h-4 w-4" />
                                {selected.size > 0 ? t('Delete selected items') : t('Delete category')}
                              </DropdownMenuItem>
                            </>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </div>

                  {folderItems.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-[var(--glass-border)] px-4 py-8 text-center text-sm text-muted-foreground">
                      <p>{t('No services in this category yet.')}</p>
                      {!readOnly && (
                        <Button variant="outline" size="sm" className="mt-3" onClick={handleAddItem}>
                          <Plus className="h-4 w-4" />
                          {t('Add Service')}
                        </Button>
                      )}
                    </div>
                  ) : (
                    <div className="overflow-hidden rounded-xl border border-[var(--glass-border)] bg-card md:rounded-lg md:bg-transparent">
                      <div className={cn('hidden border-b border-[var(--glass-border)] px-4 py-2 text-xs font-medium text-muted-foreground', ROW_GRID)} aria-hidden="true">
                        <span />
                        <span>{t('Service')}</span>
                        <span>{t('Unit')}</span>
                        <span className="text-right">{t('Price')}</span>
                      </div>
                      <ul>
                        {folderItems.map((item) => (
                          <PriceRow
                            key={item.id}
                            item={item}
                            isSelected={selected.has(item.id)}
                            selecting={selecting}
                            selectable={!readOnly}
                            onToggle={(checked) => toggleItemSelected(item.id, checked)}
                            onTap={() => handleRowTap(item)}
                            selectLabel={`${t('Select')} ${item.name}`}
                          />
                        ))}
                      </ul>
                    </div>
                  )}
                </section>
              )
            })}

            {/* Bulk action bar: lives in the services column so it stays visible
                while that column scrolls (md+); on a phone it clears the fixed
                bottom nav. */}
            {selecting && !readOnly && (
              <div className="pointer-events-none sticky bottom-[calc(5rem_+_env(safe-area-inset-bottom,_0px))] z-30 flex justify-center md:bottom-3">
                <div className="pointer-events-auto flex items-center gap-2 rounded-full border border-border bg-background py-1.5 pl-4 pr-1.5 shadow-xl">
                  <span className="text-sm font-medium">
                    {selected.size} {t('selected')}
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="rounded-full"
                    onClick={clearSelection}
                  >
                    {selected.size > 0 ? t('Clear') : t('Done')}
                  </Button>
                  {selected.size > 0 && (
                    <Button
                      size="sm"
                      variant="destructive"
                      className="rounded-full gap-1.5"
                      onClick={() => setBulkDeleteDialogOpen(true)}
                      data-testid="bulk-delete-btn"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      {t('Delete')}
                    </Button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Add/Edit Dialog */}
      <PriceBookItemDialog
        open={dialogOpen}
        onOpenChange={handleDialogChange}
        item={editingItem}
        currencyCode={currencyCode}
        folders={folders}
        defaultFolderId={activeCategory?.id ?? null}
        onDelete={handleDeleteFromDialog}
      />

      {/* Bulk Delete Confirmation — permanent, there is no Trash */}
      <AlertDialog open={bulkDeleteDialogOpen} onOpenChange={setBulkDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('Delete selected items')}</AlertDialogTitle>
            <AlertDialogDescription>
              {`${t('Permanently delete')} ${selected.size} ${selected.size === 1 ? t('item') : t('items')}? ${t('This cannot be undone.')}`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>{t('Cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmBulkDelete}
              disabled={isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isPending ? t('Deleting...') : t('Delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Item Confirmation */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('Delete Item')}</AlertDialogTitle>
            <AlertDialogDescription>
              {deletingItem
                ? `${t('Permanently delete')} "${deletingItem.name}"? ${t('This cannot be undone.')}`
                : ''}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>{t('Cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              disabled={isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isPending ? t('Deleting...') : t('Delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Folder Confirmation */}
      <AlertDialog open={deleteFolderDialogOpen} onOpenChange={setDeleteFolderDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('Delete Category')}</AlertDialogTitle>
            <AlertDialogDescription>
              {deletingFolderItemCount > 0
                ? `${t('This will delete the category and permanently delete its')} ${deletingFolderItemCount} ${deletingFolderItemCount === 1 ? t('item') : t('items')}. ${t('This cannot be undone.')}`
                : t('This will delete the empty category.')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>{t('Cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDeleteFolder}
              disabled={isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isPending ? t('Deleting...') : t('Delete Category')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* New Folder Dialog */}
      <Dialog open={newFolderDialogOpen} onOpenChange={setNewFolderDialogOpen}>
        <BottomSheetContent desktopClassName="sm:max-w-sm">
          <DialogHeader
            data-sheet-drag=""
            className="flex shrink-0 touch-none flex-row items-center justify-between gap-3 pl-5 pr-3 pt-1 pb-1 text-left sm:px-6 sm:pt-5"
          >
            <DialogTitle className="text-[19px] leading-tight font-semibold tracking-tight">{t('New Category')}</DialogTitle>
            <BottomSheetCloseButton label={t('Close')} />
            <DialogDescription className="sr-only">
              {t('Enter a name for the new price book category.')}
            </DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4 sm:px-6">
            <Input
              placeholder={t('Category name...')}
              enterKeyHint="done"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleCreateFolder() }}
              autoFocus
            />
          </div>
          <div className="flex shrink-0 justify-end gap-2 border-t bg-background px-5 py-3 sm:px-6">
            <Button variant="outline" onClick={() => setNewFolderDialogOpen(false)}>
              {t('Cancel')}
            </Button>
            <Button onClick={handleCreateFolder} disabled={!newFolderName.trim() || isPending}>
              {t('Create')}
            </Button>
          </div>
        </BottomSheetContent>
      </Dialog>

      {/* Import CSV Wizard (Phase 76) */}
      <PriceBookImportWizard
        open={importDialogOpen}
        onOpenChange={handleImportClose}
        currencyCode={currencyCode}
      />

      {/* Bulk Adjust Dialog — items from UNFILTERED source (Pitfall 7) */}
      {adjustFolder !== null && (
        <BulkAdjustDialog
          open={adjustDialogOpen}
          onOpenChange={handleAdjustClose}
          folderId={adjustFolder.id}
          folderName={adjustFolder.name}
          items={items.filter((i) => folderOf(i) === adjustFolder.id)}
        />
      )}
    </>
  )
}

/**
 * One service, as a single element on every screen. Phone: name (up to two
 * lines) over its unit, price on the right. Desktop: a grid row with Unit and
 * Price columns and a checkbox that appears on hover. The whole row is the
 * edit button (or the select toggle while selecting).
 */
function PriceRow({
  item,
  isSelected,
  selecting,
  selectable = true,
  onToggle,
  onTap,
  selectLabel,
}: {
  item: PriceBookItem
  isSelected: boolean
  selecting: boolean
  /** False hides the select checkbox (paywalled: nothing to do with a selection). */
  selectable?: boolean
  onToggle: (checked: boolean) => void
  onTap: () => void
  selectLabel: string
}) {
  return (
    <li
      data-state={isSelected ? 'selected' : undefined}
      className={cn(
        'group relative flex items-center gap-3 border-b border-[var(--glass-border)] px-3 py-3 transition-colors last:border-b-0 hover:bg-muted/40 data-[state=selected]:bg-primary/5 md:px-4 md:py-2.5',
        ROW_GRID,
      )}
    >
      <label
        className={cn(
          'relative z-10 -m-2 shrink-0 cursor-pointer items-center justify-center p-2',
          !selectable
            ? 'hidden md:invisible md:flex' // keeps the grid's checkbox column
            : selecting
              ? 'flex'
              : 'hidden md:flex md:opacity-0 md:transition-opacity md:group-hover:opacity-100 md:focus-within:opacity-100',
        )}
        aria-hidden={selectable ? undefined : true}
      >
        <Checkbox
          checked={isSelected}
          onCheckedChange={(checked) => onToggle(checked === true)}
          aria-label={selectLabel}
        />
      </label>

      <button
        type="button"
        onClick={onTap}
        className="flex min-w-0 flex-1 items-center gap-3 text-left outline-none after:absolute after:inset-0 focus-visible:after:ring-2 focus-visible:after:ring-inset focus-visible:after:ring-ring"
      >
        {item.image_url && (
          // eslint-disable-next-line @next/next/no-img-element -- user-uploaded storage image with a saved crop
          <img
            src={item.image_url}
            alt=""
            loading="lazy"
            className="size-10 shrink-0 rounded-md object-cover md:size-8"
            style={item.image_position ? {
              objectPosition: `${50 + item.image_position.x}% ${50 + item.image_position.y}%`,
              transform: `scale(${item.image_position.scale})`,
            } : undefined}
          />
        )}
        <span className="min-w-0">
          <span className="line-clamp-2 text-[15px] font-medium leading-snug md:line-clamp-1 md:text-sm">{item.name}</span>
          {item.unit && (
            <span className="mt-0.5 block truncate text-xs text-muted-foreground md:hidden">{item.unit}</span>
          )}
        </span>
      </button>

      <span className="hidden truncate text-sm text-muted-foreground md:block">{item.unit || '—'}</span>
      <span className="shrink-0 text-right text-[15px] font-semibold tabular-nums md:text-sm md:font-medium">
        {formatMoney(item.unit_price, item.currency_code)}
      </span>
    </li>
  )
}
