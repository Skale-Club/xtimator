import { describe, expect, it } from 'vitest'
import {
  SHARE_LINK_TTL_DAYS,
  shareLinkExpiryFromNow,
  isShareLinkExpired,
} from '@/lib/estimates/share-link'

describe('share-link helpers', () => {
  it('shareLinkExpiryFromNow returns ~TTL days in the future', () => {
    const iso = shareLinkExpiryFromNow()
    const ms = new Date(iso).getTime() - Date.now()
    const days = ms / (1000 * 60 * 60 * 24)
    expect(days).toBeGreaterThan(SHARE_LINK_TTL_DAYS - 1)
    expect(days).toBeLessThan(SHARE_LINK_TTL_DAYS + 1)
  })

  it('isShareLinkExpired: null/empty never expires', () => {
    expect(isShareLinkExpired(null)).toBe(false)
    expect(isShareLinkExpired(undefined)).toBe(false)
    expect(isShareLinkExpired('')).toBe(false)
  })

  it('isShareLinkExpired: past = expired, future = active', () => {
    const past = new Date(Date.now() - 1000).toISOString()
    const future = new Date(Date.now() + 60_000).toISOString()
    expect(isShareLinkExpired(past)).toBe(true)
    expect(isShareLinkExpired(future)).toBe(false)
  })

  it('a fresh expiry is NOT expired', () => {
    expect(isShareLinkExpired(shareLinkExpiryFromNow())).toBe(false)
  })
})
