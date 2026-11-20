import { redirect } from 'next/navigation'
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
import { resolveSavedCard, savedCardLabel } from '@/lib/billing/saved-card'
import { requireServiceClient } from '@/lib/supabase/service'
import { computeUsagePercent } from '@/lib/billing/usage-percent'
import { Badge } from '@/components/ui/badge'
import { ManageSubscriptionButton } from '@/components/billing/manage-subscription-button'
import { TierCardsGrid } from '@/components/billing/tier-cards-grid'
import { TopUpPacksGrid } from '@/components/billing/topup-packs-grid'
import { CreditBalanceBody } from '@/components/billing/credit-balance-card'
import { CreditHistoryList } from '@/components/billing/credit-history-list'
import { AutoTopupCard } from '@/components/billing/auto-topup-card'
import { formatUsd, formatCredits } from '@/lib/billing/format-usd'
import { formatBillingAmount, resolveBillingCurrency } from '@/lib/billing/billing-currency'
import { T } from '@/components/i18n/t'
import { LocalizedDate } from '@/components/i18n/localized-date'
import { SettingsCard, SettingsHeader, SETTINGS_CARD_CLASS } from '@/components/settings/settings-ui'
import { getPaywallContext } from '@/lib/billing/access-guard'
import { getCachedBranding } from '@/lib/platform-config'
import { cn } from '@/lib/utils'

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
  const [data, credits, cfg, stripePrices, grantedThisCycle, lots, paywall, branding] = await Promise.all([
    getBillingData(company.id),
    getCreditOverview(company.id),
    getBillingConfig(),
    getStripeDisplayPrices(),
    // `granted` of every live lot (signup, monthly, topup, adjust) - the usage
    // bar's denominator (see computeUsagePercent below).
    getLiveGrantedCredits(company.id),
    // SEED-055 Phase E: the balance split by live lot, with expiry dates.
    getLiveCreditLots(company.id),
    // Same access state the (app) layout's banner uses: paywalled (free, credits
    // gone, read-only) or out_of_credits (paid, balance at zero).
    getPaywallContext(company.id),
    getCachedBranding(),
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
  // Credits plan 2026-11-20: the card a buy (one click or auto top-up) charges -
  // the subscription's card, resolved the same way the buy route does.
  // Never 500 the page on a Stripe hiccup: no card simply means "Checkout".
  const savedCard = topupEligible && !isTwa
    ? await getStripeClient()
        .then((stripe) => resolveSavedCard(stripe, data.stripeCustomerId, data.stripeSubscriptionId))
        .catch(() => null)
    : null
  const autoTopupPaymentMethodLabel: string | null = savedCardLabel(savedCard)

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

  const blocked = paywall.state !== 'active'

  // The plan's own action: manage an existing subscription. A Free company has
  // none here - the Pro offer right below is the page's single Subscribe.
  const planAction = !isTwa && isPaid && hasStripeCustomer ? <ManageSubscriptionButton isOwner={isOwner} /> : null

  const proOffer = (
    <TierCardsGrid
      id="choose-plan"
      className={cn(!isPaid && 'border-primary/30 bg-gradient-to-b from-primary/[0.07] to-transparent')}
      title={
        <span className="flex items-center gap-2.5">
          {branding.logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={branding.logoUrl} alt="" aria-hidden className="h-6 w-6 shrink-0 object-contain" />
          )}
          <T>Xtimator Pro</T>
        </span>
      }
      description={<T>1 company and 1 user, with every feature included.</T>}
      currentTier={data.tier as 'free' | 'trial' | 'pro' | 'business'}
      currentInterval={data.stripeSubscriptionInterval ?? undefined}
      isOwner={isOwner}
      pendingCancel={!!data.tierCancelledAt}
      annualPrices={annualPrices}
      monthlyPricesCents={monthlyPricesCents}
      featureBullets={{ pro: cfg.tiers.pro.featureBullets }}
    />
  )

  return (
    <div className="space-y-6">
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

      {/* Redesign 2026-11-20: one card for where you stand (plan beside
          credits), then the single Pro offer for a company without it, then
          top-ups (Pro only) and the credit history. */}
      <section data-testid="plan-overview" className={cn(SETTINGS_CARD_CLASS, 'grid md:grid-cols-2')}>
        <div className="space-y-3 px-5 py-5 sm:px-6">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <T>Current plan</T>
          </p>
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="text-2xl font-semibold tracking-tight"><T text={tierDisplay} /></span>
            {blocked ? (
              <Badge variant="outline" data-testid="plan-blocked-badge" className="border-red-500/20 bg-red-500/10 text-red-600 dark:text-red-400"><T>Credits used up</T></Badge>
            ) : (
              planStatus && <Badge variant={planStatus.variant}><T text={planStatus.label} /></Badge>
            )}
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
            {/* Owner 2026-11-20: no "free credits never expire" line - only the
                paywall's consequence is worth saying. */}
            {data.tier === 'free' && paywall.state === 'paywalled' && (
              <span>
                {isTwa ? (
                  <T>Your free credits are used up.</T>
                ) : (
                  <T>Your free credits are used up. Until you subscribe, your estimates are read-only.</T>
                )}
              </span>
            )}
          </p>
          {!isTwa && isPaid && !hasStripeCustomer && (
            <p className="text-sm text-muted-foreground">
              <T>This plan was set by support — contact us to change it.</T>
            </p>
          )}
          <p className="text-xs text-muted-foreground" data-testid="usage-this-month">
            {/* Owner 2026-11-20: the photo count adds nothing; estimates only. */}
            <T text="This month: {estimates} estimates" values={{ estimates: data.estimatesThisMonth }} />
          </p>
          {planAction && <div className="pt-1">{planAction}</div>}
        </div>

        <div className="space-y-3 border-t border-[var(--glass-border)] px-5 py-5 sm:px-6 md:border-l md:border-t-0">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <T>Credits</T>
          </p>
          <CreditBalanceBody
            compact
            percentUsed={percentUsed}
            tier={data.tier}
            balance={credits.balance}
            lots={lots}
            topupEligible={topupEligible}
            hidePurchase={isTwa}
            showCaption={isPaid}
          />
        </div>
      </section>

      {!isTwa && !isPaid && proOffer}

      {/* Top-up packs (CREDITUI-06) + auto top-up (CREDITUI-07) in one card:
          Pro only (SEED-055 D5). A Free company sees "buy extra credits" as a
          Pro benefit in the offer above instead of a card of its own. */}
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
          <TopUpPacksGrid
            packs={cfg.topUpPacks}
            isOwner={isOwner}
            currency={billingCurrency}
            estimateRange={cfg.estimateCreditsRange}
            cardLabel={autoTopupPaymentMethodLabel}
          />
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
                packCredits={autoTopupCompany?.auto_topup_pack_credits ?? autoTopupPack?.credits ?? null}
                estimateRange={cfg.estimateCreditsRange}
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
      ) : null}

      <CreditHistoryList rows={credits.history} />

      {/* A Pro company keeps the offer at the end: switching between monthly
          and annual, or resuming a cancellation. */}
      {!isTwa && isPaid && proOffer}
    </div>
  )
}
