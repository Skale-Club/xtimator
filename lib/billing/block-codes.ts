/**
 * SEED-055 Phase D: the machine codes a billing gate returns. Client-safe (no
 * server-only import) - shared by the server gates, the 402 bodies and the UI.
 *
 * Two kinds of code:
 *   - wall codes ('paywalled' | 'out_of_credits'): the company really is blocked;
 *     the UI offers Subscribe / Buy credits.
 *   - 'unavailable': the balance could not be read, so paid AI was refused
 *     (fail closed). Nothing is wrong with the account: the UI shows a plain
 *     "try again" message and never a paywall, a CTA or a 402.
 */
export type BillingWallCode = 'paywalled' | 'out_of_credits'
export type BillingBlockCode = BillingWallCode | 'unavailable'

export function isBillingWallCode(value: unknown): value is BillingWallCode {
  return value === 'paywalled' || value === 'out_of_credits'
}

export function isBillingBlockCode(value: unknown): value is BillingBlockCode {
  return isBillingWallCode(value) || value === 'unavailable'
}

/** Where the paywall / out-of-credits CTAs send the owner. */
export const BILLING_SETTINGS_PATH = '/settings/billing'
