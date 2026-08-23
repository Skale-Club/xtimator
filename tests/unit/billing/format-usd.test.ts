import { describe, it, expect } from 'vitest'
import { formatUsd, formatCredits } from '@/lib/billing/format-usd'

/**
 * Shared USD formatter — whole-dollar amounts drop decimals; any fractional
 * amount shows exactly two. Single source of truth for every derived dollar
 * figure on the billing page (packs, thresholds, tier prices).
 */
describe('formatUsd', () => {
  it('renders a whole-dollar amount with no decimals', () => {
    expect(formatUsd(2000)).toBe('$20')
  })

  it('renders a half-dollar amount with two decimals', () => {
    expect(formatUsd(2050)).toBe('$20.50')
  })

  it('renders a cents-precise amount with two decimals', () => {
    expect(formatUsd(2999)).toBe('$29.99')
  })

  it('renders zero as "$0"', () => {
    expect(formatUsd(0)).toBe('$0')
  })

  // CREDITFIX-03 (audit finding #3): thousands separator + correct sign
  // placement for negative amounts.
  it('renders a whole-dollar amount >= $1,000 with a thousands separator', () => {
    expect(formatUsd(100000)).toBe('$1,000')
  })

  it('renders a fractional amount >= $1,000 with a thousands separator and two decimals', () => {
    expect(formatUsd(123456)).toBe('$1,234.56')
  })

  it('renders a negative whole-dollar amount as "-$5.00", sign BEFORE the currency symbol', () => {
    expect(formatUsd(-500)).toBe('-$5.00')
    expect(formatUsd(-500)).not.toBe('$-5')
    expect(formatUsd(-500)).not.toBe('$-5.00')
  })

  it('renders a negative fractional amount as "-$20.50"', () => {
    expect(formatUsd(-2050)).toBe('-$20.50')
  })

  it('renders a large negative amount with a thousands separator', () => {
    expect(formatUsd(-123456)).toBe('-$1,234.56')
  })
})

/**
 * formatCredits — the CREDIT-denominated counterpart to formatUsd. Plain
 * thousands-separated integer, NEVER a "$" — credits are not dollars
 * (CREDITFIX-03: auto_topup_threshold_credits was previously run through
 * formatUsd, so "500 credits" rendered as "$5").
 */
describe('formatCredits', () => {
  it('renders a small integer as-is', () => {
    expect(formatCredits(12)).toBe('12')
  })

  it('renders a >=1,000 integer with a thousands separator', () => {
    expect(formatCredits(7500)).toBe('7,500')
  })

  it('renders zero as "0"', () => {
    expect(formatCredits(0)).toBe('0')
  })

  it('renders a negative integer with a leading "-", never "$"', () => {
    expect(formatCredits(-12)).toBe('-12')
  })

  it('rounds a fractional input to the nearest whole credit', () => {
    expect(formatCredits(199.6)).toBe('200')
  })

  it('never contains a "$"', () => {
    expect(formatCredits(500)).not.toContain('$')
  })
})
