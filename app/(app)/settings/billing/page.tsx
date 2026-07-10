import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { CreditCard, TrendingUp } from 'lucide-react'
import { getAuthClaims } from '@/lib/queries/auth'
import { getBillingData } from '@/lib/queries/billing'
import { getActiveCompany } from '@/lib/queries/active-company'
import { getCreditOverview } from '@/lib/queries/credits'
import { getBillingConfig } from '@/lib/billing/billing-config'
import { getStripeClient } from '@/lib/billing/stripe-client'
import { requireServiceClient } from '@/lib/supabase/service'
import { computeUsagePercent } from '@/lib/billing/usage-percent'
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '@/components/ui/card'
import { ManageSubscriptionButton } from '@/components/billing/manage-subscription-button'
import { TierCardsGrid } from '@/components/billing/tier-cards-grid'
import { TopUpPacksGrid } from '@/components/billing/topup-packs-grid'
import { CreditBalanceCard } from '@/components/billing/credit-balance-card'
import { CreditHistoryList } from '@/components/billing/credit-history-list'
import { AutoTopupCard } from '@/components/billing/auto-topup-card'
import { BillingStatusToast } from '@/components/billing/billing-status-toast'
import { formatUsd } from '@/lib/billing/format-usd'
import { T } from '@/components/i18n/t'

export const metadata = { title: 'Billing & Plans' }

const TIER_DISPLAY: Record<string, string> = {
  free: 'Free',
  pro: 'Pro',
  business: 'Business',
}

export default async function BillingPage() {
  // Auth + active company resolve first — everything below is scoped to the
  // active company's id. getActiveCompany() re-uses the request-cached auth
  // claims, so running both together adds no duplicate work.
  const [claims, company] = await Promise.all([getAuthClaims(), getActiveCompany()])

  if (!claims) {
    redirect('/?auth=login')
  }

  if (!company) {
    redirect('/onboarding')
  }

  // Billing data, credits, and config are independent of one another once the
  // company id is known — fetch them in parallel.
  const [data, credits, cfg] = await Promise.all([
    getBillingData(company.id),
    getCreditOverview(company.id),
    getBillingConfig(),
  ])

  if (!data) {
    redirect('/onboarding')
  }

  const cycleGrant =
    data.tier === 'free'
      ? cfg.signupCreditGrant
      : cfg.tiers[data.tier as 'pro' | 'business']?.monthlyCreditGrant ?? 0
  const percentUsed = computeUsagePercent({ balance: credits.balance, cycleGrant })
  const annualPrices = {
    pro: cfg.tiers.pro.subscriptionPriceAnnualCents,
    business: cfg.tiers.business.subscriptionPriceAnnualCents,
  }
  const monthlyPricesCents = {
    pro: cfg.tiers.pro.subscriptionPriceCents,
    business: cfg.tiers.business.subscriptionPriceCents,
  }

  // Auto-top-up (CREDITUI-07) — read-only display data for the AutoTopupCard,
  // gated behind cfg.autoTopupEnabled below. The Stripe read is wrapped in a
  // try/catch defaulting to null: this page must never 500 on a Stripe hiccup
  // for a read-only display.
  let autoTopupCompany: {
    auto_topup_enabled?: boolean | null
    auto_topup_threshold_credits?: number | null
    auto_topup_pack_index?: number | null
    auto_topup_last_failed_at?: string | null
    stripe_customer_id?: string | null
  } | null = null
  let autoTopupPaymentMethodLabel: string | null = null

  if (cfg.autoTopupEnabled) {
    const svc = requireServiceClient()
    const { data: autoTopupRow } = await svc
      .from('companies')
      .select(
        'auto_topup_enabled, auto_topup_threshold_credits, auto_topup_pack_index, auto_topup_last_failed_at, stripe_customer_id'
      )
      .eq('id', company.id)
      .maybeSingle()
    autoTopupCompany = autoTopupRow

    if (autoTopupCompany?.stripe_customer_id) {
      try {
        const stripe = await getStripeClient()
        const customer = (await stripe.customers.retrieve(autoTopupCompany.stripe_customer_id, {
          expand: ['invoice_settings.default_payment_method'],
        })) as unknown as {
          invoice_settings?: {
            default_payment_method?: { card?: { brand?: string; last4?: string } } | string | null
          }
        }
        const pm = customer.invoice_settings?.default_payment_method
        if (pm && typeof pm !== 'string' && pm.card?.brand && pm.card?.last4) {
          const brand = pm.card.brand.charAt(0).toUpperCase() + pm.card.brand.slice(1)
          autoTopupPaymentMethodLabel = `${brand} •••• ${pm.card.last4}`
        }
      } catch (err) {
        console.warn('[settings/billing] auto-top-up payment method read failed:', err)
        autoTopupPaymentMethodLabel = null
      }
    }
  }

  const autoTopupPack =
    autoTopupCompany?.auto_topup_pack_index != null
      ? cfg.topUpPacks[autoTopupCompany.auto_topup_pack_index]
      : null
  const autoTopupPackAmount = autoTopupPack ? formatUsd(autoTopupPack.priceCents) : null
  const autoTopupThresholdAmount =
    autoTopupCompany?.auto_topup_threshold_credits != null
      ? formatUsd(autoTopupCompany.auto_topup_threshold_credits)
      : null

  const tierDisplay = TIER_DISPLAY[data.tier] ?? data.tier

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString('en-US', { dateStyle: 'medium' })

  const isPaid = data.tier === 'pro' || data.tier === 'business'

  return (
    <div className="space-y-6 p-6">
      <Suspense fallback={null}>
        <BillingStatusToast />
      </Suspense>
      <header className="flex flex-col gap-1">
        <h1 className="text-[clamp(28px,3.5vw,40px)] font-semibold tracking-tight">
          <T>Plans</T>
        </h1>
        <p className="text-sm text-muted-foreground">
          <T>You&rsquo;re on the</T>{' '}
          <strong className="text-foreground"><T text={tierDisplay} /></strong>{' '}
          <T>plan. Choose the tier that fits your business — upgrade or downgrade anytime.</T>
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
              {isPaid && data.tierCancelledAt ? (
                <p className="text-amber-600 dark:text-amber-400">
                  <T text={`Your plan ends on ${formatDate(data.tierCancelledAt)}`} />
                </p>
              ) : (
                isPaid && data.tierRenewsAt && (
                  <p className="text-muted-foreground">
                    <span className="font-medium text-foreground"><T>Renews:</T></span>{' '}
                    {formatDate(data.tierRenewsAt)}
                  </p>
                )
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
                  {data.estimatesThisMonth}{' '}
                  <span className="font-sans text-xs text-muted-foreground">
                    <T>this month</T>
                  </span>
                </span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground"><T>Photos analyzed</T></span>
                <span className="whitespace-nowrap text-right font-mono font-medium">
                  {data.photosThisMonth}{' '}
                  <span className="font-sans text-xs text-muted-foreground">
                    <T>this month</T>
                  </span>
                </span>
              </div>
              {data.entitlements.maxPhotosPerEstimate !== null && (
                <p className="text-xs text-muted-foreground">
                  <T text={`Up to ${data.entitlements.maxPhotosPerEstimate} photos per estimate on your plan.`} />
                </p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Credits (CREDITUI-01/02) — ADDITIVE to the count-based usage card above
            (MIG-01 parallel run). Owner sees credits + history, never cost math. */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <CreditBalanceCard percentUsed={percentUsed} tier={data.tier} />
          <CreditHistoryList rows={credits.history} />
        </div>

        {/* Top-up packs (CREDITUI-06) — dollar-denominated pack picker, always
            visible (not gated behind the low-balance warning). */}
        <div id="topup-packs" className="space-y-4">
          <h2 className="text-2xl font-semibold tracking-tight"><T>Add credits</T></h2>
          <TopUpPacksGrid packs={cfg.topUpPacks} />
        </div>

        {/* Auto top-up (CREDITUI-07) — gated behind the platform kill switch
            (billing_config.autoTopupEnabled); omitted from the tree entirely,
            not rendered-disabled, when the switch is off. */}
        {cfg.autoTopupEnabled && (
          <div className="space-y-4">
            <AutoTopupCard
              enabled={!!autoTopupCompany?.auto_topup_enabled}
              packAmount={autoTopupPackAmount}
              thresholdAmount={autoTopupThresholdAmount}
              paymentMethodLabel={autoTopupPaymentMethodLabel}
              lastFailed={!!autoTopupCompany?.auto_topup_last_failed_at}
              packs={cfg.topUpPacks}
              currentThresholdCredits={autoTopupCompany?.auto_topup_threshold_credits ?? null}
              currentPackIndex={autoTopupCompany?.auto_topup_pack_index ?? null}
            />
          </div>
        )}

        {/* Tier cards grid (Free / Pro / Business with per-tier gradient escalation) */}
        <div id="choose-plan" className="space-y-4">
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
