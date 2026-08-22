import { type NextRequest, NextResponse } from 'next/server'
import type Stripe from 'stripe'
import { createClient } from '@/lib/supabase/server'
import { getActiveCompanyId } from '@/lib/queries/active-company'
import { requireCompanyOwner } from '@/lib/auth/require-company-role'
import { getStripeClient } from '@/lib/billing/stripe-client'
import { getBillingConfig } from '@/lib/billing/billing-config'
import { ensureStripeCustomer } from '@/lib/billing/stripe-customer'
import { demoGuardResponse } from '@/lib/demo/guard'

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
      const item = sub.items.data[0]
      if (item?.price?.id === priceId) {
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
          return_url: `${process.env.NEXT_PUBLIC_APP_URL}/settings/billing?upgraded=1`,
        })
        return NextResponse.json({ url: portal.url })
      } catch {
        // Portal not configured for subscription updates — fall back to a plain
        // portal session so the user can still switch plans there.
        try {
          const portal = await stripe.billingPortal.sessions.create({
            customer: company.stripe_customer_id as string,
            return_url: `${process.env.NEXT_PUBLIC_APP_URL}/settings/billing`,
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

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    line_items: [{ price: priceId, quantity: 1 }],
    // Always a persisted Stripe Customer — never an orphan created ad hoc by
    // Checkout (TOPUP/CREDITUI parity fix; see lib/billing/stripe-customer.ts).
    customer: await ensureStripeCustomer(stripe, company.id as string),
    success_url: `${process.env.NEXT_PUBLIC_APP_URL}/settings/billing?success=1`,
    cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/settings/billing?cancelled=1`,
    // Store plan + companyId + billing_interval in metadata — avoids line_items expand call in webhook (RESEARCH Pitfall 3)
    metadata: { companyId: company.id, plan, billing_interval: billingInterval },
    subscription_data: {
      metadata: { companyId: company.id, plan, billing_interval: billingInterval },
    },
  })

  return NextResponse.json({ url: session.url })
}
