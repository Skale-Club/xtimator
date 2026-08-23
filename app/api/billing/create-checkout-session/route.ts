import { type NextRequest, NextResponse } from 'next/server'
import type Stripe from 'stripe'
import { createClient } from '@/lib/supabase/server'
import { getActiveCompanyId } from '@/lib/queries/active-company'
import { requireCompanyOwner } from '@/lib/auth/require-company-role'
import { getStripeClient, SEAT_ITEM_METADATA_KIND } from '@/lib/billing/stripe-client'
import { getBillingConfig } from '@/lib/billing/billing-config'
import { ensureStripeCustomer } from '@/lib/billing/stripe-customer'
import { demoGuardResponse } from '@/lib/demo/guard'
import { getCanonicalBaseUrl } from '@/lib/utils/site-url'
import { rateLimit } from '@/lib/ratelimit'
import { resolveTierFromPriceId } from '@/lib/billing/stripe-price-map'

const RATE_LIMITED_RESPONSE = (retryAfter: number | undefined) =>
  NextResponse.json(
    { error: 'Too many billing requests. Please try again shortly.', code: 'rate_limit:billing_session' },
    { status: 429, headers: { 'Retry-After': String(retryAfter ?? 3600) } }
  )

const OWNER_REQUIRED_RESPONSE = () =>
  NextResponse.json(
    { error: 'Only the company owner can manage billing.' },
    { status: 403 }
  )

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: claimsData } = await supabase.auth.getClaims()
  const claims = claimsData?.claims ?? null
  if (!claims) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Read-only demo: never start a real Stripe checkout.
  const blocked = await demoGuardResponse()
  if (blocked) return blocked

  const body = await request.json() as { plan?: string; billingInterval?: string }
  const plan = body.plan === 'business' ? 'business' : 'pro'
  const billingInterval = body.billingInterval === 'year' ? 'year' : 'month'

  // Scope to the active company (getActiveCompanyId validates membership via RLS),
  // then fetch the columns needed for checkout by id with the RLS-bound client.
  const companyId = await getActiveCompanyId()

  // Billing is owner-only — a member (or admin) can never subscribe, change
  // plans, or otherwise touch the company's payment method.
  if (companyId) {
    try {
      await requireCompanyOwner(companyId)
    } catch {
      return OWNER_REQUIRED_RESPONSE()
    }

    // FIX 3 — rate limit AFTER auth+owner gate, BEFORE any Stripe call.
    const rl = await rateLimit('billingSessionPerHour', companyId)
    if (!rl.allowed) return RATE_LIMITED_RESPONSE(rl.retryAfter)
  }

  const { data: company } = companyId
    ? await supabase
        .from('companies')
        .select('id, stripe_customer_id, stripe_subscription_id')
        .eq('id', companyId)
        .maybeSingle()
    : { data: null }

  if (!company?.id) {
    return NextResponse.json({ error: 'Company not found' }, { status: 400 })
  }

  // Prefer the panel-managed Stripe Price id from billing_config (provisioned by
  // saveBillingConfig from the admin dollar amount, no deploy); fall back to the
  // STRIPE_PRICE_* env var only when the config slot is still null. Both absent →
  // the same 500 as before.
  const cfg = await getBillingConfig()
  const tierCfg = cfg.tiers[plan]
  const configPriceId =
    billingInterval === 'year' ? tierCfg.stripePriceIdYear : tierCfg.stripePriceIdMonth
  const envPriceId =
    billingInterval === 'year'
      ? plan === 'pro'
        ? process.env.STRIPE_PRICE_PRO_ANNUAL
        : process.env.STRIPE_PRICE_BUSINESS_ANNUAL
      : plan === 'pro'
        ? process.env.STRIPE_PRICE_PRO
        : process.env.STRIPE_PRICE_BUSINESS
  const priceId = configPriceId ?? envPriceId

  const envVarName = billingInterval === 'year'
    ? `STRIPE_PRICE_${plan.toUpperCase()}_ANNUAL`
    : `STRIPE_PRICE_${plan.toUpperCase()}`

  if (!priceId) {
    return NextResponse.json(
      { error: `${envVarName} env var not set` },
      { status: 500 }
    )
  }

  const stripe = await getStripeClient()

  // Upgrade/downgrade safety net: a company that already has a live subscription
  // must NEVER get a second one from a fresh Checkout (double billing). Route it
  // through the Customer Portal update flow instead.
  if (company.stripe_subscription_id) {
    let sub: Stripe.Subscription | null = null
    try {
      sub = await stripe.subscriptions.retrieve(company.stripe_subscription_id)
    } catch {
      // retrieve failed (e.g. the subscription was deleted at Stripe) — fall
      // through to a normal Checkout.
    }

    if (sub && (sub.status === 'active' || sub.status === 'trialing' || sub.status === 'past_due')) {
      // WP-L extra fix (1): seat billing adds a SECOND item to the same
      // subscription and Stripe does not guarantee list ordering — blindly
      // trusting items.data[0] can select the SEAT item instead of the plan
      // item. If that happened here, the portal flow below would swap the
      // seat item to the new plan price (leaving two plan items = double
      // billing, and dropping the seat charge entirely), and the
      // "Already on this plan" guard below would never fire (comparing a
      // seat item's price against a plan price id never matches). Select the
      // plan item explicitly, same rule as readPeriodEnd/syncSubscriptionSeatItem.
      const item =
        sub.items.data.find((it) => it.metadata?.kind !== SEAT_ITEM_METADATA_KIND) ??
        sub.items.data[0]
      // WP-L extra fix (2): an admin price change archives the OLD Price and
      // mints a new id — an existing subscriber still on the archived Price
      // would never match `item?.price?.id === priceId` again, silently
      // losing the "already on this plan" guard and pushing them through a
      // full portal reprice flow for a plan they're already on. Treat "same
      // tier + same interval" (via the metadata.kind tag, which survives
      // archival — see stripe-price-map.ts) as equivalent to "same plan".
      const currentTier = await resolveTierFromPriceId(item?.price ?? null, stripe)
      const sameInterval = item?.price?.recurring?.interval === billingInterval
      if (item?.price?.id === priceId || (currentTier === plan && sameInterval)) {
        return NextResponse.json({ error: 'Already on this plan' }, { status: 400 })
      }
      try {
        const portal = await stripe.billingPortal.sessions.create({
          customer: company.stripe_customer_id as string,
          flow_data: {
            type: 'subscription_update_confirm',
            subscription_update_confirm: {
              subscription: sub.id,
              items: [{ id: item.id, price: priceId, quantity: 1 }],
            },
          },
          return_url: `${getCanonicalBaseUrl()}/settings/billing?upgraded=1`,
        })
        return NextResponse.json({ url: portal.url })
      } catch {
        // Portal not configured for subscription updates — fall back to a plain
        // portal session so the user can still switch plans there.
        try {
          const portal = await stripe.billingPortal.sessions.create({
            customer: company.stripe_customer_id as string,
            return_url: `${getCanonicalBaseUrl()}/settings/billing`,
          })
          return NextResponse.json({ url: portal.url })
        } catch (err) {
          // Both portal calls failed (e.g. Customer Portal never configured).
          // NEVER fall through to a fresh Checkout here — the company still has
          // a live subscription and would end up double-billed.
          console.error('[create-checkout-session] portal unavailable for live subscriber:', err)
          return NextResponse.json(
            { error: 'Could not open the plan-change portal. Please try again or contact support.' },
            { status: 502 }
          )
        }
      }
    }
    // Subscription exists but is not live (canceled/incomplete/etc.) — fall
    // through to a normal Checkout to start a fresh one.
  }

  // Fix 4b — a double-click (or a retried fetch) must not mint TWO Checkout
  // Sessions. Minute-bucketed per-company+plan+interval key: distinct plan
  // choices in the same minute still get distinct sessions; a genuine
  // double-submit of the SAME choice within the minute collapses to one.
  const idempotencyKey = `checkout:${company.id}:${plan}:${billingInterval}:${Math.floor(Date.now() / 60000)}`

  const session = await stripe.checkout.sessions.create(
    {
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      // Always a persisted Stripe Customer — never an orphan created ad hoc by
      // Checkout (TOPUP/CREDITUI parity fix; see lib/billing/stripe-customer.ts).
      customer: await ensureStripeCustomer(stripe, company.id as string),
      success_url: `${getCanonicalBaseUrl()}/settings/billing?success=1`,
      cancel_url: `${getCanonicalBaseUrl()}/settings/billing?cancelled=1`,
      // Store plan + companyId + billing_interval in metadata — avoids line_items expand call in webhook (RESEARCH Pitfall 3)
      metadata: { companyId: company.id, plan, billing_interval: billingInterval },
      subscription_data: {
        metadata: { companyId: company.id, plan, billing_interval: billingInterval },
      },
    },
    { idempotencyKey }
  )

  return NextResponse.json({ url: session.url })
}
