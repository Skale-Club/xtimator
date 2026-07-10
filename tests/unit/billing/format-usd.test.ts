import { describe, it, expect } from 'vitest'
import { formatUsd } from '@/lib/billing/format-usd'

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
})
