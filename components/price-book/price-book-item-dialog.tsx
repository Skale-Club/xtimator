'use client'

import { useEffect, useState, useTransition } from 'react'
import { useForm, type Resolver } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useRouter } from 'next/navigation'
import { ChevronsUpDown, ImageIcon, Plus, Trash2 } from 'lucide-react'
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
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  priceBookItemSchema,
  type PriceBookItemFormValues,
  type PricingType,
  type AreaSize,
  type ItemOption,
} from '@/lib/schemas/price-book'
import {
  createPriceBookItem,
  updatePriceBookItem,
  fetchItemOptions,
} from '@/lib/actions/price-book'
import type { PriceBookItem, PriceBookFolder } from '@/lib/queries/price-book'
import { ImagePositionEditor, DEFAULT_IMAGE_POSITION, type ImagePosition } from '@/components/admin/image-position-editor'

const MAX_ITEM_PHOTO_SIZE = 4 * 1024 * 1024
const ACCEPTED_ITEM_PHOTO_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp']

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
  pricing_type: 'fixed',
  base_price: null,
  price_per_unit: null,
  minimum_price: null,
  area_sizes: null,
}

/** Built-in measures for the unit selector. Anything else routes to "other". */
const UNIT_OPTIONS = [
  { value: 'min', label: 'min' },
  { value: 'hour', label: 'hour' },
  { value: 'ft', label: 'ft' },
  { value: 'ea', label: 'ea' },
] as const

interface UnitParts {
  qty: string
  measure: string
  custom: string
}

function parseUnit(raw: string | null | undefined): UnitParts {
  const s = (raw ?? '').trim()
  if (!s) return { qty: '', measure: '', custom: '' }
  const m = s.match(/^(\d+(?:\.\d+)?)\s*(.*)$/)
  const qty = m ? m[1] : ''
  const rest = (m ? m[2] : s).trim()
  if (!rest) return { qty, measure: '', custom: '' }
  const known = UNIT_OPTIONS.find((o) => o.value === rest.toLowerCase())
  if (known) return { qty, measure: known.value, custom: '' }
  return { qty, measure: 'other', custom: rest }
}

function composeUnit({ qty, measure, custom }: UnitParts): string {
  const word = measure === 'other' ? custom.trim() : measure
  return [qty.trim(), word].filter(Boolean).join(' ')
}

const PRICING_TYPES: { value: PricingType; label: string; description: string }[] = [
  { value: 'fixed', label: 'Fixed Price', description: 'Single price per unit' },
  { value: 'area_based', label: 'Area-Based', description: 'Price per sqft/unit with size presets' },
  { value: 'base_plus_addons', label: 'Base + Add-ons', description: 'Base cost with optional extras' },
]

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
  const [imagePosition, setImagePosition] = useState<ImagePosition>(DEFAULT_IMAGE_POSITION)
  const [unit, setUnit] = useState<UnitParts>({ qty: '', measure: '', custom: '' })
  const [pricingType, setPricingType] = useState<PricingType>('fixed')
  const [areaSizes, setAreaSizes] = useState<AreaSize[]>([])
  const [options, setOptions] = useState<ItemOption[]>([])
  const isEditing = !!item

  const form = useForm<PriceBookItemFormValues>({
    resolver: zodResolver(priceBookItemSchema) as Resolver<PriceBookItemFormValues>,
    defaultValues: EMPTY_FORM,
  })

  // Reset all state when dialog opens or item changes
  useEffect(() => {
    if (!open) return

    const type: PricingType = (item?.pricing_type as PricingType) ?? 'fixed'
    setPricingType(type)
    setAreaSizes((item?.area_sizes as AreaSize[]) ?? [])
    setOptions([])
    setImageFile(null)
    setImagePreview(item?.image_url ?? null)
    setImagePosition(item?.image_position ?? DEFAULT_IMAGE_POSITION)

    if (item) {
      form.reset({
        folder_id: item.folder_id ?? null,
        name: item.name,
        unit: item.unit ?? '',
        unit_price: item.unit_price,
        notes: item.notes ?? '',
        image_url: item.image_url ?? '',
        pricing_type: type,
        base_price: item.base_price ?? null,
        price_per_unit: item.price_per_unit ?? null,
        minimum_price: item.minimum_price ?? null,
        area_sizes: (item.area_sizes as AreaSize[]) ?? null,
      })
    } else {
      form.reset(EMPTY_FORM)
    }
    queueMicrotask(() => {
      setUnit(parseUnit(item?.unit ?? ''))
    })

    // Load saved options for base_plus_addons in edit mode
    if (item && type === 'base_plus_addons') {
      fetchItemOptions(item.id).then((result) => {
        if ('data' in result) {
          setOptions(
            result.data.map((o) => ({
              id: o.id,
              name: o.name,
              price: o.price,
              max_quantity: o.max_quantity ?? undefined,
              sort_order: o.sort_order,
            }))
          )
        }
      })
    }
  }, [item, open, form])

  function applyUnit(patch: Partial<UnitParts>) {
    const next = { ...unit, ...patch }
    if (patch.measure !== undefined && patch.measure !== 'other') next.custom = ''
    setUnit(next)
    form.setValue('unit', composeUnit(next), { shouldDirty: true })
  }

  function handlePricingTypeChange(value: PricingType) {
    setPricingType(value)
    form.setValue('pricing_type', value)
    // Clear type-specific fields when switching
    if (value !== 'area_based') {
      setAreaSizes([])
      form.setValue('area_sizes', null)
      form.setValue('price_per_unit', null)
      form.setValue('minimum_price', null)
    }
    if (value !== 'base_plus_addons') {
      setOptions([])
      form.setValue('base_price', null)
    }
  }

  // ── Area sizes helpers ───────────────────────────────────────

  function addAreaSize() {
    const next = [...areaSizes, { name: '', sqft: null, price: 0 }]
    setAreaSizes(next)
    form.setValue('area_sizes', next)
  }

  function updateAreaSize(index: number, patch: Partial<AreaSize>) {
    const next = areaSizes.map((s, i) => (i === index ? { ...s, ...patch } : s))
    setAreaSizes(next)
    form.setValue('area_sizes', next)
  }

  function removeAreaSize(index: number) {
    const next = areaSizes.filter((_, i) => i !== index)
    setAreaSizes(next)
    form.setValue('area_sizes', next)
  }

  // ── Options helpers ──────────────────────────────────────────

  function addOption() {
    setOptions((prev) => [...prev, { name: '', price: 0, sort_order: prev.length }])
  }

  function updateOption(index: number, patch: Partial<ItemOption>) {
    setOptions((prev) => prev.map((o, i) => (i === index ? { ...o, ...patch } : o)))
  }

  function removeOption(index: number) {
    setOptions((prev) => prev.filter((_, i) => i !== index))
  }

  // ── Submit ───────────────────────────────────────────────────

  function onSubmit(values: PriceBookItemFormValues) {
    startTransition(async () => {
      const result = item
        ? await updatePriceBookItem(item.id, values, imageFile, options, imagePosition)
        : await createPriceBookItem(values, imageFile, options, imagePosition)

      if (result.error) {
        toast.error(result.error)
        return
      }

      toast.success(item ? 'Item updated' : 'Item added')
      onOpenChange(false)
      router.refresh()
    })
  }

  const effectiveCurrency = item?.currency_code ?? currencyCode

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Edit Service' : 'Add Service'}</DialogTitle>
          <DialogDescription>
            {isEditing
              ? 'Update price book service.'
              : 'Add a new service to your price book.'}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">

            {/* Folder */}
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

            {/* Service Name */}
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Service Name *</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. General Labor" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Pricing Type */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Pricing Type</Label>
              <RadioGroup
                value={pricingType}
                onValueChange={(v) => handlePricingTypeChange(v as PricingType)}
                className="grid grid-cols-3 gap-2"
              >
                {PRICING_TYPES.map((pt) => (
                  <label
                    key={pt.value}
                    htmlFor={`pt-${pt.value}`}
                    className={`flex flex-col gap-1 rounded-md border p-3 cursor-pointer transition-colors text-sm ${
                      pricingType === pt.value
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:bg-accent'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <RadioGroupItem id={`pt-${pt.value}`} value={pt.value} className="shrink-0" />
                      <span className="font-medium leading-tight">{pt.label}</span>
                    </div>
                    <span className="text-xs text-muted-foreground pl-5 leading-tight">
                      {pt.description}
                    </span>
                  </label>
                ))}
              </RadioGroup>
            </div>

            {/* ── Fixed: unit + unit_price ── */}
            {pricingType === 'fixed' && (
              <>
                <div className="space-y-2">
                  <label className="text-sm font-medium leading-none">Unit</label>
                  <div className="flex gap-2">
                    <Input
                      inputMode="decimal"
                      placeholder="Qty"
                      aria-label="Unit quantity"
                      className="w-20 shrink-0"
                      value={unit.qty}
                      onChange={(e) => applyUnit({ qty: e.target.value.replace(/[^\d.]/g, '') })}
                    />
                    <Select
                      value={unit.measure || undefined}
                      onValueChange={(value) => applyUnit({ measure: value })}
                    >
                      <SelectTrigger className="flex-1" aria-label="Unit measure">
                        <SelectValue placeholder="Select unit" />
                      </SelectTrigger>
                      <SelectContent>
                        {UNIT_OPTIONS.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                        <SelectItem value="other">Other…</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {unit.measure === 'other' && (
                    <Input
                      placeholder="Custom unit (e.g. sqft, gal, visit)"
                      aria-label="Custom unit"
                      value={unit.custom}
                      onChange={(e) => applyUnit({ custom: e.target.value })}
                    />
                  )}
                </div>

                <FormField
                  control={form.control}
                  name="unit_price"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Unit Price *</FormLabel>
                      <FormControl>
                        <div>
                          <input type="hidden" value={field.value ?? ''} readOnly name={field.name} ref={field.ref} />
                          <MoneyInput
                            value={field.value}
                            currencyCode={effectiveCurrency}
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
              </>
            )}

            {/* ── Area-Based: price_per_unit + minimum_price + area sizes ── */}
            {pricingType === 'area_based' && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <FormField
                    control={form.control}
                    name="price_per_unit"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Price per Unit *</FormLabel>
                        <FormControl>
                          <div>
                            <input type="hidden" value={field.value ?? ''} readOnly name={field.name} ref={field.ref} />
                            <MoneyInput
                              value={field.value ?? 0}
                              currencyCode={effectiveCurrency}
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
                  <FormField
                    control={form.control}
                    name="minimum_price"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Minimum Price</FormLabel>
                        <FormControl>
                          <div>
                            <input type="hidden" value={field.value ?? ''} readOnly name={field.name} ref={field.ref} />
                            <MoneyInput
                              value={field.value ?? 0}
                              currencyCode={effectiveCurrency}
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

                {/* Area size presets */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm font-medium">Size Presets</Label>
                    <Button type="button" variant="outline" size="sm" onClick={addAreaSize}>
                      <Plus className="h-3.5 w-3.5 mr-1" />
                      Add size
                    </Button>
                  </div>
                  {areaSizes.length > 0 && (
                    <div className="rounded-md border divide-y">
                      <div className="grid grid-cols-[1fr_80px_100px_36px] gap-2 px-3 py-1.5 text-xs font-medium text-muted-foreground bg-muted/40">
                        <span>Name</span>
                        <span>Sqft</span>
                        <span>Price</span>
                        <span />
                      </div>
                      {areaSizes.map((size, i) => (
                        <div key={i} className="grid grid-cols-[1fr_80px_100px_36px] gap-2 px-3 py-2 items-center">
                          <Input
                            placeholder="Small Room"
                            value={size.name}
                            onChange={(e) => updateAreaSize(i, { name: e.target.value })}
                            className="h-8 text-sm"
                          />
                          <Input
                            inputMode="decimal"
                            placeholder="—"
                            value={size.sqft ?? ''}
                            onChange={(e) => {
                              const v = e.target.value
                              updateAreaSize(i, { sqft: v === '' ? null : Number(v) })
                            }}
                            className="h-8 text-sm"
                          />
                          <MoneyInput
                            value={size.price}
                            currencyCode={effectiveCurrency}
                            onValueChange={(v) => updateAreaSize(i, { price: v ?? 0 })}
                            placeholder="0.00"
                            className="h-8 text-sm"
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-destructive"
                            onClick={() => removeAreaSize(i)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                  {areaSizes.length === 0 && (
                    <p className="text-xs text-muted-foreground">
                      Add size presets so customers can pick a standard size. Leave empty to use only price-per-unit.
                    </p>
                  )}
                </div>
              </>
            )}

            {/* ── Base + Add-ons: base_price + options ── */}
            {pricingType === 'base_plus_addons' && (
              <>
                <FormField
                  control={form.control}
                  name="base_price"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Base Price *</FormLabel>
                      <FormControl>
                        <div>
                          <input type="hidden" value={field.value ?? ''} readOnly name={field.name} ref={field.ref} />
                          <MoneyInput
                            value={field.value ?? 0}
                            currencyCode={effectiveCurrency}
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

                {/* Options / add-ons */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm font-medium">Add-on Options</Label>
                    <Button type="button" variant="outline" size="sm" onClick={addOption}>
                      <Plus className="h-3.5 w-3.5 mr-1" />
                      Add option
                    </Button>
                  </div>
                  {options.length > 0 && (
                    <div className="rounded-md border divide-y">
                      <div className="grid grid-cols-[1fr_100px_70px_36px] gap-2 px-3 py-1.5 text-xs font-medium text-muted-foreground bg-muted/40">
                        <span>Option name</span>
                        <span>Price</span>
                        <span>Max qty</span>
                        <span />
                      </div>
                      {options.map((opt, i) => (
                        <div key={i} className="grid grid-cols-[1fr_100px_70px_36px] gap-2 px-3 py-2 items-center">
                          <Input
                            placeholder="Extra window"
                            value={opt.name}
                            onChange={(e) => updateOption(i, { name: e.target.value })}
                            className="h-8 text-sm"
                          />
                          <MoneyInput
                            value={opt.price}
                            currencyCode={effectiveCurrency}
                            onValueChange={(v) => updateOption(i, { price: v ?? 0 })}
                            placeholder="0.00"
                            className="h-8 text-sm"
                          />
                          <Input
                            inputMode="numeric"
                            placeholder="—"
                            value={opt.max_quantity ?? ''}
                            onChange={(e) => {
                              const v = e.target.value
                              updateOption(i, { max_quantity: v === '' ? undefined : Number(v) })
                            }}
                            className="h-8 text-sm"
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-destructive"
                            onClick={() => removeOption(i)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                  {options.length === 0 && (
                    <p className="text-xs text-muted-foreground">
                      Add optional extras that can be added on top of the base price.
                    </p>
                  )}
                </div>
              </>
            )}

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

            {/* Photo */}
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
                      accept="image/png,image/jpeg,image/webp"
                      className="sr-only"
                      onChange={(e) => {
                        const file = e.target.files?.[0] ?? null
                        if (!file) return
                        e.target.value = ''
                        if (!ACCEPTED_ITEM_PHOTO_TYPES.includes(file.type)) {
                          toast.error('Unsupported format. Please upload PNG, JPG, or WebP.')
                          return
                        }
                        if (file.size > MAX_ITEM_PHOTO_SIZE) {
                          toast.error('Photo must be under 4MB.')
                          return
                        }
                        setImageFile(file)
                        setImagePreview(URL.createObjectURL(file))
                        setImagePosition(DEFAULT_IMAGE_POSITION)
                      }}
                    />
                  </label>
                  {imagePreview && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => { setImageFile(null); setImagePreview(null); setImagePosition(DEFAULT_IMAGE_POSITION) }}
                    >
                      Remove
                    </Button>
                  )}
                </div>
              </div>
              {imagePreview && (
                <ImagePositionEditor
                  src={imagePreview}
                  alt="Item photo position preview"
                  aspectRatio={1}
                  fit="cover"
                  value={imagePosition}
                  onChange={setImagePosition}
                  className="max-w-[200px]"
                />
              )}
            </div>

            <Button type="submit" className="w-full" disabled={isPending}>
              {isPending
                ? isEditing ? 'Updating...' : 'Adding...'
                : isEditing ? 'Update Service' : 'Add Service'}
            </Button>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
