import { describe, expect, it } from 'vitest'
import { WHATSAPP_FIRST_ESTIMATE_TEXT, buildFirstEstimateLink } from '@/lib/whatsapp/welcome-card'

describe('buildFirstEstimateLink', () => {
  it('builds a wa.me link with digits only and the url-encoded prefilled text', () => {
    const link = buildFirstEstimateLink('+1 (555) 123-4567')
    expect(link).toBe(`https://wa.me/15551234567?text=${encodeURIComponent(WHATSAPP_FIRST_ESTIMATE_TEXT)}`)
    expect(WHATSAPP_FIRST_ESTIMATE_TEXT).toBe('Hi! I want to create my first estimate')
  })

  it('returns null (button hidden) when no platform number is configured', () => {
    expect(buildFirstEstimateLink(null)).toBeNull()
    expect(buildFirstEstimateLink('')).toBeNull()
    expect(buildFirstEstimateLink('abc')).toBeNull()
  })
})
