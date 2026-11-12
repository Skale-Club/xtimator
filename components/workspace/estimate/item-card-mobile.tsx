'use client'

import type { CSSProperties, JSX } from 'react'
import { DEFAULT_CURRENCY_CODE, formatMoney } from '@/lib/money/currency'
import type { DocumentItem } from '@/lib/estimate/document/model'
import { useTranslation } from '@/lib/i18n/use-translation'

// Mobile line items are READ rows in the list and are edited one at a time in
// the item editor sheet (item-editor-sheet.tsx). This is the pattern every
// field-service competitor follows on a phone (Jobber, Joist, Square,
// JobNimbus): a compact summary in the list, a focused editor on tap. The old
// card folded the desktop table onto four lines of always-open inputs.
//
//   Description (up to 2 lines) ........................ Total
//   1 visit × $180.00  [no tax] [discount −$20.00]

export const DEFAULT_UNIT_OPTIONS = [
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

/** "1 visit × $180.00" — the same quantity line the read-only card shows. */
export function formatItemQuantityLine(item: DocumentItem, currencyCode: string): string {
  const qty = Number.isInteger(item.quantity)
    ? String(item.quantity)
    : String(Number(item.quantity.toFixed(4)))
  const unit = item.unit ? ` ${item.unit}` : ''
  return `${qty}${unit} × ${formatMoney(item.unit_price, currencyCode)}`
}

interface ItemSummaryRowProps {
  item: DocumentItem
  currencyCode?: string
  /** Opens the item editor. Omitted (read-only) → the row is not interactive. */
  onOpen?: () => void
  /** The estimate charges tax, so a non-taxed line is worth tagging. */
  showTaxState?: boolean
  /** dnd-kit sortable wiring. Listeners go on the whole row: a long press
   *  starts a drag (TouchSensor delay), a tap opens the editor. */
  dragProps?: Record<string, unknown>
  sortableRef?: (node: HTMLElement | null) => void
  style?: CSSProperties
}

export function ItemSummaryRow({
  item,
  currencyCode = DEFAULT_CURRENCY_CODE,
  onOpen,
  showTaxState = true,
  dragProps,
  sortableRef,
  style,
}: ItemSummaryRowProps): JSX.Element {
  const { t } = useTranslation()
  const hasDiscount = (item.discount ?? 0) !== 0
  const notTaxed = showTaxState && item.taxable === false
  const description = item.description.trim()

  return (
    <div
      ref={sortableRef}
      style={style}
      data-mobile-item-id={item.id}
      className="border-b border-border/50 last:border-b-0"
    >
      <button
        {...dragProps}
        type="button"
        onClick={onOpen}
        disabled={!onOpen}
        aria-label={`${t('Edit item')}: ${description || t('New item')}`}
        className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-0.5 px-6 py-3 text-left transition-colors active:bg-muted/40 disabled:cursor-default [touch-action:pan-y] select-none"
      >
        <span
          className={`line-clamp-2 break-words text-base font-medium leading-snug ${
            description ? '' : 'italic text-muted-foreground'
          }`}
        >
          {description || t('New item')}
        </span>
        <span className="row-span-2 self-center text-right text-base font-semibold tabular-nums whitespace-nowrap">
          {formatMoney(item.total, currencyCode)}
        </span>
        <span className="flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground tabular-nums">
          <span>{formatItemQuantityLine(item, currencyCode)}</span>
          {notTaxed && (
            <span className="rounded-full bg-muted px-1.5 py-px text-[11px] font-medium text-muted-foreground">
              {t('No tax')}
            </span>
          )}
          {hasDiscount && (
            <span className="rounded-full bg-amber-100 px-1.5 py-px text-[11px] font-medium text-amber-800">
              {t('Discount')} −{formatMoney(item.discount ?? 0, currencyCode)}
            </span>
          )}
        </span>
      </button>
    </div>
  )
}
