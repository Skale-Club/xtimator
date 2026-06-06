import { describe, expect, it } from 'vitest'
import { buildWaMeLink } from '@/lib/whatsapp/wa-link'

describe('buildWaMeLink', () => {
  it('builds a bare wa.me link from an E.164 number', () => {
    expect(buildWaMeLink('+15551234567')).toBe('https://wa.me/15551234567')
  })

  it('strips +, spaces, and dashes', () => {
    expect(buildWaMeLink('+1 (555) 123-4567')).toBe('https://wa.me/15551234567')
  })

  it('URL-encodes the prefilled text', () => {
    const link = buildWaMeLink('+15551234567', "Hi! I'd like to start.")
    expect(link).toBe('https://wa.me/15551234567?text=Hi!%20I\'d%20like%20to%20start.')
  })

  it('returns null for null/empty input', () => {
    expect(buildWaMeLink(null)).toBeNull()
    expect(buildWaMeLink(undefined)).toBeNull()
    expect(buildWaMeLink('')).toBeNull()
  })

  it('returns null for too-short or too-long digit strings', () => {
    expect(buildWaMeLink('12345')).toBeNull()
    expect(buildWaMeLink('+1234567890123456')).toBeNull()
  })
})
