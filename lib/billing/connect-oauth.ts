import 'server-only'
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { getIntegrationKey } from '@/lib/platform-config'

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

/**
 * Build the `connect.stripe.com/oauth/authorize` URL for Stripe Connect Standard.
 * Caller is responsible for setting the HMAC state cookie and minting `state`
 * via `mintOAuthState`.
 */
export function buildAuthorizeUrl(opts: {
  clientId: string
  redirectUri: string
  state: string
  prefillEmail?: string | null
}): string {
  const url = new URL('https://connect.stripe.com/oauth/authorize')
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('client_id', opts.clientId)
  url.searchParams.set('scope', 'read_write')
  url.searchParams.set('redirect_uri', opts.redirectUri)
  url.searchParams.set('state', opts.state)
  if (opts.prefillEmail) {
    url.searchParams.set('stripe_user[email]', opts.prefillEmail)
  }
  return url.toString()
}

/**
 * Exchange an authorization code returned from Stripe's OAuth flow for a
 * `stripe_user_id` (acct_xxx). Uses the platform's secret key as HTTP Basic
 * auth username (password empty), per Stripe Connect OAuth docs.
 *
 * Throws on missing key or non-2xx response. The OAuth code is single-use and
 * expires in 5 minutes — callers MUST NOT retry on transient errors and MUST
 * guard against re-exchange (see callback route idempotency).
 */
export async function exchangeCode(code: string): Promise<{
  stripe_user_id: string
  livemode: boolean
  scope: 'read_write' | 'read_only'
}> {
  const secretKey = await getIntegrationKey('stripe')
  if (!secretKey) {
    throw new Error('[connect-oauth] STRIPE secret key not configured')
  }
  const res = await fetch('https://connect.stripe.com/oauth/token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(secretKey + ':').toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ grant_type: 'authorization_code', code }),
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(
      `[connect-oauth] Token exchange failed (${res.status}): ${body.slice(0, 200)}`
    )
  }
  const json = (await res.json()) as {
    stripe_user_id: string
    livemode: boolean
    scope: 'read_write' | 'read_only'
  }
  return {
    stripe_user_id: json.stripe_user_id,
    livemode: json.livemode,
    scope: json.scope,
  }
}

/**
 * Best-effort POST to `/oauth/deauthorize` to revoke the platform's access on
 * the Stripe side after a company disconnects. Errors are swallowed: the
 * company-side disconnect (clearing `stripe_account_id`) is the source of
 * truth — user intent wins even if the Stripe round-trip fails.
 */
export async function deauthorize(opts: {
  clientId: string
  stripeUserId: string
}): Promise<void> {
  try {
    const secretKey = await getIntegrationKey('stripe')
    if (!secretKey) return
    await fetch('https://connect.stripe.com/oauth/deauthorize', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(secretKey + ':').toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: opts.clientId,
        stripe_user_id: opts.stripeUserId,
      }),
    })
  } catch (e) {
    console.warn('[connect-oauth] deauthorize failed (continuing):', e)
  }
}
