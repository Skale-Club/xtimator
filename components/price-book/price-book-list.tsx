'use client'

import { useState, useMemo, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { BookOpen, Search, MoreHorizontal, Percent, Plus, Upload } from 'lucide-react'
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
import { EmptyState } from '@/components/dashboard/empty-state'
import { PriceBookItemDialog } from '@/components/price-book/price-book-item-dialog'
import { PriceBookImportDialog } from '@/components/price-book/price-book-import-dialog'
import { BulkAdjustDialog } from '@/components/price-book/bulk-adjust-dialog'
import { deletePriceBookItem } from '@/lib/actions/price-book'
import type { PriceBookItem } from '@/lib/queries/price-book'

interface PriceBookListProps {
  items: PriceBookItem[]
  companyId: string
}

export function PriceBookList({ items, companyId }: PriceBookListProps) {
  const router = useRouter()
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
  const [adjustCategory, setAdjustCategory] = useState<string | null>(null)
  const [adjustDialogOpen, setAdjustDialogOpen] = useState(false)

  // Filter FIRST (Pitfall 4: order matters — group depends on filtered)
  const filtered = useMemo(() => {
    if (!search.trim()) return items
    const q = search.toLowerCase()
    return items.filter(
      (item) =>
        item.name.toLowerCase().includes(q) ||
        (item.category ?? '').toLowerCase().includes(q)
    )
  }, [items, search])

  // Group filtered items by category, sort categories alphabetically; null = Uncategorized (rendered last)
  const grouped = useMemo(() => {
    const map = new Map<string | null, PriceBookItem[]>()
    for (const item of filtered) {
      const key = item.category || null
      const list = map.get(key) ?? []
      list.push(item)
      map.set(key, list)
    }
    return Array.from(map.entries()).sort(([a], [b]) => {
      if (a === null) return 1   // nulls last
      if (b === null) return -1
      return a.localeCompare(b)
    })
  }, [filtered])

  // Distinct existing categories for dialog autocomplete (exclude null/empty)
  const existingCategories = useMemo(
    () => [...new Set(items.map((i) => i.category).filter(Boolean) as string[])].sort(),
    [items]
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

  function handleAdjustCategory(category: string | null) {
    if (!category) return
    setAdjustCategory(category)
    setAdjustDialogOpen(true)
  }

  function handleAdjustClose(open: boolean) {
    setAdjustDialogOpen(open)
    if (!open) setAdjustCategory(null)
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

  // Empty state — no items at all
  if (items.length === 0) {
    return (
      <>
        <EmptyState
          icon={BookOpen}
          title="No price book items yet"
          description="Add your pricing standards and the AI will use them as anchors when generating estimates. Leaving this empty is fine — the AI will use market estimates instead."
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
          companyId={companyId}
          existingCategories={existingCategories}
        />
        <PriceBookImportDialog
          open={importDialogOpen}
          onOpenChange={handleImportClose}
        />
      </>
    )
  }

  return (
    <>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Price Book</h1>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setImportDialogOpen(true)}>
            <Upload className="h-4 w-4 mr-2" />
            Import CSV
          </Button>
          <Button onClick={handleAddItem}>
            <Plus className="h-4 w-4 mr-2" />
            Add Item
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

      {/* Category sections — always-expanded, alphabetical */}
      {grouped.length > 0 && (
        <div className="space-y-6">
          {grouped.map(([category, categoryItems]) => (
            <div key={category ?? '__uncategorized__'} className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                  {category ?? 'Uncategorized'}
                </h3>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={category === null || categoryItems.length === 0}
                  onClick={() => handleAdjustCategory(category)}
                  data-testid={`adjust-btn-${category ?? 'uncategorized'}`}
                >
                  <Percent className="h-3.5 w-3.5 mr-1.5" />
                  Adjust %
                </Button>
              </div>
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
                    {categoryItems.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell className="font-medium">{item.name}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {item.unit || '—'}
                        </TableCell>
                        <TableCell>${item.unit_price.toFixed(2)}</TableCell>
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
          ))}
        </div>
      )}

      {/* Add/Edit Dialog */}
      <PriceBookItemDialog
        open={dialogOpen}
        onOpenChange={handleDialogChange}
        item={editingItem}
        companyId={companyId}
        existingCategories={existingCategories}
      />

      {/* Delete Confirmation */}
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

      {/* Import CSV Dialog */}
      <PriceBookImportDialog
        open={importDialogOpen}
        onOpenChange={handleImportClose}
      />

      {/* Bulk Adjust Dialog — items from UNFILTERED source (Pitfall 7) */}
      {adjustCategory !== null && (
        <BulkAdjustDialog
          open={adjustDialogOpen}
          onOpenChange={handleAdjustClose}
          category={adjustCategory}
          items={items.filter((i) => i.category === adjustCategory)}
        />
      )}
    </>
  )
}
