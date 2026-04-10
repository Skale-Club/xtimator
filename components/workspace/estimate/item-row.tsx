'use client'

import { GripVertical, Trash2 } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import type { EditorItem } from './use-estimate-reducer'

function formatCurrency(value: number): string {
  return value.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

interface ItemRowProps {
  item: EditorItem
  sectionId: string
  onUpdate: (field: 'description' | 'quantity' | 'unit' | 'unit_price', value: string | number | null) => void
  onRemove: () => void
  dragHandleProps?: Record<string, unknown>
  isReadOnly?: boolean
}

export function ItemRow({ item, onUpdate, onRemove, dragHandleProps, isReadOnly }: ItemRowProps) {
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
        <div className="relative">
          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
          <Input
            type="number"
            step="0.01"
            min="0"
            value={item.unit_price}
            onChange={(e) => onUpdate('unit_price', parseFloat(e.target.value) || 0)}
            className="h-9 w-full pl-6 text-right"
            disabled={isReadOnly}
          />
        </div>
      </td>
      <td className="py-1.5 px-1 w-28 text-right text-sm font-medium tabular-nums">
        ${formatCurrency(item.total)}
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
