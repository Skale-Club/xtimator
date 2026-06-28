import { describe, expect, it } from 'vitest'
import { isProtectedRoute, isPublicRoute } from '@/middleware'

describe('cron middleware authentication boundary', () => {
  it.each([
    '/api/cron/expire-trials',
    '/api/cron/cleanup-orphan-projects',
    '/api/cron/cleanup-whatsapp-sessions',
    '/api/cron/trial-warning-emails',
  ])('allows %s to reach route-level CRON_SECRET authentication', (pathname) => {
    expect(isProtectedRoute(pathname)).toBe(true)
    expect(isPublicRoute(pathname)).toBe(true)
  })

  it('does not expose similarly prefixed non-cron API routes', () => {
    expect(isProtectedRoute('/api/cron-admin')).toBe(true)
    expect(isPublicRoute('/api/cron-admin')).toBe(false)
  })

  it('keeps ordinary API routes behind the Supabase session guard', () => {
    expect(isProtectedRoute('/api/private-resource')).toBe(true)
    expect(isPublicRoute('/api/private-resource')).toBe(false)
  })
})
