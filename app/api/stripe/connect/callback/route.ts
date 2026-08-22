import { NextResponse, type NextRequest } from 'next/server'
import { cookies } from 'next/headers'
import { getAuthClaims } from '@/lib/queries/auth'
import { getActiveCompanyId } from '@/lib/queries/active-company'
import { requireCompanyOwner } from '@/lib/auth/require-company-role'
import { requireServiceClient } from '@/lib/supabase/service'
import { verifyOAuthState, exchangeCode } from '@/lib/billing/connect-oauth'
import { getStripeClient } from '@/lib/billing/stripe-client'
import { resolveBaseUrl } from '@/lib/utils/site-url'
import { demoGuardResponse } from '@/lib/demo/guard'

/**
 * GET /api/stripe/connect/callback
 *
 * Stripe Connect OAuth callback. Verifies the HMAC state, exchanges the code
 * for a `stripe_user_id`, persists it on `companies`, and redirects back to
 * `/settings/integrations/stripe` with `?connected=1` (success) or `?error=...` (failure).
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
  const settingsUrl = new URL('/settings/integrations/stripe', base)

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

  // Resolve the caller's ACTIVE company — never "any company owned by
  // user_id" (a user in 2+ companies must connect Stripe for whichever
  // company is currently active, not an arbitrary one picked by `.single()`).
  const companyId = await getActiveCompanyId()
  if (!companyId) return NextResponse.redirect(new URL('/onboarding', base))

  const svc = requireServiceClient()
  const { data: company } = await svc
    .from('companies')
    .select('id, stripe_account_id')
    .eq('id', companyId)
    .single()
  if (!company) return NextResponse.redirect(new URL('/onboarding', base))

  const demoBlocked = await demoGuardResponse({
    userId: claims.sub as string,
    email: (claims.email as string | undefined) ?? null,
    companyId: company.id as string,
  })
  if (demoBlocked) return demoBlocked

  // Billing/Connect is owner-only — a member (or admin) can never complete
  // the OAuth handshake, even if they somehow reach this callback URL.
  try {
    await requireCompanyOwner(company.id as string)
  } catch {
    settingsUrl.searchParams.set('error', 'owner_required')
    return NextResponse.redirect(settingsUrl)
  }

  // Clear cookie immediately — single-use state (Pitfall 3).
  const cookieJar = await cookies()
  const cookieState = cookieJar.get('stripe_oauth_state')?.value
  cookieJar.delete('stripe_oauth_state')

  // The cookie must echo the exact state minted by /initiate — binds this
  // callback to the browser session that started the flow. Distinct from the
  // HMAC check below: this catches a caller replaying a DIFFERENT (but
  // otherwise validly-signed) state than the one their own browser started.
  if (!cookieState || cookieState !== state) {
    settingsUrl.searchParams.set('error', 'invalid_state')
    return NextResponse.redirect(settingsUrl, { status: 302 })
  }

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
