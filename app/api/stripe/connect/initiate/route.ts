import { NextResponse, type NextRequest } from 'next/server'
import { cookies } from 'next/headers'
import { getAuthClaims } from '@/lib/queries/auth'
import { getActiveCompanyId } from '@/lib/queries/active-company'
import { requireCompanyOwner } from '@/lib/auth/require-company-role'
import { requireServiceClient } from '@/lib/supabase/service'
import { getIntegrationKey } from '@/lib/platform-config'
import { mintOAuthState, buildAuthorizeUrl } from '@/lib/billing/connect-oauth'
import { demoGuardResponse } from '@/lib/demo/guard'
import { resolveBaseUrl } from '@/lib/utils/site-url'
import { rateLimit } from '@/lib/ratelimit'
import { COMPANY_FEATURE_COLUMNS, resolveCompanyFeatures } from '@/lib/features/company-features'
import { getPlatformFeatureState } from '@/lib/features/platform-feature-state'
import { checkConnectReadiness } from '@/lib/billing/connect-readiness'

/**
 * GET /api/stripe/connect/initiate
 *
 * Owner-initiated entry point for connecting a company's Stripe account via
 * Standard OAuth. Sets an httpOnly HMAC state cookie (10-min TTL) and 302s to
 * `connect.stripe.com/oauth/authorize`. When the platform's Connect Client ID
 * is not yet configured, redirects back to `/settings/client-actions` with a
 * friendly error param instead of producing a broken Stripe URL.
 */
export async function GET(req: NextRequest) {
  const base = resolveBaseUrl(req)

  const claims = await getAuthClaims()
  if (!claims) return NextResponse.redirect(new URL('/?auth=login', base))

  // Read-only demo: never begin Stripe Connect onboarding.
  const blocked = await demoGuardResponse()
  if (blocked) return blocked

  // Resolve the caller's ACTIVE company — never "any company owned by
  // user_id" (a user in 2+ companies must connect Stripe for whichever
  // company is currently active, not an arbitrary one picked by `.single()`).
  const companyId = await getActiveCompanyId()
  if (!companyId) return NextResponse.redirect(new URL('/onboarding', base))

  // Billing/Connect is owner-only — a member (or admin) can never initiate.
  try {
    await requireCompanyOwner(companyId)
  } catch {
    return NextResponse.redirect(
      new URL('/settings/client-actions?error=owner_required', base)
    )
  }

  // Feature switches (platform switch, global stop, tenant switch): the single
  // resolver decides whether this company may start connecting Stripe.
  const svc = requireServiceClient()
  const { data: company } = await svc
    .from('companies')
    .select(`id, email, ${COMPANY_FEATURE_COLUMNS}`)
    .eq('id', companyId)
    .single()
  if (!company) return NextResponse.redirect(new URL('/onboarding', base))

  const payments = resolveCompanyFeatures(company, await getPlatformFeatureState()).onlinePayments
  if (!payments.allowed) {
    return NextResponse.redirect(new URL('/settings/client-actions?error=payments_not_available', base))
  }
  if (!payments.enabled) {
    return NextResponse.redirect(new URL('/settings/client-actions?error=payments_off', base))
  }
  if (payments.linked) {
    return NextResponse.redirect(new URL('/settings/client-actions?connected=1', base))
  }
  if (!payments.canConnect) {
    return NextResponse.redirect(new URL('/settings/client-actions?error=payments_not_available', base))
  }

  // FIX 3 — rate limit AFTER auth+owner gate, BEFORE any Stripe call.
  const rl = await rateLimit('stripeConnectInitiatePerHour', companyId)
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Too many billing requests. Please try again shortly.', code: 'rate_limit:stripe_connect_initiate' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfter ?? 3600) } }
    )
  }

  const clientId = await getIntegrationKey('stripe_connect_client_id')
  if (!clientId || !/^ca_[A-Za-z0-9]+$/.test(clientId)) {
    return NextResponse.redirect(
      new URL('/settings/client-actions?error=platform_not_configured', base)
    )
  }

  try {
    if (!(await checkConnectReadiness()).ready) {
      return NextResponse.redirect(new URL('/settings/client-actions?error=platform_not_configured', base))
    }
  } catch {
    return NextResponse.redirect(new URL('/settings/client-actions?error=platform_not_configured', base))
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
