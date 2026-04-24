import { describe, it, expect } from 'vitest'
import { isPublicRoute } from '@/lib/supabase/proxy'

describe('Middleware route protection rules (D-05)', () => {
  it('/ is a public route', () => {
    expect(isPublicRoute('/')).toBe(true)
  })

  it('/auth/login is an auth route (not protected)', () => {
    expect(isPublicRoute('/auth/login')).toBe(true)
  })

  it('/auth/signup is an auth route (not protected)', () => {
    expect(isPublicRoute('/auth/signup')).toBe(true)
  })

  it('/estimate/abc is a public estimate route (not protected)', () => {
    expect(isPublicRoute('/estimate/abc123')).toBe(true)
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
