'use client'

import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import {
  formatMoneyNumber,
  getCurrencyConfig,
  getCurrencySymbol,
  parseMoneyInput,
  type SupportedCurrencyCode,
} from '@/lib/money/currency'

interface MoneyInputProps {
  value: number | null | undefined
  onValueChange: (value: number) => void
  currencyCode: SupportedCurrencyCode | string | null | undefined
  disabled?: boolean
  id?: string
  name?: string
  className?: string
  placeholder?: string
  min?: number
  onBlur?: () => void
}

function toEditString(value: number | null | undefined, currencyCode: MoneyInputProps['currencyCode']) {
  const currency = getCurrencyConfig(currencyCode)
  const amount = typeof value === 'number' && Number.isFinite(value) ? value : 0
  return amount.toFixed(currency.minorUnit)
}

export function MoneyInput({
  value,
  onValueChange,
  currencyCode,
  disabled,
  id,
  name,
  className,
  placeholder,
  min = 0,
  onBlur,
}: MoneyInputProps) {
  const [focused, setFocused] = useState(false)
  const [draft, setDraft] = useState(() => toEditString(value, currencyCode))
  const symbol = getCurrencySymbol(currencyCode)

  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
        {symbol}
      </span>
      <Input
        id={id}
        name={name}
        inputMode="decimal"
        value={focused ? draft : formatMoneyNumber(value ?? 0, currencyCode)}
        placeholder={placeholder}
        disabled={disabled}
        className={cn('pl-10 text-right tabular-nums', className)}
        onFocus={() => {
          setFocused(true)
          setDraft(toEditString(value, currencyCode))
        }}
        onChange={(event) => {
          const nextDraft = event.target.value
          setDraft(nextDraft)
          const nextValue = Math.max(min, parseMoneyInput(nextDraft, currencyCode))
          onValueChange(nextValue)
        }}
        onBlur={() => {
          setFocused(false)
          const nextValue = Math.max(min, parseMoneyInput(draft, currencyCode))
          onValueChange(nextValue)
          setDraft(toEditString(nextValue, currencyCode))
          onBlur?.()
        }}
      />
    </div>
  )
}
