import { describe, it, expect } from 'vitest'
import { formatPhoneForDisplay } from '@/lib/phone/format'

describe('formatPhoneForDisplay', () => {
  it('formats US E.164 → "+1 (508) 301-3010"', () => {
    expect(formatPhoneForDisplay('+15083013010')).toBe('+1 (508) 301-3010')
  })

  it('formats already-formatted US "+1 (508) 301-3010" → same shape', () => {
    expect(formatPhoneForDisplay('+1 (508) 301-3010')).toBe('+1 (508) 301-3010')
  })

  it('formats BR E.164 → "+55 (11) 98765-4321"', () => {
    expect(formatPhoneForDisplay('+5511987654321')).toBe('+55 (11) 98765-4321')
  })

  it('returns raw input unchanged when no dial code matches', () => {
    // No country has dial '999' in COUNTRIES — should pass through.
    expect(formatPhoneForDisplay('+9990001111')).toBe('+9990001111')
  })

  it('returns empty string for empty/null/undefined input', () => {
    expect(formatPhoneForDisplay('')).toBe('')
    expect(formatPhoneForDisplay(null)).toBe('')
    expect(formatPhoneForDisplay(undefined)).toBe('')
  })
})
