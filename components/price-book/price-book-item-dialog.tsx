'use client'

import { useEffect, useState, useTransition } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useRouter } from 'next/navigation'
import { ChevronsUpDown } from 'lucide-react'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import {
  priceBookItemSchema,
  type PriceBookItemFormValues,
} from '@/lib/schemas/price-book'
import {
  createPriceBookItem,
  updatePriceBookItem,
} from '@/lib/actions/price-book'
import type { PriceBookItem } from '@/lib/queries/price-book'

interface PriceBookItemDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  item: PriceBookItem | null
  // companyId currently unused (server actions resolve company via auth context)
  // but kept in the public surface for future per-company validation hooks.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  companyId: string
  existingCategories: string[]
}

const EMPTY_FORM: PriceBookItemFormValues = {
  category: '',
  name: '',
  unit: '',
  unit_price: 0,
  notes: '',
}

export function PriceBookItemDialog({
  open,
  onOpenChange,
  item,
  companyId: _companyId,
  existingCategories,
}: PriceBookItemDialogProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [categoryOpen, setCategoryOpen] = useState(false)
  const isEditing = !!item

  const form = useForm<PriceBookItemFormValues>({
    resolver: zodResolver(priceBookItemSchema) as any,
    defaultValues: EMPTY_FORM,
  })

  // Pitfall 3: Reset form when item or open prop changes — prevents stale values
  useEffect(() => {
    if (item) {
      form.reset({
        category: item.category,
        name: item.name,
        unit: item.unit ?? '',
        unit_price: item.unit_price,
        notes: item.notes ?? '',
      })
    } else {
      form.reset(EMPTY_FORM)
    }
  }, [item, open, form])

  function onSubmit(values: PriceBookItemFormValues) {
    startTransition(async () => {
      const result = item
        ? await updatePriceBookItem(item.id, values)
        : await createPriceBookItem(values)

      if (result.error) {
        toast.error(result.error)
        return
      }

      toast.success(item ? 'Item updated' : 'Item added')
      // Pitfall 5: Close dialog FIRST, then refresh — avoids stale-data flash
      onOpenChange(false)
      router.refresh()
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Edit Item' : 'Add Item'}</DialogTitle>
          <DialogDescription>
            {isEditing
              ? 'Update price book item.'
              : 'Add a new item to your price book.'}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            {/* Category — Combobox (Popover + Command) */}
            <FormField
              control={form.control}
              name="category"
              render={({ field }) => (
                <FormItem className="flex flex-col">
                  <FormLabel>Category *</FormLabel>
                  <Popover open={categoryOpen} onOpenChange={setCategoryOpen}>
                    <PopoverTrigger asChild>
                      <FormControl>
                        <Button
                          type="button"
                          variant="outline"
                          role="combobox"
                          className="w-full justify-between font-normal"
                        >
                          <span className={field.value ? '' : 'text-muted-foreground'}>
                            {field.value || 'Select or type category...'}
                          </span>
                          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                      </FormControl>
                    </PopoverTrigger>
                    <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
                      <Command>
                        <CommandInput
                          placeholder="Search or create category..."
                          value={field.value}
                          onValueChange={(v) => field.onChange(v)}
                        />
                        <CommandList>
                          <CommandEmpty>
                            {field.value
                              ? `No existing category. Will create "${field.value}".`
                              : 'Type to search or create.'}
                          </CommandEmpty>
                          {existingCategories.length > 0 && (
                            <CommandGroup>
                              {existingCategories.map((cat) => (
                                <CommandItem
                                  key={cat}
                                  value={cat}
                                  onSelect={(v) => {
                                    field.onChange(v)
                                    setCategoryOpen(false)
                                  }}
                                >
                                  {cat}
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          )}
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Name */}
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Item Name *</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. General Labor" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-3">
              {/* Unit */}
              <FormField
                control={form.control}
                name="unit"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Unit</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. hr, ft, ea" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Unit Price (z.coerce.number handles string→number) */}
              <FormField
                control={form.control}
                name="unit_price"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Unit Price *</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="0.00"
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
            </div>

            {/* Notes */}
            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes</FormLabel>
                  <FormControl>
                    <Textarea placeholder="Optional notes..." {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <Button type="submit" className="w-full" disabled={isPending}>
              {isPending
                ? isEditing
                  ? 'Updating...'
                  : 'Adding...'
                : isEditing
                  ? 'Update Item'
                  : 'Add Item'}
            </Button>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
