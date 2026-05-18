'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { TierCard, type Tier } from './tier-card'
import { useTranslation } from '@/lib/i18n/use-translation'

interface TierCardsGridProps {
  currentTier: Tier | 'trial'
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

export function TierCardsGrid({ currentTier }: TierCardsGridProps) {
  const { t } = useTranslation()
  const [loading, setLoading] = useState<Tier | null>(null)

  async function handleSelect(tier: Tier) {
    if (tier === 'free') return
    setLoading(tier)
    try {
      const res = await fetch('/api/billing/create-checkout-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: tier }),
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

  const normalized: Tier = currentTier === 'trial' ? 'free' : currentTier

  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
      {TIERS.map((t) => (
        <TierCard
          key={t.tier}
          tier={t.tier}
          name={t.name}
          price={t.price}
          period={t.period}
          features={t.features}
          popular={t.popular}
          current={normalized === t.tier}
          ctaLabel={
            loading === t.tier
              ? 'Redirecting…'
              : t.tier === 'free'
                ? 'Get started'
                : `Upgrade to ${t.name}`
          }
          currentLabel="Current plan"
          popularLabel="Most popular"
          onSelect={() => handleSelect(t.tier)}
        />
      ))}
    </div>
  )
}
