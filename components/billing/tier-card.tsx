'use client'

import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Check } from 'lucide-react'
import { useTranslation } from '@/lib/i18n/use-translation'

export type Tier = 'free' | 'pro' | 'business'

interface TierCardProps {
  tier: Tier
  name: string
  price: string
  period: string
  features: string[]
  ctaLabel: string
  currentLabel?: string
  popularLabel?: string
  onSelect?: () => void
  current?: boolean
  disabled?: boolean
  popular?: boolean
  showAnnual?: boolean
  annualPrice?: string | null
  annualPerMonth?: string | null
  savePct?: number | null
  /** Off when the surrounding card already names the only plan offered. */
  showName?: boolean
}

/**
 * One plan offer, laid out as a wide row: price and the call to action on the
 * left, what is included on the right. It carries no card chrome of its own;
 * TierCardsGrid frames it (title + Monthly/Annual toggle) like every other
 * settings card.
 *
 * Phase 145 — Annual pricing display:
 * - showAnnual=true + annualPrice → shows annual total + per-month equivalent + save badge
 * - showAnnual=true + no annualPrice → falls back to monthly display (annual not configured)
 */
export function TierCard({
  tier,
  name,
  price,
  period,
  features,
  ctaLabel,
  currentLabel = 'Current plan',
  popularLabel = 'Most popular',
  onSelect,
  current,
  disabled,
  popular,
  showAnnual,
  annualPrice,
  annualPerMonth,
  savePct,
  showName = true,
}: TierCardProps) {
  const { t } = useTranslation()
  const buttonVariant =
    tier === 'free' ? 'outline' : tier === 'pro' ? 'primary' : 'premium'

  const displayAnnual = showAnnual && !!annualPrice

  return (
    <div
      className={cn('grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] md:gap-10')}
      data-tier={tier}
    >
      <div className="flex flex-col gap-4">
        {(showName || (popular && !current)) && (
          <div className="flex flex-wrap items-center gap-2">
            {showName && <h3 className="text-base font-semibold">{t(name)}</h3>}
            {popular && !current && <Badge variant="brand">{t(popularLabel)}</Badge>}
          </div>
        )}
        <div className="space-y-1">
          <div className="flex items-baseline gap-1.5">
            <span className="text-4xl font-semibold tracking-tight [font-variant-numeric:tabular-nums]">
              {displayAnnual ? annualPrice : price}
            </span>
            <span className="whitespace-nowrap text-sm text-muted-foreground">
              / {t(displayAnnual ? 'year' : period)}
            </span>
          </div>
          {displayAnnual && (annualPerMonth || savePct != null) && (
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              {annualPerMonth && (
                <span>
                  {annualPerMonth} {t('/ mo · billed annually')}
                </span>
              )}
              {savePct != null && (
                <Badge variant="success">{t('Save {pct}%').replace('{pct}', String(savePct))}</Badge>
              )}
            </div>
          )}
        </div>
        <Button
          variant={buttonVariant}
          onClick={onSelect}
          disabled={current || disabled}
          className="mt-auto h-auto min-h-10 w-full whitespace-normal py-2 text-center leading-tight"
        >
          {t(current ? currentLabel : ctaLabel)}
        </Button>
      </div>

      <ul className="grid content-start gap-x-6 gap-y-2.5 text-sm sm:grid-cols-2">
        {features.map((f) => (
          <li key={f} className="flex items-start gap-2">
            <Check aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-[hsl(var(--primary))]" />
            <span>{t(f)}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
