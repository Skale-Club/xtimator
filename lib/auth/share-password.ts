import 'server-only'
import {
  createHash,
  createHmac,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from 'node:crypto'
import { cookies } from 'next/headers'

/**
 * Phase 193-02 — optional password lock on a shared estimate.
 *
 * Two independent primitives live here:
 *   1. hashSharePassword/verifySharePassword — scrypt (node:crypto, no new
 *      dependency), salt embedded in the stored string, timing-safe compare.
 *      Mirrors the discipline in lib/oauth/pkce.ts (length-guard before
 *      timingSafeEqual — it throws on a length mismatch).
 *   2. The unlock-session cookie — a signed, time-boxed claim copied
 *      wholesale from lib/auth/support-mode.ts's HMAC-SHA256 pattern. The
 *      payload binds to sha256(share_token) rather than an id, so a cookie
 *      minted for estimate A can never unlock estimate B (hasValidUnlock
 *      re-derives the hash from the CALLER-SUPPLIED token and compares it,
 *      timing-safe, against what's embedded in the cookie).
 */

// ---------------------------------------------------------------------------
// Password hashing (scrypt) — plaintext never stored, never logged.
// ---------------------------------------------------------------------------

const SCRYPT_KEYLEN = 64
const SALT_BYTES = 16
// Homeowners typing on a phone, not a security team — no complexity rules,
// just a sane length band. Enforced server-side by setEstimateSharePassword
// (lib/actions/estimate.ts); verifySharePassword additionally caps input
// length so a hostile oversized string can't be used to burn CPU on scrypt.
export const SHARE_PASSWORD_MIN_LENGTH = 4
export const SHARE_PASSWORD_MAX_LENGTH = 72

/** `salt$hash`, both base64url. */
export function hashSharePassword(password: string): string {
  const salt = randomBytes(SALT_BYTES)
  const hash = scryptSync(password, salt, SCRYPT_KEYLEN)
  return `${salt.toString('base64url')}$${hash.toString('base64url')}`
}

/**
 * Recomputes the scrypt hash with the stored salt and compares timing-safe.
 * Never throws — any malformed input (bad stored value, oversized password,
 * corrupt base64) resolves to `false` rather than propagating an exception
 * into a public-facing action.
 */
export function verifySharePassword(password: string, stored: string | null | undefined): boolean {
  if (!stored) return false
  if (typeof password !== 'string' || password.length === 0) return false
  if (password.length > SHARE_PASSWORD_MAX_LENGTH) return false

  const parts = stored.split('$')
  if (parts.length !== 2) return false
  const [saltB64, hashB64] = parts

  let salt: Buffer
  let expected: Buffer
  try {
    salt = Buffer.from(saltB64, 'base64url')
    expected = Buffer.from(hashB64, 'base64url')
  } catch {
    return false
  }
  if (salt.length === 0 || expected.length === 0) return false

  let actual: Buffer
  try {
    actual = scryptSync(password, salt, expected.length)
  } catch {
    return false
  }

  // timingSafeEqual throws on a length mismatch — guard first (lib/oauth/pkce.ts discipline).
  if (actual.length !== expected.length) return false
  return timingSafeEqual(actual, expected)
}

// ---------------------------------------------------------------------------
// Unlock-session cookie — copied wholesale from lib/auth/support-mode.ts.
// ---------------------------------------------------------------------------

export const ESTIMATE_UNLOCK_COOKIE = 'estimate_unlock'
const UNLOCK_TTL_MS = 24 * 60 * 60 * 1000 // 24h

interface UnlockPayload {
  /** sha256(share_token) — never the raw token — so a leaked cookie value
   *  alone doesn't hand over the bearer token itself. */
  tokenHash: string
  issuedAt: number
  expiresAt: number
}

export function sha256Hex(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex')
}

function loadSigningKey(): Buffer {
  const raw = process.env.APP_ENCRYPTION_KEY
  if (!raw) throw new Error('APP_ENCRYPTION_KEY is not set')
  const key = Buffer.from(raw, 'base64')
  if (key.length !== 32) {
    throw new Error(
      `APP_ENCRYPTION_KEY must decode to 32 bytes (256 bits); got ${key.length}.`
    )
  }
  return key
}

function sign(payloadB64: string): string {
  return createHmac('sha256', loadSigningKey()).update(payloadB64).digest('hex')
}

function encodeCookie(payload: UnlockPayload): string {
  const payloadB64 = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url')
  const signature = sign(payloadB64)
  return `${payloadB64}.${signature}`
}

function decodeCookie(cookieValue: string): UnlockPayload | null {
  const parts = cookieValue.split('.')
  if (parts.length !== 2) return null
  const [payloadB64, receivedSig] = parts

  const expectedSig = sign(payloadB64)
  const expectedBuf = Buffer.from(expectedSig)
  const receivedBuf = Buffer.from(receivedSig)
  if (expectedBuf.length !== receivedBuf.length) return null

  let valid: boolean
  try {
    valid = timingSafeEqual(expectedBuf, receivedBuf)
  } catch {
    return null
  }
  if (!valid) return null

  try {
    const json = Buffer.from(payloadB64, 'base64url').toString('utf8')
    const parsed = JSON.parse(json) as UnlockPayload
    if (
      typeof parsed.tokenHash !== 'string' ||
      typeof parsed.issuedAt !== 'number' ||
      typeof parsed.expiresAt !== 'number'
    ) {
      return null
    }
    return parsed
  } catch {
    return null
  }
}

/**
 * Mints and writes the signed unlock cookie for `shareToken`, scoped to this
 * estimate only (payload carries sha256(shareToken), not the token itself).
 * Called by unlockEstimate (app/estimate/[token]/actions.ts) after a
 * successful password verification.
 */
export async function setUnlockCookie(shareToken: string): Promise<void> {
  const issuedAt = Date.now()
  const expiresAt = issuedAt + UNLOCK_TTL_MS
  const payload: UnlockPayload = {
    tokenHash: sha256Hex(shareToken),
    issuedAt,
    expiresAt,
  }
  const cookieValue = encodeCookie(payload)

  const cookieStore = await cookies()
  cookieStore.set(ESTIMATE_UNLOCK_COOKIE, cookieValue, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: Math.floor(UNLOCK_TTL_MS / 1000), // never exceeds the signed expiresAt
  })
}

/**
 * Verifies a raw cookie value authorizes access to `shareToken`: signature,
 * expiry, AND that the cookie's embedded token hash matches THIS token
 * (timing-safe) — a cookie minted for a different estimate's share_token
 * fails this even with a perfectly valid signature. Returns false on any
 * failure; never throws.
 */
export function hasValidUnlock(cookieValue: string | undefined | null, shareToken: string): boolean {
  if (!cookieValue) return false
  const payload = decodeCookie(cookieValue)
  if (!payload) return false
  if (payload.expiresAt <= Date.now()) return false

  const expectedBuf = Buffer.from(sha256Hex(shareToken))
  const actualBuf = Buffer.from(payload.tokenHash)
  if (expectedBuf.length !== actualBuf.length) return false

  try {
    return timingSafeEqual(expectedBuf, actualBuf)
  } catch {
    return false
  }
}
