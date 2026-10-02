import { describe, it, expect } from 'vitest'
import { formatDate, formatAddress, formatProjectType, formatPercent } from '@/lib/estimate/document/format'

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

describe('formatProjectType — matches the web (replace(/_/g, " ") + CSS capitalize)', () => {
  it('returns null for null / empty / blank input', () => {
    expect(formatProjectType(null)).toBeNull()
    expect(formatProjectType('')).toBeNull()
    expect(formatProjectType('  _ ')).toBeNull()
  })
  it('capitalises a single word', () => {
    expect(formatProjectType('plumbing')).toBe('Plumbing')
  })
  it('turns underscores into spaces and capitalises each word', () => {
    expect(formatProjectType('kitchen_remodel')).toBe('Kitchen Remodel')
    expect(formatProjectType('full_house_exterior_painting')).toBe('Full House Exterior Painting')
  })
  it('leaves already-capitalised input unchanged (CSS capitalize never lower-cases)', () => {
    expect(formatProjectType('Kitchen Remodel')).toBe('Kitchen Remodel')
    expect(formatProjectType('HVAC_install')).toBe('HVAC Install')
  })
  it('collapses repeated separators the way HTML whitespace collapsing does on the web', () => {
    expect(formatProjectType('kitchen__remodel_')).toBe('Kitchen Remodel')
  })
})

describe('formatPercent — ONE percent string for PDF, web, preview and WhatsApp', () => {
  it('trims trailing zeros', () => {
    expect(formatPercent(10)).toBe('10%')
    expect(formatPercent(8.5)).toBe('8.5%')
    expect(formatPercent(8.25)).toBe('8.25%')
    expect(formatPercent(100)).toBe('100%')
  })
  it('renders zero as 0%', () => {
    expect(formatPercent(0)).toBe('0%')
    expect(formatPercent(-0)).toBe('0%')
  })
  it('rounds to at most 2 decimals', () => {
    expect(formatPercent(7.125)).toBe('7.13%')
    expect(formatPercent(33.333)).toBe('33.33%')
  })
  it('absorbs float noise from fraction * 100 call sites', () => {
    expect(formatPercent(0.07 * 100)).toBe('7%')
    expect(formatPercent(0.0825 * 100)).toBe('8.25%')
  })
})
