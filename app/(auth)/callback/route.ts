import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const type = searchParams.get('type')

  if (code) {
    const supabase = await createClient()
    await supabase.auth.exchangeCodeForSession(code)

    // For password recovery, redirect to reset-password page
    if (type === 'recovery') {
      return NextResponse.redirect(new URL('/auth/reset-password?mode=update', origin))
    }

    // Check company record to determine redirect destination (AUTH-06)
    const { data } = await supabase.auth.getClaims()
    const claims = data?.claims ?? null
    if (claims) {
      const { data: company } = await supabase
        .from('companies')
        .select('id')
        .eq('user_id', claims.sub)
        .single()
      return NextResponse.redirect(new URL(company ? '/dashboard' : '/onboarding', origin))
    }
  }

  // Fallback: redirect to login if no code or claims
  return NextResponse.redirect(new URL('/auth/login', origin))
}
