import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { resolveBaseUrl, getCanonicalBaseUrl } from '@/lib/utils/site-url'

describe('resolveBaseUrl — sanitization + 4-tier fallback precedence', () => {
  let siteUrlBackup: string | undefined
  let appOriginBackup: string | undefined

  beforeEach(() => {
    siteUrlBackup = process.env.NEXT_PUBLIC_SITE_URL
    appOriginBackup = process.env.APP_ORIGIN
    delete process.env.NEXT_PUBLIC_SITE_URL
    delete process.env.APP_ORIGIN
  })

  afterEach(() => {
    if (siteUrlBackup === undefined) delete process.env.NEXT_PUBLIC_SITE_URL
    else process.env.NEXT_PUBLIC_SITE_URL = siteUrlBackup
    if (appOriginBackup === undefined) delete process.env.APP_ORIGIN
    else process.env.APP_ORIGIN = appOriginBackup
  })

  it('1. NEXT_PUBLIC_SITE_URL set to a clean value is returned as-is', () => {
    process.env.NEXT_PUBLIC_SITE_URL = 'https://xtimator.com'
    const req = new Request('https://0.0.0.0:3000/callback')
    expect(resolveBaseUrl(req)).toBe('https://xtimator.com')
  })

  it('2. live Coolify bug: trailing newline is stripped', () => {
    process.env.NEXT_PUBLIC_SITE_URL = 'https://xtimator.com\n'
    const req = new Request('https://0.0.0.0:3000/callback')
    expect(resolveBaseUrl(req)).toBe('https://xtimator.com')
  })

  it('3. surrounding double quotes are stripped', () => {
    process.env.NEXT_PUBLIC_SITE_URL = '"https://xtimator.com"'
    const req = new Request('https://0.0.0.0:3000/callback')
    expect(resolveBaseUrl(req)).toBe('https://xtimator.com')
  })

  it('4. trailing slash is stripped', () => {
    process.env.NEXT_PUBLIC_SITE_URL = 'https://xtimator.com/'
    const req = new Request('https://0.0.0.0:3000/callback')
    expect(resolveBaseUrl(req)).toBe('https://xtimator.com')
  })

  it('5. whitespace-only value falls through to header fallback', () => {
    process.env.NEXT_PUBLIC_SITE_URL = '   \n  '
    const req = new Request('https://0.0.0.0:3000/callback', {
      headers: { 'x-forwarded-proto': 'https', 'x-forwarded-host': 'xtimator.com' },
    })
    expect(resolveBaseUrl(req)).toBe('https://xtimator.com')
  })

  it('6. proxy fallback: env unset, X-Forwarded-* headers drive the result', () => {
    const req = new Request('https://0.0.0.0:3000/callback', {
      headers: { 'x-forwarded-proto': 'https', 'x-forwarded-host': 'xtimator.com' },
    })
    expect(resolveBaseUrl(req)).toBe('https://xtimator.com')
  })

  it('7. last resort: env unset, no X-Forwarded-* headers → request origin', () => {
    const req = new Request('https://0.0.0.0:3000/callback')
    expect(resolveBaseUrl(req)).toBe('https://0.0.0.0:3000')
  })

  it('8. APP_ORIGIN (runtime, non-inlined) wins over NEXT_PUBLIC_SITE_URL', () => {
    process.env.APP_ORIGIN = 'https://xtimator.com'
    process.env.NEXT_PUBLIC_SITE_URL = 'https://stale-build-inlined.example.com'
    const req = new Request('https://0.0.0.0:3000/callback')
    expect(resolveBaseUrl(req)).toBe('https://xtimator.com')
  })

  it('9. APP_ORIGIN with trailing newline (Coolify env) is normalized', () => {
    process.env.APP_ORIGIN = 'https://xtimator.com\n'
    const req = new Request('https://0.0.0.0:3000/callback')
    expect(resolveBaseUrl(req)).toBe('https://xtimator.com')
  })

  it('10. APP_ORIGIN unset, NEXT_PUBLIC_SITE_URL set → tier-2 fallback still works', () => {
    process.env.NEXT_PUBLIC_SITE_URL = 'https://xtimator.com'
    const req = new Request('https://0.0.0.0:3000/callback')
    expect(resolveBaseUrl(req)).toBe('https://xtimator.com')
  })
})

describe('getCanonicalBaseUrl — request-less canonical precedence', () => {
  let siteUrlBackup: string | undefined
  let appOriginBackup: string | undefined
  let appUrlBackup: string | undefined

  beforeEach(() => {
    siteUrlBackup = process.env.NEXT_PUBLIC_SITE_URL
    appOriginBackup = process.env.APP_ORIGIN
    appUrlBackup = process.env.NEXT_PUBLIC_APP_URL
    delete process.env.NEXT_PUBLIC_SITE_URL
    delete process.env.APP_ORIGIN
    delete process.env.NEXT_PUBLIC_APP_URL
  })

  afterEach(() => {
    if (siteUrlBackup === undefined) delete process.env.NEXT_PUBLIC_SITE_URL
    else process.env.NEXT_PUBLIC_SITE_URL = siteUrlBackup
    if (appOriginBackup === undefined) delete process.env.APP_ORIGIN
    else process.env.APP_ORIGIN = appOriginBackup
    if (appUrlBackup === undefined) delete process.env.NEXT_PUBLIC_APP_URL
    else process.env.NEXT_PUBLIC_APP_URL = appUrlBackup
  })

  it('1. APP_ORIGIN wins over NEXT_PUBLIC_SITE_URL and NEXT_PUBLIC_APP_URL', () => {
    process.env.APP_ORIGIN = 'https://xtimator.com'
    process.env.NEXT_PUBLIC_SITE_URL = 'https://site.example.com'
    process.env.NEXT_PUBLIC_APP_URL = 'https://app.example.com'
    expect(getCanonicalBaseUrl()).toBe('https://xtimator.com')
  })

  it('2. APP_ORIGIN unset, NEXT_PUBLIC_SITE_URL set → NEXT_PUBLIC_SITE_URL', () => {
    process.env.NEXT_PUBLIC_SITE_URL = 'https://site.example.com'
    process.env.NEXT_PUBLIC_APP_URL = 'https://app.example.com'
    expect(getCanonicalBaseUrl()).toBe('https://site.example.com')
  })

  it('3. only NEXT_PUBLIC_APP_URL set → NEXT_PUBLIC_APP_URL (legacy alias)', () => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://app.example.com'
    expect(getCanonicalBaseUrl()).toBe('https://app.example.com')
  })

  it('4. all three unset → https://xtimator.com', () => {
    expect(getCanonicalBaseUrl()).toBe('https://xtimator.com')
  })

  it('5. trailing newline on the winning tier is normalized', () => {
    process.env.APP_ORIGIN = 'https://xtimator.com\n'
    expect(getCanonicalBaseUrl()).toBe('https://xtimator.com')
  })

  it('6. trailing slash on the winning tier is normalized', () => {
    process.env.NEXT_PUBLIC_SITE_URL = 'https://site.example.com/'
    expect(getCanonicalBaseUrl()).toBe('https://site.example.com')
  })
})
