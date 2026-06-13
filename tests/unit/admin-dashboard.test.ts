import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('@/lib/auth/admin-context', () => ({ requireAdmin: vi.fn() }))
vi.mock('@/lib/supabase/service', () => {
  // Alias both exports to one spy (product uses requireServiceClient).
  const client = vi.fn()
  return { createServiceClient: client, requireServiceClient: client }
})
vi.mock('server-only', () => ({}))

// Helper to build a chainable Supabase-like spy
type ChainSpy = {
  from: ReturnType<typeof vi.fn>
  select: ReturnType<typeof vi.fn>
  gte: ReturnType<typeof vi.fn>
  rpc: ReturnType<typeof vi.fn>
}

function makeServiceClient(opts: {
  companiesCount?: number | null
  estimatesCount?: number | null
  userCountData?: number | null
  companiesError?: boolean
  estimatesError?: boolean
  userCountError?: boolean
}): ChainSpy {
  const {
    companiesCount = 5,
    estimatesCount = 12,
    userCountData = 20,
    companiesError = false,
    estimatesError = false,
    userCountError = false,
  } = opts

  // .from('companies').select('*', { count: 'exact', head: true })
  // .from('estimates').select('*', { count: 'exact', head: true }).gte(...)
  // .rpc('get_platform_user_count')

  const gte = vi.fn().mockResolvedValue({
    count: estimatesError ? null : estimatesCount,
    error: estimatesError ? { message: 'db error' } : null,
  })

  const select = vi.fn().mockImplementation((cols: string, opts?: { head?: boolean }) => {
    // For estimates query we need .gte() chained; for companies query we resolve directly
    if (opts?.head) {
      // Return a thenable that also has .gte()
      const companiesResult = Promise.resolve({
        count: companiesError ? null : companiesCount,
        error: companiesError ? { message: 'db error' } : null,
      })
      // Attach .gte to the promise so the estimates query can chain
      Object.assign(companiesResult, { gte })
      return companiesResult
    }
    return { gte }
  })

  const from = vi.fn().mockReturnValue({ select })

  const rpc = vi.fn().mockResolvedValue({
    data: userCountError ? null : userCountData,
    error: userCountError ? { message: 'rpc error' } : null,
  })

  return { from, select, gte, rpc }
}

describe('admin dashboard stats (DASH-01)', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('returns totalCompanies count from companies table', async () => {
    const spy = makeServiceClient({ companiesCount: 7 })
    const { createServiceClient } = await import('@/lib/supabase/service')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(createServiceClient).mockReturnValue(spy as unknown as ReturnType<typeof createServiceClient>)

    const { getPlatformStats } = await import('@/lib/queries/admin-stats')
    const result = await getPlatformStats()

    expect(result.totalCompanies).toBe(7)
    expect(spy.from).toHaveBeenCalledWith('companies')
  })

  it('returns totalUsers from get_platform_user_count RPC', async () => {
    const spy = makeServiceClient({ userCountData: 42 })
    const { createServiceClient } = await import('@/lib/supabase/service')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(createServiceClient).mockReturnValue(spy as unknown as ReturnType<typeof createServiceClient>)

    const { getPlatformStats } = await import('@/lib/queries/admin-stats')
    const result = await getPlatformStats()

    expect(result.totalUsers).toBe(42)
    expect(spy.rpc).toHaveBeenCalledWith('get_platform_user_count')
  })

  it('returns estimatesLast30d count for estimates within 30 days', async () => {
    const spy = makeServiceClient({ estimatesCount: 99 })
    const { createServiceClient } = await import('@/lib/supabase/service')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(createServiceClient).mockReturnValue(spy as unknown as ReturnType<typeof createServiceClient>)

    const { getPlatformStats } = await import('@/lib/queries/admin-stats')
    const result = await getPlatformStats()

    expect(result.estimatesLast30d).toBe(99)
    expect(spy.from).toHaveBeenCalledWith('estimates')
    expect(spy.gte).toHaveBeenCalledWith('created_at', expect.any(String))
  })

  it('returns zeros when DB errors occur', async () => {
    const spy = makeServiceClient({
      companiesError: true,
      estimatesError: true,
      userCountError: true,
    })
    const { createServiceClient } = await import('@/lib/supabase/service')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(createServiceClient).mockReturnValue(spy as unknown as ReturnType<typeof createServiceClient>)

    const { getPlatformStats } = await import('@/lib/queries/admin-stats')
    const result = await getPlatformStats()

    expect(result.totalCompanies).toBe(0)
    expect(result.totalUsers).toBe(0)
    expect(result.estimatesLast30d).toBe(0)
  })
})
