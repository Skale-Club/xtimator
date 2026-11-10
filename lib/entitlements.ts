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
// SEED-055: credits are the only meter. The per-month estimate cap is null on
// every tier; the per-day count is a generous anti-abuse ceiling only.

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
}

export const tiers: Record<TierName, Entitlements> = {
  free: {
    // SEED-055: every account has every feature from day one; plans differ only
    // by credits. Free carries the Pro values; the per-day cap is abuse-only.
    maxEstimatesPerMonth: null,
    maxEstimatesPerDay: 30,
    maxPriceResearchPerMonth: 1000, // ~$5/mo research ceiling
    monthlyCreditGrant: 0, // free gets NO monthly grant — only the one-time signup grant
    maxPhotosPerEstimate: 20,
    maxAudioMinutesPerEstimate: 15,
    whatsappEnabled: true,
    pdfEnabled: true,
    priceBookEnabled: true,
    customDomainEnabled: false,
  },
  pro: {
    maxEstimatesPerMonth: null, // credits are the meter (SEED-055)
    maxEstimatesPerDay: 30,
    maxPriceResearchPerMonth: 1000, // ~$5/mo research ceiling
    monthlyCreditGrant: 3000, // mirrors DEFAULT_BILLING_CONFIG.tiers.pro (owner-approved 2026-11-09)
    maxPhotosPerEstimate: 20,
    maxAudioMinutesPerEstimate: 15,
    whatsappEnabled: true,
    pdfEnabled: true,
    priceBookEnabled: true,
    customDomainEnabled: false,
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
  },
} as const satisfies Record<TierName, Entitlements>

/**
 * Resolve entitlements for a tier string from the DB.
 * Falls back to 'free' if tier value is unrecognized — defensive against legacy
 * rows (e.g. a stray retired 'trial') and future DB states.
 * Usage in quota checks: if (limit !== null && used >= limit) { block }
 *
 * The billing-config-sourced async resolver `getEntitlementsForTier` lives in
 * the SERVER-ONLY companion `lib/entitlements-server.ts`; keeping it out of this
 * module is what lets client components import the static `tiers`/getEntitlements
 * without dragging `@/lib/billing/billing-config` (server-only) into the client
 * bundle.
 */
export function getEntitlements(tier: string): Entitlements {
  return tiers[tier as TierName] ?? tiers.free
}
