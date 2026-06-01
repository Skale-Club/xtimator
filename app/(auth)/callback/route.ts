import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { logAuthEvent } from '@/lib/auth-logger'
import { writeThemeCookie, isValidTheme } from '@/lib/theme/cookie'
import { resolveBaseUrl } from '@/lib/utils/site-url'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  // Behind the Coolify proxy `new URL(request.url).origin` is the internal bind
  // address (0.0.0.0:3000); resolveBaseUrl yields the canonical public domain.
  const baseUrl = resolveBaseUrl(request)
  const code = searchParams.get('code')
  const type = searchParams.get('type')

  if (code) {
    const supabase = await createClient()
    await supabase.auth.exchangeCodeForSession(code)

    // For password recovery, redirect to authenticated update-password page
    if (type === 'recovery') {
      logAuthEvent({ event: 'oauth_callback', success: true, provider: 'recovery', redirectTo: '/update-password' })
      return NextResponse.redirect(new URL('/update-password', baseUrl))
    }

    // Check company record to determine redirect destination (AUTH-06)
    const { data, error: claimsError } = await supabase.auth.getClaims()
    if (claimsError) {
      logAuthEvent({ event: 'oauth_callback', success: false, provider: 'google', error: `claims_error: ${claimsError.message}` })
    }
    const claims = data?.claims ?? null
    if (claims) {
      const { data: company } = await supabase
        .from('companies')
        .select('id, theme_preference')
        .eq('user_id', claims.sub)
        .single()

      // Sync theme cookie from DB so SSR serves correct theme on first load.
      // Route Handlers are allowed to write cookies (layouts are not).
      if (company && isValidTheme(company.theme_preference)) {
        await writeThemeCookie(company.theme_preference)
      }

      const redirectTo = company ? '/dashboard' : '/onboarding'
      logAuthEvent({ event: 'oauth_callback', success: true, provider: 'google', userId: claims.sub, redirectTo })
      return NextResponse.redirect(new URL(redirectTo, baseUrl))
    }
  }

  // Fallback: redirect to landing with modal auto-open if no code or claims
  logAuthEvent({ event: 'oauth_callback', success: false, provider: 'google', error: 'no_code_or_claims' })
  return NextResponse.redirect(new URL('/?auth=login', baseUrl))
}
