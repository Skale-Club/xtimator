'use client'

import { useState, type CSSProperties, type JSX } from 'react'
import { GripVertical, MoreVertical } from 'lucide-react'
import { MoneyInput } from '@/components/ui/money-input'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { DEFAULT_CURRENCY_CODE, formatMoney } from '@/lib/money/currency'
import { LABELS, type DocumentLabels } from '@/lib/estimate/document/labels'
import type { DocumentItem } from '@/lib/estimate/document/model'
import type { PriceBookItem } from '@/lib/queries/price-book'
import { PriceBookCombobox } from './price-book-combobox'

// The mobile line-item editor is the desktop table row folded onto two lines.
// Every control, class, label and action mirrors `SortableDocumentItemRow`
// in `estimate-document.tsx` so the two breakpoints read as the same field
// profile:
//
//   line 1  [grip][kebab] Description ........................... Total
//   line 2  Qty | Unit | Unit Price | Tax
//   line 3  Discount (only while the row has, or is drafting, a discount)
//
// The literal below is the exact INLINE_INPUT_CLS string used by the desktop
// row (kept inlined: this file is imported by `estimate-document.tsx`, so
// importing back would be a cycle).
const INLINE_INPUT_CLS =
  'w-full bg-transparent text-base p-1 focus:outline-none focus:bg-muted/30 focus:rounded-sm hover:bg-muted/20 hover:rounded-sm transition-colors'

// Same MoneyInput class string as the desktop unit-price / discount cells
// (pl-6 keeps the currency symbol clear of the digits).
const MONEY_INPUT_CLS =
  'h-8 bg-transparent border-0 shadow-none text-right text-base tabular-nums pl-6 pr-1 py-1 focus:ring-1 focus:ring-primary/30 hover:bg-muted/20 hover:rounded-sm'

/** Column template shared by the per-section header row and every card's
 *  numeric line, so each label sits exactly above the field it names. */
export const MOBILE_FIELD_GRID_CLS =
  'grid grid-cols-[3rem_minmax(0,1fr)_6rem_3.25rem] items-center gap-x-1'

/** Width of the grip + kebab column, matching the desktop table's first cell. */
const HANDLE_COL_CLS = 'flex items-center gap-0.5 w-12 shrink-0'

export type ItemCardMobileLabels = Pick<
  DocumentLabels,
  | 'description'
  | 'qty'
  | 'unit'
  | 'unitPrice'
  | 'discount'
  | 'lineDiscount'
  | 'taxable'
  | 'total'
  | 'addDiscount'
  | 'removeDiscount'
  | 'deleteLine'
  | 'rowActions'
  | 'noMatches'
>

const DEFAULT_LABELS: ItemCardMobileLabels = LABELS.en

const DEFAULT_UNIT_OPTIONS = [
  'each',
  'hour',
  'day',
  'sq ft',
  'linear ft',
  'cubic yd',
  'gallon',
  'lb',
  'ton',
  'lot',
]

interface ItemCardMobileProps {
  item: DocumentItem
  onUpdate: (
    field: 'description' | 'quantity' | 'unit' | 'unit_price' | 'discount' | 'taxable',
    value: string | number | boolean | null
  ) => void
  onRemove: () => void
  isReadOnly?: boolean
  currencyCode?: string
  unitOptions?: string[]
  /** Localized labels. Defaults to English so the card renders standalone. */
  labels?: Partial<ItemCardMobileLabels>
  /** Price-book rows for the description combobox (empty = plain input). */
  priceBookItems?: PriceBookItem[]
  onSelectPriceBookItem?: (item: PriceBookItem) => void
  /** Whether the discount line renders. When omitted the card manages a
   *  local draft: visible while the value is non-zero or after "Add
   *  discount" was picked from the kebab. */
  showDiscount?: boolean
  onAddDiscount?: () => void
  onRemoveDiscount?: () => void
  /** dnd-kit sortable wiring: attributes + listeners go on the grip (so the
   *  card itself is not a focusable role="button"), ref/style on the outer div. */
  dragHandleProps?: Record<string, unknown>
  sortableRef?: (node: HTMLElement | null) => void
  style?: CSSProperties
}

/**
 * Per-section column header for the mobile card list: the desktop table's
 * `<thead>`, folded the same way the cards are.
 */
export function ItemCardMobileHeader({
  labels,
}: {
  labels?: Partial<ItemCardMobileLabels>
}): JSX.Element {
  const L = { ...DEFAULT_LABELS, ...labels }
  return (
    <div className="bg-muted/50 text-xs text-muted-foreground border-b border-border/50 select-none px-6 py-1.5 space-y-1">
      <div className="flex items-center gap-0.5">
        <span className="w-12 shrink-0" aria-hidden />
        <span className="flex-1 min-w-0 truncate font-medium px-1">{L.description}</span>
        <span className="shrink-0 font-medium text-right pl-1">{L.total}</span>
      </div>
      <div className={MOBILE_FIELD_GRID_CLS}>
        <span className="font-medium text-center truncate">{L.qty}</span>
        <span className="font-medium px-1 truncate">{L.unit}</span>
        <span className="font-medium text-right pr-1 truncate">{L.unitPrice}</span>
        <span className="font-medium text-center truncate">{L.taxable}</span>
      </div>
    </div>
  )
}

export function ItemCardMobile({
  item,
  onUpdate,
  onRemove,
  isReadOnly,
  currencyCode = DEFAULT_CURRENCY_CODE,
  unitOptions,
  labels,
  priceBookItems = [],
  onSelectPriceBookItem,
  showDiscount,
  onAddDiscount,
  onRemoveDiscount,
  dragHandleProps,
  sortableRef,
  style,
}: ItemCardMobileProps): JSX.Element {
  const L = { ...DEFAULT_LABELS, ...labels }

  const resolvedUnits = (() => {
    const base = unitOptions ?? DEFAULT_UNIT_OPTIONS
    if (item.unit && !base.includes(item.unit)) return [item.unit, ...base]
    return base
  })()

  // Discount visibility mirrors the desktop Disc. column: hidden until the
  // row carries a non-zero discount or the user drafts one from the kebab.
  const [localDraft, setLocalDraft] = useState(false)
  const hasDiscount = (item.discount ?? 0) !== 0
  const discountVisible = showDiscount ?? (hasDiscount || localDraft)

  function handleAddDiscount() {
    if (onAddDiscount) onAddDiscount()
    else setLocalDraft(true)
  }
  function handleRemoveDiscount() {
    onUpdate('discount', 0)
    setLocalDraft(false)
    onRemoveDiscount?.()
  }

  const gripVisible = Boolean(dragHandleProps) && !isReadOnly

  return (
    <div
      ref={sortableRef}
      style={style}
      data-mobile-item-id={item.id}
      className="border-b border-border/50 last:border-b-0 px-6 py-1 group"
    >
      {/* line 1: grip/kebab, description, total */}
      <div className="flex items-center gap-0.5">
        <div className={HANDLE_COL_CLS}>
          <span
            className={`cursor-grab touch-none inline-flex items-center justify-center min-h-[44px] w-[22px] text-muted-foreground/30 group-hover:text-muted-foreground/60 ${
              gripVisible ? '' : 'invisible'
            }`}
            {...(gripVisible ? dragHandleProps : {})}
          >
            <GripVertical className="h-3.5 w-3.5" />
          </span>
          {!isReadOnly && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  aria-label={L.rowActions}
                  className="inline-flex items-center justify-center min-h-[44px] w-[22px] transition-colors text-muted-foreground/50 hover:text-muted-foreground"
                >
                  <MoreVertical className="h-3.5 w-3.5" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                {!discountVisible && (
                  <DropdownMenuItem onClick={handleAddDiscount}>{L.addDiscount}</DropdownMenuItem>
                )}
                {discountVisible && (
                  <DropdownMenuItem onClick={handleRemoveDiscount}>
                    {L.removeDiscount}
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem variant="destructive" onClick={onRemove}>
                  {L.deleteLine}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>

        <PriceBookCombobox
          value={item.description}
          onChange={(next) => onUpdate('description', next)}
          onSelectPriceBookItem={(pb) => onSelectPriceBookItem?.(pb)}
          items={priceBookItems}
          currencyCode={currencyCode}
          placeholder={L.description}
          aria-label={L.description}
          className={`${INLINE_INPUT_CLS} min-w-0`}
          noMatchesLabel={L.noMatches}
          disabled={isReadOnly}
        />

        <span className="shrink-0 pl-1 text-base tabular-nums font-medium text-right whitespace-nowrap">
          {formatMoney(item.total, currencyCode)}
        </span>
      </div>

      {/* line 2: qty, unit, unit price, tax (same order as the desktop columns) */}
      <div className={MOBILE_FIELD_GRID_CLS}>
        <input
          type="number"
          step="any"
          min="0"
          value={item.quantity}
          onChange={(e) =>
            onUpdate('quantity', parseFloat(e.target.value) || 0)
          }
          className={`${INLINE_INPUT_CLS} text-center tabular-nums`}
          disabled={isReadOnly}
          aria-label={L.qty}
        />

        <Select
          value={item.unit ?? ''}
          onValueChange={(value) => onUpdate('unit', value || null)}
          disabled={isReadOnly}
        >
          <SelectTrigger
            className="h-8 min-w-0 bg-transparent border-0 shadow-none text-base px-1 hover:bg-muted/20 focus:ring-1 focus:ring-primary/30"
            aria-label={L.unit}
          >
            <SelectValue placeholder="—" />
          </SelectTrigger>
          <SelectContent>
            {resolvedUnits.map((u) => (
              <SelectItem key={u} value={u}>
                {u}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <MoneyInput
          name="unit_price"
          value={item.unit_price}
          currencyCode={currencyCode}
          onValueChange={(value) => onUpdate('unit_price', value)}
          className={MONEY_INPUT_CLS}
          disabled={isReadOnly}
        />

        {/* 44px wrapper keeps the WCAG 2.5.5 touch target on the compact Switch. */}
        <div className="flex items-center justify-center min-h-[44px]">
          <Switch
            checked={item.taxable ?? true}
            onCheckedChange={(checked) => onUpdate('taxable', checked)}
            disabled={isReadOnly}
            aria-label={L.taxable}
          />
        </div>
      </div>

      {/* line 3: discount, only while the row has (or drafts) one */}
      {discountVisible && (
        <div className="flex items-center justify-end gap-2 pb-1">
          <span className="text-sm text-muted-foreground select-none">{L.discount}</span>
          <div className="w-28">
            <MoneyInput
              name="discount"
              value={item.discount ?? 0}
              currencyCode={currencyCode}
              onValueChange={(value) => onUpdate('discount', value)}
              className={MONEY_INPUT_CLS}
              disabled={isReadOnly}
            />
          </div>
        </div>
      )}
    </div>
  )
}
