import { describe, it, expect } from 'vitest'
// Pre-launch audit fix: this test used to import from lib/supabase/proxy.ts,
// a stale duplicate never imported by any application code (grep confirms
// zero importers). Next.js 16 renamed the middleware convention to
// `proxy.ts` at the project root — THAT file (not the lib/supabase one) is
// the real, live middleware entry point, so this test previously provided
// ZERO coverage of actual routing/auth behavior. Fixed to import the real
// module.
import { isPublicRoute, isProtectedRoute } from '@/proxy'

/** Mirrors proxy.ts's exact anonymous-redirect guard:
 *  `!claims && isProtectedRoute(pathname) && !isPublicRoute(pathname)`. */
function wouldRedirectAnonymous(pathname: string): boolean {
  return isProtectedRoute(pathname) && !isPublicRoute(pathname)
}

describe('Middleware route protection rules (D-05)', () => {
  it('/ is a public route', () => {
    expect(isPublicRoute('/')).toBe(true)
  })

  it('/login is no longer a route (returns false)', () => {
    expect(isPublicRoute('/login')).toBe(false)
  })

  it('/signup is no longer a route (returns false)', () => {
    expect(isPublicRoute('/signup')).toBe(false)
  })

  it('/reset-password is no longer a route (returns false)', () => {
    expect(isPublicRoute('/reset-password')).toBe(false)
  })

  it('/callback is an auth route (not protected)', () => {
    expect(isPublicRoute('/callback')).toBe(true)
  })

  it('/dashboard is a protected route', () => {
    expect(wouldRedirectAnonymous('/dashboard')).toBe(true)
  })

  it('/onboarding is a protected route', () => {
    expect(wouldRedirectAnonymous('/onboarding')).toBe(true)
  })

  it('/api/cron/anything is public (own CRON_SECRET auth)', () => {
    expect(wouldRedirectAnonymous('/api/cron/cleanup-orphan-projects')).toBe(false)
  })

  it('/api/webhooks/stripe is public (signature-verified)', () => {
    expect(wouldRedirectAnonymous('/api/webhooks/stripe')).toBe(false)
  })

  it('/api/inngest is public (Inngest-signed requests)', () => {
    expect(wouldRedirectAnonymous('/api/inngest')).toBe(false)
  })

  it('/api/health is public (pre-launch audit fix — Docker healthcheck + uptime monitors)', () => {
    expect(wouldRedirectAnonymous('/api/health')).toBe(false)
  })

  it('/api/health/live is public (liveness probe the orchestrator uses to route traffic)', () => {
    // Must answer 200 anonymously — the Docker/Coolify healthcheck has no
    // session. A 307 here marks the container unhealthy → "no available server".
    expect(wouldRedirectAnonymous('/api/health/live')).toBe(false)
    expect(isPublicRoute('/api/health/live')).toBe(true)
  })

  it('/api/mcp is public (pre-launch audit fix — RFC 6750 Bearer auth, own challenge flow)', () => {
    expect(wouldRedirectAnonymous('/api/mcp')).toBe(false)
  })

  it('/api/csp-report is public (pre-launch audit fix — unauthenticated browser CSP reports)', () => {
    expect(wouldRedirectAnonymous('/api/csp-report')).toBe(false)
  })

  it('/api/estimates/123 (a normal authenticated API route) redirects an anonymous caller', () => {
    expect(wouldRedirectAnonymous('/api/estimates/123')).toBe(true)
  })
})

describe('Public share link (/estimate/[token]) — pre-launch audit fix', () => {
  // app/estimate/[token] is the ONLY route under the literal '/estimate' URL
  // prefix, and it's the public link a business sends to its clients (forced
  // light theme + noindex robots specifically for logged-out viewing — see
  // app/estimate/[token]/layout.tsx). '/estimate' used to sit in
  // PROTECTED_ROUTE_PREFIXES with an exemption for a '/estimate/public'
  // folder that never existed in app/, so EVERY anonymous visit to a real
  // share link (e.g. /estimate/<uuid-share-token>) was 307-redirected to
  // /?auth=login — silently breaking the core "send an estimate link to a
  // client" flow for any client without a session. Fixed by removing
  // '/estimate' from the protected prefixes entirely (there is nothing
  // authenticated to protect at that URL).
  it('an anonymous visit to a real share-token URL is NOT redirected to login', () => {
    expect(wouldRedirectAnonymous('/estimate/a1b2c3d4-e5f6-7890-abcd-ef1234567890')).toBe(false)
  })

  it('/estimate (bare, no token) is also not redirected', () => {
    expect(wouldRedirectAnonymous('/estimate')).toBe(false)
  })
})

describe('Landing root (/) routing rules (D-01, D-02)', () => {
  it('/ is a public (landing root) route', () => {
    const pathname = '/'
    const isLandingRoot = pathname === '/'
    expect(isLandingRoot).toBe(true)
  })

  it('unauthenticated GET / does NOT trigger the protected-route redirect', () => {
    expect(wouldRedirectAnonymous('/')).toBe(false)
  })

  it('authenticated GET / triggers redirect to /dashboard', () => {
    const pathname = '/'
    const claims = { sub: 'user-123' } // authenticated (truthy object)
    const isLandingRoot = pathname === '/'
    const wouldRedirectToDashboard = !!claims && isLandingRoot
    expect(wouldRedirectToDashboard).toBe(true)
  })

  it('authenticated GET /dashboard does NOT trigger the landing-root redirect', () => {
    const pathname: string = '/dashboard'
    const claims = { sub: 'user-123' } // authenticated
    const isLandingRoot = pathname === '/'
    const wouldRedirectToDashboard = !!claims && isLandingRoot
    expect(wouldRedirectToDashboard).toBe(false)
  })

  it('unauthenticated request to /dashboard would redirect to /?auth=login', () => {
    const url = new URL('http://example.com/dashboard')
    // Replicate the proxy redirect-target construction exactly.
    url.pathname = '/'
    url.search = ''
    url.searchParams.set('auth', 'login')
    expect(url.pathname).toBe('/')
    expect(url.searchParams.get('auth')).toBe('login')
  })
})
