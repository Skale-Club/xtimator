import { describe, it, expect } from 'vitest'

/**
 * SEED-054 — the referral-cookie contract shared by the edge proxy (writer) and
 * the signup server action (reader). A malformed cookie must always mean "no
 * referral" and never throw: it sits directly in the signup path.
 */

import {
  REFERRAL_COOKIE,
  REFERRAL_COOKIE_OPTIONS,
  REFERRAL_QUERY_PARAM,
  isWithinAttributionWindow,
  parseReferralCookie,
  readReferralParam,
  serializeReferralCookie,
} from '@/lib/affiliates/attribution'

describe('cookie options', () => {
  it('is httpOnly — no client code reads it, so keep it out of XSS reach', () => {
    expect(REFERRAL_COOKIE_OPTIONS.httpOnly).toBe(true)
  })

  it('is sameSite=lax so a cross-site referral click still carries it', () => {
    expect(REFERRAL_COOKIE_OPTIONS.sameSite).toBe('lax')
  })

  it('is site-wide — a referral link may land on any marketing page', () => {
    expect(REFERRAL_COOKIE_OPTIONS.path).toBe('/')
  })
})

describe('serialize/parse round trip', () => {
  it('round-trips code and issue timestamp', () => {
    const issuedAt = new Date('2026-08-05T12:00:00.000Z')
    const parsed = parseReferralCookie(serializeReferralCookie('joao2026', issuedAt))
    expect(parsed?.code).toBe('joao2026')
    expect(parsed?.issuedAt.getTime()).toBe(issuedAt.getTime())
  })

  it('normalizes a tampered mixed-case code on read', () => {
    expect(parseReferralCookie('JoAo2026.1754395200000')?.code).toBe('joao2026')
  })
})

describe('parseReferralCookie — malformed input means "no referral"', () => {
  it('returns null for absent values', () => {
    expect(parseReferralCookie(null)).toBeNull()
    expect(parseReferralCookie(undefined)).toBeNull()
    expect(parseReferralCookie('')).toBeNull()
  })

  it('returns null when the timestamp is not a number', () => {
    expect(parseReferralCookie('joao2026.notatimestamp')).toBeNull()
  })

  it('returns null when the timestamp is non-positive', () => {
    expect(parseReferralCookie('joao2026.0')).toBeNull()
    expect(parseReferralCookie('joao2026.-5')).toBeNull()
  })

  it('returns null when the code cannot normalize', () => {
    expect(parseReferralCookie('!!.1754395200000')).toBeNull()
  })

  it('accepts a bare legacy code, dating it now rather than dropping it', () => {
    const now = new Date('2026-08-05T12:00:00.000Z')
    const parsed = parseReferralCookie('joao2026', now)
    expect(parsed?.code).toBe('joao2026')
    expect(parsed?.issuedAt.getTime()).toBe(now.getTime())
  })
})

describe('isWithinAttributionWindow', () => {
  const now = new Date('2026-08-05T00:00:00.000Z')
  const daysAgo = (n: number) => new Date(now.getTime() - n * 24 * 60 * 60 * 1000)

  it('attributes a click inside the window', () => {
    expect(isWithinAttributionWindow(daysAgo(30), 90, now)).toBe(true)
  })

  it('attributes at exactly the boundary', () => {
    expect(isWithinAttributionWindow(daysAgo(90), 90, now)).toBe(true)
  })

  it('drops a click past the window', () => {
    expect(isWithinAttributionWindow(daysAgo(91), 90, now)).toBe(false)
  })

  it('attributes regardless of age when the window is disabled (0)', () => {
    expect(isWithinAttributionWindow(daysAgo(10_000), 0, now)).toBe(true)
  })

  it('tolerates a future timestamp rather than losing a real click to clock skew', () => {
    const future = new Date(now.getTime() + 60_000)
    expect(isWithinAttributionWindow(future, 90, now)).toBe(true)
  })
})

describe('readReferralParam', () => {
  it('extracts and normalizes ?ref=', () => {
    expect(readReferralParam(new URLSearchParams('ref=JoAo2026'))).toBe('joao2026')
  })

  it('returns null when the param is absent', () => {
    expect(readReferralParam(new URLSearchParams('utm_source=x'))).toBeNull()
  })

  it('returns null for an unusable value so the proxy skips the cookie write', () => {
    expect(readReferralParam(new URLSearchParams('ref=ab'))).toBeNull()
  })

  it('uses the documented param and cookie names', () => {
    expect(REFERRAL_QUERY_PARAM).toBe('ref')
    expect(REFERRAL_COOKIE).toBe('xt_ref')
  })
})
