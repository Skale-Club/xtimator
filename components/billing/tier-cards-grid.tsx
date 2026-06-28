'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { TierCard, type Tier } from './tier-card'
import { useTranslation } from '@/lib/i18n/use-translation'

interface TierCardsGridProps {
  currentTier: Tier | 'trial'
  annualPrices?: { pro?: number | null; business?: number | null }
  monthlyPricesCents?: { pro?: number | null; business?: number | null }
}

const TIERS: Array<{
  tier: Tier
  name: string
  price: string
  period: string
  features: string[]
  popular?: boolean
}> = [
  {
    tier: 'free',
    name: 'Free',
    price: '$0',
    period: 'month',
    features: [
      '3 estimates per month',
      '10 photos per estimate',
      'Basic templates',
      'Email support',
    ],
  },
  {
    tier: 'pro',
    name: 'Pro',
    price: '$29',
    period: 'month',
    popular: true,
    features: [
      'Unlimited estimates',
      '50 photos per estimate',
      'Custom branding',
      'Priority email support',
      'WhatsApp delivery',
    ],
  },
  {
    tier: 'business',
    name: 'Business',
    price: '$99',
    period: 'month',
    features: [
      'Everything in Pro',
      'Unlimited photos',
      'Custom domain',
      'Stripe Connect payments',
      'Phone + chat support',
    ],
  },
]

export function TierCardsGrid({ currentTier, annualPrices, monthlyPricesCents }: TierCardsGridProps) {
  const { t } = useTranslation()
  const [loading, setLoading] = useState<Tier | null>(null)
  const [billingInterval, setBillingInterval] = useState<'month' | 'year'>('month')

  async function handleSelect(tier: Tier) {
    if (tier === 'free') return
    setLoading(tier)
    try {
      const res = await fetch('/api/billing/create-checkout-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: tier, billingInterval }),
      })
      const data = await res.json()
      if (!res.ok || !data.url) {
        toast.error(t('Could not start checkout. Please try again.'))
        return
      }
      window.location.href = data.url
    } catch {
      toast.error(t('Could not start checkout. Please try again.'))
    } finally {
      setLoading(null)
    }
  }

  function getAnnualDisplay(tier: Tier) {
    if (tier === 'free') return null
    const annualCents = annualPrices?.[tier as 'pro' | 'business']
    const monthlyCents = monthlyPricesCents?.[tier as 'pro' | 'business']
    if (!annualCents || !monthlyCents) return null
    const annualDollars = (annualCents / 100).toFixed(0)
    const perMonthDollars = (annualCents / 100 / 12).toFixed(2)
    const savePct = Math.round((1 - annualCents / (monthlyCents * 12)) * 100)
    return {
      annualPrice: `$${annualDollars}`,
      annualPerMonth: `$${perMonthDollars}`,
      savePct: savePct > 0 ? savePct : null,
    }
  }

  const normalized: Tier = currentTier === 'trial' ? 'free' : currentTier

  return (
    <div className="space-y-6">
      {/* Monthly / Annual toggle */}
      <div className="flex items-center justify-center gap-1">
        <button
          type="button"
          onClick={() => setBillingInterval('month')}
          className={cn(
            'rounded-lg px-4 py-2 text-sm font-medium transition-colors',
            billingInterval === 'month'
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          {t('Monthly')}
        </button>
        <button
          type="button"
          onClick={() => setBillingInterval('year')}
          className={cn(
            'rounded-lg px-4 py-2 text-sm font-medium transition-colors',
            billingInterval === 'year'
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          {t('Annual')}
        </button>
      </div>

      <div className="mx-auto grid w-full max-w-5xl grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {TIERS.map((tierItem) => {
          const annualDisplay = billingInterval === 'year' ? getAnnualDisplay(tierItem.tier) : null
          return (
            <TierCard
              key={tierItem.tier}
              tier={tierItem.tier}
              name={tierItem.name}
              price={tierItem.price}
              period={tierItem.period}
              features={tierItem.features}
              popular={tierItem.popular}
              current={normalized === tierItem.tier}
              showAnnual={billingInterval === 'year'}
              annualPrice={annualDisplay?.annualPrice}
              annualPerMonth={annualDisplay?.annualPerMonth}
              savePct={annualDisplay?.savePct}
              ctaLabel={
                loading === tierItem.tier
                  ? 'Redirecting…'
                  : tierItem.tier === 'free'
                    ? 'Get started'
                    : `Upgrade to ${tierItem.name}`
              }
              currentLabel="Current plan"
              popularLabel="Most popular"
              onSelect={() => handleSelect(tierItem.tier)}
            />
          )
        })}
      </div>
    </div>
  )
}
