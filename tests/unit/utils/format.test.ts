import { describe, it, expect } from 'vitest'
import { formatUSD } from '@/lib/utils/format'

describe('formatUSD', () => {
  it('formats zero cents as $0.00', () => {
    expect(formatUSD(0)).toBe('$0.00')
  })

  it('formats whole-dollar values', () => {
    expect(formatUSD(100)).toBe('$1.00')
    expect(formatUSD(50000)).toBe('$500.00')
  })

  it('formats large values with thousand separators', () => {
    expect(formatUSD(1234567)).toBe('$12,345.67')
  })

  it('treats null/undefined as $0.00', () => {
    expect(formatUSD(null)).toBe('$0.00')
    expect(formatUSD(undefined)).toBe('$0.00')
  })

  it('treats non-finite values as $0.00', () => {
    expect(formatUSD(Number.NaN)).toBe('$0.00')
    expect(formatUSD(Number.POSITIVE_INFINITY)).toBe('$0.00')
  })
})
