'use client'

import { GripVertical, Trash2, CheckCircle2, Zap, Search } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { MoneyInput } from '@/components/ui/money-input'
import { DEFAULT_CURRENCY_CODE, formatMoney } from '@/lib/money/currency'
import type { EditorItem } from './use-estimate-reducer'

interface ItemRowProps {
  item: EditorItem
  sectionId: string
  onUpdate: (field: 'description' | 'quantity' | 'unit' | 'unit_price', value: string | number | null) => void
  onRemove: () => void
  dragHandleProps?: Record<string, unknown>
  isReadOnly?: boolean
  currencyCode?: string
}

export function ItemRow({
  item,
  onUpdate,
  onRemove,
  dragHandleProps,
  isReadOnly,
  currencyCode = DEFAULT_CURRENCY_CODE,
}: ItemRowProps) {
  return (
    <tr className="group border-b last:border-b-0">
      <td className="py-1.5 px-1 w-8">
        {!isReadOnly && (
          <span
            className="cursor-grab text-muted-foreground/50 hover:text-muted-foreground inline-flex items-center"
            {...dragHandleProps}
          >
            <GripVertical className="h-4 w-4" />
          </span>
        )}
      </td>
      <td className="py-1.5 px-1">
        <Input
          value={item.description}
          onChange={(e) => onUpdate('description', e.target.value)}
          placeholder="Item description"
          className="h-9 w-full"
          disabled={isReadOnly}
        />
      </td>
      <td className="py-1.5 px-1 w-20">
        <Input
          type="number"
          step="any"
          min="0"
          value={item.quantity}
          onChange={(e) => onUpdate('quantity', parseFloat(e.target.value) || 0)}
          className="h-9 w-full text-right"
          disabled={isReadOnly}
        />
      </td>
      <td className="py-1.5 px-1 w-20">
        <Input
          value={item.unit ?? ''}
          onChange={(e) => onUpdate('unit', e.target.value || null)}
          placeholder="unit"
          className="h-9 w-full"
          disabled={isReadOnly}
        />
      </td>
      <td className="py-1.5 px-1 w-28">
        <MoneyInput
          value={item.unit_price}
          currencyCode={currencyCode}
          onValueChange={(value) => onUpdate('unit_price', value)}
          className="h-9"
          disabled={isReadOnly}
        />
      </td>
      <td className="py-1.5 px-1 w-28">
        {item.isManuallyEdited ? (
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
        ) : null}
      </td>
      <td className="py-1.5 px-1 w-28 text-right text-sm font-medium tabular-nums">
        {formatMoney(item.total, currencyCode)}
      </td>
      <td className="py-1.5 px-1 w-10">
        {!isReadOnly && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onRemove}
            className="h-9 w-9 min-h-[44px] min-w-[44px] text-muted-foreground hover:text-destructive"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
      </td>
    </tr>
  )
}
