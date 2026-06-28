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
} from 'lucide-react'
import { toast } from 'sonner'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
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
import { EmptyState } from '@/components/dashboard/empty-state'
import { PriceBookItemDialog } from '@/components/price-book/price-book-item-dialog'
import { PriceBookImportWizard } from '@/components/price-book/import-wizard'
import { BulkAdjustDialog } from '@/components/price-book/bulk-adjust-dialog'
import {
  deletePriceBookItem,
  createFolder,
  updateFolder,
  deleteFolder,
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
  const [search, setSearch] = useState('')
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
    if (!search.trim()) return items
    const q = search.toLowerCase()
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
    // Named folders in sort_order
    for (const folder of folders) {
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

  function handleConfirmDelete() {
    if (!deletingItem) return
    const target = deletingItem
    startTransition(async () => {
      const result = await deletePriceBookItem(target.id)
      if (result.error) {
        toast.error(result.error)
      } else {
        toast.success(`"${target.name}" deleted`)
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
    startTransition(async () => {
      const result = await deleteFolder(deletingFolderId)
      if (result.error) { toast.error(result.error); return }
      toast.success(t('Category deleted'))
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
          title="No price book items yet"
          description="Add your pricing standards and the AI will use them as anchors when generating estimates. Leaving this empty is fine | the AI will use market estimates instead."
          actionLabel="Add first item"
          onAction={handleAddItem}
        />
        <div className="flex justify-center -mt-4">
          <Button variant="outline" onClick={() => setImportDialogOpen(true)}>
            <Upload className="h-4 w-4 mr-2" />
            Import CSV
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
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold">Price Book</h1>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={() => setNewFolderDialogOpen(true)}>
            <FolderPlus className="h-4 w-4 mr-2" />
            {t('New Category')}
          </Button>
          <Button variant="outline" onClick={() => setImportDialogOpen(true)}>
            <Upload className="h-4 w-4 mr-2" />
            Import CSV
          </Button>
          <Button onClick={handleAddItem}>
            <Plus className="h-4 w-4 mr-2" />
            Add Service
          </Button>
        </div>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search items..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* No results from search */}
      {filtered.length === 0 && items.length > 0 && (
        <EmptyState
          icon={Search}
          title="No items match your search"
          description="Try a different search term"
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
                <div className="flex flex-wrap items-center gap-2 border-b pb-2">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
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

                  <div className="ml-auto flex items-center gap-1">
                    {!isVirtual && !isRenaming && (
                      <>
                        <Button
                          variant="ghost" size="icon" className="h-6 w-6"
                          onClick={() => {
                            setRenamingFolderId(folderId!)
                            setRenamingFolderValue(folderName)
                          }}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost" size="icon" className="h-6 w-6 text-destructive hover:text-destructive"
                          onClick={() => {
                            setDeletingFolderId(folderId!)
                            setDeleteFolderDialogOpen(true)
                          }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      className="ml-1"
                      disabled={folderItems.length === 0}
                      onClick={() => handleAdjustFolder(folderId, folderName)}
                      data-testid={`adjust-btn-folder-${folderId ?? 'uncategorized'}`}
                    >
                      <Percent className="h-3.5 w-3.5 mr-1.5" />
                      Adjust %
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
                              <TableHead>Item</TableHead>
                              <TableHead>Unit</TableHead>
                              <TableHead>Unit Price</TableHead>
                              <TableHead className="w-[50px]" />
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {folderItems.map((item) => (
                              <TableRow key={item.id}>
                                <TableCell className="font-medium">
                                  <div className="flex items-center gap-2">
                                    {item.image_url ? (
                                      <img
                                        src={item.image_url}
                                        alt={item.name}
                                        className="h-8 w-8 rounded object-cover shrink-0"
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
                        <Card key={item.id}>
                          <CardContent className="flex items-center justify-between gap-3 p-3">
                            {/* Left: thumb + name + price/unit */}
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

                            {/* Right: dropdown — same handlers as desktop */}
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
              </div>
            )
          })}
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

      {/* Delete Item Confirmation */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Item</AlertDialogTitle>
            <AlertDialogDescription>
              {deletingItem
                ? `Delete "${deletingItem.name}"? This action cannot be undone.`
                : ''}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              disabled={isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isPending ? 'Deleting...' : 'Delete'}
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
              {t('This will delete the category. Items in this category must be moved or deleted first.')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
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
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleCreateFolder() }}
            autoFocus
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewFolderDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateFolder} disabled={!newFolderName.trim() || isPending}>
              Create
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
