'use client'

import { Trash2, CheckCircle2, Zap, Search } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { MoneyInput } from '@/components/ui/money-input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { DEFAULT_CURRENCY_CODE, formatMoney } from '@/lib/money/currency'
import type { EditorItem } from './use-estimate-reducer'

interface ItemCardMobileProps {
  item: EditorItem
  onUpdate: (field: 'description' | 'quantity' | 'unit' | 'unit_price', value: string | number | null) => void
  onRemove: () => void
  isReadOnly?: boolean
  currencyCode?: string
  unitOptions?: string[]
}

/**
 * R4 mobile-first variant of ItemRow. Stacked card layout that keeps every
 * field editable inline without forcing horizontal scroll. Drag-reorder is
 * desktop-only — on mobile the editing surface takes priority and users
 * reorder via the desktop layout when needed.
 */
const DEFAULT_UNIT_OPTIONS = ['each', 'hour', 'day', 'sq ft', 'linear ft', 'cubic yd', 'gallon', 'lb', 'ton', 'lot']

export function ItemCardMobile({
  item,
  onUpdate,
  onRemove,
  isReadOnly,
  currencyCode = DEFAULT_CURRENCY_CODE,
  unitOptions,
}: ItemCardMobileProps) {
  const resolvedUnits = (() => {
    const base = unitOptions ?? DEFAULT_UNIT_OPTIONS
    if (item.unit && !base.includes(item.unit)) return [item.unit, ...base]
    return base
  })()
  const badge = item.isManuallyEdited ? (
    <Badge variant="outline" className="text-xs">Edited</Badge>
  ) : item.price_source === 'price_book' ? (
    <Badge variant="secondary" className="text-xs gap-1">
      <CheckCircle2 className="h-3 w-3" />Price book
    </Badge>
  ) : item.price_source === 'ai_estimate' ? (
    <Badge variant="outline" className="text-xs gap-1">
      <Zap className="h-3 w-3" />AI estimate
    </Badge>
  ) : item.price_source === 'researched' ? (
    <Badge variant="outline" className="text-xs gap-1">
      <Search className="h-3 w-3" />Researched
    </Badge>
  ) : null

  return (
    <Card variant="glass" className="p-3 space-y-2">
      <Input
        value={item.description}
        onChange={(e) => onUpdate('description', e.target.value)}
        placeholder="Item description"
        className="h-9 w-full"
        disabled={isReadOnly}
      />

      <div className="grid grid-cols-[1fr,1fr,1.4fr] gap-2">
        <div>
          <label className="text-[10px] uppercase tracking-wider text-muted-foreground select-none">Qty</label>
          <Input
            type="number"
            step="any"
            min="0"
            value={item.quantity}
            onChange={(e) => onUpdate('quantity', parseFloat(e.target.value) || 0)}
            className="h-9 w-full text-right"
            disabled={isReadOnly}
          />
        </div>
        <div>
          <label className="text-[10px] uppercase tracking-wider text-muted-foreground select-none">Unit</label>
          <Select
            value={item.unit ?? ''}
            onValueChange={(value) => onUpdate('unit', value || null)}
            disabled={isReadOnly}
          >
            <SelectTrigger className="h-9 w-full">
              <SelectValue placeholder="—" />
            </SelectTrigger>
            <SelectContent>
              {resolvedUnits.map((u) => (
                <SelectItem key={u} value={u}>{u}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-[10px] uppercase tracking-wider text-muted-foreground select-none">Unit Price</label>
          <MoneyInput
            value={item.unit_price}
            currencyCode={currencyCode}
            onValueChange={(value) => onUpdate('unit_price', value)}
            className="h-9"
            disabled={isReadOnly}
          />
        </div>
      </div>

      <div className="flex items-center justify-between pt-1">
        <div className="flex items-center gap-2">{badge}</div>
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold tabular-nums">
            {formatMoney(item.total, currencyCode)}
          </span>
          {!isReadOnly && (
            <Button
              variant="ghost"
              size="icon"
              onClick={onRemove}
              className="h-9 w-9 min-h-[44px] min-w-[44px] text-muted-foreground hover:text-destructive"
              aria-label="Remove item"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
    </Card>
  )
}
