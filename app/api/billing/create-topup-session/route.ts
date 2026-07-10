import { type NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getActiveCompanyId } from '@/lib/queries/active-company'
import { getStripeClient } from '@/lib/billing/stripe-client'
import { demoGuardResponse } from '@/lib/demo/guard'
import { getBillingConfig } from '@/lib/billing/billing-config'

/**
 * Phase 113 (TOPUP-02 route side) — one-time credit top-up checkout.
 *
 * Mirrors create-checkout-session/route.ts (subscription) but uses
 * mode:'payment' with INLINE price_data driven entirely by
 * getBillingConfig().topUpPacks — NO pre-created Stripe Price. The pack
 * credits + price are looked up SERVER-SIDE by packIndex, never trusted from
 * the request body (research Pitfall 4). The credit grant happens later, in the
 * checkout.session.completed webhook arm keyed on metadata.type='credit_topup'.
 */
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

  const body = (await request.json().catch(() => null)) as { packIndex?: number } | null
  const packIndex = Number(body?.packIndex)

  const companyId = await getActiveCompanyId()
  const { data: company } = companyId
    ? await supabase
        .from('companies')
        .select('id, stripe_customer_id')
        .eq('id', companyId)
        .maybeSingle()
    : { data: null }

  if (!company?.id) {
    return NextResponse.json({ error: 'Company not found' }, { status: 400 })
  }

  const cfg = await getBillingConfig()
  const pack = Number.isInteger(packIndex) ? cfg.topUpPacks[packIndex] : undefined
  if (!pack) {
    return NextResponse.json({ error: 'Invalid pack' }, { status: 400 })
  }

  const stripe = await getStripeClient()

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: 'usd',
          unit_amount: pack.priceCents, // server-side — never from the body (Pitfall 4)
          product_data: { name: `${pack.credits} Xtimator credits` },
        },
      },
    ],
    // Attach to existing Stripe customer if one exists (avoids duplicate customer creation)
    customer: company.stripe_customer_id ?? undefined,
    success_url: `${process.env.NEXT_PUBLIC_APP_URL}/settings/billing?topup=1`,
    cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/settings/billing?topup=cancelled`,
    metadata: {
      type: 'credit_topup',
      companyId: company.id,
      credits: String(pack.credits), // metadata values are strings
    },
  })

  return NextResponse.json({ url: session.url })
}
