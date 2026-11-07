import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'

const cookieStore = new Map<string, string>()
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: (n: string) => (cookieStore.has(n) ? { value: cookieStore.get(n) } : undefined) }),
}))

import {
  isTwaCookieValue,
  hasTwaLaunchSignal,
  readTwaCookieClient,
  TWA_COOKIE_NAME,
} from '@/lib/pwa/twa-signal'
import { isTwaRequest } from '@/lib/pwa/twa-context'
import { proxy } from '@/proxy'

describe('isTwaCookieValue', () => {
  it('is true only for "1"', () => {
    expect(isTwaCookieValue('1')).toBe(true)
    expect(isTwaCookieValue('0')).toBe(false)
    expect(isTwaCookieValue('')).toBe(false)
    expect(isTwaCookieValue(undefined)).toBe(false)
    expect(isTwaCookieValue(null)).toBe(false)
  })
})

describe('hasTwaLaunchSignal', () => {
  it('detects the android-app referrer for our package', () => {
    expect(hasTwaLaunchSignal({ referer: 'android-app://com.xtimator.app' })).toBe(true)
    expect(hasTwaLaunchSignal({ referer: 'android-app://com.xtimator.app/https/xtimator.com' })).toBe(true)
  })
  it('ignores other referrers', () => {
    expect(hasTwaLaunchSignal({ referer: 'android-app://com.other.app' })).toBe(false)
    expect(hasTwaLaunchSignal({ referer: 'https://google.com/' })).toBe(false)
    expect(hasTwaLaunchSignal({ referer: null })).toBe(false)
    expect(hasTwaLaunchSignal({})).toBe(false)
  })
  it('detects ?source=twa', () => {
    expect(hasTwaLaunchSignal({ searchParams: new URLSearchParams('source=twa') })).toBe(true)
    expect(hasTwaLaunchSignal({ searchParams: new URLSearchParams('source=email') })).toBe(false)
  })
})

describe('isTwaRequest', () => {
  beforeEach(() => cookieStore.clear())
  it('reads the xt_twa cookie', async () => {
    expect(await isTwaRequest()).toBe(false)
    cookieStore.set(TWA_COOKIE_NAME, '1')
    expect(await isTwaRequest()).toBe(true)
  })
})

describe('readTwaCookieClient', () => {
  afterEach(() => {
    document.cookie = 'xt_twa=; Max-Age=0; Path=/'
  })
  it('reads the cookie in the browser', () => {
    expect(readTwaCookieClient()).toBe(false)
    document.cookie = 'other=1; Path=/'
    document.cookie = 'xt_twa=1; Path=/'
    expect(readTwaCookieClient()).toBe(true)
  })
})

describe('proxy sets the sticky xt_twa cookie', () => {
  const origin = 'https://xtimator.com'

  it('on ?source=twa', async () => {
    const res = await proxy(new NextRequest(`${origin}/api/health?source=twa`))
    const c = res.cookies.get(TWA_COOKIE_NAME)
    expect(c?.value).toBe('1')
    expect(c?.path).toBe('/')
    expect(c?.sameSite).toBe('lax')
    expect(c?.secure).toBe(true)
    expect(c?.httpOnly).toBeFalsy()
    expect(c?.maxAge).toBeGreaterThanOrEqual(60 * 60 * 24 * 300)
  })

  it('on the android-app referrer', async () => {
    const res = await proxy(
      new NextRequest(`${origin}/api/health`, { headers: { referer: 'android-app://com.xtimator.app' } }),
    )
    expect(res.cookies.get(TWA_COOKIE_NAME)?.value).toBe('1')
  })

  it('never sets or clears it when there is no signal', async () => {
    const res = await proxy(new NextRequest(`${origin}/api/health`, { headers: { cookie: 'xt_twa=1' } }))
    expect(res.cookies.get(TWA_COOKIE_NAME)).toBeUndefined()
    expect(res.headers.get('set-cookie') ?? '').not.toContain('xt_twa')
  })
})
