import { type NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getStripeClient } from '@/lib/billing/stripe-client'
import { demoGuardResponse } from '@/lib/demo/guard'

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

  const { data: company } = await supabase
    .from('companies')
    .select('id, stripe_customer_id')
    .eq('user_id', claims.sub)
    .single()

  if (!company?.id) {
    return NextResponse.json({ error: 'Company not found' }, { status: 400 })
  }

  const priceId =
    billingInterval === 'year'
      ? plan === 'pro'
        ? process.env.STRIPE_PRICE_PRO_ANNUAL
        : process.env.STRIPE_PRICE_BUSINESS_ANNUAL
      : plan === 'pro'
        ? process.env.STRIPE_PRICE_PRO
        : process.env.STRIPE_PRICE_BUSINESS

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

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    line_items: [{ price: priceId, quantity: 1 }],
    // Attach to existing Stripe customer if one exists (avoids duplicate customer creation)
    customer: company.stripe_customer_id ?? undefined,
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
