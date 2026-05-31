import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { resolveBaseUrl } from '@/lib/utils/site-url'

describe('resolveBaseUrl — sanitization + 3-tier fallback precedence', () => {
  let envBackup: string | undefined

  beforeEach(() => {
    envBackup = process.env.NEXT_PUBLIC_SITE_URL
    delete process.env.NEXT_PUBLIC_SITE_URL
  })

  afterEach(() => {
    if (envBackup === undefined) delete process.env.NEXT_PUBLIC_SITE_URL
    else process.env.NEXT_PUBLIC_SITE_URL = envBackup
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
})
