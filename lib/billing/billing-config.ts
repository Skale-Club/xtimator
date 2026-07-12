import 'server-only'
import { createServiceClient } from '@/lib/supabase/service'

/**
 * Phase 111 — billing_config store CORE (BILLCFG-01 / BILLCFG-03).
 *
 * A typed, null-safe, SERVER-ONLY reader over the metadata-only
 * `platform_integrations` `billing_config` row. Mirrors
 * `getOpenRouterDefaultModel()` (lib/platform-config.ts): reads `metadata` via
 * `createServiceClient()` (RLS-bypassing service role — never the browser
 * client) and merges the stored values over {@link DEFAULT_BILLING_CONFIG}.
 *
 * This reader FUNCTION ships DORMANT this phase — no production module calls
 * `getBillingConfig()`. Every downstream phase (112 ledger, 113 Stripe, 114
 * fee, 116 calibration) wires it. The `DEFAULT_BILLING_CONFIG` constant and the
 * `BillingConfig` type ARE public and may be imported by the Plan 02 panel.
 *
 * NO migration: `billing_config` is a metadata-only row the existing CHECK
 * (20260517000002) already permits with all crypto columns null.
 */

export type TopUpPack = { credits: number; priceCents: number }
/**
 * Per-tier entitlement caps + feature flags, mirroring lib/entitlements.ts
 * `Entitlements` (minus monthlyCreditGrant, which already lives on TierBilling).
 * Runtime-editable home for the numbers currently hardcoded in that module.
 * null = unlimited on the count caps (never Infinity — see lib/entitlements.ts).
 */
export type TierEntitlements = {
  maxEstimatesPerMonth: number | null
  maxEstimatesPerDay: number | null
  maxPriceResearchPerMonth: number | null
  maxPhotosPerEstimate: number
  maxAudioMinutesPerEstimate: number
  whatsappEnabled: boolean
  pdfEnabled: boolean
  priceBookEnabled: boolean
  customDomainEnabled: boolean
  chatEnabled: boolean
}
export type TierBilling = {
  monthlyCreditGrant: number
  subscriptionPriceCents: number
  // per-tier ANNUAL subscription price in integer cents (SEED-038); CALIBRATE BEFORE CHARGING placeholder — the displayed discount % is DERIVED (1 − annual/(12×monthly)), never stored
  subscriptionPriceAnnualCents: number
  // seats bundled in the tier before per-seat billing kicks in (e.g. the owner
  // seat is included) — CALIBRATE BEFORE CHARGING (placeholder, not final).
  includedSeats: number
  // Stripe Price IDs auto-created/refreshed from subscriptionPriceCents /
  // subscriptionPriceAnnualCents by the save action (no Stripe dashboard). null
  // until the first save provisions them.
  stripePriceIdMonth: string | null
  stripePriceIdYear: string | null
  // Runtime-editable per-tier entitlement caps + feature flags (mirrors
  // lib/entitlements.ts, the static fallback).
  entitlements: TierEntitlements
  // Marketing feature bullets rendered on the tier card (was hardcoded copy).
  featureBullets: string[]
}
export type BillingTier = 'free' | 'pro' | 'business' // mirrors the TierName union (Billing v2: 'trial' retired — free IS the trial via signupCreditGrant)

export type BillingConfig = {
  markup: number // global multiplier; default 4.5 (per-op map = v2 GRAN-01 extension point)
  creditUnitUsd: number // 1 credit = $X charged value; default 0.01
  whisperUsdPerMinute: number // runtime source for the Phase-110 transcription rate const; default 0.006
  estimateFeePct: number // 0.01 = 1% (SEED-036); default 0.01
  estimateFeeMinCents: number // Stripe rejects $0 fee — sane floor for Phase 114 FEE-04; default 1
  seatPriceCents: number // monthly price of one billable seat in integer cents (SEED-037); CALIBRATE BEFORE CHARGING placeholder
  seatPriceAnnualCents: number // global ANNUAL per-seat price in integer cents (SEED-038); CALIBRATE BEFORE CHARGING placeholder
  tiers: Record<BillingTier, TierBilling>
  topUpPacks: TopUpPack[]
  lowBalanceThresholds: number[] // credit balances at which to warn; default [200, 50]
  meteredOperations: Record<string, boolean> // which ops debit vs absorbed (schema slot for Phase 112; minimal UI now)
  absorbedChatRateLimitPerMin: number // anti-abuse for absorbed chat; default 20
  /**
   * Billing v2: one-time credit grant at FIRST-company signup — the free tier's
   * entire allowance ("the free tier IS the trial": no clock, just this balance).
   * Idempotent per company (ledger key `signup:{companyId}`); added companies by
   * the same user do NOT re-grant (anti credit-farming, D-14 spirit).
   */
  signupCreditGrant: number
  /**
   * Master charging switch (CREDIT-05). Billing v2 flips the default to TRUE:
   * the free-tier wall REQUIRES enforcement (zero balance → block + upgrade
   * wall). Grant sizes/markup remain calibration knobs in this config; flipping
   * this off via the admin panel instantly reverts to record-only.
   */
  enforcementEnabled: boolean
  /**
   * Platform-wide auto-top-up kill switch (CREDITUI-07). Mirrors
   * enforcementEnabled's exact pattern: default FALSE. The tenant-facing
   * "Enable auto-top-up" toggle only renders/functions when this is true —
   * gives the owner a single instant-disable switch independent of each
   * tenant's own opt-in (company.auto_topup_enabled).
   */
  autoTopupEnabled: boolean
}

/**
 * Illustrative placeholders — CALIBRATE BEFORE CHARGING (CALIB-02, Phase 116).
 * NOT final numbers. They exist so the reader is null-safe before any admin
 * save; real grant/markup/price come from the cost measured since Phase 110.
 */
export const DEFAULT_BILLING_CONFIG: BillingConfig = {
  markup: 4.5,
  creditUnitUsd: 0.01,
  whisperUsdPerMinute: 0.006,
  estimateFeePct: 0.01,
  estimateFeeMinCents: 1,
  // Billing v2 (v1 launch decision): seats are FREE — teammates share the
  // company's credit pool, so usage is already metered by credits and per-seat
  // billing would be double-dipping. Price 0 makes computeSeatChargeCents a
  // no-op, so inviting a teammate never adds a Stripe seat item. Set a price
  // here (admin panel, no deploy) to enable seat billing later.
  seatPriceCents: 0,
  seatPriceAnnualCents: 0,
  // includedSeats per tier is a CALIBRATION PLACEHOLDER (the owner seat is bundled,
  // so each defaults to 1) — CALIBRATE BEFORE CHARGING, do not invent generous numbers.
  // subscriptionPriceAnnualCents per tier is also a CALIBRATION PLACEHOLDER (≈10× monthly
  // for paid tiers so the later-derived annual discount is visible, 0 for free/trial) —
  // CALIBRATE BEFORE CHARGING, do NOT present these as final pricing.
  // Billing v2: paid grants sized to SATISFY the CALIB-02 margin invariant at
  // the default markup (grant real cost ≤ 30% of price) since enforcement now
  // defaults ON — pro 3500 ≈ 27% of $29, business 12000 ≈ 27% of $99. Still
  // CALIBRATION PLACEHOLDERS: tune price/grant/markup together in the panel.
  tiers: {
    free: {
      monthlyCreditGrant: 0,
      subscriptionPriceCents: 0,
      subscriptionPriceAnnualCents: 0,
      includedSeats: 1,
      stripePriceIdMonth: null,
      stripePriceIdYear: null,
      entitlements: {
        maxEstimatesPerMonth: null,
        maxEstimatesPerDay: null,
        maxPriceResearchPerMonth: 50,
        maxPhotosPerEstimate: 3,
        maxAudioMinutesPerEstimate: 2,
        whatsappEnabled: true,
        pdfEnabled: true,
        priceBookEnabled: false,
        customDomainEnabled: false,
        chatEnabled: true,
      },
      featureBullets: [
        'Estimates until your free credits run out',
        '3 photos per estimate',
        'Basic templates',
        'Email support',
      ],
    },
    pro: {
      monthlyCreditGrant: 3500,
      subscriptionPriceCents: 2900,
      subscriptionPriceAnnualCents: 29000,
      includedSeats: 1,
      stripePriceIdMonth: null,
      stripePriceIdYear: null,
      entitlements: {
        maxEstimatesPerMonth: 200,
        maxEstimatesPerDay: 30,
        maxPriceResearchPerMonth: 1000,
        maxPhotosPerEstimate: 20,
        maxAudioMinutesPerEstimate: 15,
        whatsappEnabled: true,
        pdfEnabled: true,
        priceBookEnabled: true,
        customDomainEnabled: false,
        chatEnabled: true,
      },
      featureBullets: [
        'Unlimited estimates',
        '20 photos per estimate',
        'Custom branding',
        'Priority email support',
      ],
    },
    business: {
      monthlyCreditGrant: 12000,
      subscriptionPriceCents: 9900,
      subscriptionPriceAnnualCents: 99000,
      includedSeats: 1,
      stripePriceIdMonth: null,
      stripePriceIdYear: null,
      entitlements: {
        maxEstimatesPerMonth: null,
        maxEstimatesPerDay: 100,
        maxPriceResearchPerMonth: null,
        maxPhotosPerEstimate: 50,
        maxAudioMinutesPerEstimate: 30,
        whatsappEnabled: true,
        pdfEnabled: true,
        priceBookEnabled: true,
        customDomainEnabled: true,
        chatEnabled: true,
      },
      featureBullets: [
        'Everything in Pro',
        '50 photos per estimate',
        'Custom domain',
        'Stripe Connect payments',
        'Phone + chat support',
      ],
    },
  },
  // Billing v2 (CREDITUI-06): 3 dollar-denominated packs at $20/$50/$100.
  // Credits-per-pack are CALIBRATE-BEFORE-CHARGING placeholders (mild volume
  // discount curve consistent with the prior 2-pack ratio) — NOT final pricing.
  topUpPacks: [
    { credits: 1300, priceCents: 2000 },
    { credits: 3500, priceCents: 5000 },
    { credits: 7500, priceCents: 10000 },
  ],
  lowBalanceThresholds: [200, 50],
  meteredOperations: { estimate: true, photo_batch: true, audio_minutes: true, price_research: true },
  absorbedChatRateLimitPerMin: 20,
  // Billing v2: free-tier one-time allowance. CALIBRATE (sized ≈ a handful of
  // estimates at the default markup); adjustable at runtime via the admin panel.
  signupCreditGrant: 2000,
  // Billing v2: enforcement ON — the free wall depends on it (see type docs).
  enforcementEnabled: true,
  // Phase 153 (CREDITUI-07): auto-top-up kill switch defaults OFF, mirroring
  // enforcementEnabled's exact pattern — flip on only after the tenant-facing
  // settings UI (Plan 03) and the trigger core (this plan) are both verified.
  autoTopupEnabled: false,
}

// 30s TTL cache mirroring brandingCache (lib/platform-config.ts). The
// invalidator is called from invalidatePlatformConfig() so a Plan 02 admin
// save flushes immediately — the new config applies at runtime without a
// deploy (BILLCFG-02 "applied without deploy", research Pitfall 5).
const BILLING_CONFIG_TTL_MS = 30_000
let billingConfigCache: { value: BillingConfig; fetchedAt: number } | null = null

export function invalidateBillingConfigCache(): void {
  billingConfigCache = null
}

/**
 * Null-safe reader. Returns {@link DEFAULT_BILLING_CONFIG} when no row exists or
 * the service client is unavailable (static build). When a row is present, it
 * shallow-merges the stored metadata over the defaults and DEEP-merges `tiers`
 * so a row written before a field existed still resolves (research Pitfall 6).
 * Cached for 30s; flush via {@link invalidateBillingConfigCache}.
 */
export async function getBillingConfig(): Promise<BillingConfig> {
  const now = Date.now()
  if (billingConfigCache && now - billingConfigCache.fetchedAt < BILLING_CONFIG_TTL_MS) {
    return billingConfigCache.value
  }
  const svc = createServiceClient()
  if (!svc) {
    billingConfigCache = { value: DEFAULT_BILLING_CONFIG, fetchedAt: now }
    return DEFAULT_BILLING_CONFIG
  }
  const { data } = await svc
    .from('platform_integrations')
    .select('metadata')
    .eq('provider', 'billing_config')
    .maybeSingle()
  const stored = (data?.metadata ?? null) as Partial<BillingConfig> | null
  if (!stored) {
    billingConfigCache = { value: DEFAULT_BILLING_CONFIG, fetchedAt: now }
    return DEFAULT_BILLING_CONFIG
  }
  // Deep-merge each tier so a row written before `entitlements` existed still
  // resolves that nested object from the defaults (research Pitfall 6). Every
  // tier now carries a nested `entitlements` map that must fall through
  // field-by-field, not be dropped when a stored tier omits it.
  const storedTiers = (stored.tiers ?? {}) as Partial<
    Record<BillingTier, Partial<TierBilling>>
  >
  const tierNames: BillingTier[] = ['free', 'pro', 'business']
  const tiers = Object.fromEntries(
    tierNames.map((t) => {
      const storedTier = storedTiers[t] ?? {}
      return [
        t,
        {
          ...DEFAULT_BILLING_CONFIG.tiers[t],
          ...storedTier,
          entitlements: {
            ...DEFAULT_BILLING_CONFIG.tiers[t].entitlements,
            ...(storedTier.entitlements ?? {}),
          },
        },
      ]
    })
  ) as Record<BillingTier, TierBilling>
  const value: BillingConfig = {
    ...DEFAULT_BILLING_CONFIG,
    ...stored,
    tiers,
  }
  billingConfigCache = { value, fetchedAt: now }
  return value
}
