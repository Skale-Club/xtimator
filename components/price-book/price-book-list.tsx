'use client'

import { useState, useMemo, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  BookOpen,
  Search,
  MoreHorizontal,
  Percent,
  Plus,
  Upload,
  ImageIcon,
  ChevronDown,
  ChevronRight,
  Pencil,
  Trash2,
  FolderPlus,
  FolderOpen,
  ListChecks,
} from 'lucide-react'
import { toast } from 'sonner'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
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
import { Card, CardContent } from '@/components/ui/card'
import { ListSearch, TOOLBAR_CONTROL } from '@/components/ui/list-toolbar'
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
} from '@/lib/actions/price-book'
import type { PriceBookItem, PriceBookFolder } from '@/lib/queries/price-book'
import { DEFAULT_CURRENCY_CODE, formatMoney } from '@/lib/money/currency'
import { useTranslation } from '@/lib/i18n/use-translation'

interface PriceBookListProps {
  items: PriceBookItem[]
  folders: PriceBookFolder[]
  companyId?: string
  currencyCode?: string
}

export function PriceBookList({
  items,
  folders,
  currencyCode = DEFAULT_CURRENCY_CODE,
}: PriceBookListProps) {
  const router = useRouter()
  const { t } = useTranslation()
  // Search lives in the URL like every list (Back and reload keep it).
  const url = useListUrlState()
  const [search, setSearchState] = useState(() => url.read('q') ?? '')
  function setSearch(value: string) {
    setSearchState(value)
    url.write({ q: value.trim() || null })
  }
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

  // Folder state
  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(new Set())
  const [renamingFolderId, setRenamingFolderId] = useState<string | null>(null)
  const [renamingFolderValue, setRenamingFolderValue] = useState('')
  const [newFolderDialogOpen, setNewFolderDialogOpen] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const [deletingFolderId, setDeletingFolderId] = useState<string | null>(null)
  const [deleteFolderDialogOpen, setDeleteFolderDialogOpen] = useState(false)

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

  // Group filtered items by folder_id
  const groupedByFolder = useMemo(() => {
    const map = new Map<string | null, PriceBookItem[]>()
    for (const item of filtered) {
      const key = item.folder_id ?? null
      const list = map.get(key) ?? []
      list.push(item)
      map.set(key, list)
    }
    return map
  }, [filtered])

  // Build display-order folder sections: named folders first (sorted by sort_order/name), Uncategorized last
  const folderSections = useMemo(() => {
    const sections: Array<{
      id: string | null
      name: string
      items: PriceBookItem[]
      isVirtual: boolean
    }> = []
    // Deduplicate by name (case-insensitive) — protects against duplicate DB rows
    // that can occur when the seed ran more than once due to a partial failure.
    const seenNames = new Set<string>()
    for (const folder of folders) {
      const key = folder.name.toLowerCase()
      if (seenNames.has(key)) continue
      seenNames.add(key)
      const folderItems = groupedByFolder.get(folder.id) ?? []
      sections.push({ id: folder.id, name: folder.name, items: folderItems, isVirtual: false })
    }
    // Virtual uncategorized — items with folder_id === null
    const uncatItems = groupedByFolder.get(null) ?? []
    if (uncatItems.length > 0) {
      sections.push({ id: null, name: 'Uncategorized', items: uncatItems, isVirtual: true })
    }
    return sections
  }, [folders, groupedByFolder])

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

  function handleConfirmBulkDelete() {
    const ids = Array.from(selected)
    if (ids.length === 0) return
    startTransition(async () => {
      const result = await deletePriceBookItems(ids)
      if ('error' in result && result.error) {
        toast.error(result.error)
      } else {
        toast.success(t('Deleted'))
        setSelected(new Set())
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
          actionLabel={t('Add first item')}
          onAction={handleAddItem}
        />
        <div className="flex justify-center -mt-4">
          <Button variant="outline" onClick={() => setImportDialogOpen(true)}>
            <Upload className="h-4 w-4 mr-2" />
            {t('Import CSV')}
          </Button>
        </div>
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

  return (
    <>
      {/* Same layout as the shared list header: one row on wide screens (title,
          search that shrinks to fit, actions); on smaller ones the search takes
          its own full-width line and the secondary actions fold into a ⋯ menu. */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-3">
        <h2 className="min-h-9 min-w-0 flex-1 content-center text-xl font-semibold tracking-[-0.015em] sm:text-2xl lg:flex-none">
          {t('Price Book')}
        </h2>
        <div className="order-last flex w-full min-w-0 items-center lg:order-none lg:w-auto lg:flex-1 lg:justify-end">
          <ListSearch
            className="min-w-0 flex-1 lg:max-w-64"
            value={search}
            onChange={setSearch}
            placeholder={t('Search items...')}
          />
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button variant="outline" size="sm" className={cn(TOOLBAR_CONTROL, 'hidden lg:inline-flex')} onClick={() => setNewFolderDialogOpen(true)}>
            <FolderPlus className="h-4 w-4" />
            {t('New Category')}
          </Button>
          <Button variant="outline" size="sm" className={cn(TOOLBAR_CONTROL, 'hidden lg:inline-flex')} onClick={() => setImportDialogOpen(true)}>
            <Upload className="h-4 w-4" />
            {t('Import CSV')}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon-sm" className={cn(TOOLBAR_CONTROL, 'size-9 lg:hidden')} aria-label={t('More actions')}>
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
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
          <Button variant="primary" size="sm" className="h-9 rounded-lg" onClick={handleAddItem}>
            <Plus className="h-4 w-4" />
            {t('Add Service')}
          </Button>
        </div>
      </div>

      {/* No results from search */}
      {filtered.length === 0 && items.length > 0 && (
        <EmptyState
          icon={Search}
          title={t('No items match your search')}
          description={t('Try a different search term')}
          onClearFilter={() => setSearch('')}
        />
      )}

      {/* Folder sections */}
      {folderSections.length > 0 && (
        <div className="space-y-6">
          {folderSections.map(({ id: folderId, name: folderName, items: folderItems, isVirtual }) => {
            const isCollapsed = folderId ? collapsedFolders.has(folderId) : false
            // Only real folders (non-virtual) can be in renaming mode.
            // Guard against both being null (which would otherwise match).
            const isRenaming = folderId !== null && folderId === renamingFolderId

            return (
              <div key={folderId ?? '__uncategorized__'} className="space-y-4">
                {/* Folder header */}
                {/* flex-wrap: on a 360px phone the name + 5 action buttons cannot share a
                    line (the name was squeezed to "Plum…"), so the actions drop to
                    their own right-aligned line and the name gets the full width. */}
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b pb-2">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-10 rounded-lg md:size-8"
                    aria-label={isCollapsed ? t('Expand category') : t('Collapse category')}
                    onClick={() => {
                      if (!folderId) return
                      setCollapsedFolders((prev) => {
                        const next = new Set(prev)
                        if (next.has(folderId)) {
                          next.delete(folderId)
                        } else {
                          next.add(folderId)
                        }
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
                      enterKeyHint="done"
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
                    <span className="flex min-w-0 flex-1 basis-32 items-center gap-1.5 text-sm font-semibold" title={folderName}>
                      <FolderOpen className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <span className="truncate">{folderName}</span>
                      <span className="ml-1 shrink-0 font-normal text-muted-foreground">
                        ({folderItems.length})
                      </span>
                    </span>
                  )}

                  <div className="ml-auto flex shrink-0 items-center gap-0.5">
                    {/* Select-all for this category's VISIBLE items — icon button,
                        not a checkbox (quick-260718-s8a): click selects all; when
                        everything is already selected, click deselects. */}
                    {folderItems.length > 0 && (() => {
                      const selState = folderSelectionState(folderItems)
                      return (
                        <Button
                          variant="ghost"
                          size="icon"
                          className={`size-10 rounded-lg md:size-8 ${selState === false ? 'text-muted-foreground hover:text-foreground' : 'text-primary hover:text-primary'}`}
                          onClick={() => toggleFolderSelected(folderItems, selState !== true)}
                          aria-label={`${t('Select all in')} ${folderName}`}
                          aria-pressed={selState === true}
                          title={selState === true ? t('Deselect all') : t('Select all')}
                          data-testid={`select-all-folder-${folderId ?? 'uncategorized'}`}
                        >
                          <ListChecks className="h-4 w-4" />
                        </Button>
                      )
                    })()}
                    {!isVirtual && !isRenaming && (
                      <>
                        <Button
                          variant="ghost" size="icon" className="size-10 rounded-lg text-muted-foreground hover:text-foreground md:size-8"
                          aria-label={t('Rename category')}
                          onClick={() => {
                            setRenamingFolderId(folderId!)
                            setRenamingFolderValue(folderName)
                          }}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost" size="icon" className="size-10 rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive md:size-8"
                          aria-label={selected.size > 0 ? t('Delete selected items') : t('Delete category')}
                          data-testid={`delete-folder-btn-${folderId}`}
                          onClick={() => {
                            // Dual function (quick-260718-d2f): with a selection,
                            // delete the selected items; with none, delete the
                            // category together with all its items.
                            if (selected.size > 0) {
                              setBulkDeleteDialogOpen(true)
                            } else {
                              setDeletingFolderId(folderId!)
                              setDeleteFolderDialogOpen(true)
                            }
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      className={cn(TOOLBAR_CONTROL, 'ml-1.5 h-10 gap-1 px-2.5 md:h-8')}
                      disabled={folderItems.length === 0}
                      onClick={() => handleAdjustFolder(folderId, folderName)}
                      data-testid={`adjust-btn-folder-${folderId ?? 'uncategorized'}`}
                      aria-label={t('Adjust prices by %')}
                    >
                      <Percent className="h-3.5 w-3.5" />
                      {/* Icon-only on a phone so the category row stays one line. */}
                      <span className="hidden sm:inline">{t('Adjust %')}</span>
                    </Button>
                  </div>
                </div>

                {/* Items inside folder — desktop Table (md+) + mobile Card list (<md) */}
                {!isCollapsed && folderItems.length > 0 && (
                  <>
                    {/* Desktop: existing table preserved byte-for-byte, gated to md+ */}
                    <div className="hidden md:block pl-4">
                      <div className="rounded-md border">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="w-[40px]" />
                              <TableHead>{t('Item')}</TableHead>
                              <TableHead>{t('Unit')}</TableHead>
                              <TableHead>{t('Unit Price')}</TableHead>
                              <TableHead className="w-[50px]" />
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {folderItems.map((item) => (
                              <TableRow key={item.id} data-state={selected.has(item.id) ? 'selected' : undefined}>
                                <TableCell>
                                  <Checkbox
                                    checked={selected.has(item.id)}
                                    onCheckedChange={(checked) => toggleItemSelected(item.id, checked === true)}
                                    aria-label={`${t('Select')} ${item.name}`}
                                  />
                                </TableCell>
                                <TableCell className="font-medium">
                                  <div className="flex items-center gap-2">
                                    {item.image_url ? (
                                      <img
                                        src={item.image_url}
                                        alt={item.name}
                                        className="h-8 w-8 rounded object-cover shrink-0"
                                        style={item.image_position ? {
                                          objectPosition: `${50 + item.image_position.x}% ${50 + item.image_position.y}%`,
                                          transform: `scale(${item.image_position.scale})`,
                                        } : undefined}
                                      />
                                    ) : (
                                      <div className="h-8 w-8 rounded bg-muted flex items-center justify-center shrink-0">
                                        <ImageIcon className="h-4 w-4 text-muted-foreground" />
                                      </div>
                                    )}
                                    {item.name}
                                  </div>
                                </TableCell>
                                <TableCell className="text-muted-foreground">
                                  {item.unit || '—'}
                                </TableCell>
                                <TableCell>{formatMoney(item.unit_price, item.currency_code)}</TableCell>
                                <TableCell>
                                  <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-8 w-8"
                                      >
                                        <MoreHorizontal className="h-4 w-4" />
                                      </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end">
                                      <DropdownMenuItem onClick={() => handleEditItem(item)}>
                                        {t('Edit')}
                                      </DropdownMenuItem>
                                      <DropdownMenuItem
                                        className="text-destructive"
                                        onClick={() => handleDeletePrompt(item)}
                                      >
                                        {t('Delete')}
                                      </DropdownMenuItem>
                                    </DropdownMenuContent>
                                  </DropdownMenu>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </div>

                    {/* Mobile: card list (<md only) — no left indent to maximize narrow-screen width */}
                    <div className="md:hidden space-y-2">
                      {folderItems.map((item) => (
                        // py-0: Card ships py-6, which stacked on CardContent's p-3 made each
                        // row ~118px tall for a 40px thumbnail.
                        <Card key={item.id} className="py-0">
                          <CardContent className="flex items-center justify-between gap-3 p-3">
                            {/* Left: checkbox + thumb + name + price/unit */}
                            <div className="flex items-center gap-3 min-w-0 flex-1">
                              {/* The label widens the 16px checkbox's tap area to ~40px
                                  (the negative margin keeps the row layout unchanged). */}
                              <label className="-m-3 flex shrink-0 cursor-pointer items-center justify-center p-3">
                                <Checkbox
                                  checked={selected.has(item.id)}
                                  onCheckedChange={(checked) => toggleItemSelected(item.id, checked === true)}
                                  aria-label={`${t('Select')} ${item.name}`}
                                />
                              </label>
                              {item.image_url ? (
                                <img
                                  src={item.image_url}
                                  alt={item.name}
                                  className="h-10 w-10 rounded object-cover shrink-0"
                                  style={item.image_position ? {
                                    objectPosition: `${50 + item.image_position.x}% ${50 + item.image_position.y}%`,
                                    transform: `scale(${item.image_position.scale})`,
                                  } : undefined}
                                />
                              ) : (
                                <div className="h-10 w-10 rounded bg-muted flex items-center justify-center shrink-0">
                                  <ImageIcon className="h-4 w-4 text-muted-foreground" />
                                </div>
                              )}
                              <div className="min-w-0">
                                <p className="font-medium truncate">{item.name}</p>
                                <p className="truncate text-sm text-muted-foreground">
                                  {formatMoney(item.unit_price, item.currency_code)}
                                  {item.unit ? ` / ${item.unit}` : ''}
                                </p>
                              </div>
                            </div>

                            {/* Right: dropdown — same handlers as desktop */}
                            <div className="shrink-0">
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="ghost" size="icon" className="h-10 w-10" aria-label={t('Actions')}>
                                    <MoreHorizontal className="h-4 w-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem onClick={() => handleEditItem(item)}>
                                    {t('Edit')}
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    className="text-destructive"
                                    onClick={() => handleDeletePrompt(item)}
                                  >
                                    {t('Delete')}
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
              </div>
            )
          })}
        </div>
      )}

      {/* Bulk action bar (quick-260718-t7d) — appears when any items are selected */}
      {selected.size > 0 && (
        <div className="sticky bottom-3 z-30 flex justify-center pointer-events-none">
          <div className="pointer-events-auto flex items-center gap-2 rounded-full border border-border bg-background/95 py-1.5 pl-4 pr-1.5 shadow-xl backdrop-blur">
            <span className="text-sm font-medium">
              {selected.size} {t('selected')}
            </span>
            <Button
              size="sm"
              variant="ghost"
              className="rounded-full"
              onClick={() => setSelected(new Set())}
            >
              {t('Clear')}
            </Button>
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
          </div>
        </div>
      )}

      {/* Add/Edit Dialog */}
      <PriceBookItemDialog
        open={dialogOpen}
        onOpenChange={handleDialogChange}
        item={editingItem}
        currencyCode={currencyCode}
        folders={folders}
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
        <DialogContent className="sm:max-w-xs">
          <DialogHeader>
            <DialogTitle>{t('New Category')}</DialogTitle>
            <DialogDescription>
              {t('Enter a name for the new price book category.')}
            </DialogDescription>
          </DialogHeader>
          <Input
            placeholder={t('Category name...')}
            enterKeyHint="done"
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleCreateFolder() }}
            autoFocus
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewFolderDialogOpen(false)}>
              {t('Cancel')}
            </Button>
            <Button onClick={handleCreateFolder} disabled={!newFolderName.trim() || isPending}>
              {t('Create')}
            </Button>
          </DialogFooter>
        </DialogContent>
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
          items={items.filter((i) => (i.folder_id ?? null) === adjustFolder.id)}
        />
      )}
    </>
  )
}
