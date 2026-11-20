'use client'

import { CreditCard } from 'lucide-react'
import { TopUpPackCard } from '@/components/billing/topup-pack-card'
import { openBuyCredits } from '@/components/billing/buy-credits'
import { useTranslation } from '@/lib/i18n/use-translation'
import type { TopUpPack } from '@/lib/billing/billing-config'
import type { BillingCurrency } from '@/lib/billing/billing-currency'
import { defaultPackIndex, packViews, type EstimateCreditsRange } from '@/lib/billing/pack-display'

/**
 * The top-up pack picker on the billing page. `packs` comes from the billing
 * config (admin-editable, never a local constant). Credits plan 2026-11-20:
 * "Best value" is computed (most credits per unit of price), each pack shows
 * the range of estimates it usually covers, and the line under the packs says
 * which card a buy charges.
 */
export function TopUpPacksGrid({
  packs,
  isOwner = true,
  currency = 'usd',
  estimateRange = { low: 65, high: 150 },
  cardLabel,
}: {
  packs: TopUpPack[]
  isOwner?: boolean
  currency?: BillingCurrency
  estimateRange?: EstimateCreditsRange
  /** "Visa •••• 4242" when the subscription has a card on file. */
  cardLabel?: string | null
}) {
  const { t } = useTranslation()
  const views = packViews(packs, currency, estimateRange)
  const first = defaultPackIndex(views.length)

  return (
    <div className="space-y-3">
      <div className="grid w-full grid-cols-3 gap-2 pt-1 sm:gap-4">
        {views.map((v) => (
          <TopUpPackCard
            key={v.index}
            packIndex={v.index}
            priceCents={v.priceCents}
            currency={v.currency}
            credits={v.credits}
            estimates={v.estimates}
            bestValue={v.bestValue}
            highlighted={v.index === first}
            isOwner={isOwner}
          />
        ))}
      </div>
      {cardLabel ? (
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          <CreditCard className="h-3.5 w-3.5" aria-hidden />
          {t('Charged to {card}, your subscription card, without leaving the app.').replace('{card}', cardLabel)}
          <button
            type="button"
            className="underline underline-offset-2 hover:text-foreground"
            onClick={() => openBuyCredits({ packIndex: first })}
            disabled={!isOwner}
          >
            {t('Use another card')}
          </button>
        </p>
      ) : null}
    </div>
  )
}
