'use client'

import { useEffect, useMemo, useTransition } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { bulkAdjustSchema, type BulkAdjustFormValues } from '@/lib/schemas/price-book'
import { bulkAdjustPriceBookFolder } from '@/lib/actions/price-book'
import type { PriceBookItem } from '@/lib/queries/price-book'

interface BulkAdjustDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  folderId: string | null
  folderName: string
  items: PriceBookItem[]
}

export function BulkAdjustDialog({
  open,
  onOpenChange,
  folderId,
  folderName,
  items,
}: BulkAdjustDialogProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const form = useForm<BulkAdjustFormValues>({
    resolver: zodResolver(bulkAdjustSchema) as any,
    defaultValues: { adjustmentPercent: 0 },
  })

  // Pitfall 6: Reset form when dialog opens — prevent stale % from prior folder session
  useEffect(() => {
    if (open) {
      form.reset({ adjustmentPercent: 0 })
    }
  }, [open, form])

  const adjustmentPercent = form.watch('adjustmentPercent')

  // Pitfall 4: Guard for 0 / empty — show empty preview, not rows with identical prices
  const preview = useMemo(() => {
    if (!adjustmentPercent || adjustmentPercent === 0) return []
    return items.map((item) => ({
      id: item.id,
      name: item.name,
      currentPrice: item.unit_price,
      // D-04 rounding — matches server-side formula exactly
      newPrice: Math.round(item.unit_price * (1 + adjustmentPercent / 100) * 100) / 100,
    }))
  }, [items, adjustmentPercent])

  const isPositive = (adjustmentPercent ?? 0) > 0

  function onSubmit(values: BulkAdjustFormValues) {
    startTransition(async () => {
      const result = await bulkAdjustPriceBookFolder(folderId, values.adjustmentPercent)
      if ('error' in result) {
        // Pitfall 5: stay open on error
        toast.error(result.error)
        return
      }
      toast.success(`Updated ${result.data.updated} items`)
      // Pitfall 5: close THEN refresh
      onOpenChange(false)
      router.refresh()
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Adjust prices | {folderName}</DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            {/* % Input */}
            <FormField
              control={form.control}
              name="adjustmentPercent"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Adjustment %</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      step="0.1"
                      placeholder="+10 or -5"
                      value={field.value ?? ''}
                      onChange={(e) => field.onChange(e.target.value)}
                      onBlur={field.onBlur}
                      name={field.name}
                      ref={field.ref}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Live Preview Table */}
            {preview.length > 0 && (
              <div className="rounded-md border max-h-64 overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Item</TableHead>
                      <TableHead>Current Price</TableHead>
                      <TableHead>New Price</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {preview.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell className="font-medium">{row.name}</TableCell>
                        <TableCell className="text-muted-foreground">
                          ${row.currentPrice.toFixed(2)}
                        </TableCell>
                        <TableCell
                          className={
                            isPositive
                              ? 'text-green-600 dark:text-green-400 font-medium'
                              : 'text-red-600 dark:text-red-400 font-medium'
                          }
                        >
                          ${row.newPrice.toFixed(2)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            {/* Footer */}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={isPending}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={
                  isPending ||
                  !adjustmentPercent ||
                  adjustmentPercent === 0
                }
              >
                {isPending ? 'Applying...' : `Apply to ${items.length} items`}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
