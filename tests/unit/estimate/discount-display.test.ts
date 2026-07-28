import { describe, it, expect } from 'vitest'
import { isPercentageDiscount } from '@/lib/estimate/discount-display'

describe('isPercentageDiscount', () => {
  it('returns true for the schema spelling "percentage"', () => {
    expect(isPercentageDiscount('percentage')).toBe(true)
  })

  it('returns true for the totals-engine-internal spelling "percent"', () => {
    expect(isPercentageDiscount('percent')).toBe(true)
  })

  it('returns false for "fixed"', () => {
    expect(isPercentageDiscount('fixed')).toBe(false)
  })

  it('returns false for the AI-write-path spelling "amount"', () => {
    expect(isPercentageDiscount('amount')).toBe(false)
  })

  it('returns false for null', () => {
    expect(isPercentageDiscount(null)).toBe(false)
  })
})
