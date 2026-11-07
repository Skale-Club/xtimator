import { createServerClient } from '@supabase/ssr'
import { dataApiBaseUrl } from '@/lib/supabase/data-api'
import { NextResponse, type NextRequest } from 'next/server'
import { ownedAuthEnabled } from '@/lib/auth/mode'
import { ownedRequestClaims } from '@/lib/auth/owned-proxy'

export function isPublicRoute(pathname: string) {
  const isAuthRoute = pathname === '/callback'
  const isPublicEstimate = pathname.startsWith('/estimate')
  const isMetadataRoute =
    pathname === '/icon' ||
    pathname === '/apple-icon' ||
    pathname === '/manifest.webmanifest'

  return pathname === '/' || isAuthRoute || isPublicEstimate || isMetadataRoute
}

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = ownedAuthEnabled() ? null : createServerClient(
    dataApiBaseUrl()!,
    (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // CRITICAL: Use getClaims(), NOT getSession()
  // getSession() does not re-validate the JWT signature against Supabase servers
  let claims = null
  try {
    if (ownedAuthEnabled()) claims = await ownedRequestClaims(request, supabaseResponse)
    else {
      const { data } = await supabase!.auth.getClaims()
      claims = data?.claims ?? null
    }
  } catch {
    claims = null
  }

  const { pathname } = request.nextUrl

  if (!claims && !isPublicRoute(pathname)) {
    const url = request.nextUrl.clone()
    url.pathname = '/'
    url.search = ''
    url.searchParams.set('auth', 'login')
    // Preserve set-cookie headers so Supabase can rotate session tokens on redirect
    const redirectResponse = NextResponse.redirect(url)
    supabaseResponse.headers.forEach((value, key) => {
      if (key === 'set-cookie') redirectResponse.headers.append(key, value)
    })
    return {
      claims,
      response: redirectResponse,
    }
  }

  return {
    claims,
    response: supabaseResponse,
  }
}
