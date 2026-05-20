/**
 * Phase 76 PB-CSV-04 — RED tests for locale-aware currency parsing.
 *
 * These tests WILL fail until 76-02 implements `parseCurrency` + `detectLocale`.
 * They lock in expected behavior across US, BR, Plain, Custom, and edge cases.
 */
import { describe, it, expect } from 'vitest'
import { detectLocale, parseCurrency } from '@/lib/csv/locale-parser'

describe('parseCurrency — US locale', () => {
  it('parses "$1,234.56" → 1234.56', () => {
    expect(parseCurrency('$1,234.56', 'us')).toBe(1234.56)
  })
  it('parses "1,234.56" (no symbol) → 1234.56', () => {
    expect(parseCurrency('1,234.56', 'us')).toBe(1234.56)
  })
  it('parses "$ 999.00" (space after symbol) → 999', () => {
    expect(parseCurrency('$ 999.00', 'us')).toBe(999)
  })
})

describe('parseCurrency — BR locale', () => {
  it('parses "R$ 1.234,56" → 1234.56', () => {
    expect(parseCurrency('R$ 1.234,56', 'br')).toBe(1234.56)
  })
  it('parses "1.234,56" (no symbol) → 1234.56', () => {
    expect(parseCurrency('1.234,56', 'br')).toBe(1234.56)
  })
  it('parses "R$ 99,00" → 99', () => {
    expect(parseCurrency('R$ 99,00', 'br')).toBe(99)
  })
})

describe('parseCurrency — Plain locale', () => {
  it('parses "1234" → 1234', () => {
    expect(parseCurrency('1234', 'plain')).toBe(1234)
  })
  it('parses "1234.5" → 1234.5', () => {
    expect(parseCurrency('1234.5', 'plain')).toBe(1234.5)
  })
})

describe('parseCurrency — quoting and whitespace', () => {
  it('strips surrounding double quotes: \'"1,234.56"\' → 1234.56 (US)', () => {
    expect(parseCurrency('"1,234.56"', 'us')).toBe(1234.56)
  })
  it('returns null for empty/whitespace input', () => {
    expect(parseCurrency('', 'us')).toBeNull()
    expect(parseCurrency('   ', 'us')).toBeNull()
  })
  it('returns null for unparseable garbage like "abc"', () => {
    expect(parseCurrency('abc', 'us')).toBeNull()
  })
})

describe('parseCurrency — Custom locale', () => {
  it('parses "1 234,56" with decimal="," thousands=" " → 1234.56', () => {
    expect(parseCurrency('1 234,56', 'custom', { decimal: ',', thousands: ' ' })).toBe(1234.56)
  })
})

describe('detectLocale', () => {
  it('detects US from $-prefixed dot-decimal samples', () => {
    expect(detectLocale(['$1,234.56', '$2,000.00', '$3.50'])).toBe('us')
  })
  it('detects BR from R$-prefixed comma-decimal samples', () => {
    expect(detectLocale(['R$ 1.234,56', 'R$ 2.000,00'])).toBe('br')
  })
  it('detects Plain from bare-number samples', () => {
    expect(detectLocale(['1234.56', '2000'])).toBe('plain')
  })
})
