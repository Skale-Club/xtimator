import 'server-only'
import { createServiceClient } from '@/lib/supabase/service'

/**
 * Phase 111 — billing_config store CORE (BILLCFG-01 / BILLCFG-03).
 *
 * A typed, null-safe, SERVER-ONLY reader over the metadata-only
 * `platform_integrations` `billing_config` row. Mirrors
 * `getSelectedAIProvider()` (lib/platform-config.ts): reads `metadata` via
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
export type TierBilling = { monthlyCreditGrant: number; subscriptionPriceCents: number }
export type BillingTier = 'free' | 'trial' | 'pro' | 'business' // mirrors the TierName union

export type BillingConfig = {
  markup: number // global multiplier; default 4.5 (per-op map = v2 GRAN-01 extension point)
  creditUnitUsd: number // 1 credit = $X charged value; default 0.01
  whisperUsdPerMinute: number // runtime source for the Phase-110 transcription rate const; default 0.006
  estimateFeePct: number // 0.01 = 1% (SEED-036); default 0.01
  estimateFeeMinCents: number // Stripe rejects $0 fee — sane floor for Phase 114 FEE-04; default 1
  tiers: Record<BillingTier, TierBilling>
  topUpPacks: TopUpPack[]
  lowBalanceThresholds: number[] // credit balances at which to warn; default [200, 50]
  meteredOperations: Record<string, boolean> // which ops debit vs absorbed (schema slot for Phase 112; minimal UI now)
  absorbedChatRateLimitPerMin: number // anti-abuse for absorbed chat; default 20
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
  tiers: {
    free: { monthlyCreditGrant: 0, subscriptionPriceCents: 0 },
    trial: { monthlyCreditGrant: 2000, subscriptionPriceCents: 0 },
    pro: { monthlyCreditGrant: 9000, subscriptionPriceCents: 2900 },
    business: { monthlyCreditGrant: 30000, subscriptionPriceCents: 9900 },
  },
  topUpPacks: [
    { credits: 1000, priceCents: 1500 },
    { credits: 5000, priceCents: 6000 },
  ],
  lowBalanceThresholds: [200, 50],
  meteredOperations: { estimate: true, photo_batch: true, audio_minutes: true, price_research: true },
  absorbedChatRateLimitPerMin: 20,
}

/**
 * Null-safe reader. Returns {@link DEFAULT_BILLING_CONFIG} when no row exists or
 * the service client is unavailable (static build). When a row is present, it
 * shallow-merges the stored metadata over the defaults and DEEP-merges `tiers`
 * so a row written before a field existed still resolves (research Pitfall 6).
 */
export async function getBillingConfig(): Promise<BillingConfig> {
  const svc = createServiceClient()
  if (!svc) return DEFAULT_BILLING_CONFIG
  const { data } = await svc
    .from('platform_integrations')
    .select('metadata')
    .eq('provider', 'billing_config')
    .maybeSingle()
  const stored = (data?.metadata ?? null) as Partial<BillingConfig> | null
  if (!stored) return DEFAULT_BILLING_CONFIG
  return {
    ...DEFAULT_BILLING_CONFIG,
    ...stored,
    tiers: { ...DEFAULT_BILLING_CONFIG.tiers, ...(stored.tiers ?? {}) },
  }
}
