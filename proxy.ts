import { type NextRequest, NextResponse } from 'next/server'
import { updateSession } from '@/lib/supabase/proxy'
import { checkPlatformAdmin } from '@/lib/supabase/admin-gate'

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Custom domain white-label pass-through (DOMAIN-03)
  const host = request.headers.get('host') ?? ''
  const appHost = process.env.NEXT_PUBLIC_APP_HOST ?? 'xtimator.com'
  const isCustomHost =
    !host.includes('localhost') &&
    !host.endsWith('.vercel.app') &&
    host !== appHost

  if (isCustomHost && pathname.startsWith('/estimate/')) {
    const requestHeaders = new Headers(request.headers)
    requestHeaders.set('x-white-label', '1')
    return NextResponse.next({ request: { headers: requestHeaders } })
  }

  // Webhook bypass: Meta Cloud API cannot send auth cookies.
  // /api/webhooks/* must be reachable unauthenticated. (WA-04)
  // Verification is handled inside each webhook route via HMAC signature check.
  if (pathname.startsWith('/api/webhooks/')) {
    return NextResponse.next()
  }

  // Inngest bypass: the Inngest worker/dev server calls /api/inngest with no
  // auth cookies. The serve handler self-validates via INNGEST_SIGNING_KEY.
  if (pathname.startsWith('/api/inngest')) {
    return NextResponse.next()
  }

  // Always refresh session first (existing behavior — preserved).
  const { claims, response } = await updateSession(request)

  // Avoid loop: skip the admin gate when the request is already on /404 (R-06).
  if (pathname === '/404') return response

  // Admin gate: /admin/* requires membership in platform_admins.
  // Negative result → 404 (NOT 403/401/redirect-to-login) per D-07 to avoid
  // revealing the admin surface. This MUST take precedence over updateSession's
  // generic auth-redirect, otherwise anon users would be sent to /auth/login
  // (revealing that /admin/* is a protected area).
  if (pathname.startsWith('/admin')) {
    const isAdmin = await checkPlatformAdmin(request)
    if (!isAdmin) {
      return NextResponse.rewrite(new URL('/404', request.url))
    }
    // Authenticated admin: fall through to the (possibly cookie-refreshed)
    // session response. If updateSession returned a redirect for some other
    // reason, honour it — but for an admin user there is no such case in
    // current logic.
    return response
  }

  // Non-admin paths: if updateSession returned a redirect (3xx), short-circuit
  // so the redirect target is processed on the next request.
  if (response.status >= 300 && response.status < 400) return response

  return response
}

export const config = {
  matcher: [
    // Run middleware on all paths except Next.js internals and static files
    '/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|icon|apple-icon|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
