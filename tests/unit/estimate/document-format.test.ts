import { describe, it, expect } from 'vitest'
import { formatDate, formatAddress } from '@/lib/estimate/document/format'

describe('formatDate — local-midnight fix (ENGINE-01)', () => {
  it('formats a date-only string as the SAME calendar day the string says', () => {
    expect(formatDate('2026-07-08', 'en')).toBe('July 8, 2026')
  })
  it('formats pt/es locales without throwing', () => {
    expect(formatDate('2026-07-08', 'pt')).toContain('2026')
    expect(formatDate('2026-07-08', 'es')).toContain('2026')
  })
  it('does not throw on a full ISO timestamp (only date-only strings get T00:00:00 normalization)', () => {
    expect(() => formatDate('2026-07-08T15:30:00Z', 'en')).not.toThrow()
  })
})

describe('formatAddress', () => {
  it('joins address + city/state/zip on two lines', () => {
    expect(formatAddress({ address: '123 Main St', city: 'Austin', state: 'TX', zip: '78701' }))
      .toBe('123 Main St\nAustin, TX 78701')
  })
  it('returns null when every field is empty', () => {
    expect(formatAddress({ address: null, city: null, state: null, zip: null })).toBeNull()
  })
})
