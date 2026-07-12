// lib/queries/billing.ts
// Phase 59: Billing data query for the /settings/billing page.
// Uses requireServiceClient because usage_events has deny-all RLS.

import { requireServiceClient } from '@/lib/supabase/service'
import { getEntitlementsForTier, type Entitlements } from '@/lib/entitlements'

export interface BillingData {
  tier: string                          // 'free' | 'pro' | 'business' (Billing v2: 'trial' retired)
  tierRenewsAt: string | null           // ISO string from DB
  tierCancelledAt: string | null        // ISO string from DB — set while a paid sub is pending-cancel
  stripeSubscriptionId: string | null
  estimatesThisMonth: number            // COUNT of 'estimate_generated' events this UTC month
  photosThisMonth: number               // COUNT of 'photo_analyzed' events this UTC month
  entitlements: Entitlements            // from getEntitlements(tier)
}

/**
 * Fetches billing data for a company.
 * Returns null if the company does not exist (e.g., before onboarding).
 *
 * Company-scoped (takes companyId, NOT userId) so the page can scope every
 * card to the active company — the product supports one user owning 2+
 * companies (company switcher + add mode), which a `.single()`-by-user_id
 * lookup broke.
 *
 * @param companyId  The active company's UUID.
 */
export async function getBillingData(companyId: string): Promise<BillingData | null> {
  const serviceClient = requireServiceClient()

  // Fetch the company row by id.
  const { data: company } = await serviceClient
    .from('companies')
    .select('id, tier, tier_renews_at, tier_cancelled_at, stripe_subscription_id')
    .eq('id', companyId)
    .maybeSingle()

  if (!company) {
    return null
  }

  const tier: string = (company as { tier: string }).tier ?? 'free'
  const tierRenewsAt: string | null = (company as { tier_renews_at: string | null }).tier_renews_at
  const tierCancelledAt: string | null = (company as { tier_cancelled_at: string | null }).tier_cancelled_at
  const stripeSubscriptionId: string | null = (company as { stripe_subscription_id: string | null }).stripe_subscription_id

  // Compute start of current UTC month.
  const now = new Date()
  const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
  const startOfMonthIso = startOfMonth.toISOString()

  // Count usage events with two head:true count queries (no rows transferred) —
  // avoids pulling every event row into JS just to count them.
  const [estimatesRes, photosRes] = await Promise.all([
    serviceClient
      .from('usage_events')
      .select('*', { count: 'exact', head: true })
      .eq('company_id', companyId)
      .eq('event_type', 'estimate_generated')
      .gte('created_at', startOfMonthIso),
    serviceClient
      .from('usage_events')
      .select('*', { count: 'exact', head: true })
      .eq('company_id', companyId)
      .eq('event_type', 'photo_analyzed')
      .gte('created_at', startOfMonthIso),
  ])

  const estimatesThisMonth = estimatesRes.count ?? 0
  const photosThisMonth = photosRes.count ?? 0

  return {
    tier,
    tierRenewsAt,
    tierCancelledAt,
    stripeSubscriptionId,
    estimatesThisMonth,
    photosThisMonth,
    entitlements: await getEntitlementsForTier(tier),
  }
}
