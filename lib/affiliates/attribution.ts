/**
 * SEED-054 — the referral-cookie contract. PURE module: the proxy (edge
 * runtime) sets the cookie, the signup server action reads it, and this file is
 * the single place either one learns the name, lifetime, and flags. No DB, no
 * `server-only`.
 */

import { normalizeAffiliateCode } from '@/lib/affiliates/code'

/** Query parameter on a referral link: `https://xtimator.com/?ref=CODE`. */
export const REFERRAL_QUERY_PARAM = 'ref'

/** Cookie the proxy writes and the signup action reads. */
export const REFERRAL_COOKIE = 'xt_ref'

/**
 * Cookie lifetime in days.
 *
 * WHY A CONSTANT AND NOT `billing_config.affiliate.attributionWindowDays`: the
 * proxy runs before (and independently of) any DB round-trip, and reading
 * platform config on every anonymous landing-page hit would put a Supabase
 * query in the hot path of the marketing site. So the COOKIE gets a fixed
 * generous TTL here, and the CONFIGURED window is enforced server-side at
 * attribution time (attribution-server.ts compares the cookie's issue date
 * against the runtime config). Shortening the window in the admin panel
 * therefore takes effect immediately; lengthening it beyond this constant does
 * not, which is the safe direction to fail.
 */
export const REFERRAL_COOKIE_MAX_AGE_DAYS = 90

export const REFERRAL_COOKIE_OPTIONS = {
  // httpOnly: the cookie is only ever read server-side (proxy write, signup
  // action read). No client code needs it, so keep it out of reach of any XSS.
  httpOnly: true,
  sameSite: 'lax' as const,
  // Referral links arrive over https in production; `secure` is set from the
  // request protocol by the writer so localhost dev still works.
  path: '/',
  maxAge: REFERRAL_COOKIE_MAX_AGE_DAYS * 24 * 60 * 60,
}

/**
 * Cookie payload. The issue timestamp travels WITH the code so the server can
 * enforce the configured attribution window at signup time — a bare code would
 * leave us unable to tell a 2-day-old click from an 89-day-old one.
 *
 * Format: `{code}.{issuedAtMs}`. Deliberately NOT signed: unlike the Connect
 * OAuth state (lib/billing/connect-oauth.ts), forging this cookie only lets
 * someone credit an EXISTING affiliate for their OWN signup — self-referral,
 * which is a fraud-review concern (the `void` referral status), not an
 * authentication boundary. Signing it would add a secret dependency to the edge
 * proxy for no security gain.
 */
export function serializeReferralCookie(code: string, issuedAt: Date): string {
  return `${code}.${issuedAt.getTime()}`
}

export type ParsedReferralCookie = {
  code: string
  issuedAt: Date
}

/**
 * Parse a cookie value written by {@link serializeReferralCookie}. Returns
 * `null` for anything malformed, unparseable, or carrying a code that does not
 * normalize — a bad cookie means "no referral", never a throw, because it sits
 * in the signup path.
 *
 * Also accepts a BARE code with no timestamp (treated as issued now), so a
 * cookie written by an older deploy still attributes instead of being dropped.
 */
export function parseReferralCookie(
  value: string | null | undefined,
  now: Date = new Date()
): ParsedReferralCookie | null {
  if (!value) return null
  const lastDot = value.lastIndexOf('.')
  if (lastDot === -1) {
    const bare = normalizeAffiliateCode(value)
    return bare ? { code: bare, issuedAt: now } : null
  }
  const code = normalizeAffiliateCode(value.slice(0, lastDot))
  if (!code) return null
  const ts = Number(value.slice(lastDot + 1))
  if (!Number.isFinite(ts) || ts <= 0) return null
  return { code, issuedAt: new Date(ts) }
}

/**
 * Whether a click recorded at `issuedAt` is still attributable under the
 * runtime-configured window. `windowDays <= 0` disables the window entirely
 * (attribute regardless of age).
 */
export function isWithinAttributionWindow(
  issuedAt: Date,
  windowDays: number,
  now: Date = new Date()
): boolean {
  if (!(windowDays > 0)) return true
  const ageMs = now.getTime() - issuedAt.getTime()
  // A negative age means a clock-skewed or forged future timestamp. Treat it as
  // valid rather than dropping a real click over a few seconds of skew — the
  // cookie is unsigned anyway, so this is not a security boundary.
  if (ageMs < 0) return true
  return ageMs <= windowDays * 24 * 60 * 60 * 1000
}

/**
 * Extract and normalize the `?ref=` value from a URL's search params. Returns
 * `null` when absent or unusable, so the proxy can skip the cookie write with a
 * single check.
 */
export function readReferralParam(searchParams: URLSearchParams): string | null {
  return normalizeAffiliateCode(searchParams.get(REFERRAL_QUERY_PARAM))
}
