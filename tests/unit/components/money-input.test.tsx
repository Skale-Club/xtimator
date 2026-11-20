import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { useState } from 'react'
import { MoneyInput, moneyDraftToValue, sanitizeMoneyDraft } from '@/components/ui/money-input'

/**
 * Plain decimal entry (owner decision 2026-11-20): what you type is the amount.
 * It replaced a calculator-style entry where "35" became 0.35 while the field
 * still showed "35".
 */

function Harness({
  initial = 0,
  currencyCode = 'USD',
  onValue,
}: {
  initial?: number
  currencyCode?: string
  onValue?: (v: number) => void
}) {
  const [value, setValue] = useState<number>(initial)
  return (
    <MoneyInput
      value={value}
      currencyCode={currencyCode}
      placeholder="0.00"
      onValueChange={(v) => {
        setValue(v)
        onValue?.(v)
      }}
    />
  )
}

function type(input: HTMLInputElement, raw: string) {
  fireEvent.change(input, { target: { value: raw } })
}

describe('MoneyInput — plain decimal entry', () => {
  it('clears the seeded 0.00 to an empty field on focus', () => {
    render(<Harness initial={0} />)
    const input = screen.getByRole('textbox') as HTMLInputElement
    expect(input.value).toBe('0.00') // unfocused
    fireEvent.focus(input)
    expect(input.value).toBe('') // placeholder shows
  })

  it('"35" is 35.00, not 0.35', () => {
    const onValue = vi.fn()
    render(<Harness onValue={onValue} />)
    const input = screen.getByRole('textbox') as HTMLInputElement
    fireEvent.focus(input)
    type(input, '35')
    expect(input.value).toBe('35')
    expect(onValue).toHaveBeenLastCalledWith(35)
    fireEvent.blur(input)
    expect(input.value).toBe('35.00')
    expect(onValue).toHaveBeenLastCalledWith(35)
  })

  it('accepts a dot or a comma as the decimal separator', () => {
    const onValue = vi.fn()
    render(<Harness onValue={onValue} />)
    const input = screen.getByRole('textbox') as HTMLInputElement
    fireEvent.focus(input)
    type(input, '35.5')
    expect(onValue).toHaveBeenLastCalledWith(35.5)
    type(input, '35,75')
    expect(onValue).toHaveBeenLastCalledWith(35.75)
  })

  it('keeps at most two decimals and one separator', () => {
    render(<Harness />)
    const input = screen.getByRole('textbox') as HTMLInputElement
    fireEvent.focus(input)
    type(input, '12.3456')
    expect(input.value).toBe('12.34')
    type(input, '1.2.3')
    expect(input.value).toBe('1.23')
  })

  it('drops symbols and letters from a paste', () => {
    const onValue = vi.fn()
    render(<Harness onValue={onValue} />)
    const input = screen.getByRole('textbox') as HTMLInputElement
    fireEvent.focus(input)
    type(input, '$1250abc')
    expect(input.value).toBe('1250')
    expect(onValue).toHaveBeenLastCalledWith(1250)
  })

  it('round-trips an existing value on focus (edit mode)', () => {
    render(<Harness initial={12.5} />)
    const input = screen.getByRole('textbox') as HTMLInputElement
    expect(input.value).toBe('12.50')
    fireEvent.focus(input)
    expect(input.value).toBe('12.5')
  })

  it('edits a whole-number value without decimals', () => {
    render(<Harness initial={1100} />)
    const input = screen.getByRole('textbox') as HTMLInputElement
    fireEvent.focus(input)
    expect(input.value).toBe('1100')
  })

  it('never takes a decimal for zero-minor-unit currencies (JPY)', () => {
    const onValue = vi.fn()
    render(<Harness currencyCode="JPY" onValue={onValue} />)
    const input = screen.getByRole('textbox') as HTMLInputElement
    fireEvent.focus(input)
    type(input, '5000.5')
    expect(input.value).toBe('50005')
    expect(onValue).toHaveBeenLastCalledWith(50005)
  })
})

describe('sanitizeMoneyDraft / moneyDraftToValue', () => {
  it('cleans a draft and parses it', () => {
    expect(sanitizeMoneyDraft('007', 2)).toBe('7')
    expect(sanitizeMoneyDraft('0.5', 2)).toBe('0.5')
    expect(sanitizeMoneyDraft('', 2)).toBe('')
    expect(moneyDraftToValue('35,5')).toBe(35.5)
    expect(moneyDraftToValue('')).toBe(0)
    expect(moneyDraftToValue('.')).toBe(0)
  })
})
