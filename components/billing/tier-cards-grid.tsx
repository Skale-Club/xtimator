'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { TierCard, type Tier } from './tier-card'
import { useTranslation } from '@/lib/i18n/use-translation'
import { formatUsd } from '@/lib/billing/format-usd'

// Tier ranking — used to distinguish an upgrade ("Upgrade to Pro") from a
// lateral/downward switch ("Switch to Pro") relative to the user's current tier.
const TIER_RANK: Record<Tier, number> = { free: 0, pro: 1, business: 2 }

interface TierCardsGridProps {
  currentTier: Tier | 'trial'
  annualPrices?: { pro?: number | null; business?: number | null }
  monthlyPricesCents?: { pro?: number | null; business?: number | null }
}

/**
 * Phase 156 (CREDITFIX-03) — feature-bullet verification pass.
 *
 * Prices are sourced live from billing_config via monthlyPricesCents/annualPrices
 * props (see getMonthlyPriceDisplay/getAnnualDisplay below) — never hardcoded here.
 *
 * Feature bullets have NO equivalent billing_config field (they are marketing
 * copy, not billing data — intentionally NOT moved into config, per locked
 * decision: no new backend/ledger logic this phase). Each bullet below was
 * checked against lib/entitlements.ts's actual tier-gating code on 2026-07-06:
 *
 * - Free "photos per estimate" / Pro "photos per estimate" / Business "photos
 *   per estimate": all 3 corrected to match maxPhotosPerEstimate (3/20/50) —
 *   previously overclaimed 10/50/"Unlimited".
 * - Free "estimates" bullet corrected: free is credit-gated (maxEstimatesPerMonth
 *   is null — no count cap), not "3 estimates per month" as previously claimed.
 * - Pro "WhatsApp delivery" REMOVED: whatsappEnabled is true for ALL tiers
 *   (lib/entitlements.ts) — it was never a Pro-exclusive differentiator.
 * - Pro "Unlimited estimates" LEFT AS-IS: maxEstimatesPerMonth=200 is an
 *   anti-abuse ceiling (per the file's own comment), not a customer-facing cap
 *   — 200/mo functions as unlimited for realistic usage.
 * - Business "Custom domain" LEFT AS-IS: matches customDomainEnabled=true,
 *   business-exclusive, verified accurate.
 * - "Custom branding" (pro) and "Stripe Connect payments" (business): NO
 *   code-level gate exists anywhere in the codebase for either (grepped
 *   customBranding/brandingEnabled and tier checks in app/api/stripe/connect/*
 *   — zero matches). These are either aspirational copy or ungated-in-practice
 *   capabilities; left as-is (adding new gating logic is out of scope — no new
 *   backend logic this phase) but flagged here for a future phase to either
 *   implement the gate or soften the copy.
 * - "Basic templates" / "Email support" / "Priority email support" / "Phone +
 *   chat support" / "Everything in Pro": non-code-gated support-channel or
 *   structural copy, nothing in the codebase to verify against — left as-is.
 */
const TIERS: Array<{
  tier: Tier
  name: string
  price?: string
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
      'Estimates until your free credits run out',
      '3 photos per estimate',
      'Basic templates',
      'Email support',
    ],
  },
  {
    tier: 'pro',
    name: 'Pro',
    period: 'month',
    popular: true,
    features: [
      'Unlimited estimates',
      '20 photos per estimate',
      'Custom branding',
      'Priority email support',
    ],
  },
  {
    tier: 'business',
    name: 'Business',
    period: 'month',
    features: [
      'Everything in Pro',
      '50 photos per estimate',
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

  function getMonthlyPriceDisplay(tier: Tier, fallback: string): string {
    if (tier === 'free') return fallback // free is always $0, not config-driven
    const cents = monthlyPricesCents?.[tier as 'pro' | 'business']
    if (cents == null) return fallback // defensive fallback if prop not passed (e.g. isolated render/test)
    return formatUsd(cents)
  }

  function getAnnualDisplay(tier: Tier) {
    if (tier === 'free') return null
    const annualCents = annualPrices?.[tier as 'pro' | 'business']
    const monthlyCents = monthlyPricesCents?.[tier as 'pro' | 'business']
    if (!annualCents || !monthlyCents) return null
    const perMonthDollars = (annualCents / 100 / 12).toFixed(2)
    const savePct = Math.round((1 - annualCents / (monthlyCents * 12)) * 100)
    return {
      annualPrice: formatUsd(annualCents),
      annualPerMonth: `$${perMonthDollars}`,
      savePct: savePct > 0 ? savePct : null,
    }
  }

  const normalized: Tier = currentTier === 'trial' ? 'free' : currentTier
  const isPaidUser = normalized === 'pro' || normalized === 'business'

  return (
    <div className="space-y-6">
      {/* Monthly / Annual toggle */}
      <div className="flex items-center justify-center gap-1">
        <button
          type="button"
          aria-pressed={billingInterval === 'month'}
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
          aria-pressed={billingInterval === 'year'}
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
          const monthlyPrice = getMonthlyPriceDisplay(tierItem.tier, tierItem.price ?? '$0')
          // Free card is a portal-only downgrade path for paid users — render it
          // disabled (it never had a checkout wire-up; onSelect returns early)
          // so it doesn't read as an enabled no-op.
          const freeDisabledForPaid = tierItem.tier === 'free' && isPaidUser
          const ranksAbove = TIER_RANK[normalized] > TIER_RANK[tierItem.tier]
          const ctaLabel =
            loading === tierItem.tier
              ? 'Redirecting…'
              : tierItem.tier === 'free'
                ? freeDisabledForPaid
                  ? 'Downgrade via portal'
                  : 'Get started'
                : ranksAbove
                  ? `Switch to ${tierItem.name}`
                  : `Upgrade to ${tierItem.name}`
          return (
            <TierCard
              key={tierItem.tier}
              tier={tierItem.tier}
              name={tierItem.name}
              price={monthlyPrice}
              period={tierItem.period}
              features={tierItem.features}
              popular={tierItem.popular}
              current={normalized === tierItem.tier}
              showAnnual={billingInterval === 'year'}
              annualPrice={annualDisplay?.annualPrice}
              annualPerMonth={annualDisplay?.annualPerMonth}
              savePct={annualDisplay?.savePct}
              ctaLabel={ctaLabel}
              disabled={freeDisabledForPaid}
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
