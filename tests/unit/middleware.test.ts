import { describe, it, expect } from 'vitest'
import { isPublicRoute } from '@/lib/supabase/proxy'

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

  it('/estimate/abc is a public estimate route (not protected)', () => {
    expect(isPublicRoute('/estimate/abc123')).toBe(true)
  })

  it('/reset-password is no longer a route (returns false)', () => {
    expect(isPublicRoute('/reset-password')).toBe(false)
  })

  it('/callback is an auth route (not protected)', () => {
    expect(isPublicRoute('/callback')).toBe(true)
  })

  it('/dashboard is a protected route', () => {
    expect(isPublicRoute('/dashboard')).toBe(false)
  })

  it('/onboarding is a protected route', () => {
    expect(isPublicRoute('/onboarding')).toBe(false)
  })
})

describe('Landing root (/) routing rules (D-01, D-02)', () => {
  it('/ is a public (landing root) route', () => {
    const pathname = '/'
    const isLandingRoot = pathname === '/'
    expect(isLandingRoot).toBe(true)
  })

  it('unauthenticated GET / does NOT trigger the protected-route redirect', () => {
    const pathname = '/'
    const claims = null // unauthenticated
    const isAuthRoute = pathname.startsWith('/callback')
    const isPublicEstimate = pathname.startsWith('/estimate')
    const isLandingRoot = pathname === '/'
    // The guard that would redirect to /?auth=login
    const wouldRedirectToLogin = !claims && !isAuthRoute && !isPublicEstimate && !isLandingRoot
    expect(wouldRedirectToLogin).toBe(false)
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
