// lib/entitlements.ts
// Authoritative subscription tier definitions for Xtimator.
// Source: SEED-013 design + codebase pattern (lib/errors/codes.ts).
// CRITICAL: Use null for "unlimited" — Infinity does not serialize to JSON.

export type TierName = 'free' | 'trial' | 'pro' | 'business'

export type Entitlements = {
  /** null = no limit (unlimited). Never use Infinity — JSON.stringify(Infinity) === null (silent corruption). */
  maxEstimatesPerMonth: number | null
  /** null = no limit. */
  maxEstimatesPerDay: number | null
  /**
   * Monthly regional price-research search allowance (Phase 108 — RMETER-02).
   * null = unlimited (never use Infinity — see file-level comment).
   * Sized from the ~$0.005/search OpenRouter web-research cost: free 50, trial 200,
   * pro 1000, business unlimited. A cache HIT consumes NO allowance (only provider
   * lookups — actual searches — are metered).
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
    maxEstimatesPerMonth: 10,
    maxEstimatesPerDay: 3,
    maxPriceResearchPerMonth: 50, // ~$0.25/mo research ceiling at ~$0.005/search
    monthlyCreditGrant: 0, // mirrors DEFAULT_BILLING_CONFIG.tiers.free
    maxPhotosPerEstimate: 3,
    maxAudioMinutesPerEstimate: 2,
    whatsappEnabled: true,
    pdfEnabled: true,
    priceBookEnabled: false,
    customDomainEnabled: false,
    chatEnabled: false,
  },
  trial: {
    maxEstimatesPerMonth: null, // unlimited during trial
    maxEstimatesPerDay: 20,
    maxPriceResearchPerMonth: 200, // generous trial allowance (~$1/mo)
    monthlyCreditGrant: 2000, // mirrors DEFAULT_BILLING_CONFIG.tiers.trial
    maxPhotosPerEstimate: 10,
    maxAudioMinutesPerEstimate: 5,
    whatsappEnabled: true,
    pdfEnabled: true,
    priceBookEnabled: true,
    customDomainEnabled: false,
    chatEnabled: true,
  },
  pro: {
    maxEstimatesPerMonth: 200,
    maxEstimatesPerDay: 30,
    maxPriceResearchPerMonth: 1000, // ~$5/mo research ceiling
    monthlyCreditGrant: 9000, // mirrors DEFAULT_BILLING_CONFIG.tiers.pro
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
    monthlyCreditGrant: 30000, // mirrors DEFAULT_BILLING_CONFIG.tiers.business
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
 * Falls back to 'free' if tier value is unrecognized — defensive against future DB states.
 * Usage in quota checks: if (limit !== null && used >= limit) { block }
 */
export function getEntitlements(tier: string): Entitlements {
  return tiers[tier as TierName] ?? tiers.free
}

/**
 * Resolve the EFFECTIVE tier for a company, honoring the trial clock.
 *
 * The rest of the codebase models a trial as `tier = 'free'` + a future
 * `tier_trial_ends_at` (see lib/actions/company.ts and the expire-trials cron):
 * the `tier` column is never set to the literal string `'trial'` at signup.
 * As a result, `getEntitlements(company.tier)` alone gives a trialing owner the
 * capped FREE entitlements (no chat, 10 estimates/mo) instead of the generous
 * `trial` entitlements defined above — silently defeating the trial. This helper
 * closes that gap by promoting `free` + a live trial clock to `'trial'`.
 *
 * It is also defensive against legacy/stray rows that carry the literal
 * `tier = 'trial'`: those collapse to `'free'` once the clock has expired, so an
 * expired trial can never keep paid entitlements forever (the expire-trials cron
 * only ever demotes rows whose tier is already `'free'`).
 *
 * Paid tiers (`pro`/`business`) and unrecognized strings pass straight through.
 */
export function effectiveTier(company: {
  tier?: string | null
  tier_trial_ends_at?: string | null
}): TierName {
  const raw = company.tier ?? 'free'
  const endsAt = company.tier_trial_ends_at
  const trialActive = endsAt != null && new Date(endsAt).getTime() > Date.now()

  if (raw === 'free' || raw === 'trial') {
    return trialActive ? 'trial' : 'free'
  }
  return (tiers[raw as TierName] ? raw : 'free') as TierName
}

/**
 * Convenience wrapper: resolve entitlements from a company row, honoring the
 * trial clock via {@link effectiveTier}. Prefer this over `getEntitlements(tier)`
 * wherever a full company row (with `tier_trial_ends_at`) is available.
 */
export function getEntitlementsForCompany(company: {
  tier?: string | null
  tier_trial_ends_at?: string | null
}): Entitlements {
  return getEntitlements(effectiveTier(company))
}
