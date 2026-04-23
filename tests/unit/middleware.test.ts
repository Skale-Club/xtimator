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
