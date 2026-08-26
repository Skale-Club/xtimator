// Phase 193-02 — lib/auth/share-password.ts.
//
// Covers: hash/verify roundtrip, wrong password, malformed/tampered stored
// hash, and the unlock-session cookie (sign/verify, tamper, expiry, and the
// cross-estimate binding — a cookie minted for token A must never unlock
// token B). Mirrors the beforeEach/APP_ENCRYPTION_KEY setup and cookie-mock
// style of tests/unit/support-mode.test.ts (the file this module's cookie
// logic was copied from).

import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('next/headers', () => ({ cookies: vi.fn() }))

import { cookies } from 'next/headers'

function makeCookieStore() {
  const setSpy = vi.fn()
  return { store: { set: setSpy }, setSpy }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.resetModules()
  process.env.APP_ENCRYPTION_KEY = Buffer.alloc(32, 9).toString('base64')
})

describe('hashSharePassword / verifySharePassword', () => {
  it('roundtrips: a hashed password verifies against itself', async () => {
    const { hashSharePassword, verifySharePassword } = await import('@/lib/auth/share-password')
    const stored = hashSharePassword('correct horse battery staple')
    expect(verifySharePassword('correct horse battery staple', stored)).toBe(true)
  })

  it('stores neither the plaintext nor anything that trivially contains it', async () => {
    const { hashSharePassword } = await import('@/lib/auth/share-password')
    const stored = hashSharePassword('hunter2')
    expect(stored).not.toContain('hunter2')
    expect(stored.split('$')).toHaveLength(2)
  })

  it('rejects the wrong password', async () => {
    const { hashSharePassword, verifySharePassword } = await import('@/lib/auth/share-password')
    const stored = hashSharePassword('correct-password')
    expect(verifySharePassword('wrong-password', stored)).toBe(false)
  })

  it('two hashes of the same password are different (random salt) but both verify', async () => {
    const { hashSharePassword, verifySharePassword } = await import('@/lib/auth/share-password')
    const a = hashSharePassword('same-password')
    const b = hashSharePassword('same-password')
    expect(a).not.toBe(b)
    expect(verifySharePassword('same-password', a)).toBe(true)
    expect(verifySharePassword('same-password', b)).toBe(true)
  })

  it('returns false (never throws) for a null/undefined/malformed stored value', async () => {
    const { verifySharePassword } = await import('@/lib/auth/share-password')
    expect(verifySharePassword('anything', null)).toBe(false)
    expect(verifySharePassword('anything', undefined)).toBe(false)
    expect(verifySharePassword('anything', 'not-a-valid-hash')).toBe(false)
    expect(verifySharePassword('anything', 'a$b$c')).toBe(false)
    expect(verifySharePassword('anything', '$$')).toBe(false)
  })

  it('returns false (never throws) for a tampered hash half of a valid stored value', async () => {
    const { hashSharePassword, verifySharePassword } = await import('@/lib/auth/share-password')
    const stored = hashSharePassword('correct-password')
    const [salt] = stored.split('$')
    const tampered = `${salt}$${Buffer.from('not the real hash bytes').toString('base64url')}`
    expect(verifySharePassword('correct-password', tampered)).toBe(false)
  })

  it('rejects an oversized password without throwing (DoS guard on scrypt cost)', async () => {
    const { hashSharePassword, verifySharePassword } = await import('@/lib/auth/share-password')
    const stored = hashSharePassword('some-password')
    const huge = 'x'.repeat(10_000)
    expect(verifySharePassword(huge, stored)).toBe(false)
  })

  it('rejects an empty-string password', async () => {
    const { hashSharePassword, verifySharePassword } = await import('@/lib/auth/share-password')
    const stored = hashSharePassword('some-password')
    expect(verifySharePassword('', stored)).toBe(false)
  })
})

describe('setUnlockCookie / hasValidUnlock', () => {
  it('a freshly minted cookie authorizes the SAME share token', async () => {
    const { store, setSpy } = makeCookieStore()
    vi.mocked(cookies).mockResolvedValue(store as never)

    const { setUnlockCookie, hasValidUnlock } = await import('@/lib/auth/share-password')
    await setUnlockCookie('share-token-abc')

    const mintedValue = setSpy.mock.calls[0][1] as string
    expect(hasValidUnlock(mintedValue, 'share-token-abc')).toBe(true)
  })

  it('httpOnly + secure + sameSite lax + ~24h maxAge', async () => {
    const { store, setSpy } = makeCookieStore()
    vi.mocked(cookies).mockResolvedValue(store as never)

    const { setUnlockCookie, ESTIMATE_UNLOCK_COOKIE } = await import('@/lib/auth/share-password')
    await setUnlockCookie('share-token-abc')

    expect(setSpy).toHaveBeenCalledWith(
      ESTIMATE_UNLOCK_COOKIE,
      expect.any(String),
      expect.objectContaining({
        httpOnly: true,
        secure: true,
        sameSite: 'lax',
        maxAge: 24 * 60 * 60,
      })
    )
  })

  it('a cookie minted for token A does NOT authorize token B (cross-estimate binding)', async () => {
    const { store, setSpy } = makeCookieStore()
    vi.mocked(cookies).mockResolvedValue(store as never)

    const { setUnlockCookie, hasValidUnlock } = await import('@/lib/auth/share-password')
    await setUnlockCookie('share-token-A')
    const mintedValue = setSpy.mock.calls[0][1] as string

    expect(hasValidUnlock(mintedValue, 'share-token-B')).toBe(false)
  })

  it('a tampered signature is rejected', async () => {
    const { store, setSpy } = makeCookieStore()
    vi.mocked(cookies).mockResolvedValue(store as never)

    const { setUnlockCookie, hasValidUnlock } = await import('@/lib/auth/share-password')
    await setUnlockCookie('share-token-abc')
    const mintedValue = setSpy.mock.calls[0][1] as string

    const [payloadPart, sigPart] = mintedValue.split('.')
    const flippedChar = sigPart[0] === 'a' ? 'b' : 'a'
    const tamperedValue = `${payloadPart}.${flippedChar}${sigPart.slice(1)}`

    expect(hasValidUnlock(tamperedValue, 'share-token-abc')).toBe(false)
  })

  it('an expired cookie is rejected even with a valid signature', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'))

    const { store, setSpy } = makeCookieStore()
    vi.mocked(cookies).mockResolvedValue(store as never)

    const { setUnlockCookie, hasValidUnlock } = await import('@/lib/auth/share-password')
    await setUnlockCookie('share-token-abc')
    const mintedValue = setSpy.mock.calls[0][1] as string

    vi.setSystemTime(new Date('2026-01-02T01:00:00.000Z')) // +25h, past the 24h TTL

    expect(hasValidUnlock(mintedValue, 'share-token-abc')).toBe(false)

    vi.useRealTimers()
  })

  it('hasValidUnlock never throws on garbage input (missing, malformed, empty)', async () => {
    const { hasValidUnlock } = await import('@/lib/auth/share-password')
    expect(hasValidUnlock(undefined, 'share-token-abc')).toBe(false)
    expect(hasValidUnlock(null, 'share-token-abc')).toBe(false)
    expect(hasValidUnlock('garbage', 'share-token-abc')).toBe(false)
    expect(hasValidUnlock('a.b.c', 'share-token-abc')).toBe(false)
  })
})
