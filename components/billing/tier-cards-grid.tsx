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

export type BillingInterval = 'month' | 'year'

interface TierCardsGridProps {
  currentTier: Tier | 'trial'
  annualPrices?: { pro?: number | null; business?: number | null }
  monthlyPricesCents?: { pro?: number | null; business?: number | null }
  // Per-tier marketing bullets sourced live from billing_config
  // (tiers[t].featureBullets), passed by the billing page. Falls back to the
  // hardcoded TIERS[].features below only when a tier is missing (defensive for
  // isolated renders / tests that don't wire the prop).
  featureBullets?: Partial<Record<Tier, string[]>>
  // The company's ACTUAL current billing interval — undefined means "unknown"
  // (keeps pre-Phase-UX behavior: the current tier is always shown as
  // disabled "Current plan" regardless of which toggle position is selected).
  // When known and it differs from the selected toggle position, the current
  // tier's card offers an enabled "Switch to annual"/"Switch to monthly" CTA
  // instead of a disabled "Current plan" — the monthly→annual upsell was
  // previously unreachable because `current` ignored interval entirely.
  currentInterval?: BillingInterval
  // False when the signed-in user is a company member, not the owner — billing
  // actions are owner-only server-side, so a non-owner's every CTA here would
  // otherwise 403 forever with no explanation. Defaults to true so existing
  // callers (which don't know about ownership) keep today's behavior.
  isOwner?: boolean
  // True when the company's subscription is scheduled to cancel at period end
  // (tier_cancelled_at set). The current tier's card then offers an enabled
  // "Resume subscription" CTA (via the billing portal's cancel-reversal flow)
  // instead of a disabled "Current plan" dead end. Defaults to false.
  pendingCancel?: boolean
}

/**
 * Phase 112 — feature bullets are now CONFIG-SOURCED.
 *
 * Prices are sourced live from billing_config via monthlyPricesCents/annualPrices
 * props (see getMonthlyPriceDisplay/getAnnualDisplay below) — never hardcoded here.
 *
 * Feature bullets are likewise runtime-editable: the billing page reads
 * billing_config.tiers[t].featureBullets and passes them via the `featureBullets`
 * prop, so the super-admin panel edits them without a deploy. The TIERS[].features
 * arrays below are the STATIC FALLBACK only (isolated render / tests, or a tier
 * the prop omits). Their defaults mirror billing_config's featureBullets, which
 * were verified accurate against lib/entitlements.ts's tier-gating on 2026-07-06:
 *
 * - Free/Pro/Business "photos per estimate" match maxPhotosPerEstimate (3/20/50).
 * - Free "estimates" bullet: free is credit-gated (maxEstimatesPerMonth null — no
 *   count cap), not a fixed monthly count.
 * - Pro "Unlimited estimates": maxEstimatesPerMonth=200 is an anti-abuse ceiling,
 *   functions as unlimited for realistic usage.
 * - Business "Custom domain": matches customDomainEnabled=true (business-exclusive).
 * - "Custom branding" (pro) / "Stripe Connect payments" (business): no code-level
 *   gate exists — aspirational/ungated copy, editable in the panel.
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

export function TierCardsGrid({
  currentTier,
  annualPrices,
  monthlyPricesCents,
  featureBullets,
  currentInterval,
  isOwner = true,
  pendingCancel = false,
}: TierCardsGridProps) {
  const { t } = useTranslation()
  const [loading, setLoading] = useState<Tier | null>(null)
  const [billingInterval, setBillingInterval] = useState<BillingInterval>('month')

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
        toast.error(data.error ? t(data.error) : t('Could not start checkout. Please try again.'))
        return
      }
      window.location.href = data.url
    } catch {
      toast.error(t('Could not start checkout. Please try again.'))
    } finally {
      setLoading(null)
    }
  }

  // Resume a subscription scheduled to cancel at period end — routes through
  // the same billing portal as "Manage Subscription" (Stripe's portal exposes
  // the cancel-reversal action there), never a dedicated checkout.
  async function handleResume(tier: Tier) {
    setLoading(tier)
    try {
      const res = await fetch('/api/billing/create-portal-session', { method: 'POST' })
      const data = await res.json()
      if (!res.ok || !data.url) {
        toast.error(data.error ? t(data.error) : t('Could not open subscription portal. Please try again.'))
        return
      }
      window.location.href = data.url
    } catch {
      toast.error(t('Could not open subscription portal. Please try again.'))
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
      {!isOwner && (
        <p className="text-center text-sm text-muted-foreground">
          {t('Only the company owner can manage billing.')}
        </p>
      )}

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
          // Config-sourced bullets win; hardcoded TIERS[].features is the fallback.
          const features = featureBullets?.[tierItem.tier] ?? tierItem.features
          // Free card is a portal-only downgrade path for paid users — render it
          // disabled (it never had a checkout wire-up; onSelect returns early)
          // so it doesn't read as an enabled no-op.
          const freeDisabledForPaid = tierItem.tier === 'free' && isPaidUser
          const ranksAbove = TIER_RANK[normalized] > TIER_RANK[tierItem.tier]

          const isCurrentTier = normalized === tierItem.tier
          const sameInterval = currentInterval === undefined || currentInterval === billingInterval
          // Current tier, cancellation scheduled → offer a way back instead of a
          // disabled dead end. Free has no subscription to resume.
          const isPendingCancelCurrent =
            isCurrentTier && sameInterval && pendingCancel && tierItem.tier !== 'free'
          // Current tier, but the toggle is on the OTHER interval and we know
          // the company's actual interval → an enabled interval-switch CTA
          // instead of a disabled "Current plan" for an unbuyable combination.
          const isIntervalSwitch =
            isCurrentTier && !sameInterval && currentInterval !== undefined && !isPendingCancelCurrent
          const current = isCurrentTier && sameInterval && !isPendingCancelCurrent

          const ctaLabel =
            loading === tierItem.tier
              ? 'Redirecting…'
              : tierItem.tier === 'free'
                ? freeDisabledForPaid
                  ? 'Downgrade via portal'
                  : 'Get started'
                : isPendingCancelCurrent
                  ? 'Resume subscription'
                  : isIntervalSwitch
                    ? billingInterval === 'year'
                      ? 'Switch to annual'
                      : 'Switch to monthly'
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
              features={features}
              popular={tierItem.popular}
              current={current}
              showAnnual={billingInterval === 'year'}
              annualPrice={annualDisplay?.annualPrice}
              annualPerMonth={annualDisplay?.annualPerMonth}
              savePct={annualDisplay?.savePct}
              ctaLabel={ctaLabel}
              disabled={freeDisabledForPaid || !isOwner}
              currentLabel="Current plan"
              popularLabel="Most popular"
              onSelect={() =>
                isPendingCancelCurrent ? handleResume(tierItem.tier) : handleSelect(tierItem.tier)
              }
            />
          )
        })}
      </div>
    </div>
  )
}
