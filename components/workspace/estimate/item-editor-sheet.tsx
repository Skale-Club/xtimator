'use client'

import { useState, type JSX } from 'react'
import { ChevronDown, Copy, Minus, Plus, Trash2 } from 'lucide-react'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { MoneyInput } from '@/components/ui/money-input'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'
import { DEFAULT_CURRENCY_CODE, formatMoney } from '@/lib/money/currency'
import type { DocumentItem } from '@/lib/estimate/document/model'
import type { PriceBookItem } from '@/lib/queries/price-book'
import { useTranslation } from '@/lib/i18n/use-translation'
import { PriceBookCombobox } from './price-book-combobox'
import { DEFAULT_UNIT_OPTIONS } from './item-card-mobile'

export type ItemEditorField =
  | 'description'
  | 'quantity'
  | 'unit'
  | 'unit_price'
  | 'discount'
  | 'taxable'

interface ItemEditorSheetProps {
  /** The item being edited; null closes the sheet. */
  item: DocumentItem | null
  /** True right after "Add item": the title says "New item" and the
   *  description field takes focus. */
  isNew?: boolean
  /** Stable identity of the open item across saves. Item ids change when an
   *  autosave maps a temp- id to its server uuid, so the caller passes the
   *  item's position instead; keying by id would remount mid-typing. */
  editorKey?: string
  onClose: () => void
  onUpdate: (field: ItemEditorField, value: string | number | boolean | null) => void
  onSelectPriceBookItem?: (item: PriceBookItem) => void
  onDelete: () => void
  onDuplicate: () => void
  currencyCode?: string
  unitOptions?: string[]
  priceBookItems?: PriceBookItem[]
}

/** How many unit options show as one-tap chips; the rest sit under "Other". */
const UNIT_CHIP_COUNT = 5

const FIELD_LABEL = 'text-xs font-medium uppercase tracking-wide text-muted-foreground'
const FIELD_BOX =
  'rounded-lg border border-border bg-background px-3 py-2 focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/15'

/**
 * Mobile line-item editor: a bottom sheet that edits ONE item with full-size,
 * thumb-friendly controls (quantity stepper, unit chips, currency keypad), the
 * live line total, rarely used fields under "More options", and Delete /
 * Duplicate in the footer. Every change dispatches immediately (the editor
 * autosaves as before); "Done" only closes.
 */
export function ItemEditorSheet({
  item,
  isNew = false,
  editorKey,
  onClose,
  onUpdate,
  onSelectPriceBookItem,
  onDelete,
  onDuplicate,
  currencyCode = DEFAULT_CURRENCY_CODE,
  unitOptions,
  priceBookItems = [],
}: ItemEditorSheetProps): JSX.Element {
  const { t } = useTranslation()

  return (
    <Sheet open={item !== null} onOpenChange={(open) => { if (!open) onClose() }}>
      <SheetContent
        side="bottom"
        showCloseButton={false}
        data-testid="item-editor-sheet"
        className="max-h-[90dvh] gap-0 overflow-y-auto p-0"
        onOpenAutoFocus={(event) => {
          // Only a brand-new item jumps straight into typing (its description);
          // opening an existing one must not pop the keyboard over the fields.
          event.preventDefault()
          if (!isNew) return
          const content = event.currentTarget as HTMLElement | null
          content
            ?.querySelector<HTMLElement>('[data-item-description] textarea, [data-item-description] input')
            ?.focus()
        }}
      >
        {item && (
          <ItemEditorBody
            // Remount per item so local UI state (More options, Other unit)
            // never leaks from one item to the next (see editorKey).
            key={editorKey ?? item.id}
            item={item}
            isNew={isNew}
            onClose={onClose}
            onUpdate={onUpdate}
            onSelectPriceBookItem={onSelectPriceBookItem}
            onDelete={onDelete}
            onDuplicate={onDuplicate}
            currencyCode={currencyCode}
            unitOptions={unitOptions ?? DEFAULT_UNIT_OPTIONS}
            priceBookItems={priceBookItems}
            t={t}
          />
        )}
      </SheetContent>
    </Sheet>
  )
}

function ItemEditorBody({
  item,
  isNew,
  onClose,
  onUpdate,
  onSelectPriceBookItem,
  onDelete,
  onDuplicate,
  currencyCode,
  unitOptions,
  priceBookItems,
  t,
}: Omit<ItemEditorSheetProps, 'item' | 'unitOptions' | 'currencyCode' | 'priceBookItems' | 'editorKey'> & {
  item: DocumentItem
  currencyCode: string
  unitOptions: string[]
  priceBookItems: PriceBookItem[]
  t: (s: string) => string
}): JSX.Element {
  const hasDiscount = (item.discount ?? 0) !== 0
  const notTaxed = item.taxable === false
  // More options opens by itself when the item already uses one of them.
  const [moreOpen, setMoreOpen] = useState(hasDiscount || notTaxed)

  const chipUnits = unitOptions.slice(0, UNIT_CHIP_COUNT)
  const unitIsChip = item.unit !== null && chipUnits.includes(item.unit)
  const [otherUnitOpen, setOtherUnitOpen] = useState(item.unit !== null && !unitIsChip)
  // The current unit always has a chip, even when it is a custom one.
  const chips = item.unit && !unitIsChip && !otherUnitOpen ? [...chipUnits, item.unit] : chipUnits

  const quantity = Number.isFinite(item.quantity) ? item.quantity : 0
  function stepQuantity(delta: number) {
    const next = Math.max(0, Math.round((quantity + delta) * 10000) / 10000)
    onUpdate('quantity', next)
  }

  return (
    <div className="flex flex-col">
      {/* Header: grabber, title, Done */}
      <div className="sticky top-0 z-10 bg-[var(--glass-bg-strong)] px-4 pt-2 pb-3">
        <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-border" aria-hidden />
        <div className="flex items-center justify-between gap-3">
          <SheetTitle className="text-base">{isNew ? t('New item') : t('Edit item')}</SheetTitle>
          <Button size="sm" onClick={onClose} className="rounded-full px-4">
            {t('Done')}
          </Button>
        </div>
        <SheetDescription className="sr-only">
          {t('Changes are saved automatically.')}
        </SheetDescription>
      </div>

      <div className="flex flex-col gap-4 px-4 pb-4">
        {/* Description, with price book search */}
        <div className="flex flex-col gap-1.5">
          <span className={FIELD_LABEL}>{t('Description')}</span>
          <div className={FIELD_BOX} data-item-description>
            <PriceBookCombobox
              value={item.description}
              onChange={(next) => onUpdate('description', next)}
              onSelectPriceBookItem={(pb) => onSelectPriceBookItem?.(pb)}
              items={priceBookItems}
              currencyCode={currencyCode}
              placeholder={t('What is the work?')}
              aria-label={t('Description')}
              multiline
              className="w-full min-w-0 resize-none bg-transparent text-base outline-none [field-sizing:content] break-words"
              noMatchesLabel={t('No matches')}
            />
          </div>
        </div>

        {/* Quantity and unit price */}
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <span className={FIELD_LABEL}>{t('Quantity')}</span>
            <div className={cn(FIELD_BOX, 'flex items-center gap-1 px-1.5 py-1')}>
              <button
                type="button"
                onClick={() => stepQuantity(-1)}
                disabled={quantity <= 0}
                aria-label={t('Decrease quantity')}
                className="grid h-9 w-9 shrink-0 place-items-center rounded-md text-primary transition-colors hover:bg-muted disabled:opacity-30"
              >
                <Minus className="h-4 w-4" />
              </button>
              <input
                type="number"
                inputMode="decimal"
                step="any"
                min="0"
                value={item.quantity}
                onChange={(e) => onUpdate('quantity', parseFloat(e.target.value) || 0)}
                aria-label={t('Quantity')}
                className="min-w-0 flex-1 bg-transparent text-center text-base tabular-nums outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
              />
              <button
                type="button"
                onClick={() => stepQuantity(1)}
                aria-label={t('Increase quantity')}
                className="grid h-9 w-9 shrink-0 place-items-center rounded-md text-primary transition-colors hover:bg-muted"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <span className={FIELD_LABEL}>{t('Unit price')}</span>
            <MoneyInput
              name="unit_price"
              value={item.unit_price}
              currencyCode={currencyCode}
              onValueChange={(value) => onUpdate('unit_price', value)}
              className="h-11 text-right text-base tabular-nums"
            />
          </div>
        </div>

        {/* Unit: common units as chips, the rest under Other */}
        <div className="flex flex-col gap-1.5">
          <span className={FIELD_LABEL}>{t('Unit')}</span>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={t('Unit')}>
            {chips.map((u) => {
              const selected = item.unit === u && !otherUnitOpen
              return (
                <button
                  key={u}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => {
                    setOtherUnitOpen(false)
                    onUpdate('unit', selected ? null : u)
                  }}
                  className={cn(
                    'min-h-9 rounded-full border px-3 text-sm transition-colors',
                    selected
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border text-foreground hover:bg-muted',
                  )}
                >
                  {u}
                </button>
              )
            })}
            <button
              type="button"
              role="radio"
              aria-checked={otherUnitOpen}
              onClick={() => setOtherUnitOpen((open) => !open)}
              className={cn(
                'min-h-9 rounded-full border px-3 text-sm transition-colors',
                otherUnitOpen
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-dashed border-border text-muted-foreground hover:bg-muted',
              )}
            >
              {t('Other')}
            </button>
          </div>
          {otherUnitOpen && (
            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap gap-2">
                {unitOptions.slice(UNIT_CHIP_COUNT).map((u) => (
                  <button
                    key={u}
                    type="button"
                    onClick={() => onUpdate('unit', u)}
                    className={cn(
                      'min-h-9 rounded-full border px-3 text-sm transition-colors',
                      item.unit === u
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-border hover:bg-muted',
                    )}
                  >
                    {u}
                  </button>
                ))}
              </div>
              <input
                type="text"
                value={item.unit ?? ''}
                onChange={(e) => onUpdate('unit', e.target.value.trim() ? e.target.value : null)}
                placeholder={t('Type a unit')}
                aria-label={t('Custom unit')}
                className={cn(FIELD_BOX, 'text-base outline-none')}
              />
            </div>
          )}
        </div>

        {/* Live line total */}
        <div className="flex items-baseline justify-between border-t border-border pt-3">
          <span className="text-sm text-muted-foreground">{t('Item total')}</span>
          <span data-testid="item-editor-total" className="text-lg font-semibold tabular-nums">
            {formatMoney(item.total, currencyCode)}
          </span>
        </div>

        {/* More options: tax and line discount */}
        <div className="rounded-lg border border-border">
          <button
            type="button"
            onClick={() => setMoreOpen((open) => !open)}
            aria-expanded={moreOpen}
            className="flex w-full items-center justify-between px-3 py-3 text-sm font-medium"
          >
            {t('More options')}
            <ChevronDown className={cn('h-4 w-4 transition-transform', moreOpen && 'rotate-180')} />
          </button>
          {moreOpen && (
            <div className="flex flex-col gap-3 border-t border-border px-3 py-3">
              <label className="flex min-h-11 items-center justify-between gap-3 text-sm">
                <span>{t('Charge tax')}</span>
                <Switch
                  checked={item.taxable ?? true}
                  onCheckedChange={(checked) => onUpdate('taxable', checked)}
                  aria-label={t('Charge tax')}
                />
              </label>
              <div className="flex items-center justify-between gap-3 text-sm">
                <span>{t('Discount on this item')}</span>
                <div className="w-32">
                  <MoneyInput
                    name="discount"
                    value={item.discount ?? 0}
                    currencyCode={currencyCode}
                    onValueChange={(value) => onUpdate('discount', value)}
                    className="h-10 text-right text-base tabular-nums"
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="grid grid-cols-2 gap-3 pt-1 pb-[env(safe-area-inset-bottom,0px)]">
          <Button
            type="button"
            variant="outline"
            onClick={onDelete}
            className="h-11 gap-2 text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
          >
            <Trash2 className="h-4 w-4" />
            {t('Delete')}
          </Button>
          <Button type="button" variant="outline" onClick={onDuplicate} className="h-11 gap-2">
            <Copy className="h-4 w-4" />
            {t('Duplicate')}
          </Button>
        </div>
      </div>
    </div>
  )
}
