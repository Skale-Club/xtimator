import { redirect } from 'next/navigation'
import { CreditCard, TrendingUp } from 'lucide-react'
import { getAuthClaims } from '@/lib/queries/auth'
import { getBillingData } from '@/lib/queries/billing'
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '@/components/ui/card'
import { ManageSubscriptionButton } from '@/components/billing/manage-subscription-button'
import { TierCardsGrid } from '@/components/billing/tier-cards-grid'

export const metadata = { title: 'Billing' }

const TIER_DISPLAY: Record<string, string> = {
  free: 'Free',
  trial: 'Trial',
  pro: 'Pro',
  business: 'Business',
}

export default async function BillingPage() {
  const claims = await getAuthClaims()

  if (!claims) {
    redirect('/login')
  }

  const data = await getBillingData(claims.sub as string)

  if (!data) {
    redirect('/onboarding')
  }

  const tierDisplay = TIER_DISPLAY[data.tier] ?? data.tier

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString('en-US', { dateStyle: 'medium' })

  const isPaid = data.tier === 'pro' || data.tier === 'business'

  return (
    <div className="space-y-12 pb-12">
      {/* Hero zone — Phase 71 pattern: gradient-hero radial backdrop */}
      <section className="relative isolate px-6 pt-[clamp(48px,8vw,96px)] pb-8 text-center">
        <div
          aria-hidden
          className="absolute inset-0 -z-10 gradient-hero"
        />
        <h1 className="text-[clamp(36px,5vw,56px)] font-semibold tracking-[-0.025em]">
          Billing
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-base text-muted-foreground">
          You&rsquo;re on the <strong className="text-foreground">{tierDisplay}</strong> plan. Choose
          the tier that fits your business — upgrade or downgrade anytime.
        </p>
      </section>

      <div className="mx-auto w-full max-w-6xl space-y-8 px-6">
        {/* Current plan + usage */}
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <Card variant="glass" className="p-6">
            <CardHeader className="border-b border-[var(--glass-border)] p-0 pb-4">
              <div className="flex items-start gap-3">
                <CreditCard className="mt-0.5 h-5 w-5 text-[hsl(var(--primary))]" />
                <div>
                  <CardTitle>{tierDisplay} Plan</CardTitle>
                  <CardDescription>Current subscription plan</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-2 px-0 pt-4 text-sm">
              {data.tier === 'trial' && data.tierTrialEndsAt && (
                <p className="text-muted-foreground">
                  <span className="font-medium text-foreground">Trial ends:</span>{' '}
                  {formatDate(data.tierTrialEndsAt)}
                </p>
              )}
              {isPaid && data.tierRenewsAt && (
                <p className="text-muted-foreground">
                  <span className="font-medium text-foreground">Renews:</span>{' '}
                  {formatDate(data.tierRenewsAt)}
                </p>
              )}
              {data.tier === 'free' && !data.tierTrialEndsAt && (
                <p className="text-muted-foreground">No active trial</p>
              )}
            </CardContent>
          </Card>

          <Card variant="glass" className="p-6">
            <CardHeader className="border-b border-[var(--glass-border)] p-0 pb-4">
              <div className="flex items-start gap-3">
                <TrendingUp className="mt-0.5 h-5 w-5 text-[hsl(var(--primary))]" />
                <div>
                  <CardTitle>Usage This Month</CardTitle>
                  <CardDescription>
                    Counts reset at the start of each UTC calendar month.
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3 px-0 pt-4 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Estimates</span>
                <span className="font-mono font-medium">
                  {data.estimatesThisMonth}
                  {' / '}
                  {data.entitlements.maxEstimatesPerMonth !== null
                    ? data.entitlements.maxEstimatesPerMonth
                    : 'Unlimited'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Photos analyzed</span>
                <span className="font-mono font-medium">
                  {data.photosThisMonth}
                  {' / '}
                  {data.entitlements.maxPhotosPerEstimate !== null
                    ? `${data.entitlements.maxPhotosPerEstimate} per estimate`
                    : 'Unlimited'}
                </span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Tier cards grid (Free / Pro / Business with per-tier gradient escalation) */}
        <div className="space-y-4">
          <h2 className="text-2xl font-semibold tracking-tight">Choose your plan</h2>
          <TierCardsGrid currentTier={data.tier as 'free' | 'trial' | 'pro' | 'business'} />
        </div>

        {/* Manage subscription (Stripe Customer Portal — Phase 70 CONNECT-04) */}
        {isPaid && (
          <Card variant="glass" className="p-6">
            <CardHeader className="p-0">
              <CardTitle>Manage subscription</CardTitle>
              <CardDescription>
                Update payment method, view invoices, or cancel via the Stripe portal.
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
