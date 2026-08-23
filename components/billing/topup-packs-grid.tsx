import { TopUpPackCard } from '@/components/billing/topup-pack-card'
import type { TopUpPack } from '@/lib/billing/billing-config'

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
}: {
  packs: TopUpPack[]
  isOwner?: boolean
}) {
  const recommendedIndex = packs.length >= 3 ? 1 : -1
  return (
    <div className="mx-auto grid w-full max-w-5xl grid-cols-1 gap-6 sm:grid-cols-3">
      {packs.map((pack, i) => (
        <TopUpPackCard
          key={i}
          packIndex={i}
          priceCents={pack.priceCents}
          credits={pack.credits}
          recommended={i === recommendedIndex}
          isOwner={isOwner}
        />
      ))}
    </div>
  )
}
