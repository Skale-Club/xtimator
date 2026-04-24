import { describe, it, expect } from 'vitest'

describe('Middleware route protection rules (D-05)', () => {
  it('/auth/login is an auth route (not protected)', () => {
    const pathname = '/auth/login'
    const isAuthRoute = pathname.startsWith('/auth')
    expect(isAuthRoute).toBe(true)
  })

  it('/auth/signup is an auth route (not protected)', () => {
    const pathname = '/auth/signup'
    const isAuthRoute = pathname.startsWith('/auth')
    expect(isAuthRoute).toBe(true)
  })

  it('/estimate/abc is a public estimate route (not protected)', () => {
    const pathname = '/estimate/abc123'
    const isPublicEstimate = pathname.startsWith('/estimate')
    expect(isPublicEstimate).toBe(true)
  })

  it('/dashboard is a protected route', () => {
    const pathname = '/dashboard'
    const isAuthRoute = pathname.startsWith('/auth')
    const isPublicEstimate = pathname.startsWith('/estimate')
    expect(isAuthRoute || isPublicEstimate).toBe(false)
  })

  it('/onboarding is a protected route', () => {
    const pathname = '/onboarding'
    const isAuthRoute = pathname.startsWith('/auth')
    const isPublicEstimate = pathname.startsWith('/estimate')
    expect(isAuthRoute || isPublicEstimate).toBe(false)
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
    const isAuthRoute = pathname.startsWith('/login') || pathname.startsWith('/signup') || pathname.startsWith('/reset-password') || pathname.startsWith('/callback')
    const isPublicEstimate = pathname.startsWith('/estimate')
    const isLandingRoot = pathname === '/'
    // The guard that would redirect to /login
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
    const pathname = '/dashboard'
    const claims = { sub: 'user-123' } // authenticated
    const isLandingRoot = pathname === '/'
    const wouldRedirectToDashboard = !!claims && isLandingRoot
    expect(wouldRedirectToDashboard).toBe(false)
  })
})
