import type { TopUpPack } from '@/lib/billing/billing-config'
import { resolvePackPrice, type BillingCurrency } from '@/lib/billing/billing-currency'

/**
 * Credits plan 2026-11-20: what the owner sees on a top-up pack.
 *
 * - The credits are the headline (the July 2026 "never show credit counts"
 *   rule is gone since SEED-055 shows credits everywhere).
 * - No conversion to estimates: what a credit buys is a business secret
 *   (owner, 2026-11-20), so a pack shows only its credits and price.
 * - "Best value" goes to the pack with the most credits per unit of price, not
 *   to a fixed position.
 */
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
  bestValue: boolean
}

export function packViews(packs: TopUpPack[], currency: BillingCurrency): PackView[] {
  const best = bestValuePackIndex(packs, currency)
  return packs.map((pack, index) => {
    const price = resolvePackPrice(pack, currency)
    return {
      index,
      credits: pack.credits,
      priceCents: price.priceCents,
      currency: price.currency,
      bestValue: index === best,
    }
  })
}

/** The pack offered first: the middle one of three, else the first. */
export function defaultPackIndex(count: number): number {
  return count >= 3 ? 1 : 0
}
