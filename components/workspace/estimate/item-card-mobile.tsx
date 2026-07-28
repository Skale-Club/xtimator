'use client'

import type { JSX } from 'react'
import { Trash2, CheckCircle2, Zap, Search } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { MoneyInput } from '@/components/ui/money-input'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { DEFAULT_CURRENCY_CODE, formatMoney } from '@/lib/money/currency'
import type { EditorItem } from './use-estimate-reducer'

// Phase 162 3c (DOCUX-06) — the mobile line-item editor is rebuilt to match
// the desktop document-native table language: transparent inputs on the paper
// surface, no glass card wrapper. The literal below is the exact
// INLINE_INPUT_CLS string used by the desktop `SortableDocumentItemRow` in
// `estimate-document.tsx` (kept inlined per the plan's Option A — no
// cross-file coupling since this component is imported by that same file).
const INLINE_INPUT_CLS =
  'w-full bg-transparent text-base p-1 focus:outline-none focus:bg-muted/30 focus:rounded-sm hover:bg-muted/20 hover:rounded-sm transition-colors'

interface ItemCardMobileProps {
  item: EditorItem
  onUpdate: (
    field: 'description' | 'quantity' | 'unit' | 'unit_price' | 'discount' | 'taxable',
    value: string | number | boolean | null
  ) => void
  onRemove: () => void
  isReadOnly?: boolean
  currencyCode?: string
  unitOptions?: string[]
}

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

/**
 * Phase 162 3c — mobile line-item editor rebuilt to match the desktop
 * document-native table language. No glass card wrapper; transparent inputs
 * on the paper surface; 44px touch targets preserved on the Switch container
 * and trash button (WCAG 2.5.5 Level AA).
 *
 * Prop signature is intentionally identical to the pre-3c version so the
 * caller in `estimate-document.tsx` (mobile branch inside `sm:hidden`) needs
 * no changes.
 */
export function ItemCardMobile({
  item,
  onUpdate,
  onRemove,
  isReadOnly,
  currencyCode = DEFAULT_CURRENCY_CODE,
  unitOptions,
}: ItemCardMobileProps): JSX.Element {
  const resolvedUnits = (() => {
    const base = unitOptions ?? DEFAULT_UNIT_OPTIONS
    if (item.unit && !base.includes(item.unit)) return [item.unit, ...base]
    return base
  })()

  const badge = item.isManuallyEdited ? (
    <Badge variant="outline" className="text-xs">
      Edited
    </Badge>
  ) : item.price_source === 'price_book' ? (
    <Badge variant="secondary" className="text-xs gap-1">
      <CheckCircle2 className="h-3 w-3" />
      Price book
    </Badge>
  ) : item.price_source === 'ai_estimate' ? (
    <Badge variant="outline" className="text-xs gap-1">
      <Zap className="h-3 w-3" />
      AI estimate
    </Badge>
  ) : item.price_source === 'researched' ? (
    <Badge variant="outline" className="text-xs gap-1">
      <Search className="h-3 w-3" />
      Researched
    </Badge>
  ) : null

  return (
    <div className="border-b border-border/50 last:border-b-0 px-6 sm:px-10 py-2.5 space-y-1.5">
      <input
        value={item.description}
        onChange={(e) => onUpdate('description', e.target.value)}
        placeholder="Item description"
        className={INLINE_INPUT_CLS}
        disabled={isReadOnly}
        aria-label="Item description"
      />

      <div className="grid grid-cols-[auto,1fr] gap-x-3 gap-y-0.5 text-sm">
        <span className="text-muted-foreground select-none pt-1">Qty</span>
        <input
          type="number"
          step="any"
          min="0"
          value={item.quantity}
          onChange={(e) =>
            onUpdate('quantity', Math.max(0, parseFloat(e.target.value) || 0))
          }
          className={`${INLINE_INPUT_CLS} text-right tabular-nums`}
          disabled={isReadOnly}
          aria-label="Quantity"
        />

        <span className="text-muted-foreground select-none pt-1">Unit</span>
        <Select
          value={item.unit ?? ''}
          onValueChange={(value) => onUpdate('unit', value || null)}
          disabled={isReadOnly}
        >
          <SelectTrigger
            className="h-8 bg-transparent border-0 shadow-none text-right hover:bg-muted/20 focus:ring-1 focus:ring-primary/30"
            aria-label="Unit"
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

        <span className="text-muted-foreground select-none pt-1">Unit Price</span>
        <MoneyInput
          name="unit_price"
          value={item.unit_price}
          currencyCode={currencyCode}
          onValueChange={(value) => onUpdate('unit_price', value)}
          className="h-8 bg-transparent border-0 shadow-none text-right text-base tabular-nums"
          disabled={isReadOnly}
        />

        <span className="text-muted-foreground select-none pt-1">Discount</span>
        <MoneyInput
          name="discount"
          value={item.discount ?? 0}
          currencyCode={currencyCode}
          onValueChange={(value) => onUpdate('discount', value)}
          className="h-8 bg-transparent border-0 shadow-none text-right text-base tabular-nums"
          disabled={isReadOnly}
        />

        <span className="text-muted-foreground select-none flex items-center min-h-[44px]">
          Taxable
        </span>
        <div className="flex items-center justify-end min-h-[44px]">
          <Switch
            checked={item.taxable ?? true}
            onCheckedChange={(checked) => onUpdate('taxable', checked)}
            disabled={isReadOnly}
            aria-label="Taxable"
          />
        </div>
      </div>

      <div className="flex items-center justify-between pt-1 mt-1 border-t border-border/30">
        <div className="flex items-center gap-2">{badge}</div>
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold tabular-nums">
            {formatMoney(item.total, currencyCode)}
          </span>
          {!isReadOnly && (
            <button
              type="button"
              onClick={onRemove}
              className="min-h-[44px] min-w-[44px] flex items-center justify-center text-muted-foreground hover:text-destructive rounded-md transition-colors"
              aria-label="Remove item"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
