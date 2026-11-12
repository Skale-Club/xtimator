import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { AlertTriangle } from 'lucide-react'
import { getAuthClaims } from '@/lib/queries/auth'
import { isTwaRequest } from '@/lib/pwa/twa-context'
import { requireCompanyOwner } from '@/lib/auth/require-company-role'
import { getBillingData } from '@/lib/queries/billing'
import { getActiveCompany } from '@/lib/queries/active-company'
import { isDemoCompany } from '@/lib/demo/config'
import { getCreditOverview, getLiveGrantedCredits, getLiveCreditLots } from '@/lib/queries/credits'
import { isTopupEligible } from '@/lib/billing/topup-eligibility'
import { getBillingConfig } from '@/lib/billing/billing-config'
import { getStripeDisplayPrices } from '@/lib/billing/stripe-display-prices'
import { getStripeClient } from '@/lib/billing/stripe-client'
import { requireServiceClient } from '@/lib/supabase/service'
import { computeUsagePercent } from '@/lib/billing/usage-percent'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ManageSubscriptionButton } from '@/components/billing/manage-subscription-button'
import { TierCardsGrid } from '@/components/billing/tier-cards-grid'
import { TopUpPacksGrid } from '@/components/billing/topup-packs-grid'
import { CreditBalanceCard } from '@/components/billing/credit-balance-card'
import { CreditHistoryList } from '@/components/billing/credit-history-list'
import { AutoTopupCard } from '@/components/billing/auto-topup-card'
import { BillingStatusToast } from '@/components/billing/billing-status-toast'
import { formatUsd, formatCredits } from '@/lib/billing/format-usd'
import { formatBillingAmount, resolveBillingCurrency } from '@/lib/billing/billing-currency'
import { T } from '@/components/i18n/t'
import { LocalizedDate } from '@/components/i18n/localized-date'
import { SettingsCard, SettingsHeader } from '@/components/settings/settings-ui'

export const metadata = { title: 'Plan and billing | Settings' }

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

  // Android TWA (Google Play): purchase-free mode. The page shows the current
  // plan, credit balance and history only - no prices, no purchase controls, no
  // Stripe Checkout/Portal entry points.
  const isTwa = await isTwaRequest()

  // Billing data, credits, and config are independent of one another once the
  // company id is known — fetch them in parallel.
  const [data, credits, cfg, stripePrices, grantedThisCycle, lots] = await Promise.all([
    getBillingData(company.id),
    getCreditOverview(company.id),
    getBillingConfig(),
    getStripeDisplayPrices(),
    // `granted` of every live lot (signup, monthly, topup, adjust) - the usage
    // bar's denominator (see computeUsagePercent below).
    getLiveGrantedCredits(company.id),
    // SEED-055 Phase E: the balance split by live lot, with expiry dates.
    getLiveCreditLots(company.id),
  ])

  if (!data) {
    redirect('/onboarding')
  }

  // The denominator is what the live lots were actually GRANTED (not the
  // static config amount), so a top-up raises it instead of clamping the bar
  // to 0%. Only with no live lot at all (grantedThisCycle === 0) is there no
  // valid denominator - percentUsed is null and the UI renders the raw balance.
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
  // Pro is the only plan offered (SEED-055); Business stays in config but is
  // never passed to a customer-facing surface.
  const annualPrices = {
    pro: stripePrices.pro.yearCents ?? cfg.tiers.pro.subscriptionPriceAnnualCents,
  }
  const monthlyPricesCents = {
    pro: stripePrices.pro.monthCents ?? cfg.tiers.pro.subscriptionPriceCents,
  }

  // Top-ups (packs + auto top-up) are Pro-only: shown only to a company with a
  // live Pro subscription; everyone else is asked to subscribe first.
  const topupEligible = isTopupEligible(
    data.tier,
    data.stripeSubscriptionStatus,
    data.stripeSubscriptionId
  )

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

  if (cfg.autoTopupEnabled && topupEligible) {
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
  // Packs (one-off and auto top-up) are priced in the company's billing
  // currency; the plan price below stays USD until BRL Stripe Prices exist.
  const billingCurrency = resolveBillingCurrency({ currency_code: company.currency_code }, cfg.brlPricingEnabled === true)
  const autoTopupPackAmount =
    autoTopupPackPriceCents != null
      ? formatBillingAmount(autoTopupPackPriceCents, billingCurrency)
      : null
  // CREDITFIX-03 (audit finding #3): auto_topup_threshold_credits is a CREDIT
  // count, not a cents figure — running it through formatUsd rendered "500
  // credits" as "$5". formatCredits renders the credit count as-is.
  const autoTopupThresholdAmount =
    autoTopupCompany?.auto_topup_threshold_credits != null
      ? formatCredits(autoTopupCompany.auto_topup_threshold_credits)
      : null

  const tierDisplay = TIER_DISPLAY[data.tier] ?? data.tier

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

  const isAnnual = data.stripeSubscriptionInterval === 'year'
  const planPrice = isPaid && !isTwa
    ? isAnnual && annualPrices.pro
      ? { amount: formatUsd(annualPrices.pro), period: 'year' }
      : { amount: formatUsd(monthlyPricesCents.pro), period: 'month' }
    : null

  // One status per plan, in priority order: a failing payment beats a
  // scheduled cancellation, which beats a normal renewal.
  // A Free plan has no subscription state to show (its name already says it).
  const planStatus: { label: string; variant: 'success' | 'warning' | 'danger' } | null = !isPaid
    ? null
    : isPastDue
      ? { label: 'Payment failed', variant: 'danger' }
      : data.tierCancelledAt
        ? { label: 'Cancels at period end', variant: 'warning' }
        : { label: 'Active', variant: 'success' }

  const usageStats: Array<{ label: string; value: string | number }> = [
    { label: 'Estimates', value: data.estimatesThisMonth },
    { label: 'Photos analyzed', value: data.photosThisMonth },
    ...(data.entitlements.maxPhotosPerEstimate !== null
      ? [{ label: 'Photo limit per estimate', value: data.entitlements.maxPhotosPerEstimate }]
      : []),
  ]

  // The plan card's action: manage an existing subscription, or point a Free
  // company at the Pro offer further down. Never a purchase control in the TWA.
  const planAction = isTwa ? null : isPaid ? (
    hasStripeCustomer ? <ManageSubscriptionButton isOwner={isOwner} /> : null
  ) : (
    <Button asChild variant="primary" size="sm">
      <Link href="#choose-plan"><T>Subscribe to Pro</T></Link>
    </Button>
  )

  return (
    <div className="space-y-6">
      <Suspense fallback={null}>
        <BillingStatusToast />
      </Suspense>
      <SettingsHeader
        title={<T>Plan and billing</T>}
        description={<T>Your plan, credits and payments.</T>}
      />

      {isPastDue && (
        <div
          data-testid="past-due-banner"
          className="flex flex-col gap-3 rounded-lg border border-red-500/20 bg-red-500/10 p-4 text-red-600 dark:text-red-400 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <p className="text-sm">
              {isTwa ? (
                <T>We couldn&rsquo;t charge your card. Manage your plan on xtimator.com from a web browser.</T>
              ) : (
                <T>We couldn&rsquo;t charge your card — update your payment method to keep your plan.</T>
              )}
            </p>
          </div>
        </div>
      )}

      {/* Current plan: what you're on, its state, what it costs, and this
          month's usage, with the one action that changes it. */}
      <SettingsCard title={<T>Current plan</T>} action={planAction} bodyClassName="space-y-5">
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="text-2xl font-semibold tracking-tight"><T text={tierDisplay} /></span>
            {planStatus && <Badge variant={planStatus.variant}><T text={planStatus.label} /></Badge>}
          </div>
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
            {planPrice && (
              <span>
                <span className="font-medium text-foreground [font-variant-numeric:tabular-nums]">{planPrice.amount}</span>
                {' / '}<T text={planPrice.period} />
              </span>
            )}
            {planPrice && (data.tierCancelledAt || data.tierRenewsAt) && <span aria-hidden>·</span>}
            {isPaid && data.tierCancelledAt ? (
              <span className="text-amber-600 dark:text-amber-400">
                <T>Ends on</T> <LocalizedDate iso={data.tierCancelledAt} />
              </span>
            ) : (
              isPaid && data.tierRenewsAt && (
                <span>
                  <T>Renews on</T> <LocalizedDate iso={data.tierRenewsAt} />
                </span>
              )
            )}
            {data.tier === 'free' && (
              <span>
                {isTwa ? (
                  <T>Free plan — your free credits never expire.</T>
                ) : (
                  <T>Free plan — your free credits never expire. Subscribe to Pro when they run out.</T>
                )}
              </span>
            )}
          </p>
          {!isTwa && isPaid && !hasStripeCustomer && (
            <p className="text-sm text-muted-foreground">
              <T>This plan was set by support — contact us to change it.</T>
            </p>
          )}
        </div>

        <div className="space-y-2 border-t border-[var(--glass-border)] pt-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <T>This month</T>
          </p>
          <dl className="grid grid-cols-3 gap-2 sm:gap-3">
            {usageStats.map((stat) => (
              <div
                key={stat.label}
                className="rounded-[var(--radius-md)] border border-[var(--glass-border)] bg-[var(--glass-bg-light)] px-3 py-3 sm:px-4"
              >
                <dt className="text-xs text-muted-foreground"><T text={stat.label} /></dt>
                <dd className="mt-1 text-xl font-semibold [font-variant-numeric:tabular-nums]">{stat.value}</dd>
              </div>
            ))}
          </dl>
          <p className="text-xs text-muted-foreground">
            <T>Counts reset at the start of each UTC calendar month.</T>
          </p>
        </div>
      </SettingsCard>

      {/* Credits (CREDITUI-01/02): the balance by lot beside the ledger.
          Owner sees credits + history, never cost math. The history list
          scrolls inside its card, so on wide screens the balance card sets
          the row height and the ledger fills it. */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <CreditBalanceCard
          percentUsed={percentUsed}
          tier={data.tier}
          balance={credits.balance}
          lots={lots}
          topupEligible={topupEligible}
          hidePurchase={isTwa}
        />
        <CreditHistoryList rows={credits.history} className="flex flex-col" fillHeight />
      </div>

      {/* Top-up packs (CREDITUI-06) + auto top-up (CREDITUI-07) in one card:
          Pro only (SEED-055 D5). Everyone else sees the subscribe prompt. */}
      {isTwa ? (
        <p
          data-testid="twa-plan-note"
          className="rounded-lg border border-[var(--glass-border)] p-4 text-sm text-muted-foreground"
        >
          <T>Manage your plan on xtimator.com from a web browser.</T>
        </p>
      ) : topupEligible ? (
        <SettingsCard
          id="topup-packs"
          title={<T>Add credits</T>}
          description={
            <T
              text="One-time packs. Purchased credits expire {months} months after purchase."
              values={{ months: cfg.topupExpiryMonths }}
            />
          }
          bodyClassName="space-y-6"
        >
          {!isOwner && (
            <p className="text-sm text-muted-foreground">
              <T>Only the company owner can manage billing.</T>
            </p>
          )}
          <TopUpPacksGrid packs={cfg.topUpPacks} isOwner={isOwner} currency={billingCurrency} />
          {/* Auto top-up is gated behind the platform kill switch
              (billing_config.autoTopupEnabled); omitted from the tree
              entirely, not rendered-disabled, when the switch is off. */}
          {cfg.autoTopupEnabled && (
            <div className="border-t border-[var(--glass-border)] pt-5">
              <AutoTopupCard
                enabled={!!autoTopupCompany?.auto_topup_enabled}
                packAmount={autoTopupPackAmount}
                thresholdAmount={autoTopupThresholdAmount}
                paymentMethodLabel={autoTopupPaymentMethodLabel}
                lastFailed={!!autoTopupCompany?.auto_topup_last_failed_at}
                packs={cfg.topUpPacks}
                currentThresholdCredits={autoTopupCompany?.auto_topup_threshold_credits ?? null}
                currentPackIndex={autoTopupCompany?.auto_topup_pack_index ?? null}
                isOwner={isOwner}
                currency={billingCurrency}
              />
            </div>
          )}
        </SettingsCard>
      ) : (
        <div id="topup-packs" data-testid="topup-subscribe-prompt">
          <SettingsCard
            title={<T>Add credits</T>}
            description={<T>Subscribe to Pro to buy extra credits</T>}
            action={
              <Button asChild variant="outline" size="sm">
                <Link href="#choose-plan"><T>Subscribe to Pro</T></Link>
              </Button>
            }
          />
        </div>
      )}

      {/* Plan offer: Pro only, monthly / annual toggle (SEED-055). */}
      {!isTwa && (
        <TierCardsGrid
          id="choose-plan"
          title={<T>Xtimator Pro</T>}
          description={<T>1 company and 1 user, with every feature included.</T>}
          currentTier={data.tier as 'free' | 'trial' | 'pro' | 'business'}
          currentInterval={data.stripeSubscriptionInterval ?? undefined}
          isOwner={isOwner}
          pendingCancel={!!data.tierCancelledAt}
          annualPrices={annualPrices}
          monthlyPricesCents={monthlyPricesCents}
          featureBullets={{ pro: cfg.tiers.pro.featureBullets }}
        />
      )}
    </div>
  )
}
