import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
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
  const { data } = await supabase.auth.getClaims()
  const claims = data?.claims ?? null

  const { pathname } = request.nextUrl

  // D-05, D-01, D-02: protect all routes EXCEPT /login, /signup, /reset-password, /callback, /estimate/* and /
  // /callback must be public so the OAuth code exchange can run before getClaims() has anything to return
  const isAuthRoute = pathname.startsWith('/login') || pathname.startsWith('/signup') || pathname.startsWith('/reset-password') || pathname.startsWith('/callback')
  const isPublicEstimate = pathname.startsWith('/estimate')
  const isLandingRoot = pathname === '/'  // D-01: / is public; D-02: authenticated / → /dashboard

  if (!claims && !isAuthRoute && !isPublicEstimate && !isLandingRoot) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    // Preserve set-cookie headers so Supabase can rotate session tokens on redirect
    const redirectResponse = NextResponse.redirect(url)
    supabaseResponse.headers.forEach((value, key) => {
      if (key === 'set-cookie') redirectResponse.headers.append(key, value)
    })
    return redirectResponse
  }

  // D-02: Authenticated visitor hits landing root → redirect to /dashboard
  if (claims && isLandingRoot) {
    const url = request.nextUrl.clone()
    url.pathname = '/dashboard'
    const redirectResponse = NextResponse.redirect(url)
    supabaseResponse.headers.forEach((value, key) => {
      if (key === 'set-cookie') redirectResponse.headers.append(key, value)
    })
    return redirectResponse
  }

  return supabaseResponse
}
