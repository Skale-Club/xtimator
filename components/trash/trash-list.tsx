'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2, RotateCcw, ImageIcon } from 'lucide-react'
import { toast } from 'sonner'
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Card, CardContent } from '@/components/ui/card'
import { EmptyState } from '@/components/dashboard/empty-state'
import {
  restorePriceBookItems,
  destroyPriceBookItems,
  emptyPriceBookTrash,
} from '@/lib/actions/price-book'
import type { DeletedPriceBookItem } from '@/lib/queries/price-book'
import { formatMoney } from '@/lib/money/currency'
import { useTranslation } from '@/lib/i18n/use-translation'

interface TrashListProps {
  items: DeletedPriceBookItem[]
}

// Quick-260718-t7d — recently deleted price book items. Everything here is
// recoverable until it is deleted forever (per item or Empty Trash).
export function TrashList({ items }: TrashListProps) {
  const router = useRouter()
  const { t } = useTranslation()
  const [isPending, startTransition] = useTransition()
  const [destroyingItem, setDestroyingItem] = useState<{ id: string; name: string } | null>(null)
  const [emptyDialogOpen, setEmptyDialogOpen] = useState(false)

  function handleRestore(item: DeletedPriceBookItem) {
    startTransition(async () => {
      const result = await restorePriceBookItems([item.id])
      if ('error' in result && result.error) {
        toast.error(result.error)
      } else {
        toast.success(`"${item.name}" ${t('restored')}`)
        router.refresh()
      }
    })
  }

  function handleConfirmDestroy() {
    if (!destroyingItem) return
    const target = destroyingItem
    startTransition(async () => {
      const result = await destroyPriceBookItems([target.id])
      if ('error' in result && result.error) {
        toast.error(result.error)
      } else {
        toast.success(`"${target.name}" ${t('deleted forever')}`)
        router.refresh()
      }
      setDestroyingItem(null)
    })
  }

  function handleConfirmEmptyTrash() {
    startTransition(async () => {
      const result = await emptyPriceBookTrash()
      if ('error' in result && result.error) {
        toast.error(result.error)
      } else {
        toast.success(t('Trash emptied'))
        router.refresh()
      }
      setEmptyDialogOpen(false)
    })
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-2xl font-semibold tracking-[-0.015em] shrink-0">{t('Trash')}</h2>
        {items.length > 0 && (
          <Button
            variant="destructive"
            size="sm"
            className="ml-auto"
            onClick={() => setEmptyDialogOpen(true)}
            data-testid="empty-trash-btn"
          >
            <Trash2 className="h-4 w-4 mr-2" />
            {t('Empty Trash')}
          </Button>
        )}
      </div>
      <p className="text-sm text-muted-foreground mt-1">
        {t('Deleted price book items stay here until you restore them or delete them forever.')}
      </p>

      {items.length === 0 ? (
        <EmptyState
          icon={Trash2}
          title={t('Trash is empty')}
          description={t('Items you delete from the Price Book will show up here.')}
        />
      ) : (
        <div className="mt-4 space-y-2">
          {/* Desktop table */}
          <div className="hidden md:block">
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('Item')}</TableHead>
                    <TableHead>{t('Category')}</TableHead>
                    <TableHead>{t('Unit Price')}</TableHead>
                    <TableHead>{t('Deleted')}</TableHead>
                    <TableHead className="w-[220px]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item) => (
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
                        {item.folder_name || '—'}
                      </TableCell>
                      <TableCell>{formatMoney(item.unit_price, item.currency_code)}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {new Date(item.deleted_at).toLocaleDateString()}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={isPending}
                            onClick={() => handleRestore(item)}
                          >
                            <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
                            {t('Restore')}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={isPending}
                            className="text-destructive hover:text-destructive"
                            onClick={() => setDestroyingItem({ id: item.id, name: item.name })}
                          >
                            <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                            {t('Delete forever')}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden space-y-2">
            {items.map((item) => (
              <Card key={item.id}>
                <CardContent className="flex items-center justify-between gap-3 p-3">
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
                        {' · '}
                        {new Date(item.deleted_at).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      disabled={isPending}
                      onClick={() => handleRestore(item)}
                      aria-label={`${t('Restore')} ${item.name}`}
                    >
                      <RotateCcw className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      disabled={isPending}
                      onClick={() => setDestroyingItem({ id: item.id, name: item.name })}
                      aria-label={`${t('Delete forever')} ${item.name}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Delete forever (single item) */}
      <AlertDialog
        open={destroyingItem !== null}
        onOpenChange={(open) => { if (!open) setDestroyingItem(null) }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('Delete forever')}</AlertDialogTitle>
            <AlertDialogDescription>
              {destroyingItem
                ? `${t('Permanently delete')} "${destroyingItem.name}"? ${t('This action cannot be undone.')}`
                : ''}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDestroy}
              disabled={isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isPending ? t('Deleting...') : t('Delete forever')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Empty Trash (everything) */}
      <AlertDialog open={emptyDialogOpen} onOpenChange={setEmptyDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('Empty Trash')}</AlertDialogTitle>
            <AlertDialogDescription>
              {`${t('Permanently delete all')} ${items.length} ${items.length === 1 ? t('item') : t('items')}? ${t('This action cannot be undone.')}`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmEmptyTrash}
              disabled={isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="confirm-empty-trash"
            >
              {isPending ? t('Deleting...') : t('Empty Trash')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
