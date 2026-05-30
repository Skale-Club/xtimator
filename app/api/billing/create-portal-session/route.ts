import { type NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getStripeClient } from '@/lib/billing/stripe-client'
import { demoGuardResponse } from '@/lib/demo/guard'

export async function POST(_request: NextRequest) {
  const supabase = await createClient()
  const { data: claimsData } = await supabase.auth.getClaims()
  const claims = claimsData?.claims ?? null
  if (!claims) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Read-only demo: never open the real Stripe billing portal.
  const blocked = await demoGuardResponse()
  if (blocked) return blocked

  const { data: company } = await supabase
    .from('companies')
    .select('id, stripe_customer_id')
    .eq('user_id', claims.sub)
    .single()

  if (!company?.stripe_customer_id) {
    return NextResponse.json(
      { error: 'No active Stripe subscription found' },
      { status: 400 }
    )
  }

  const stripe = await getStripeClient()

  const session = await stripe.billingPortal.sessions.create({
    customer: company.stripe_customer_id,
    return_url: `${process.env.NEXT_PUBLIC_APP_URL}/settings/billing`,
  })

  return NextResponse.json({ url: session.url })
}
