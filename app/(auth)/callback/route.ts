import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { logAuthEvent } from '@/lib/auth-logger'
import { writeThemeCookie, isValidTheme } from '@/lib/theme/cookie'

/**
 * Quick-260909-eul — relative Location on purpose. exchangeCodeForSession() has
 * just written the auth cookies on THIS request's host; an absolute redirect to
 * APP_ORIGIN used to strand a `www.` session on the apex (no cookies there →
 * /?auth=login → second login). NextResponse.redirect() rejects relative URLs,
 * hence the raw response. Route handlers merge cookies() writes into it.
 */
function relativeRedirect(path: `/${string}`): NextResponse {
  return new NextResponse(null, { status: 307, headers: { Location: path } })
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')
  const type = searchParams.get('type')

  if (code) {
    const supabase = await createClient()
    const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)

    if (exchangeError) {
      logAuthEvent({ event: 'oauth_callback', success: false, provider: 'google', error: `exchange_error: ${exchangeError.message}` })
      return relativeRedirect('/?auth=login')
    }

    // For password recovery, redirect to authenticated update-password page
    if (type === 'recovery') {
      logAuthEvent({ event: 'oauth_callback', success: true, provider: 'recovery', redirectTo: '/update-password' })
      return relativeRedirect('/update-password')
    }

    // Use the user from exchangeCodeForSession() — it has the claims we need
    // (sub, email, etc.) without a race condition against getClaims().
    // getClaims() may not see the freshly-written session cookie on the first request.
    const user = data?.user ?? null
    if (user) {
      // Company resolution MUST mirror the app shell (lib/queries/active-company.ts):
      // a user "has a company" when they own one OR are a member of one via
      // company_members (team staff, multi-company owners). The previous
      // `.single()` on companies errored for 0 rows (staff / brand-new Google
      // user) AND for >1 rows (owner of multiple companies), bouncing valid
      // logins back to the landing page.
      const [ownedResult, membershipResult] = await Promise.all([
        supabase
          .from('companies')
          .select('id, theme_preference')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from('company_members')
          .select('company_id')
          .eq('user_id', user.id)
          .limit(1)
          .maybeSingle(),
      ])

      const ownedCompany = ownedResult.data
      const hasCompany = !!ownedCompany || !!membershipResult.data

      // Sync theme cookie from DB so SSR serves correct theme on first load.
      // Route Handlers are allowed to write cookies (layouts are not).
      if (ownedCompany && isValidTheme(ownedCompany.theme_preference)) {
        await writeThemeCookie(ownedCompany.theme_preference)
      }

      const redirectTo: '/dashboard' | '/onboarding' = hasCompany ? '/dashboard' : '/onboarding'
      logAuthEvent({ event: 'oauth_callback', success: true, provider: 'google', userId: user.id, redirectTo })
      return relativeRedirect(redirectTo)
    }
  }

  // Fallback: redirect to landing with modal auto-open if no code or user
  logAuthEvent({ event: 'oauth_callback', success: false, provider: 'google', error: 'no_code_or_user' })
  return relativeRedirect('/?auth=login')
}
