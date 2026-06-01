import { NextResponse, type NextRequest } from 'next/server'
import { cookies } from 'next/headers'
import { getAuthClaims } from '@/lib/queries/auth'
import { requireServiceClient } from '@/lib/supabase/service'
import { verifyOAuthState, exchangeCode } from '@/lib/billing/connect-oauth'
import { getStripeClient } from '@/lib/billing/stripe-client'
import { resolveBaseUrl } from '@/lib/utils/site-url'

/**
 * GET /api/stripe/connect/callback
 *
 * Stripe Connect OAuth callback. Verifies the HMAC state, exchanges the code
 * for a `stripe_user_id`, persists it on `companies`, and redirects back to
 * `/settings/payments` with `?connected=1` (success) or `?error=...` (failure).
 *
 * IDEMPOTENT: If the company already has `stripe_account_id` set, the handler
 * short-circuits without re-exchanging the code. OAuth codes are single-use
 * and revoke the connection on second exchange (OAuth 2 spec) — see
 * RESEARCH.md Pitfall 3.
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  const stripeError = url.searchParams.get('error')
  const base = resolveBaseUrl(req)
  const settingsUrl = new URL('/settings/payments', base)

  if (stripeError) {
    settingsUrl.searchParams.set('error', stripeError)
    return NextResponse.redirect(settingsUrl)
  }
  if (!code || !state) {
    settingsUrl.searchParams.set('error', 'missing_params')
    return NextResponse.redirect(settingsUrl)
  }

  const claims = await getAuthClaims()
  if (!claims) return NextResponse.redirect(new URL('/?auth=login', base))

  const svc = requireServiceClient()
  const { data: company } = await svc
    .from('companies')
    .select('id, stripe_account_id')
    .eq('user_id', claims.sub as string)
    .single()
  if (!company) return NextResponse.redirect(new URL('/onboarding', base))

  // Clear cookie immediately — single-use state (Pitfall 3).
  const cookieJar = await cookies()
  cookieJar.delete('stripe_oauth_state')

  if (!verifyOAuthState(state, company.id as string)) {
    settingsUrl.searchParams.set('error', 'invalid_state')
    return NextResponse.redirect(settingsUrl, { status: 302 })
  }

  // IDEMPOTENCY: if already connected, treat as success — do NOT re-exchange.
  if (company.stripe_account_id) {
    settingsUrl.searchParams.set('connected', '1')
    return NextResponse.redirect(settingsUrl)
  }

  try {
    const { stripe_user_id } = await exchangeCode(code)
    const stripe = await getStripeClient()
    const account = await stripe.accounts.retrieve(stripe_user_id)
    const displayName =
      account.settings?.dashboard?.display_name ??
      account.business_profile?.name ??
      stripe_user_id
    await svc
      .from('companies')
      .update({
        stripe_account_id: stripe_user_id,
        stripe_connect_status: 'active',
        stripe_connected_at: new Date().toISOString(),
        stripe_account_email: account.email ?? null,
        stripe_account_display_name: displayName,
      })
      .eq('id', company.id as string)
    settingsUrl.searchParams.set('connected', '1')
    return NextResponse.redirect(settingsUrl)
  } catch (e) {
    console.error('[connect-callback]', e)
    settingsUrl.searchParams.set('error', 'token_exchange_failed')
    return NextResponse.redirect(settingsUrl)
  }
}
