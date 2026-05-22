'use client'

import { useEffect, useState, useTransition } from 'react'
import { useForm, type Resolver } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useRouter } from 'next/navigation'
import { ChevronsUpDown, ImageIcon } from 'lucide-react'
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
import { MoneyInput } from '@/components/ui/money-input'
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
import type { PriceBookItem, PriceBookFolder } from '@/lib/queries/price-book'

interface PriceBookItemDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  item: PriceBookItem | null
  currencyCode: string
  folders: PriceBookFolder[]
}

const EMPTY_FORM: PriceBookItemFormValues = {
  folder_id: null,
  name: '',
  unit: '',
  unit_price: 0,
  notes: '',
}

export function PriceBookItemDialog({
  open,
  onOpenChange,
  item,
  currencyCode,
  folders,
}: PriceBookItemDialogProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [folderOpen, setFolderOpen] = useState(false)
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const isEditing = !!item

  const form = useForm<PriceBookItemFormValues>({
    resolver: zodResolver(priceBookItemSchema) as Resolver<PriceBookItemFormValues>,
    defaultValues: EMPTY_FORM,
  })

  // Pitfall 3: Reset form when item or open prop changes — prevents stale values
  useEffect(() => {
    if (item) {
      form.reset({
        folder_id: item.folder_id ?? null,
        name: item.name,
        unit: item.unit ?? '',
        unit_price: item.unit_price,
        notes: item.notes ?? '',
        image_url: item.image_url ?? '',
      })
    } else {
      form.reset(EMPTY_FORM)
    }
    queueMicrotask(() => {
      setImageFile(null)
      setImagePreview(item?.image_url ?? null)
    })
  }, [item, open, form])

  function onSubmit(values: PriceBookItemFormValues) {
    startTransition(async () => {
      const result = item
        ? await updatePriceBookItem(item.id, values, imageFile)
        : await createPriceBookItem(values, imageFile)

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
                      <div>
                        <input
                          type="hidden"
                          value={field.value ?? ''}
                          readOnly
                          name={field.name}
                          ref={field.ref}
                        />
                        <MoneyInput
                          value={field.value}
                          currencyCode={item?.currency_code ?? currencyCode}
                          onValueChange={field.onChange}
                          onBlur={field.onBlur}
                          placeholder="0.00"
                        />
                      </div>
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

            {/* Photo (optional) */}
            <div className="space-y-2">
              <label className="text-sm font-medium leading-none">Photo (optional)</label>
              <div className="flex items-center gap-3">
                {imagePreview ? (
                  <img
                    src={imagePreview}
                    alt="Item preview"
                    className="h-10 w-10 rounded object-cover border border-border shrink-0"
                  />
                ) : (
                  <div className="h-10 w-10 rounded border border-dashed border-border flex items-center justify-center shrink-0 bg-muted">
                    <ImageIcon className="h-4 w-4 text-muted-foreground" />
                  </div>
                )}
                <div className="flex gap-2 flex-1">
                  <label htmlFor="price-book-image-upload" className="cursor-pointer flex-1">
                    <div className="flex items-center justify-center h-9 rounded-md border border-input bg-background px-3 text-sm font-medium hover:bg-accent hover:text-accent-foreground transition-colors">
                      {imagePreview ? 'Change photo' : 'Add photo'}
                    </div>
                    <input
                      id="price-book-image-upload"
                      type="file"
                      accept="image/*"
                      className="sr-only"
                      onChange={(e) => {
                        const file = e.target.files?.[0] ?? null
                        setImageFile(file)
                        if (file) {
                          const url = URL.createObjectURL(file)
                          setImagePreview(url)
                        }
                      }}
                    />
                  </label>
                  {imagePreview && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setImageFile(null)
                        setImagePreview(null)
                      }}
                    >
                      Remove
                    </Button>
                  )}
                </div>
              </div>
            </div>

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
