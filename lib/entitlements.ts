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
  maxPhotosPerEstimate: number
  maxAudioMinutesPerEstimate: number
  whatsappEnabled: boolean
  pdfEnabled: boolean
  priceBookEnabled: boolean
  customDomainEnabled: boolean
}

export const tiers: Record<TierName, Entitlements> = {
  free: {
    maxEstimatesPerMonth: 10,
    maxEstimatesPerDay: 3,
    maxPriceResearchPerMonth: 50, // ~$0.25/mo research ceiling at ~$0.005/search
    maxPhotosPerEstimate: 3,
    maxAudioMinutesPerEstimate: 2,
    whatsappEnabled: true,
    pdfEnabled: true,
    priceBookEnabled: false,
    customDomainEnabled: false,
  },
  trial: {
    maxEstimatesPerMonth: null, // unlimited during trial
    maxEstimatesPerDay: 20,
    maxPriceResearchPerMonth: 200, // generous trial allowance (~$1/mo)
    maxPhotosPerEstimate: 10,
    maxAudioMinutesPerEstimate: 5,
    whatsappEnabled: true,
    pdfEnabled: true,
    priceBookEnabled: true,
    customDomainEnabled: false,
  },
  pro: {
    maxEstimatesPerMonth: 200,
    maxEstimatesPerDay: 30,
    maxPriceResearchPerMonth: 1000, // ~$5/mo research ceiling
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
 * Falls back to 'free' if tier value is unrecognized — defensive against future DB states.
 * Usage in quota checks: if (limit !== null && used >= limit) { block }
 */
export function getEntitlements(tier: string): Entitlements {
  return tiers[tier as TierName] ?? tiers.free
}
