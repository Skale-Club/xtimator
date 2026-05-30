import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { ACTIVE_COMPANY_COOKIE_NAME } from '@/lib/queries/active-company'
import {
  getDemoCompanyId,
  getDemoUserEmail,
  getDemoUserPassword,
} from '@/lib/demo/config'

// Auto-login mutates session cookies, so this must run on the Node runtime and
// never be statically cached.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Public demo entry point.
 *
 * A visitor clicking "See Demo" lands here. We programmatically sign them in as
 * the shared demo user (credentials are server-only env vars), pin the active
 * company to the dedicated demo company, and forward them into the dashboard.
 *
 * Read-only enforcement (app guard + restrictive RLS) is handled separately so
 * the demo user can browse but never mutate or trigger external side effects.
 */
export async function GET(request: Request) {
  const { origin } = new URL(request.url)

  const email = getDemoUserEmail()
  const password = getDemoUserPassword()

  // Demo not configured (missing credentials) — fail safe back to the landing
  // page rather than exposing a 500.
  if (!email || !password) {
    return NextResponse.redirect(new URL('/?demo=unavailable', origin))
  }

  const supabase = await createClient()

  // If the visitor is already signed in as the demo user, skip re-authenticating.
  const { data: claimsData } = await supabase.auth.getClaims()
  const currentEmail = claimsData?.claims?.email ?? null
  const alreadyDemo = currentEmail?.toLowerCase() === email.toLowerCase()

  if (!alreadyDemo) {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      return NextResponse.redirect(new URL('/?demo=error', origin))
    }
  }

  // Pin the active company to the demo company so the dashboard resolves it.
  const cookieStore = await cookies()
  cookieStore.set(ACTIVE_COMPANY_COOKIE_NAME, getDemoCompanyId(), {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  })

  return NextResponse.redirect(new URL('/dashboard', origin))
}
