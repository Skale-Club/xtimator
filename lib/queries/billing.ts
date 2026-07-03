// lib/queries/billing.ts
// Phase 59: Billing data query for the /settings/billing page.
// Uses requireServiceClient because usage_events has deny-all RLS.

import { requireServiceClient } from '@/lib/supabase/service'
import { getEntitlements, effectiveTier, type Entitlements, type TierName } from '@/lib/entitlements'

export interface BillingData {
  tier: string                          // raw DB value: 'free' | 'trial' | 'pro' | 'business'
  effectiveTier: TierName               // tier honoring the live trial clock (free+clock → 'trial')
  tierTrialEndsAt: string | null        // ISO string from DB
  tierRenewsAt: string | null           // ISO string from DB
  stripeSubscriptionId: string | null
  estimatesThisMonth: number            // COUNT of 'estimate_generated' events this UTC month
  photosThisMonth: number               // COUNT of 'photo_analyzed' events this UTC month
  entitlements: Entitlements            // resolved from effectiveTier, not the raw column
}

/**
 * Fetches billing data for a user's company.
 * Returns null if the company does not exist (e.g., before onboarding).
 *
 * @param userId  The user's auth UUID (sub claim).
 */
export async function getBillingData(userId: string): Promise<BillingData | null> {
  const serviceClient = requireServiceClient()

  // Fetch the company row for this user.
  const { data: company, error } = await serviceClient
    .from('companies')
    .select('id, tier, tier_trial_ends_at, tier_renews_at, stripe_subscription_id')
    .eq('user_id', userId)
    .single()

  if (error || !company) {
    return null
  }

  const companyId: string = (company as { id: string }).id
  const tier: string = (company as { tier: string }).tier ?? 'free'
  const tierTrialEndsAt: string | null = (company as { tier_trial_ends_at: string | null }).tier_trial_ends_at
  const tierRenewsAt: string | null = (company as { tier_renews_at: string | null }).tier_renews_at
  const stripeSubscriptionId: string | null = (company as { stripe_subscription_id: string | null }).stripe_subscription_id

  // Compute start of current UTC month.
  const now = new Date()
  const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))

  // Fetch all usage events for this company in the current month.
  // Fetching all event_types in one query and counting in JS to avoid N+1.
  const { data: events } = await serviceClient
    .from('usage_events')
    .select('event_type')
    .eq('company_id', companyId)
    .gte('created_at', startOfMonth.toISOString())

  const rows = events ?? []
  const estimatesThisMonth = rows.filter(
    (r: { event_type: string }) => r.event_type === 'estimate_generated'
  ).length
  const photosThisMonth = rows.filter(
    (r: { event_type: string }) => r.event_type === 'photo_analyzed'
  ).length

  const effTier = effectiveTier({ tier, tier_trial_ends_at: tierTrialEndsAt })

  return {
    tier,
    effectiveTier: effTier,
    tierTrialEndsAt,
    tierRenewsAt,
    stripeSubscriptionId,
    estimatesThisMonth,
    photosThisMonth,
    entitlements: getEntitlements(effTier),
  }
}
