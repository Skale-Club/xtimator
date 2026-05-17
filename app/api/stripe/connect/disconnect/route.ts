import { NextResponse, type NextRequest } from 'next/server'
import { revalidatePath } from 'next/cache'
import { getAuthClaims } from '@/lib/queries/auth'
import { requireServiceClient } from '@/lib/supabase/service'
import { getIntegrationKey } from '@/lib/platform-config'
import { deauthorize } from '@/lib/billing/connect-oauth'

/**
 * POST /api/stripe/connect/disconnect
 *
 * Soft disconnect: clears `stripe_account_id`, sets status='disconnected',
 * preserves email + display_name as audit trail. Best-effort calls Stripe's
 * `/oauth/deauthorize` — failures there are logged but do not block the
 * company-side disconnect (user intent wins).
 *
 * Existing paid estimates retain `payment_status='paid'` — disconnect never
 * retroactively changes payment history.
 */
export async function POST(req: NextRequest) {
  void req
  const claims = await getAuthClaims()
  if (!claims) {
    return NextResponse.json(
      { ok: false, message: 'unauthorized' },
      { status: 401 }
    )
  }

  const svc = requireServiceClient()
  const { data: company } = await svc
    .from('companies')
    .select('id, stripe_account_id')
    .eq('user_id', claims.sub as string)
    .single()
  if (!company || !company.stripe_account_id) {
    return NextResponse.json({ ok: true, message: 'already disconnected' })
  }

  const clientId = await getIntegrationKey('stripe_connect_client_id')
  if (clientId) {
    await deauthorize({
      clientId,
      stripeUserId: company.stripe_account_id as string,
    })
  }

  await svc
    .from('companies')
    .update({
      stripe_account_id: null,
      stripe_connect_status: 'disconnected',
      // keep stripe_account_email + stripe_account_display_name as audit trail
    })
    .eq('id', company.id as string)

  revalidatePath('/settings/payments')
  return NextResponse.json({ ok: true })
}
