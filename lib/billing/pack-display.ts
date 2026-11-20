import type { TopUpPack } from '@/lib/billing/billing-config'
import { resolvePackPrice, type BillingCurrency } from '@/lib/billing/billing-currency'

/**
 * Credits plan 2026-11-20: what the owner sees on a top-up pack.
 *
 * - The credits are the headline (the July 2026 "never show credit counts"
 *   rule is gone since SEED-055 shows credits everywhere).
 * - An estimate's cost varies, so a pack shows a RANGE of estimates, from the
 *   admin-configured cost of a large one (fewest) to a small one (most).
 * - "Best value" goes to the pack with the most credits per unit of price, not
 *   to a fixed position.
 */
export type EstimateCreditsRange = { low: number; high: number }

export function estimatesForCredits(
  credits: number,
  range: EstimateCreditsRange
): { min: number; max: number } {
  const low = Math.max(1, Math.round(range.low))
  const high = Math.max(low, Math.round(range.high))
  return { min: Math.floor(credits / high), max: Math.floor(credits / low) }
}

/** Index of the pack with the most credits per cent (ties: the bigger pack). -1 with fewer than 2 packs. */
export function bestValuePackIndex(packs: TopUpPack[], currency: BillingCurrency): number {
  if (packs.length < 2) return -1
  let best = -1
  let bestRate = -1
  packs.forEach((pack, i) => {
    const { priceCents } = resolvePackPrice(pack, currency)
    if (!(priceCents > 0)) return
    const rate = pack.credits / priceCents
    if (rate > bestRate + 1e-9 || (Math.abs(rate - bestRate) <= 1e-9 && pack.credits > packs[best]?.credits)) {
      best = i
      bestRate = rate
    }
  })
  return best
}

export type PackView = {
  index: number
  credits: number
  priceCents: number
  currency: BillingCurrency
  estimates: { min: number; max: number }
  bestValue: boolean
}

export function packViews(
  packs: TopUpPack[],
  currency: BillingCurrency,
  range: EstimateCreditsRange
): PackView[] {
  const best = bestValuePackIndex(packs, currency)
  return packs.map((pack, index) => {
    const price = resolvePackPrice(pack, currency)
    return {
      index,
      credits: pack.credits,
      priceCents: price.priceCents,
      currency: price.currency,
      estimates: estimatesForCredits(pack.credits, range),
      bestValue: index === best,
    }
  })
}

/** The pack offered first: the middle one of three, else the first. */
export function defaultPackIndex(count: number): number {
  return count >= 3 ? 1 : 0
}
