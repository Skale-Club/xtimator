import { NextResponse, type NextRequest } from 'next/server'
import { cookies } from 'next/headers'
import { getAuthClaims } from '@/lib/queries/auth'
import { requireServiceClient } from '@/lib/supabase/service'
import { getIntegrationKey } from '@/lib/platform-config'
import { mintOAuthState, buildAuthorizeUrl } from '@/lib/billing/connect-oauth'
import { isDemoSession } from '@/lib/demo/guard'
import { resolveBaseUrl } from '@/lib/utils/site-url'

/**
 * GET /api/stripe/connect/initiate
 *
 * Owner-initiated entry point for connecting a company's Stripe account via
 * Standard OAuth. Sets an httpOnly HMAC state cookie (10-min TTL) and 302s to
 * `connect.stripe.com/oauth/authorize`. When the platform's Connect Client ID
 * is not yet configured, redirects back to `/settings/integrations/stripe` with a
 * friendly error param instead of producing a broken Stripe URL.
 */
export async function GET(req: NextRequest) {
  const base = resolveBaseUrl(req)

  const claims = await getAuthClaims()
  if (!claims) return NextResponse.redirect(new URL('/?auth=login', base))

  // Read-only demo: never begin Stripe Connect onboarding.
  if (await isDemoSession()) {
    return NextResponse.redirect(
      new URL('/settings/integrations/stripe?error=demo_readonly', base)
    )
  }

  const svc = requireServiceClient()
  const { data: company } = await svc
    .from('companies')
    .select('id, email')
    .eq('user_id', claims.sub as string)
    .single()
  if (!company) return NextResponse.redirect(new URL('/onboarding', base))

  const clientId = await getIntegrationKey('stripe_connect_client_id')
  if (!clientId) {
    return NextResponse.redirect(
      new URL('/settings/integrations/stripe?error=platform_not_configured', base)
    )
  }

  const state = mintOAuthState(company.id as string)
  const cookieJar = await cookies()
  cookieJar.set('stripe_oauth_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 600,
    path: '/',
  })

  const redirectUri = `${base}/api/stripe/connect/callback`
  const url = buildAuthorizeUrl({
    clientId,
    redirectUri,
    state,
    prefillEmail: (company.email as string | null) ?? null,
  })
  return NextResponse.redirect(url)
}
