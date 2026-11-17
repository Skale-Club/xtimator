'use client'

import { Trash2 } from 'lucide-react'
import { formatCurrency } from '@/lib/utils/format'
import { useTranslation } from '@/lib/i18n/use-translation'
import { cn } from '@/lib/utils'
import type { ChangeOrderItem } from '@/lib/change-orders/types'
import { MINUS } from './change-order-utils'

/**
 * One line of the editor. Numbers stay strings while typing so "1." or "" never
 * fights the cursor. The line type (added work or credit) is a flag over a
 * POSITIVE price: the stored unit_price is negative for a credit.
 */
export interface LineDraft {
  key: string
  id?: string
  description: string
  quantity: string
  unit: string
  /** Magnitude, always shown positive. */
  price: string
  credit: boolean
  taxable: boolean
}

let keySeq = 0
export function nextLineKey(): string {
  keySeq += 1
  return `new-${keySeq}`
}

function num(value: string): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

const round2 = (n: number) => Math.round(n * 100) / 100

export function lineUnitPrice(line: LineDraft): number {
  const magnitude = Math.abs(num(line.price))
  return line.credit ? -magnitude : magnitude
}

export function lineTotal(line: LineDraft): number {
  return round2(num(line.quantity) * lineUnitPrice(line))
}

export function lineFromItem(item: ChangeOrderItem): LineDraft {
  return {
    key: item.id,
    id: item.id,
    description: item.description,
    quantity: String(item.quantity),
    unit: item.unit ?? '',
    price: String(Math.abs(item.unit_price)),
    credit: item.unit_price < 0,
    taxable: item.taxable,
  }
}

export function blankLine(credit: boolean, taxable: boolean): LineDraft {
  return { key: nextLineKey(), description: '', quantity: '1', unit: '', price: '', credit, taxable }
}

export function isBlankLine(line: LineDraft): boolean {
  return line.description.trim() === '' && num(line.price) === 0
}

const FIELD =
  'h-10 w-full min-w-0 rounded-md border border-neutral-300 bg-white px-2.5 text-base text-neutral-900 outline-none placeholder:text-neutral-400 focus:border-[hsl(var(--primary))] focus:ring-2 focus:ring-[hsl(var(--primary)/0.25)] disabled:border-transparent disabled:bg-transparent disabled:px-0 disabled:opacity-100'

function FieldLabel({ children }: { children: string }) {
  return <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-neutral-500 md:hidden">{children}</span>
}

export interface LinesEditorProps {
  lines: LineDraft[]
  readOnly: boolean
  currencyCode: string
  /** Only when the change order carries tax. */
  showTaxable: boolean
  onChange: (key: string, patch: Partial<LineDraft>) => void
  onRemove: (key: string) => void
}

/**
 * Lines of the change order. Phones: one stacked card per line. md and up: one
 * grid row per line under a header row. Read-only renders the same rows with
 * disabled inputs.
 */
export function LinesEditor({ lines, readOnly, currencyCode, showTaxable, onChange, onRemove }: LinesEditorProps) {
  const { t } = useTranslation()
  const cols = 'md:grid-cols-[minmax(0,1fr)_4.5rem_5.5rem_7rem_7.5rem]'

  return (
    <div data-testid="change-order-lines">
      <div
        aria-hidden
        className={cn(
          'hidden gap-2 border-b border-neutral-200 pb-1.5 text-[11px] font-medium uppercase tracking-wide text-neutral-500 md:grid',
          cols,
        )}
      >
        <span>{t('Description')}</span>
        <span>{t('Qty')}</span>
        <span>{t('Unit')}</span>
        <span className="text-right">{t('Unit price')}</span>
        <span className="text-right">{t('Total')}</span>
      </div>

      {lines.length === 0 && (
        <p className="py-4 text-center text-sm text-neutral-500">{t('No items yet. Add work or a credit.')}</p>
      )}

      <ul className="flex flex-col gap-3 md:gap-0">
        {lines.map((line, index) => {
          const total = lineTotal(line)
          const isCredit = line.credit
          const label = `${t('Item')} ${index + 1}`
          return (
            <li
              key={line.key}
              data-testid="change-order-line"
              data-credit={isCredit ? 'true' : 'false'}
              className={cn(
                'grid grid-cols-3 gap-x-2 gap-y-2 rounded-xl border border-neutral-200 p-3 md:items-center md:rounded-none md:border-0 md:border-b md:px-0 md:py-2',
                cols,
              )}
            >
              <div className="col-span-3 md:col-span-1">
                <FieldLabel>{t('Description')}</FieldLabel>
                <input
                  value={line.description}
                  onChange={(e) => onChange(line.key, { description: e.target.value })}
                  disabled={readOnly}
                  aria-label={`${label} ${t('description')}`}
                  placeholder={t('Describe the work')}
                  className={FIELD}
                />
              </div>
              <div className="min-w-0">
                <FieldLabel>{t('Qty')}</FieldLabel>
                <input
                  type="number"
                  inputMode="decimal"
                  step="any"
                  min="0"
                  value={line.quantity}
                  onChange={(e) => onChange(line.key, { quantity: e.target.value })}
                  disabled={readOnly}
                  aria-label={`${label} ${t('quantity')}`}
                  className={cn(FIELD, 'tabular-nums md:text-center')}
                />
              </div>
              <div className="min-w-0">
                <FieldLabel>{t('Unit')}</FieldLabel>
                <input
                  value={line.unit}
                  onChange={(e) => onChange(line.key, { unit: e.target.value })}
                  disabled={readOnly}
                  aria-label={`${label} ${t('unit')}`}
                  placeholder={t('ea')}
                  className={cn(FIELD, 'md:text-center')}
                />
              </div>
              <div className="min-w-0">
                <FieldLabel>{t('Unit price')}</FieldLabel>
                <input
                  type="number"
                  inputMode="decimal"
                  step="any"
                  min="0"
                  value={line.price}
                  onChange={(e) => onChange(line.key, { price: e.target.value })}
                  disabled={readOnly}
                  aria-label={`${label} ${isCredit ? t('credit amount') : t('unit price')}`}
                  placeholder="0.00"
                  className={cn(FIELD, 'tabular-nums md:text-right', isCredit && 'text-red-600')}
                />
              </div>
              <div className="col-span-3 flex items-baseline justify-between md:col-span-1 md:justify-end">
                <span className="text-[11px] font-medium uppercase tracking-wide text-neutral-500 md:hidden">{t('Total')}</span>
                <span
                  data-testid="change-order-line-total"
                  className={cn('text-base font-semibold tabular-nums', total < 0 ? 'text-red-600' : 'text-neutral-900')}
                >
                  {total < 0 ? `${MINUS}${formatCurrency(Math.abs(total), currencyCode)}` : formatCurrency(total, currencyCode)}
                </span>
              </div>

              {!readOnly ? (
                <div className="col-span-3 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-neutral-100 pt-1.5 md:col-span-full md:border-0 md:pt-0">
                  <button
                    type="button"
                    role="switch"
                    aria-checked={isCredit}
                    aria-label={`${label} ${t('is a credit')}`}
                    onClick={() => onChange(line.key, { credit: !isCredit })}
                    className="inline-flex min-h-10 items-center gap-2 text-[13px] font-medium text-neutral-600"
                  >
                    <span
                      aria-hidden
                      className={cn(
                        'relative h-5 w-9 rounded-full transition-colors',
                        isCredit ? 'bg-red-500' : 'bg-neutral-300',
                      )}
                    >
                      <span
                        className={cn(
                          'absolute top-0.5 size-4 rounded-full bg-white shadow transition-all',
                          isCredit ? 'left-[18px]' : 'left-0.5',
                        )}
                      />
                    </span>
                    {t('Credit')}
                  </button>
                  {showTaxable && (
                    <label className="inline-flex min-h-10 items-center gap-2 text-[13px] font-medium text-neutral-600">
                      <input
                        type="checkbox"
                        checked={line.taxable}
                        onChange={(e) => onChange(line.key, { taxable: e.target.checked })}
                        aria-label={`${label} ${t('taxable')}`}
                        className="size-4 accent-[hsl(var(--primary))]"
                      />
                      {t('Taxable')}
                    </label>
                  )}
                  <button
                    type="button"
                    onClick={() => onRemove(line.key)}
                    aria-label={`${t('Delete')} ${label.toLowerCase()}`}
                    className="ml-auto inline-flex size-10 items-center justify-center rounded-full text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-red-600"
                  >
                    <Trash2 className="size-4" aria-hidden />
                  </button>
                </div>
              ) : (
                isCredit && (
                  <p className="col-span-3 text-[12px] font-medium text-red-600 md:col-span-full">{t('Credit')}</p>
                )
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
