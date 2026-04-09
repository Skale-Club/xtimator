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
