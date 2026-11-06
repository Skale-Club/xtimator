/**
 * SEED-055 Phase C: top-ups (one-off packs and auto top-up) are sold to Pro
 * companies with a live subscription only. A free company whose signup credits
 * ran out must subscribe; it cannot buy its way around the paywall.
 *
 * "Live" = Stripe status active / trialing / past_due (past_due keeps access
 * while Stripe dunning retries, matching the monthly-lot rule). A paid tier
 * with a canceled / unpaid / unknown status is NOT eligible. Pure - safe to
 * import from routes, the auto top-up trigger and tests.
 */
const ELIGIBLE_STATUSES = new Set(['active', 'trialing', 'past_due'])

export function isTopupEligible(
  tier: string | null | undefined,
  subscriptionStatus: string | null | undefined,
): boolean {
  if (tier !== 'pro' && tier !== 'business') return false
  return subscriptionStatus != null && ELIGIBLE_STATUSES.has(subscriptionStatus)
}

/** 403 body shared by both top-up session routes. */
export const TOPUP_REQUIRES_SUBSCRIPTION_BODY = {
  error: 'Credit top-ups require an active Pro subscription.',
  code: 'topup_requires_subscription',
} as const
