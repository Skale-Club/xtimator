// Phase 86: PKCE S256 verification (RFC 7636).
//
// The authorization endpoint stores `code_challenge` (base64url of sha256(code_verifier)).
// The token endpoint must recompute `BASE64URL(SHA256(code_verifier))` from the incoming
// `code_verifier` and constant-time compare against the stored challenge.

import { createHash, timingSafeEqual } from 'node:crypto'

/**
 * Encode a Buffer as base64url (RFC 4648 §5) — no padding, `+` → `-`, `/` → `_`.
 */
export function base64UrlEncode(buf: Buffer): string {
  return buf.toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_')
}

/**
 * Compute the S256 code challenge for a given verifier:
 *   BASE64URL(SHA256(code_verifier))
 */
export function s256Challenge(codeVerifier: string): string {
  const digest = createHash('sha256').update(codeVerifier, 'ascii').digest()
  return base64UrlEncode(digest)
}

/**
 * Constant-time comparison of two base64url-encoded strings.
 * Returns false on length mismatch (timingSafeEqual would throw).
 */
export function safeEqualBase64Url(a: string, b: string): boolean {
  const bufA = Buffer.from(a)
  const bufB = Buffer.from(b)
  if (bufA.length !== bufB.length) return false
  return timingSafeEqual(bufA, bufB)
}

/**
 * Verify a PKCE S256 challenge.
 * @param codeVerifier - plaintext verifier from the token request
 * @param storedChallenge - base64url-encoded challenge stored at /authorize
 */
export function verifyPkceS256(codeVerifier: string, storedChallenge: string): boolean {
  // RFC 7636 §4.1: verifier must be 43-128 chars of [A-Z a-z 0-9 -._~].
  if (typeof codeVerifier !== 'string') return false
  if (codeVerifier.length < 43 || codeVerifier.length > 128) return false
  if (!/^[A-Za-z0-9\-._~]+$/.test(codeVerifier)) return false
  const computed = s256Challenge(codeVerifier)
  return safeEqualBase64Url(computed, storedChallenge)
}
