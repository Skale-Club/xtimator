// tests/unit/oauth-pkce.test.ts
// Phase 86: PKCE S256 verification (RFC 7636).

import { describe, it, expect } from 'vitest'
import { createHash } from 'node:crypto'
import { base64UrlEncode, s256Challenge, verifyPkceS256 } from '@/lib/oauth/pkce'

const VALID_VERIFIER = 'a'.repeat(64) // 64 chars, in the [A-Za-z0-9-._~] alphabet — valid per RFC 7636.

describe('base64UrlEncode', () => {
  it('strips padding and replaces + and /', () => {
    // 0xfb 0xff produces "+/8=" in base64.
    const input = Buffer.from([0xfb, 0xff, 0xfe])
    const standard = input.toString('base64')
    expect(standard).toContain('/')
    const encoded = base64UrlEncode(input)
    expect(encoded).not.toContain('+')
    expect(encoded).not.toContain('/')
    expect(encoded).not.toContain('=')
  })
})

describe('s256Challenge', () => {
  it('matches BASE64URL(SHA256(verifier))', () => {
    const expected = createHash('sha256').update(VALID_VERIFIER, 'ascii').digest('base64')
      .replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_')
    expect(s256Challenge(VALID_VERIFIER)).toBe(expected)
  })

  it('matches the RFC 7636 §B example vector', () => {
    // Verifier from RFC 7636 Appendix B: produces challenge "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"
    const rfcVerifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'
    expect(s256Challenge(rfcVerifier)).toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM')
  })
})

describe('verifyPkceS256', () => {
  it('returns true for a matching (verifier, challenge) pair', () => {
    const challenge = s256Challenge(VALID_VERIFIER)
    expect(verifyPkceS256(VALID_VERIFIER, challenge)).toBe(true)
  })

  it('returns false when the verifier does not match the stored challenge', () => {
    const challenge = s256Challenge(VALID_VERIFIER)
    expect(verifyPkceS256('b'.repeat(64), challenge)).toBe(false)
  })

  it('rejects verifiers shorter than 43 chars', () => {
    const short = 'a'.repeat(42)
    expect(verifyPkceS256(short, s256Challenge(short))).toBe(false)
  })

  it('rejects verifiers longer than 128 chars', () => {
    const long = 'a'.repeat(129)
    expect(verifyPkceS256(long, s256Challenge(long))).toBe(false)
  })

  it('rejects verifiers with disallowed characters', () => {
    const badAlphabet = 'a'.repeat(43) + '!'
    expect(verifyPkceS256(badAlphabet, s256Challenge(badAlphabet))).toBe(false)
  })

  it('rejects non-string verifiers', () => {
    // @ts-expect-error — runtime safety check
    expect(verifyPkceS256(undefined, 'anything')).toBe(false)
    // @ts-expect-error — runtime safety check
    expect(verifyPkceS256(123, 'anything')).toBe(false)
  })

  it('returns false on length mismatch instead of throwing', () => {
    // timingSafeEqual would throw if buffers differ in length — we must guard.
    expect(verifyPkceS256(VALID_VERIFIER, 'short')).toBe(false)
  })
})
