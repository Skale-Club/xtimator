import { describe, it, expect, vi, beforeEach } from 'vitest'

// unstable_cache wraps the function — make it a passthrough so the inner fn is testable
vi.mock('next/cache', () => ({
  unstable_cache: (fn: (...args: unknown[]) => unknown) => fn,
  revalidateTag: vi.fn(),
  revalidatePath: vi.fn(),
}))

describe('getAuthClaims', () => {
  beforeEach(() => { vi.resetModules() })

  it('returns null when no claims data', async () => {
    vi.doMock('@/lib/supabase/server', () => ({
      createClient: vi.fn().mockResolvedValue({
        auth: { getClaims: vi.fn().mockResolvedValue({ data: null }) },
      }),
    }))
    const { getAuthClaims } = await import('@/lib/queries/auth')
    const result = await getAuthClaims()
    expect(result).toBeNull()
  })
})

describe('getCachedCompany', () => {
  beforeEach(() => { vi.resetModules() })

  it('returns null when company not found', async () => {
    vi.doMock('@/lib/supabase/server', () => ({
      createClient: vi.fn().mockResolvedValue({
        from: vi.fn(() => ({
          select: vi.fn(() => ({
            eq: vi.fn(() => ({ single: vi.fn().mockResolvedValue({ data: null }) })),
          })),
        })),
      }),
    }))
    const { getCachedCompany } = await import('@/lib/queries/auth')
    const result = await getCachedCompany('user-123')
    expect(result).toBeNull()
  })

  it('returns company when found', async () => {
    const mockCompany = { id: 'co-1', name: 'Acme', logo_url: null, owner_name: 'Bob', theme_preference: 'dark', industry: null }
    vi.doMock('@/lib/supabase/server', () => ({
      createClient: vi.fn().mockResolvedValue({
        from: vi.fn(() => ({
          select: vi.fn(() => ({
            eq: vi.fn(() => ({ single: vi.fn().mockResolvedValue({ data: mockCompany }) })),
          })),
        })),
      }),
    }))
    const { getCachedCompany } = await import('@/lib/queries/auth')
    const result = await getCachedCompany('user-123')
    expect(result).toMatchObject({ id: 'co-1', name: 'Acme' })
  })
})
