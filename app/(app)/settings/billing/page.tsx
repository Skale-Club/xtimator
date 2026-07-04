import { redirect } from 'next/navigation'
import { CreditCard, TrendingUp } from 'lucide-react'
import { getAuthClaims } from '@/lib/queries/auth'
import { getBillingData } from '@/lib/queries/billing'
import { getActiveCompany } from '@/lib/queries/active-company'
import { getCreditOverview } from '@/lib/queries/credits'
import { getBillingConfig } from '@/lib/billing/billing-config'
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '@/components/ui/card'
import { ManageSubscriptionButton } from '@/components/billing/manage-subscription-button'
import { TierCardsGrid } from '@/components/billing/tier-cards-grid'
import { CreditBalanceCard } from '@/components/billing/credit-balance-card'
import { CreditHistoryList } from '@/components/billing/credit-history-list'
import { T } from '@/components/i18n/t'

export const metadata = { title: 'Plans' }

const TIER_DISPLAY: Record<string, string> = {
  free: 'Free',
  pro: 'Pro',
  business: 'Business',
}

export default async function BillingPage() {
  const claims = await getAuthClaims()

  if (!claims) {
    redirect('/?auth=login')
  }

  const data = await getBillingData(claims.sub as string)

  if (!data) {
    redirect('/onboarding')
  }

  const company = await getActiveCompany()

  if (!company) {
    redirect('/onboarding')
  }

  const credits = await getCreditOverview(company.id)

  const cfg = await getBillingConfig()
  const annualPrices = {
    pro: cfg.tiers.pro.subscriptionPriceAnnualCents,
    business: cfg.tiers.business.subscriptionPriceAnnualCents,
  }
  const monthlyPricesCents = {
    pro: cfg.tiers.pro.subscriptionPriceCents,
    business: cfg.tiers.business.subscriptionPriceCents,
  }

  const tierDisplay = TIER_DISPLAY[data.tier] ?? data.tier

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString('en-US', { dateStyle: 'medium' })

  const isPaid = data.tier === 'pro' || data.tier === 'business'

  return (
    <div className="space-y-6 p-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-[clamp(28px,3.5vw,40px)] font-semibold tracking-tight">
          <T>Plans</T>
        </h1>
        <p className="text-sm text-muted-foreground">
          <T>You&rsquo;re on the</T>{' '}
          <strong className="text-foreground"><T text={tierDisplay} /></strong>{' '}
          <T>plan. Choose the tier that fits your business | upgrade or downgrade anytime.</T>
        </p>
      </header>

      <div className="w-full space-y-8">
        {/* Current plan + usage */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Card variant="glass" className="p-6">
            <CardHeader className="border-b border-[var(--glass-border)] p-0 pb-4">
              <div className="flex items-start gap-3">
                <CreditCard className="mt-0.5 h-5 w-5 text-[hsl(var(--primary))]" />
                <div>
                  <CardTitle><T text={`${tierDisplay} Plan`} /></CardTitle>
                  <CardDescription><T>Current subscription plan</T></CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-2 px-0 pt-4 text-sm">
              {isPaid && data.tierRenewsAt && (
                <p className="text-muted-foreground">
                  <span className="font-medium text-foreground"><T>Renews:</T></span>{' '}
                  {formatDate(data.tierRenewsAt)}
                </p>
              )}
              {data.tier === 'free' && (
                <p className="text-muted-foreground">
                  <T>Free plan — your credit balance below is your remaining allowance.</T>
                </p>
              )}
            </CardContent>
          </Card>

          <Card variant="glass" className="p-6">
            <CardHeader className="border-b border-[var(--glass-border)] p-0 pb-4">
              <div className="flex items-start gap-3">
                <TrendingUp className="mt-0.5 h-5 w-5 text-[hsl(var(--primary))]" />
                <div>
                  <CardTitle><T>Usage This Month</T></CardTitle>
                  <CardDescription>
                    <T>Counts reset at the start of each UTC calendar month.</T>
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3 px-0 pt-4 text-sm">
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground"><T>Estimates</T></span>
                <span className="whitespace-nowrap font-mono font-medium">
                  {data.entitlements.maxEstimatesPerMonth !== null ? (
                    `${data.estimatesThisMonth} / ${data.entitlements.maxEstimatesPerMonth}`
                  ) : (
                    <>
                      {data.estimatesThisMonth}{' '}
                      <span className="font-sans text-xs text-muted-foreground">
                        <T>/ Unlimited</T>
                      </span>
                    </>
                  )}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground"><T>Photos analyzed</T></span>
                <span className="whitespace-nowrap text-right font-mono font-medium">
                  {data.entitlements.maxPhotosPerEstimate !== null ? (
                    <>
                      {data.photosThisMonth} / {data.entitlements.maxPhotosPerEstimate}{' '}
                      <span className="font-sans text-xs text-muted-foreground">
                        <T>per estimate</T>
                      </span>
                    </>
                  ) : (
                    <>
                      {data.photosThisMonth}{' '}
                      <span className="font-sans text-xs text-muted-foreground">
                        <T>/ Unlimited</T>
                      </span>
                    </>
                  )}
                </span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Credits (CREDITUI-01/02) — ADDITIVE to the count-based usage card above
            (MIG-01 parallel run). Owner sees credits + history, never cost math. */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <CreditBalanceCard
            balance={credits.balance}
            lowBalanceThresholds={credits.lowBalanceThresholds}
          />
          <CreditHistoryList rows={credits.history} />
        </div>

        {/* Tier cards grid (Free / Pro / Business with per-tier gradient escalation) */}
        <div className="space-y-4">
          <h2 className="text-2xl font-semibold tracking-tight"><T>Choose your plan</T></h2>
          <TierCardsGrid
            currentTier={data.tier as 'free' | 'trial' | 'pro' | 'business'}
            annualPrices={annualPrices}
            monthlyPricesCents={monthlyPricesCents}
          />
        </div>

        {/* Manage subscription (Stripe Customer Portal — Phase 70 CONNECT-04) */}
        {isPaid && (
          <Card variant="glass" className="p-6">
            <CardHeader className="p-0">
              <CardTitle><T>Manage subscription</T></CardTitle>
              <CardDescription>
                <T>Update payment method, view invoices, or cancel via the Stripe portal.</T>
              </CardDescription>
            </CardHeader>
            <CardContent className="px-0 pt-4">
              <ManageSubscriptionButton />
            </CardContent>
          </Card>
        )}
        </div>
    </div>
  )
}
