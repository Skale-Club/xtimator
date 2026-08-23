import { describe, it, expect } from 'vitest'
import { parseMoneyInput } from '@/lib/money/currency'

/**
 * lib/money/currency.ts parseMoneyInput — audit fix.
 *
 * Before this fix, `parseMoneyInput` stripped everything outside `[\d,.-]`,
 * so a pasted "1e3" (scientific notation, e.g. copied out of a spreadsheet)
 * had its "e" silently dropped, collapsing to "13" — a wrong parse ($13
 * instead of $1,000) with no error signal. parseMoneyInput now detects an
 * [eE] with digits on both sides and returns null instead of guessing.
 */
describe('parseMoneyInput — scientific notation rejection', () => {
  it('returns null for lowercase scientific notation ("1e3")', () => {
    expect(parseMoneyInput('1e3', 'USD')).toBeNull()
  })

  it('returns null for uppercase scientific notation ("1E3")', () => {
    expect(parseMoneyInput('1E3', 'USD')).toBeNull()
  })

  it('returns null for scientific notation with an explicit positive exponent ("1e+3")', () => {
    expect(parseMoneyInput('1e+3', 'USD')).toBeNull()
  })

  it('returns null for scientific notation with a negative exponent ("1e-3")', () => {
    expect(parseMoneyInput('1e-3', 'USD')).toBeNull()
  })

  it('returns null for scientific notation embedded in a larger pasted value ("$1,000e3 total")', () => {
    expect(parseMoneyInput('$1,000e3 total', 'USD')).toBeNull()
  })

  it('does NOT reject an ordinary decimal amount ("1234.56")', () => {
    expect(parseMoneyInput('1234.56', 'USD')).toBe(1234.56)
  })

  it('does NOT reject a plain integer amount ("1000")', () => {
    expect(parseMoneyInput('1000', 'USD')).toBe(1000)
  })

  it('does NOT reject a currency-formatted amount ("$1,000.00")', () => {
    expect(parseMoneyInput('$1,000.00', 'USD')).toBe(1000)
  })

  it('does not false-positive on a stray "e" with no digit on one side (e.g. trailing "e")', () => {
    // "100e" has no digit AFTER the e, so it is not scientific notation by
    // our detector — it falls through to normal parsing, where the
    // non-numeric "e" is stripped like any other stray character.
    expect(parseMoneyInput('100e', 'USD')).toBe(100)
  })

  it('still returns 0 for genuinely non-numeric input (unchanged prior behavior)', () => {
    expect(parseMoneyInput('abc', 'USD')).toBe(0)
  })
})
