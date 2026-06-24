/**
 * Phase 116 — Calibration core (CALIB-02).
 *
 * Three concerns, deliberately split by purity:
 *   1. validateMarginInvariant — PURE. Inverts the credit-ledger debit math to
 *      compute, per priced tier, the real OpenRouter/Whisper cost of spending the
 *      WHOLE monthly grant, and gates it at ≤ 30% of the subscription price
 *      (SEED-035 §5). Importable by BOTH the server gate (saveBillingConfig, Plan
 *      02) and any client pass/fail badge — so this module carries NO
 *      `import 'server-only'`; the only I/O (the aggregator) guards itself at
 *      call time.
 *   2. recommendFromAggregate — PURE, ILLUSTRATIVE. Given a per-operation cost
 *      aggregate + an EXPLICIT per-tier usage profile, estimates a tier's monthly
 *      real cost. The usage profile is a documented GUESS until production data
 *      exists (see CALIBRATION-RUNBOOK).
 *   3. aggregateAiCostByOperation — service-role read of ai_cost_events. Excludes
 *      NULL real_cost_usd (Phase-110 null-vs-0 discipline) and NEVER throws.
 *
 * WHY NO 'server-only' HERE: the credit-ledger module is server-only because it
 * writes via requireServiceClient at module top. This module's pure exports must
 * be importable from a client badge AND the server gate, so it stays pure-
 * importable; requireServiceClient is itself server-guarded and is only ever
 * reached inside aggregateAiCostByOperation. The BillingConfig import is TYPE-ONLY
 * (`import type`), so this module does NOT reference the billing-config reader
 * SYMBOL — it stays out of the Phase-111 dormancy allowlist (it is not a config
 * consumer; it validates a config that is passed IN).
 */

import type { BillingConfig, BillingTier } from '@/lib/billing/billing-config'

/** SEED-035 §5: the real cost of a tier's FULL monthly grant must be ≤ 30% of its price. */
export const MARGIN_INVARIANT_MAX = 0.3

export type TierMarginResult = {
  /** real OpenRouter/Whisper cost (USD) of spending the entire monthly grant. */
  realCostOfGrantUsd: number
  /** realCostOfGrantUsd / subscriptionPriceUsd. Infinity for zero-price tiers. */
  ratio: number
  /** true iff ratio ≤ max (always true for skipped/zero-price tiers). */
  pass: boolean
  /** true for zero-price tiers (free/trial) — excluded from the gate, still reported. */
  skipped: boolean
}

/**
 * Validate the margin invariant against a billing config.
 *
 * For each tier: realCostOfGrantUsd = (monthlyCreditGrant × creditUnitUsd) / markup
 * (the exact inverse of recordCreditDebit's `credits = round(realCost × markup /
 * creditUnitUsd)`), ratio = realCostOfGrantUsd / (subscriptionPriceCents / 100).
 *
 * Zero-price tiers (free/trial) have no subscription revenue to measure a margin
 * against, so they are SKIPPED (skipped:true, pass:true) — their burn is still
 * reported via realCostOfGrantUsd. The overall `pass` is the AND over PRICED
 * tiers only. A failing priced tier (ratio > max) makes overall pass false.
 */
export function validateMarginInvariant(
  cfg: Pick<BillingConfig, 'markup' | 'creditUnitUsd' | 'tiers'>,
  max = MARGIN_INVARIANT_MAX
): { pass: boolean; tiers: Record<BillingTier, TierMarginResult> } {
  const tierNames = Object.keys(cfg.tiers) as BillingTier[]
  const tiers = {} as Record<BillingTier, TierMarginResult>
  let overall = true
  for (const name of tierNames) {
    const t = cfg.tiers[name]
    const realCostOfGrantUsd = (t.monthlyCreditGrant * cfg.creditUnitUsd) / cfg.markup
    const priceUsd = t.subscriptionPriceCents / 100
    const skipped = priceUsd <= 0
    const ratio = skipped ? Infinity : realCostOfGrantUsd / priceUsd
    const pass = skipped ? true : ratio <= max
    if (!skipped && !pass) overall = false
    tiers[name] = { realCostOfGrantUsd, ratio, pass, skipped }
  }
  return { pass: overall, tiers }
}

/** Per-operation_type cost statistics over measured (non-null) ai_cost_events rows. */
export type OpCostStat = {
  operationType: string
  /** count of MEASURED rows (NULL-cost rows are excluded — Phase-110 discipline). */
  n: number
  meanUsd: number
  medianUsd: number
  p90Usd: number
}

/**
 * Estimate a tier's monthly real AI cost from a per-operation aggregate and an
 * EXPLICIT per-tier usage profile.
 *
 * ILLUSTRATIVE — the usageProfile is a documented GUESS (e.g. "Pro = 40 estimates
 * + 200 photo_batch + 120 audio_minutes / mo") until production usage data exists.
 * See CALIBRATION-RUNBOOK. estimatedMonthlyRealCostUsd = Σ over op of
 * (perOp.meanUsd × usageProfile[op] ?? 0). An op absent from the profile
 * contributes 0 — never NaN.
 */
export function recommendFromAggregate(
  perOp: OpCostStat[],
  usageProfile: Partial<Record<string, number>>
): { estimatedMonthlyRealCostUsd: number } {
  const estimatedMonthlyRealCostUsd = perOp.reduce((acc, op) => {
    const count = usageProfile[op.operationType] ?? 0
    return acc + op.meanUsd * count
  }, 0)
  return { estimatedMonthlyRealCostUsd }
}

/**
 * Read ai_cost_events via the service-role client and compute mean/median/p90/n
 * per operation_type over MEASURED rows only.
 *
 * The `.not('real_cost_usd', 'is', null)` filter is load-bearing: NULL means the
 * provider returned no cost (Gemini / unknown Whisper rate) and is NEVER coerced
 * to 0 — including it would bias the mean toward zero (Phase-110 null-vs-0
 * discipline). Best-effort: any read failure returns [] (never throws), mirroring
 * reconcileBalance in credit-ledger.ts.
 */
export async function aggregateAiCostByOperation(): Promise<OpCostStat[]> {
  try {
    const { requireServiceClient } = await import('@/lib/supabase/service')
    const svc = requireServiceClient()
    const { data, error } = await svc
      .from('ai_cost_events')
      .select('operation_type, real_cost_usd')
      .not('real_cost_usd', 'is', null)
    if (error) return []
    const rows = (data as Array<{ operation_type: string; real_cost_usd: number }> | null) ?? []

    // Group measured costs per operation_type.
    const byOp = new Map<string, number[]>()
    for (const r of rows) {
      // Defensive: skip any NULL that slipped past the query filter (never coerce to 0).
      if (r.real_cost_usd == null) continue
      const list = byOp.get(r.operation_type) ?? []
      list.push(r.real_cost_usd)
      byOp.set(r.operation_type, list)
    }

    const result: OpCostStat[] = []
    for (const [operationType, costs] of byOp) {
      const sorted = [...costs].sort((a, b) => a - b)
      const len = sorted.length
      const sum = sorted.reduce((acc, c) => acc + c, 0)
      const meanUsd = sum / len
      const medianUsd = sorted[Math.min(Math.floor(0.5 * len), len - 1)]
      const p90Usd = sorted[Math.min(Math.floor(0.9 * len), len - 1)]
      result.push({ operationType, n: len, meanUsd, medianUsd, p90Usd })
    }
    result.sort((a, b) => a.operationType.localeCompare(b.operationType))
    return result
  } catch (err) {
    console.warn('[aggregateAiCostByOperation] swallowed read failure:', err)
    return []
  }
}
