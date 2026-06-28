import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

const PROTECTED_ROUTE_PREFIXES = [
  '/dashboard',
  '/onboarding',
  '/estimate',
  '/company',
  '/team',
  '/settings',
  '/integrations',
  '/api',
] as const

const PUBLIC_EXACT_ROUTES = ['/', '/callback'] as const

const PUBLIC_PREFIXES = ['/estimate/public', '/icon', '/apple-icon', '/manifest.webmanifest'] as const

export function isPublicRoute(pathname: string): boolean {
  if (PUBLIC_EXACT_ROUTES.includes(pathname as (typeof PUBLIC_EXACT_ROUTES)[number])) {
    return true
  }
  if (pathname === '/api/cron' || pathname.startsWith('/api/cron/')) {
    return true
  }
  return PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix))
}

export function isProtectedRoute(pathname: string): boolean {
  return PROTECTED_ROUTE_PREFIXES.some((prefix) => pathname.startsWith(prefix))
}

export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)!,
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
    const { data } = await supabase.auth.getClaims()
    claims = data?.claims ?? null
  } catch {
    claims = null
  }

  const { pathname } = request.nextUrl

  // Redirect authenticated users from landing page to dashboard
  if (claims && pathname === '/') {
    const url = request.nextUrl.clone()
    url.pathname = '/dashboard'
    url.search = ''
    const redirectResponse = NextResponse.redirect(url)
    supabaseResponse.headers.forEach((value, key) => {
      if (key === 'set-cookie') redirectResponse.headers.append(key, value)
    })
    return redirectResponse
  }

  // Protect private routes
  // Cron routes authenticate with their own CRON_SECRET Bearer token. They
  // must reach the route handler even when there is no Supabase user session.
  if (!claims && isProtectedRoute(pathname) && !isPublicRoute(pathname)) {
    const url = request.nextUrl.clone()
    url.pathname = '/'
    url.search = ''
    url.searchParams.set('auth', 'login')
    const redirectResponse = NextResponse.redirect(url)
    supabaseResponse.headers.forEach((value, key) => {
      if (key === 'set-cookie') redirectResponse.headers.append(key, value)
    })
    return redirectResponse
  }

  // Allow public routes and authenticated access to protected routes
  return supabaseResponse
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     * - webhook endpoints that need raw body
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
