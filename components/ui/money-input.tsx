'use client'

import { useState } from 'react'
import { flushSync } from 'react-dom'
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
  /**
   * 'start' (default): the symbol pinned to the field's left edge.
   * 'beside': the symbol sits right next to the right-aligned number, for
   * table cells where a pinned symbol drifts far from short amounts. In this
   * mode `className` styles the whole field (a <label>, so a click anywhere
   * focuses the number) and the input itself is unstyled.
   */
  symbolPlacement?: 'start' | 'beside'
}

// Keep a typed amount within a safe range (12 integer digits).
const MAX_INTEGER_DIGITS = 12

/**
 * Plain decimal entry (owner decision 2026-11-20): what you type is the
 * amount. "35" is 35.00, "35.5" or "35,5" is 35.50. It replaced a
 * calculator-style entry where digits filled in from the right ("35" was
 * 0.35 while the field still showed "35"), which priced lines 100x too low
 * and disagreed with the change order fields.
 *
 * Accepts digits and ONE decimal separator ("." or ","), at most `minorUnit`
 * decimals (none for zero-decimal currencies such as JPY). Anything else
 * typed or pasted (currency symbols, letters, thousands separators after the
 * decimal) is dropped.
 */
export function sanitizeMoneyDraft(raw: string, minorUnit: number): string {
  let out = ''
  let seenSeparator = false
  let decimals = 0
  let integerDigits = 0
  for (const ch of raw) {
    if (ch >= '0' && ch <= '9') {
      if (seenSeparator) {
        if (decimals >= minorUnit) continue
        decimals += 1
      } else {
        if (integerDigits >= MAX_INTEGER_DIGITS) continue
        integerDigits += 1
      }
      out += ch
    } else if ((ch === '.' || ch === ',') && !seenSeparator && minorUnit > 0) {
      seenSeparator = true
      out += ch
    }
  }
  // Drop leading zeros of the integer part ("007" -> "7"), keeping "0.5".
  return out.replace(/^0+(?=\d)/, '')
}

/** A sanitized draft -> its numeric value ("35,5" -> 35.5, "" or "." -> 0). */
export function moneyDraftToValue(draft: string): number {
  const n = Number(draft.replace(',', '.'))
  return Number.isFinite(n) ? n : 0
}

/** The editable text for an existing value: no grouping, decimals only when needed. */
function valueToDraft(value: number | null | undefined, minorUnit: number, decimalSeparator: string): string {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return ''
  const fixed = value.toFixed(minorUnit)
  const trimmed = minorUnit > 0 ? fixed.replace(/\.?0+$/, '') : fixed
  return decimalSeparator === ',' ? trimmed.replace('.', ',') : trimmed
}

function localeDecimalSeparator(locale: string): string {
  return new Intl.NumberFormat(locale).formatToParts(1.1).find((p) => p.type === 'decimal')?.value ?? '.'
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
  symbolPlacement = 'start',
}: MoneyInputProps) {
  const [focused, setFocused] = useState(false)
  const [draft, setDraft] = useState('')
  const currency = getCurrencyConfig(currencyCode)
  const minorUnit = currency.minorUnit
  const symbol = getCurrencySymbol(currencyCode)
  const display = focused ? draft : formatMoneyNumber(value ?? 0, currencyCode)

  const inputProps = {
    id,
    name,
    inputMode: (minorUnit > 0 ? 'decimal' : 'numeric') as 'decimal' | 'numeric',
    'data-money-input': '',
    value: display,
    placeholder,
    disabled,
    onFocus: () => {
      // Commit the editable representation before the browser selects text.
      // A deferred value replacement can collapse that selection and append a
      // new amount to the old one instead of replacing it.
      flushSync(() => {
        setFocused(true)
        setDraft(valueToDraft(value, minorUnit, localeDecimalSeparator(currency.locale)))
      })
    },
    onChange: (event: React.ChangeEvent<HTMLInputElement>) => {
      const next = sanitizeMoneyDraft(event.target.value, minorUnit)
      setDraft(next)
      onValueChange(Math.max(min, moneyDraftToValue(next)))
    },
    onBlur: () => {
      setFocused(false)
      onValueChange(Math.max(min, moneyDraftToValue(draft)))
      onBlur?.()
    },
  }

  if (symbolPlacement === 'beside') {
    // The input is only as wide as its text, so the symbol stays beside the
    // number however short it is (`ch` tracks tabular digits closely).
    const chars = Math.max(display.length || placeholder?.length || 1, 1)
    return (
      <label className={cn('flex cursor-text items-center justify-end gap-0.5 tabular-nums', className)}>
        <span className="pointer-events-none text-muted-foreground">{symbol}</span>
        <input
          {...inputProps}
          style={{ width: `${chars + 0.5}ch` }}
          className="min-w-0 bg-transparent p-0 text-right tabular-nums outline-none disabled:cursor-not-allowed"
        />
      </label>
    )
  }

  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
        {symbol}
      </span>
      <Input {...inputProps} className={cn('pl-10 text-right tabular-nums', className)} />
    </div>
  )
}
