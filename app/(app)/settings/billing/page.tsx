import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { CreditCard, TrendingUp, AlertTriangle } from 'lucide-react'
import { getAuthClaims } from '@/lib/queries/auth'
import { requireCompanyOwner } from '@/lib/auth/require-company-role'
import { getBillingData } from '@/lib/queries/billing'
import { getActiveCompany } from '@/lib/queries/active-company'
import { isDemoCompany } from '@/lib/demo/config'
import { getCreditOverview, getCycleGrantedCredits } from '@/lib/queries/credits'
import { getBillingConfig } from '@/lib/billing/billing-config'
import { getStripeDisplayPrices } from '@/lib/billing/stripe-display-prices'
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
import { formatUsd, formatCredits } from '@/lib/billing/format-usd'
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

  // Owner-only billing: the routes already enforce it server-side (403), but the
  // UI must not offer controls that will be refused — a member clicking Upgrade
  // and being told "try again" forever was the audit's dead-end #6. Reuse the
  // SAME gate the routes use so the two can never drift; a denial is a plain
  // boolean here, never an exception.
  const isOwner = await requireCompanyOwner(company.id)
    .then(() => true)
    .catch(() => false)

  if (isDemoCompany(company.id)) redirect('/settings/company')

  // Billing data, credits, and config are independent of one another once the
  // company id is known — fetch them in parallel.
  const [data, credits, cfg, stripePrices, grantedThisCycle] = await Promise.all([
    getBillingData(company.id),
    getCreditOverview(company.id),
    getBillingConfig(),
    getStripeDisplayPrices(),
    // CREDITFIX-01: actual credit_ledger 'grant'/'topup' sum for the current
    // UTC cycle — replaces the static configured monthlyCreditGrant as the
    // usage bar's denominator (see computeUsagePercent below).
    getCycleGrantedCredits(company.id),
  ])

  if (!data) {
    redirect('/onboarding')
  }

  // CREDITFIX-01 (audit finding #1): the denominator is what was ACTUALLY
  // granted this cycle, not the static config amount — a Business company
  // with balance 2000 and a configured grant of 12000 used to render "83%
  // used" having used nothing (the config grant and the ledger disagreed),
  // and a company that bought a top-up used to clamp to "0% used" forever
  // (the static grant never grew to reflect the top-up). When nothing has
  // been granted this cycle (grantedThisCycle === 0), there's no valid
  // denominator at all — percentUsed is null and the UI renders the raw
  // balance instead of a misleading bar.
  const percentUsed =
    grantedThisCycle === 0
      ? null
      : computeUsagePercent({
          balance: credits.balance,
          cycleGrant: Math.max(grantedThisCycle, credits.balance),
        })
  // Invariant: the tier card must show what Stripe will actually charge — the
  // live Stripe price (when resolvable) OVERRIDES the billing_config price;
  // null Stripe slots fall back to config exactly as before.
  const annualPrices = {
    pro: stripePrices.pro.yearCents ?? cfg.tiers.pro.subscriptionPriceAnnualCents,
    business: stripePrices.business.yearCents ?? cfg.tiers.business.subscriptionPriceAnnualCents,
  }
  const monthlyPricesCents = {
    pro: stripePrices.pro.monthCents ?? cfg.tiers.pro.subscriptionPriceCents,
    business: stripePrices.business.monthCents ?? cfg.tiers.business.subscriptionPriceCents,
  }

  // Auto-top-up (CREDITUI-07) — read-only display data for the AutoTopupCard,
  // gated behind cfg.autoTopupEnabled below. The Stripe read is wrapped in a
  // try/catch defaulting to null: this page must never 500 on a Stripe hiccup
  // for a read-only display.
  let autoTopupCompany: {
    auto_topup_enabled?: boolean | null
    auto_topup_threshold_credits?: number | null
    auto_topup_pack_index?: number | null
    auto_topup_pack_price_cents?: number | null
    auto_topup_pack_credits?: number | null
    auto_topup_last_failed_at?: string | null
    stripe_customer_id?: string | null
  } | null = null
  let autoTopupPaymentMethodLabel: string | null = null

  if (cfg.autoTopupEnabled) {
    const svc = requireServiceClient()
    const { data: autoTopupRow } = await svc
      .from('companies')
      .select(
        'auto_topup_enabled, auto_topup_threshold_credits, auto_topup_pack_index, auto_topup_pack_price_cents, auto_topup_pack_credits, auto_topup_last_failed_at, stripe_customer_id'
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

  // Prefer the per-company price snapshot (what the tenant authorized) over the
  // live index lookup, so a later admin reorder/reprice doesn't misreport the
  // amount we'll charge; fall back to the index for legacy (null-snapshot) rows.
  const autoTopupPack =
    autoTopupCompany?.auto_topup_pack_index != null
      ? cfg.topUpPacks[autoTopupCompany.auto_topup_pack_index]
      : null
  const autoTopupPackPriceCents =
    autoTopupCompany?.auto_topup_pack_price_cents ?? autoTopupPack?.priceCents ?? null
  const autoTopupPackAmount =
    autoTopupPackPriceCents != null ? formatUsd(autoTopupPackPriceCents) : null
  // CREDITFIX-03 (audit finding #3): auto_topup_threshold_credits is a CREDIT
  // count, not a cents figure — running it through formatUsd rendered "500
  // credits" as "$5". formatCredits renders the credit count as-is.
  const autoTopupThresholdAmount =
    autoTopupCompany?.auto_topup_threshold_credits != null
      ? formatCredits(autoTopupCompany.auto_topup_threshold_credits)
      : null

  const tierDisplay = TIER_DISPLAY[data.tier] ?? data.tier

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString('en-US', { dateStyle: 'medium' })

  const isPaid = data.tier === 'pro' || data.tier === 'business'

  // CREDITFIX (audit finding #4): during Stripe's whole dunning window a
  // failing customer's tier is still 'pro'/'business' (the downgrade only
  // happens once Stripe gives up) — the page must surface that ahead of
  // time, not just show a normal "Renews: <date>" until the silent drop to
  // Free. Kept separate from the pending-cancel banner below (that one is a
  // deliberate cancellation; this one is an unintentional payment failure).
  const isPastDue =
    isPaid &&
    (data.stripeSubscriptionStatus === 'past_due' || data.stripeSubscriptionStatus === 'unpaid')

  // CREDITFIX (audit finding #6): create-portal-session 400s without a
  // stripe_customer_id — a company whose tier was set directly by an admin
  // (never went through Stripe Checkout) has no Stripe customer, so the
  // "Manage subscription" button would 400 forever. Gate it on the customer
  // id actually being present.
  const hasStripeCustomer = !!data.stripeCustomerId

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
        {isPastDue && (
          <div
            data-testid="past-due-banner"
            className="flex flex-col gap-3 rounded-lg border border-red-500/20 bg-red-500/10 p-4 text-red-600 dark:text-red-400 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <p className="text-sm">
                <T>We couldn&rsquo;t charge your card — update your payment method to keep your plan.</T>
              </p>
            </div>
            {hasStripeCustomer && <ManageSubscriptionButton isOwner={isOwner} />}
          </div>
        )}

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
          <CreditBalanceCard percentUsed={percentUsed} tier={data.tier} balance={credits.balance} />
          <CreditHistoryList rows={credits.history} />
        </div>

        {/* Top-up packs (CREDITUI-06) — dollar-denominated pack picker, always
            visible (not gated behind the low-balance warning). */}
        <div id="topup-packs" className="space-y-4">
          <h2 className="text-2xl font-semibold tracking-tight"><T>Add credits</T></h2>
          <TopUpPacksGrid packs={cfg.topUpPacks} isOwner={isOwner} />
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
            currentInterval={data.stripeSubscriptionInterval ?? undefined}
            isOwner={isOwner}
            pendingCancel={!!data.tierCancelledAt}
            annualPrices={annualPrices}
            monthlyPricesCents={monthlyPricesCents}
            featureBullets={{
              free: cfg.tiers.free.featureBullets,
              pro: cfg.tiers.pro.featureBullets,
              business: cfg.tiers.business.featureBullets,
            }}
          />
        </div>

        {/* Manage subscription (Stripe Customer Portal — Phase 70 CONNECT-04).
            CREDITFIX (audit finding #6): create-portal-session requires
            stripe_customer_id — an admin-set tier (both paid companies in
            prod, per the audit) has none, so the button 400s forever. Gate
            the action on hasStripeCustomer; explain instead when absent. */}
        {isPaid && (
          <Card variant="glass" className="p-6">
            <CardHeader className="p-0">
              <CardTitle><T>Manage subscription</T></CardTitle>
              <CardDescription>
                <T>Update payment method, view invoices, or cancel via the Stripe portal.</T>
              </CardDescription>
            </CardHeader>
            <CardContent className="px-0 pt-4">
              {hasStripeCustomer ? (
                <ManageSubscriptionButton />
              ) : (
                <p className="text-sm text-muted-foreground">
                  <T>This plan was set by support — contact us to change it.</T>
                </p>
              )}
            </CardContent>
          </Card>
        )}
        </div>
    </div>
  )
}
