import { type NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getStripeClient } from '@/lib/billing/stripe-client'
import { demoGuardResponse } from '@/lib/demo/guard'

/**
 * Phase 153 (CREDITUI-07) — mode:'setup' Checkout Session for capturing a
 * reusable payment method OUTSIDE a live purchase. Mirrors
 * create-topup-session/route.ts's auth/demo-guard/company-lookup shape
 * exactly. No line_items (nothing is purchased here) — the webhook's
 * autotopup_setup arm attaches the resulting payment method as the
 * customer's default once the session completes.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: claimsData } = await supabase.auth.getClaims()
  const claims = claimsData?.claims ?? null
  if (!claims) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const blocked = await demoGuardResponse()
  if (blocked) return blocked

  const { data: company } = await supabase
    .from('companies')
    .select('id, stripe_customer_id')
    .eq('user_id', claims.sub)
    .single()

  if (!company?.id) {
    return NextResponse.json({ error: 'Company not found' }, { status: 400 })
  }

  const stripe = await getStripeClient()

  const session = await stripe.checkout.sessions.create({
    mode: 'setup',
    customer: company.stripe_customer_id ?? undefined,
    success_url: `${process.env.NEXT_PUBLIC_APP_URL}/settings/billing?autotopup_setup=1`,
    cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/settings/billing?autotopup_setup=cancelled`,
    metadata: {
      type: 'autotopup_setup',
      companyId: company.id,
    },
  })

  return NextResponse.json({ url: session.url })
}
