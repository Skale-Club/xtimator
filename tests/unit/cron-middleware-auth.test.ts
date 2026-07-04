import { describe, expect, it } from 'vitest'
import { isProtectedRoute, isPublicRoute } from '@/proxy'

describe('cron middleware authentication boundary', () => {
  it.each([
    '/api/cron/cleanup-orphan-projects',
    '/api/cron/cleanup-whatsapp-sessions',
  ])('allows %s to reach route-level CRON_SECRET authentication', (pathname) => {
    expect(isProtectedRoute(pathname)).toBe(true)
    expect(isPublicRoute(pathname)).toBe(true)
  })

  it('allows /api/inngest to reach the signature-verified serve handler', () => {
    // Inngest authenticates via X-Inngest-Signature (INNGEST_SIGNING_KEY), not a
    // Supabase session. If this regresses, every background job silently stops.
    expect(isProtectedRoute('/api/inngest')).toBe(true)
    expect(isPublicRoute('/api/inngest')).toBe(true)
    expect(isPublicRoute('/api/inngest/')).toBe(true)
  })

  it('does not expose similarly prefixed non-cron API routes', () => {
    expect(isProtectedRoute('/api/cron-admin')).toBe(true)
    expect(isPublicRoute('/api/cron-admin')).toBe(false)
    // Guard against an over-broad inngest match leaking a lookalike route.
    expect(isPublicRoute('/api/inngest-admin')).toBe(false)
  })

  it('keeps ordinary API routes behind the Supabase session guard', () => {
    expect(isProtectedRoute('/api/private-resource')).toBe(true)
    expect(isPublicRoute('/api/private-resource')).toBe(false)
  })
})
