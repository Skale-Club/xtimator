'use client'

import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useTranslation } from '@/lib/i18n/use-translation'
import { useIsTwa } from '@/components/pwa/twa-provider'
import { openBuyCredits } from '@/components/billing/buy-credits'
import { formatCredits } from '@/lib/billing/format-usd'
import { formatBillingAmount, type BillingCurrency } from '@/lib/billing/billing-currency'

/**
 * One top-up pack on the billing page (credits plan 2026-11-20).
 *
 * The credits are the headline, with the range of estimates they usually
 * cover; the price is on the button. The price is ALWAYS derived from
 * `priceCents` (admin-editable packs). Buy opens the shared buy dialog with
 * this pack selected, which charges the subscription card or falls back to
 * Checkout.
 */
export function TopUpPackCard({
  packIndex,
  priceCents,
  credits,
  estimates,
  bestValue,
  highlighted,
  isOwner = true,
  currency = 'usd',
}: {
  packIndex: number
  priceCents: number
  credits: number
  estimates?: { min: number; max: number }
  bestValue?: boolean
  /** The pack offered first (stronger border and a primary button). */
  highlighted?: boolean
  isOwner?: boolean
  currency?: BillingCurrency
}) {
  const { t } = useTranslation()
  const isTwa = useIsTwa()
  const amount = formatBillingAmount(priceCents, currency)

  return (
    <div
      data-testid="topup-pack"
      className={cn(
        'relative flex flex-col items-center gap-1 rounded-[var(--radius-md)] border px-2 pb-3 pt-5 text-center sm:px-4 sm:pb-4 sm:pt-6',
        highlighted
          ? 'border-[hsl(var(--primary))]/60 bg-[hsl(var(--primary))]/5'
          : 'border-[var(--glass-border)] bg-[var(--glass-bg-light)]'
      )}
    >
      {bestValue && (
        <Badge variant="brand" className="absolute -top-2.5 left-1/2 -translate-x-1/2 whitespace-nowrap">
          {t('Best value')}
        </Badge>
      )}
      <span className="text-xl font-semibold tracking-tight [font-variant-numeric:tabular-nums] sm:text-3xl">
        {formatCredits(credits)}
      </span>
      <span className="text-xs text-muted-foreground">{t('credits')}</span>
      {estimates && (
        <span className="text-[11px] leading-tight text-muted-foreground sm:text-xs">
          {t('{min} to {max} estimates')
            .replace('{min}', String(estimates.min))
            .replace('{max}', String(estimates.max))}
        </span>
      )}
      {!isTwa && (
        <Button
          size="sm"
          variant={highlighted ? 'primary' : 'outline'}
          className="mt-2 w-full justify-center text-center"
          disabled={!isOwner}
          onClick={() => openBuyCredits({ packIndex })}
        >
          <span className="hidden sm:inline">{t('Buy for {price}').replace('{price}', amount)}</span>
          <span className="sm:hidden">{amount}</span>
        </Button>
      )}
    </div>
  )
}
