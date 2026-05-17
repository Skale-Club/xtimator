import 'server-only'
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

/**
 * HMAC-signed OAuth state helpers for the Stripe Connect Standard authorize
 * flow. The state is passed through `connect.stripe.com/oauth/authorize` and
 * returned to the callback, where it must prove:
 *
 *   1. The redirect originated from a request we issued (CSRF protection).
 *   2. The redirect belongs to the same logged-in company that initiated it
 *      (prevents one company hijacking another's authorization).
 *   3. The redirect is fresh — older than 10 minutes is rejected. OAuth codes
 *      themselves expire in 5 minutes, so a 10-minute window leaves slack for
 *      slow user click-through without keeping replay surface open.
 *
 * Format:  `{companyId}.{nonce}.{timestampMs}.{base64url(hmacSHA256(payload))}`
 *
 * The shared secret is `APP_ENCRYPTION_KEY` — the same key used by
 * `lib/crypto/aes.ts` for platform-integration encryption. Reusing it keeps
 * the surface of "secrets that must exist for the app to boot" small.
 */

const STATE_TTL_MS = 10 * 60 * 1000 // 10 minutes — see header comment.

function getStateSecret(): string {
  const secret = process.env.APP_ENCRYPTION_KEY
  if (!secret) {
    throw new Error(
      'APP_ENCRYPTION_KEY must be set to mint or verify Connect OAuth state'
    )
  }
  return secret
}

/**
 * Build a state string to embed in the `state` query parameter sent to
 * `connect.stripe.com/oauth/authorize`. Safe to expose in a URL: the signature
 * prevents tampering and the nonce ensures uniqueness.
 */
export function mintOAuthState(companyId: string): string {
  const nonce = randomBytes(16).toString('base64url')
  const ts = Date.now().toString()
  const payload = `${companyId}.${nonce}.${ts}`
  const sig = createHmac('sha256', getStateSecret())
    .update(payload)
    .digest('base64url')
  return `${payload}.${sig}`
}

/**
 * Verify a state returned from Stripe in the OAuth callback. Returns `true`
 * iff all of the following hold:
 *
 *   - The state has the expected 4-part shape.
 *   - The embedded companyId matches `expectedCompanyId` (the currently
 *     authenticated company on the callback request).
 *   - The embedded timestamp is no older than `STATE_TTL_MS`.
 *   - The HMAC signature recomputed over the payload matches the one in the
 *     state, compared via `timingSafeEqual` to avoid leaking byte-by-byte
 *     timing information.
 */
export function verifyOAuthState(
  state: string,
  expectedCompanyId: string
): boolean {
  const parts = state.split('.')
  if (parts.length !== 4) return false
  const [companyId, nonce, ts, sig] = parts
  if (companyId !== expectedCompanyId) return false

  const tsNum = Number(ts)
  if (!Number.isFinite(tsNum)) return false
  if (Date.now() - tsNum > STATE_TTL_MS) return false

  const expected = createHmac('sha256', getStateSecret())
    .update(`${companyId}.${nonce}.${ts}`)
    .digest('base64url')

  const a = Buffer.from(sig)
  const b = Buffer.from(expected)
  // `timingSafeEqual` throws on length mismatch — guard explicitly so a
  // malformed signature returns `false` instead of throwing.
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}
