import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type { NextRequest } from 'next/server'

/**
 * Mocks for the two Supabase entry points consumed by admin-gate.ts and admin-context.ts.
 *
 * - `@supabase/ssr.createServerClient` is the cookie-bound client used by checkPlatformAdmin
 *   (exercises only `auth.getClaims()`).
 * - `@/lib/supabase/server.createClient` is the cookie-bound client used by getAdminContext
 *   (exercises `auth.getClaims()`).
 * - `@/lib/supabase/service.createServiceClient` is the service-role client used by BOTH
 *   to query `platform_admins` (chainable: from().select().eq().maybeSingle()).
 *
 * The factory exports vi.fn() stubs that each test overrides with mockReturnValue.
 */

vi.mock('@supabase/ssr', () => ({
  createServerClient: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  notFound: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND')
  }),
}))

/** Builds a chainable Supabase mock whose terminal call resolves to `response`. */
function makeServiceClient(response: { data: unknown; error?: unknown }) {
  const terminal = vi.fn().mockResolvedValue(response)
  const chain: Record<string, unknown> = {
    single: terminal,
    maybeSingle: terminal,
  }
  chain.from = vi.fn().mockReturnValue(chain)
  chain.select = vi.fn().mockReturnValue(chain)
  chain.eq = vi.fn().mockReturnValue(chain)
  return chain
}

/** Builds a fake SSR client whose `auth.getClaims()` resolves to the given claims object. */
function makeSsrClient(claims: { sub?: string; email?: string } | null) {
  return {
    auth: {
      getClaims: vi.fn().mockResolvedValue({ data: claims ? { claims } : null }),
    },
  }
}

/** Minimal NextRequest stub — admin-gate only reads `request.cookies.getAll()`. */
function makeRequest(): NextRequest {
  return {
    cookies: {
      getAll: () => [],
    },
  } as unknown as NextRequest
}

describe('lib/supabase/admin-gate (ADMIN-01)', () => {
  beforeEach(() => {
    vi.resetModules()
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co'
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key'
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns true when SSR session has a sub AND platform_admins row exists', async () => {
    const ssrModule = await import('@supabase/ssr')
    ;(ssrModule.createServerClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
      makeSsrClient({ sub: 'user-A', email: 'a@example.com' })
    )

    const svcModule = await import('@/lib/supabase/service')
    ;(svcModule.createServiceClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
      makeServiceClient({ data: { user_id: 'user-A' }, error: null })
    )

    const { checkPlatformAdmin } = await import('@/lib/supabase/admin-gate')
    const result = await checkPlatformAdmin(makeRequest())
    expect(result).toBe(true)
  })

  it('returns false (no throw) when SSR session has no sub', async () => {
    const ssrModule = await import('@supabase/ssr')
    ;(ssrModule.createServerClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
      makeSsrClient(null)
    )

    const { checkPlatformAdmin } = await import('@/lib/supabase/admin-gate')
    const result = await checkPlatformAdmin(makeRequest())
    expect(result).toBe(false)
  })

  it('returns false when SSR session valid but platform_admins lookup returns null', async () => {
    const ssrModule = await import('@supabase/ssr')
    ;(ssrModule.createServerClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
      makeSsrClient({ sub: 'user-B', email: 'b@example.com' })
    )

    const svcModule = await import('@/lib/supabase/service')
    ;(svcModule.createServiceClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
      makeServiceClient({ data: null, error: null })
    )

    const { checkPlatformAdmin } = await import('@/lib/supabase/admin-gate')
    const result = await checkPlatformAdmin(makeRequest())
    expect(result).toBe(false)
  })
})

describe('lib/auth/admin-context (ADMIN-01)', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('getAdminContext() returns { userId, email } on positive admin lookup', async () => {
    const serverModule = await import('@/lib/supabase/server')
    ;(serverModule.createClient as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeSsrClient({ sub: 'admin-1', email: 'admin@example.com' })
    )

    const svcModule = await import('@/lib/supabase/service')
    ;(svcModule.createServiceClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
      makeServiceClient({ data: { user_id: 'admin-1' }, error: null })
    )

    const { getAdminContext } = await import('@/lib/auth/admin-context')
    const ctx = await getAdminContext()
    expect(ctx).toEqual({ userId: 'admin-1', email: 'admin@example.com' })
  })

  it('getAdminContext() returns null when no claims', async () => {
    const serverModule = await import('@/lib/supabase/server')
    ;(serverModule.createClient as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeSsrClient(null)
    )

    const { getAdminContext } = await import('@/lib/auth/admin-context')
    const ctx = await getAdminContext()
    expect(ctx).toBeNull()
  })

  it('getAdminContext() returns null when user is not in platform_admins', async () => {
    const serverModule = await import('@/lib/supabase/server')
    ;(serverModule.createClient as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeSsrClient({ sub: 'user-X', email: 'x@example.com' })
    )

    const svcModule = await import('@/lib/supabase/service')
    ;(svcModule.createServiceClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
      makeServiceClient({ data: null, error: null })
    )

    const { getAdminContext } = await import('@/lib/auth/admin-context')
    const ctx = await getAdminContext()
    expect(ctx).toBeNull()
  })

  it('requireAdmin() calls notFound() when getAdminContext returns null', async () => {
    const serverModule = await import('@/lib/supabase/server')
    ;(serverModule.createClient as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeSsrClient(null)
    )

    const navModule = await import('next/navigation')
    const notFoundSpy = navModule.notFound as unknown as ReturnType<typeof vi.fn>

    const { requireAdmin } = await import('@/lib/auth/admin-context')
    await expect(requireAdmin()).rejects.toThrow('NEXT_NOT_FOUND')
    expect(notFoundSpy).toHaveBeenCalled()
  })
})
