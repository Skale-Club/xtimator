import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import {
  ACTIVE_COMPANY_COOKIE,
  ACTIVE_COMPANY_COOKIE_OPTIONS,
} from '@/lib/queries/active-company'
import { getDemoCompanyId, getDemoUserEmail } from '@/lib/demo/config'
import { resolveBaseUrl } from '@/lib/utils/site-url'

// Auto-login mutates session cookies, so this must run on the Node runtime and
// never be statically cached.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Public demo entry point.
 *
 * A visitor clicking "See Demo" lands here. We programmatically establish a
 * session for the shared demo user (email is a server-only env var), pin the
 * active company to the dedicated demo company, and forward them into the
 * dashboard.
 *
 * Why not signInWithPassword? The project enforces CAPTCHA (Turnstile) on the
 * auth endpoints, which real users solve in the browser. A server-side password
 * sign-in has no captcha token and is rejected. Instead we mint the session via
 * the service-role admin API: generate a one-time magic-link token and consume
 * it with verifyOtp, neither of which is captcha-gated.
 *
 * Read-only enforcement (app guard + restrictive RLS) is handled separately so
 * the demo user can browse but never mutate or trigger external side effects.
 */
export async function GET(request: Request) {
  const origin = resolveBaseUrl(request)

  const email = getDemoUserEmail()
  const admin = createServiceClient()

  // Demo not configured (missing email or service key) — fail safe back to the
  // landing page rather than exposing a 500.
  if (!email || !admin) {
    return NextResponse.redirect(new URL('/?demo=unavailable', origin))
  }

  const supabase = await createClient()

  // If the visitor is already signed in as the demo user, skip re-authenticating.
  const { data: claimsData } = await supabase.auth.getClaims()
  const currentEmail = claimsData?.claims?.email ?? null
  const alreadyDemo = currentEmail?.toLowerCase() === email.toLowerCase()

  if (!alreadyDemo) {
    // 1. Service-role generates a one-time login token for the demo user.
    const { data: link, error: linkError } =
      await admin.auth.admin.generateLink({ type: 'magiclink', email })
    if (linkError || !link?.properties?.email_otp) {
      return NextResponse.redirect(new URL('/?demo=error', origin))
    }

    // 2. Consume it on the SSR client so the session cookies are written to the
    //    response. verifyOtp is not captcha-gated.
    const { error: verifyError } = await supabase.auth.verifyOtp({
      email,
      token: link.properties.email_otp,
      type: 'email',
    })
    if (verifyError) {
      return NextResponse.redirect(new URL('/?demo=error', origin))
    }
  }

  // Pin the active company to the demo company so the dashboard resolves it.
  const cookieStore = await cookies()
  cookieStore.set(
    ACTIVE_COMPANY_COOKIE,
    getDemoCompanyId(),
    ACTIVE_COMPANY_COOKIE_OPTIONS
  )

  return NextResponse.redirect(new URL('/dashboard', origin))
}
