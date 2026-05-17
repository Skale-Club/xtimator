'use client'

import { type Dispatch } from 'react'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { EstimateEditorState, EstimateAction } from './use-estimate-reducer'

function formatCurrency(value: number): string {
  return value.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

interface EstimateTotalsProps {
  state: EstimateEditorState
  dispatch: Dispatch<EstimateAction>
  isReadOnly?: boolean
}

export function EstimateTotals({ state, dispatch, isReadOnly }: EstimateTotalsProps) {
  const discountTypeValue = state.discount_type ?? 'none'
  const taxPercent = Math.round(state.tax_rate * 10000) / 100

  return (
    <div className="flex justify-end">
      <div className="w-full max-w-sm space-y-2">
        {/* Subtotal */}
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Subtotal</span>
          <span className="font-medium tabular-nums">${formatCurrency(state.subtotal)}</span>
        </div>

        {/* Discount */}
        <div className="flex items-center justify-between gap-3 text-sm">
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground whitespace-nowrap">Discount</span>
            <Select
              value={discountTypeValue}
              onValueChange={(val) => {
                const type = val === 'none' ? null : val
                dispatch({
                  type: 'UPDATE_DISCOUNT',
                  discount_type: type,
                  discount_value: type ? state.discount_value : 0,
                })
              }}
              disabled={isReadOnly}
            >
              <SelectTrigger className="h-8 w-[130px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                <SelectItem value="percentage">Percentage</SelectItem>
                <SelectItem value="fixed">Fixed Amount</SelectItem>
              </SelectContent>
            </Select>
            {state.discount_type && (
              <div className="relative">
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={state.discount_value}
                  onChange={(e) =>
                    dispatch({
                      type: 'UPDATE_DISCOUNT',
                      discount_type: state.discount_type,
                      discount_value: parseFloat(e.target.value) || 0,
                    })
                  }
                  className="h-8 w-20 text-right text-xs"
                  disabled={isReadOnly}
                />
                {state.discount_type === 'percentage' && (
                  <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">%</span>
                )}
              </div>
            )}
          </div>
          {state.discount_amount > 0 && (
            <span className="font-medium tabular-nums text-destructive">
              -${formatCurrency(state.discount_amount)}
            </span>
          )}
        </div>

        {/* Tax */}
        <div className="flex items-center justify-between gap-3 text-sm">
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground whitespace-nowrap">Tax</span>
            <div className="relative">
              <Input
                type="number"
                step="0.01"
                min="0"
                value={taxPercent}
                onChange={(e) => {
                  const pct = parseFloat(e.target.value) || 0
                  dispatch({ type: 'UPDATE_TAX_RATE', tax_rate: pct / 100 })
                }}
                className="h-8 w-20 text-right text-xs"
                disabled={isReadOnly}
              />
              <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">%</span>
            </div>
          </div>
          <span className="font-medium tabular-nums">${formatCurrency(state.tax_amount)}</span>
        </div>

        {/* Divider */}
        <div className="border-t pt-2" />

        {/* Grand Total — highlighted glass row, mono numerics */}
        <div className="flex items-center justify-between rounded-md bg-[var(--glass-bg-light)] px-3 py-2">
          <span className="text-base font-semibold">Grand Total</span>
          <span className="font-mono text-xl font-semibold tabular-nums">${formatCurrency(state.total)}</span>
        </div>
      </div>
    </div>
  )
}
