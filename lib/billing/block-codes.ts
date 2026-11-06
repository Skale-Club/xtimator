/**
 * SEED-055 Phase D: the machine codes a billing gate returns. Client-safe (no
 * server-only import) - shared by the server gates, the 402 bodies and the UI.
 */
export type BillingBlockCode = 'paywalled' | 'out_of_credits'

export function isBillingBlockCode(value: unknown): value is BillingBlockCode {
  return value === 'paywalled' || value === 'out_of_credits'
}

/** Where the paywall / out-of-credits CTAs send the owner. */
export const BILLING_SETTINGS_PATH = '/settings/billing'
