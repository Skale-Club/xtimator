// lib/entitlements.ts
// Authoritative subscription tier definitions for Xtimator.
// Source: SEED-013 design + codebase pattern (lib/errors/codes.ts).
// CRITICAL: Use null for "unlimited" — Infinity does not serialize to JSON.
//
// Billing v2: CREDITS are the customer-facing meter — every operation on the
// platform AI key debits credits (real cost × markup, lib/billing/credit-ledger).
// The free tier IS the trial: a one-time signup credit grant
// (billing_config.signupCreditGrant), no time clock; when the balance hits zero
// the credit gate blocks with an upgrade wall. The legacy 14-day `trial` tier
// and its `tier_trial_ends_at` clock are retired (the DB column remains,
// unread, until a later cleanup migration). BYOK companies (companies.byok_enabled,
// super-admin only) run on their own OpenRouter key and bypass the credit
// system entirely.
//
// The per-month/per-day estimate counts below are ANTI-ABUSE ceilings on paid
// tiers, not the customer-facing meter. On free they are null so the credit
// balance is the single binding limit.

export type TierName = 'free' | 'pro' | 'business'

export type Entitlements = {
  /** null = no limit (unlimited). Never use Infinity — JSON.stringify(Infinity) === null (silent corruption). */
  maxEstimatesPerMonth: number | null
  /** null = no limit. */
  maxEstimatesPerDay: number | null
  /**
   * Monthly regional price-research search allowance (Phase 108 — RMETER-02).
   * null = unlimited (never use Infinity — see file-level comment).
   * Sized from the ~$0.005/search OpenRouter web-research cost. A cache HIT
   * consumes NO allowance (only provider lookups — actual searches — are metered).
   */
  maxPriceResearchPerMonth: number | null
  /**
   * Static/fallback per-tier monthly credit grant (CREDIT-04). Mirrors
   * billing_config.tiers[tier].monthlyCreditGrant — the AUTHORITATIVE runtime
   * value is read from the billing-config reader at grant time (BILLCFG-03, no
   * hard-coded billing numbers). This field keeps static callers null-safe,
   * exactly as maxPriceResearchPerMonth was added in Phase 108.
   */
  monthlyCreditGrant: number
  maxPhotosPerEstimate: number
  maxAudioMinutesPerEstimate: number
  whatsappEnabled: boolean
  pdfEnabled: boolean
  priceBookEnabled: boolean
  customDomainEnabled: boolean
  chatEnabled: boolean // CHATMETER-02 — in-app chat is a Pro/Business feature
}

export const tiers: Record<TierName, Entitlements> = {
  free: {
    // Billing v2: free is credit-gated (one-time signup grant, then the wall).
    // Count caps are null so the credit balance is the single binding limit.
    maxEstimatesPerMonth: null,
    maxEstimatesPerDay: null,
    maxPriceResearchPerMonth: 50, // ~$0.25 research ceiling at ~$0.005/search
    monthlyCreditGrant: 0, // free gets NO monthly grant — only the one-time signup grant
    maxPhotosPerEstimate: 3,
    maxAudioMinutesPerEstimate: 2,
    whatsappEnabled: true,
    pdfEnabled: true,
    priceBookEnabled: false,
    customDomainEnabled: false,
    chatEnabled: true, // opened up on free — usage stays bound by the credit balance
  },
  pro: {
    maxEstimatesPerMonth: 200, // anti-abuse ceiling; credits are the real meter
    maxEstimatesPerDay: 30,
    maxPriceResearchPerMonth: 1000, // ~$5/mo research ceiling
    monthlyCreditGrant: 3500, // mirrors DEFAULT_BILLING_CONFIG.tiers.pro (margin-safe placeholder)
    maxPhotosPerEstimate: 20,
    maxAudioMinutesPerEstimate: 15,
    whatsappEnabled: true,
    pdfEnabled: true,
    priceBookEnabled: true,
    customDomainEnabled: false,
    chatEnabled: true,
  },
  business: {
    maxEstimatesPerMonth: null, // unlimited
    maxEstimatesPerDay: 100,
    maxPriceResearchPerMonth: null, // unlimited research
    monthlyCreditGrant: 12000, // mirrors DEFAULT_BILLING_CONFIG.tiers.business (margin-safe placeholder)
    maxPhotosPerEstimate: 50,
    maxAudioMinutesPerEstimate: 30,
    whatsappEnabled: true,
    pdfEnabled: true,
    priceBookEnabled: true,
    customDomainEnabled: true,
    chatEnabled: true,
  },
} as const satisfies Record<TierName, Entitlements>

/**
 * Resolve entitlements for a tier string from the DB.
 * Falls back to 'free' if tier value is unrecognized — defensive against legacy
 * rows (e.g. a stray retired 'trial') and future DB states.
 * Usage in quota checks: if (limit !== null && used >= limit) { block }
 */
export function getEntitlements(tier: string): Entitlements {
  return tiers[tier as TierName] ?? tiers.free
}

/**
 * SERVER-SIDE authority (Phase 112 — runtime-editable entitlements). Resolves a
 * tier's entitlements from `billing_config.tiers[tier].entitlements` (the
 * super-admin panel, applied without a deploy) merged OVER the static default so
 * config wins per field and any field the stored row omits falls back to the
 * constant above. An unrecognized tier resolves to static `free`, matching
 * getEntitlements.
 *
 * getBillingConfig is server-only and pulled in via a DYNAMIC import so this
 * module's static graph stays client-safe — the sync getEntitlements/`tiers`
 * export keep working for client and test importers (chat-bubble.tsx et al.).
 */
export async function getEntitlementsForTier(tier: string): Promise<Entitlements> {
  const fallback = getEntitlements(tier)
  try {
    const { getBillingConfig } = await import('@/lib/billing/billing-config')
    const cfg = await getBillingConfig()
    const configured = cfg.tiers[tier as TierName]?.entitlements
    if (!configured) return fallback
    // Config wins per field; unset fields fall through to the static default.
    return { ...fallback, ...configured, monthlyCreditGrant: fallback.monthlyCreditGrant }
  } catch {
    // Static build / service client unavailable — degrade to the static default.
    return fallback
  }
}
