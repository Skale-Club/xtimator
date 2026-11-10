import { TopUpPackCard } from '@/components/billing/topup-pack-card'
import type { TopUpPack } from '@/lib/billing/billing-config'
import { resolvePackPrice, type BillingCurrency } from '@/lib/billing/billing-currency'

/**
 * Phase 153-01 (CREDITUI-06) — 3-column top-up pack picker.
 *
 * `packs` is a REQUIRED prop fed by the server page from the billing config
 * reader's `topUpPacks` field — no local pack array, no hardcoded pricing,
 * matching the SEED-035 "everything configurable" principle enforced
 * elsewhere in this file's sibling components (tier-cards-grid.tsx).
 * The middle pack (index 1 of exactly 3) is marked "Best value".
 */
export function TopUpPacksGrid({
  packs,
  // Owner-only billing: the routes return 403 for a member, so the cards must
  // not offer a purchase the server will refuse (audit dead-end #6).
  isOwner = true,
  currency = 'usd',
}: {
  packs: TopUpPack[]
  isOwner?: boolean
  currency?: BillingCurrency
}) {
  const recommendedIndex = packs.length >= 3 ? 1 : -1
  return (
    <div className="grid w-full grid-cols-3 gap-2 pt-1 sm:gap-4">
      {packs.map((pack, i) => {
        const price = resolvePackPrice(pack, currency)
        return (
        <TopUpPackCard
          key={i}
          packIndex={i}
          priceCents={price.priceCents}
          currency={price.currency}
          credits={pack.credits}
          recommended={i === recommendedIndex}
          isOwner={isOwner}
        />
        )
      })}
    </div>
  )
}
