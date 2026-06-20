import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { useState } from 'react'
import { MoneyInput } from '@/components/ui/money-input'

/**
 * Calculator / cents-style entry (see plan: humming-cuddling-summit).
 * Digits fill from the right; the decimal floats `minorUnit` places from the
 * right once the digit count passes `minorUnit`.
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

describe('MoneyInput — cents entry', () => {
  it('clears the seeded 0.00 to an empty field on focus', () => {
    render(<Harness initial={0} />)
    const input = screen.getByRole('textbox') as HTMLInputElement
    expect(input.value).toBe('0.00') // unfocused
    fireEvent.focus(input)
    expect(input.value).toBe('') // zeros gone — placeholder shows
  })

  it('follows the 5 > 50 > 5.00 > 50.00 sequence (USD)', () => {
    const onValue = vi.fn()
    render(<Harness onValue={onValue} />)
    const input = screen.getByRole('textbox') as HTMLInputElement
    fireEvent.focus(input)

    type(input, '5')
    expect(input.value).toBe('5')
    type(input, '50')
    expect(input.value).toBe('50')
    type(input, '500')
    expect(input.value).toBe('5.00')
    type(input, '5000')
    expect(input.value).toBe('50.00')

    expect(onValue).toHaveBeenLastCalledWith(50)
  })

  it('keeps the decimal two from the right regardless of length', () => {
    const onValue = vi.fn()
    render(<Harness onValue={onValue} />)
    const input = screen.getByRole('textbox') as HTMLInputElement
    fireEvent.focus(input)

    type(input, '12345')
    expect(input.value).toBe('123.45')
    expect(onValue).toHaveBeenLastCalledWith(123.45)

    // backspace one digit
    type(input, '1234')
    expect(input.value).toBe('12.34')
    expect(onValue).toHaveBeenLastCalledWith(12.34)
  })

  it('a 2-digit entry commits as cents (50 → $0.50)', () => {
    const onValue = vi.fn()
    render(<Harness onValue={onValue} />)
    const input = screen.getByRole('textbox') as HTMLInputElement
    fireEvent.focus(input)
    type(input, '50')
    fireEvent.blur(input)
    expect(onValue).toHaveBeenLastCalledWith(0.5)
  })

  it('strips leading zeros so typed zeros disappear', () => {
    render(<Harness />)
    const input = screen.getByRole('textbox') as HTMLInputElement
    fireEvent.focus(input)
    type(input, '000')
    expect(input.value).toBe('')
    type(input, '0050')
    expect(input.value).toBe('50')
  })

  it('round-trips an existing value on focus (edit mode)', () => {
    render(<Harness initial={12.5} />)
    const input = screen.getByRole('textbox') as HTMLInputElement
    expect(input.value).toBe('12.50')
    fireEvent.focus(input)
    expect(input.value).toBe('12.50') // seeded from 1250 minor units
  })

  it('never shows a decimal for zero-minor-unit currencies (JPY)', () => {
    const onValue = vi.fn()
    render(<Harness currencyCode="JPY" onValue={onValue} />)
    const input = screen.getByRole('textbox') as HTMLInputElement
    fireEvent.focus(input)
    type(input, '5000')
    expect(input.value).toBe('5,000')
    expect(onValue).toHaveBeenLastCalledWith(5000)
  })
})
