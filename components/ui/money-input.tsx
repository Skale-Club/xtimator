'use client'

import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import {
  formatMoneyNumber,
  getCurrencyConfig,
  getCurrencySymbol,
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

// Cap the digit buffer to keep parseInt within a safe range.
const MAX_DIGITS = 12

/** Cents accumulator → numeric value. `1250` (minorUnit 2) → 12.5. */
function digitsToValue(digits: string, minorUnit: number): number {
  if (!digits) return 0
  const n = parseInt(digits, 10)
  if (!Number.isFinite(n)) return 0
  return n / 10 ** minorUnit
}

/** Strip everything but digits, drop leading zeros, cap length. */
function sanitizeDigits(raw: string): string {
  return raw.replace(/\D/g, '').replace(/^0+/, '').slice(0, MAX_DIGITS)
}

/** Seed the buffer from an existing numeric value (e.g. when editing). */
function valueToDigits(value: number | null | undefined, minorUnit: number): string {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return ''
  return String(Math.round(value * 10 ** minorUnit))
}

/**
 * Calculator / cents-style display: digits fill in from the right and the
 * decimal floats two (minorUnit) places from the right once you pass the
 * minor-unit digit count.
 *   minorUnit 2:  "5" → "5", "50" → "50", "500" → "5.00", "5000" → "50.00"
 *   minorUnit 0:  "5" → "5" (no decimal ever)
 */
function digitsToDisplay(digits: string, minorUnit: number, locale: string): string {
  if (!digits) return ''
  if (minorUnit === 0) {
    return new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(parseInt(digits, 10))
  }
  // Decimal not yet reached — show the raw digits with no separator.
  if (digits.length <= minorUnit) return digits
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: minorUnit,
    maximumFractionDigits: minorUnit,
  }).format(digitsToValue(digits, minorUnit))
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
  const [digits, setDigits] = useState('')
  const currency = getCurrencyConfig(currencyCode)
  const minorUnit = currency.minorUnit
  const symbol = getCurrencySymbol(currencyCode)

  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
        {symbol}
      </span>
      <Input
        id={id}
        name={name}
        inputMode="numeric"
        value={focused ? digitsToDisplay(digits, minorUnit, currency.locale) : formatMoneyNumber(value ?? 0, currencyCode)}
        placeholder={placeholder}
        disabled={disabled}
        className={cn('pl-10 text-right tabular-nums', className)}
        onFocus={() => {
          setFocused(true)
          // Seed from the current value so editing works; clears 0.00 → empty.
          setDigits(valueToDigits(value, minorUnit))
        }}
        onChange={(event) => {
          const next = sanitizeDigits(event.target.value)
          setDigits(next)
          onValueChange(Math.max(min, digitsToValue(next, minorUnit)))
        }}
        onBlur={() => {
          setFocused(false)
          onValueChange(Math.max(min, digitsToValue(digits, minorUnit)))
          onBlur?.()
        }}
      />
    </div>
  )
}
