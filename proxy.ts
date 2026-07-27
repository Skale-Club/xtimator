import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { getDemoAppOrigin } from '@/lib/demo/config'
import { classifyDemoEntryRequest, getRequestOrigin } from '@/lib/demo/session'

const PROTECTED_ROUTE_PREFIXES = [
  '/dashboard',
  '/onboarding',
  // Pre-launch audit fix: '/estimate' used to be listed here, but the ONLY
  // route that ever lived at that literal URL prefix is app/estimate/[token]
  // — the PUBLIC share-link page a business sends to its clients (rendered
  // in a forced-light layout with noindex robots specifically for logged-out
  // viewing; see app/estimate/[token]/layout.tsx). The PUBLIC_PREFIXES
  // exemption below only ever matched '/estimate/public', a folder that has
  // never existed in app/ — so every anonymous visit to a share link was
  // 307-redirected to /?auth=login by this middleware, silently breaking the
  // core "send an estimate link to a client" flow for anyone not already
  // signed in. There is no authenticated content under '/estimate' to
  // protect, so it's removed entirely rather than special-cased.
  '/company',
  '/team',
  '/settings',
  '/integrations',
  '/api',
] as const

const PUBLIC_EXACT_ROUTES = ['/', '/callback'] as const

const PUBLIC_PREFIXES = ['/icon', '/apple-icon', '/manifest.webmanifest'] as const

export function isPublicRoute(pathname: string): boolean {
  if (PUBLIC_EXACT_ROUTES.includes(pathname as (typeof PUBLIC_EXACT_ROUTES)[number])) {
    return true
  }
  if (pathname === '/api/cron' || pathname.startsWith('/api/cron/')) {
    return true
  }
  // Stripe (and other) webhooks verify authenticity via signature header — must
  // bypass session auth so Stripe's delivery reaches the handler without redirect.
  if (pathname.startsWith('/api/webhooks/')) {
    return true
  }
  // Inngest invokes background functions (transcribe, generate-estimate,
  // analyze-photos, notify, crons, xphere sync) via SIGNED requests — the serve
  // handler verifies X-Inngest-Signature against INNGEST_SIGNING_KEY, so there is
  // no Supabase session to redirect on. Without this bypass, Inngest's sync +
  // invoke requests get 307'd to /?auth=login and NO background job ever runs
  // (this silently broke the whole pipeline for ~11 days after '/api' entered the
  // protected prefixes). Same rationale as the webhook/cron exemptions above.
  if (pathname === '/api/inngest' || pathname.startsWith('/api/inngest/')) {
    return true
  }
  // Pre-launch audit fix: /api/health exposes only booleans + a commit sha
  // (no PII/secrets — see app/api/health/route.ts) and is meant to be probed
  // anonymously by the Docker HEALTHCHECK and external uptime monitors. Without
  // this exemption it 307-redirects to /?auth=login for any unauthenticated
  // caller, so no external monitor (or the compose healthcheck) can ever reach it.
  // The prefix also covers /api/health/live (the dependency-free LIVENESS probe
  // the orchestrator uses to route traffic) and any future /api/health/* probe —
  // all must answer 200 anonymously or the container is (falsely) unhealthy.
  if (pathname === '/api/health' || pathname.startsWith('/api/health/')) {
    return true
  }
  // Browsers POST CSP violation reports here unauthenticated (no session to
  // check against) — see app/api/csp-report/route.ts.
  if (pathname === '/api/csp-report') {
    return true
  }
  // /api/mcp authenticates every request itself via RFC 6750 Bearer tokens
  // (lib/mcp/auth.ts) — it has no Supabase session concept. Without this
  // exemption, an MCP client's unauthenticated discovery request gets a 307 to
  // the login page instead of the RFC-9728-compliant 401 + WWW-Authenticate
  // challenge the MCP spec expects, breaking the OAuth discovery flow entirely.
  if (pathname === '/api/mcp' || pathname.startsWith('/api/mcp/')) {
    return true
  }
  return PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix))
}

export function isProtectedRoute(pathname: string): boolean {
  return PROTECTED_ROUTE_PREFIXES.some((prefix) => pathname.startsWith(prefix))
}

/**
 * Machine-to-machine API routes that authenticate via their OWN mechanism
 * (Stripe/webhook signatures, Inngest's X-Inngest-Signature, cron's CRON_SECRET
 * bearer) or are fully public (health probes, browser CSP reports). They NEVER
 * read a Supabase session, so they must not pay the getClaims() round-trip on
 * every hit. This is a strict SUBSET of isPublicRoute — kept deliberately narrow
 * (no '/', no '/api/mcp' whose 401 challenge flow still runs through the client)
 * so only clearly claim-free paths short-circuit.
 */
function isClaimFreeApiRoute(pathname: string): boolean {
  return (
    pathname === '/api/webhooks' || pathname.startsWith('/api/webhooks/') ||
    pathname === '/api/inngest' || pathname.startsWith('/api/inngest/') ||
    pathname === '/api/cron' || pathname.startsWith('/api/cron/') ||
    pathname === '/api/health' || pathname.startsWith('/api/health/') ||
    pathname === '/api/csp-report'
  )
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  const demoEntry = classifyDemoEntryRequest(request)

  // The apex handoff must not construct an Auth client or touch apex cookies.
  if (demoEntry.kind === 'apex') {
    return NextResponse.redirect(demoEntry.destination, 303)
  }
  // The route owns exact demo-host session creation/repair. A malformed entry
  // reaches the route's terminal 503 without the proxy refreshing any cookies.
  if (pathname === '/demo/entry') {
    return NextResponse.next({ request })
  }

  // Perf: short-circuit claim-free machine/public API routes BEFORE constructing
  // the Supabase client + calling getClaims(). These endpoints authenticate
  // themselves (signatures/bearer tokens) or are public probes, so the auth
  // validation was pure overhead on every webhook/inngest/cron/health hit. The
  // landing page '/' and all protected routes deliberately fall through below so
  // the session-cookie refresh (getClaims) and protected-route gating still run.
  if (isClaimFreeApiRoute(request.nextUrl.pathname)) {
    return NextResponse.next({ request })
  }

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

  // Quick-260718-w4r: authenticated GET / used to 307 to /dashboard here. It now
  // falls through to the landing page — the marketing site must stay reachable
  // when logged in (the landing TopNav resolves the session client-side and
  // shows the avatar + Dashboard link). Sign-in and the OAuth callback redirect
  // to /dashboard explicitly on their own, so nothing relied on this hop.

  // Protect private routes
  // Cron routes authenticate with their own CRON_SECRET Bearer token. They
  // must reach the route handler even when there is no Supabase user session.
  if (!claims && isProtectedRoute(pathname) && !isPublicRoute(pathname)) {
    const demoOrigin = getDemoAppOrigin()
    const requestOrigin = getRequestOrigin(request)
    const url = requestOrigin === demoOrigin?.origin
      ? new URL('/demo/entry', demoOrigin)
      : request.nextUrl.clone()
    if (requestOrigin !== demoOrigin?.origin) {
      url.pathname = '/'
      url.search = ''
      url.searchParams.set('auth', 'login')
    }
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
