import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Phase 193-02 — setEstimateSharePassword (lib/actions/estimate.ts).
 *
 * Covers: auth failure, demo-tenant denial (assertCompanyWritable), password
 * length validation, hashing (never stores plaintext), removal (null clears
 * both columns), and the cross-company / not-found no-op path. Mirrors the
 * getAuthContext mocking style of tests/unit/actions/estimate-lock-guard.test.ts.
 */

const getActiveCompanyId = vi.fn()
vi.mock('@/lib/queries/active-company', () => ({
  getActiveCompanyId: (...args: unknown[]) => getActiveCompanyId(...args),
}))

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/integrations/xphere/dispatch', () => ({ dispatchXphereSync: vi.fn() }))

const mockAssertCompanyWritable = vi.fn()
vi.mock('@/lib/demo/guard', () => ({
  assertWritable: vi.fn().mockResolvedValue(null),
  assertCompanyWritable: (...args: unknown[]) => mockAssertCompanyWritable(...args),
}))

const fromImpl = vi.fn()
let updateEqMock: ReturnType<typeof vi.fn>
let updateCompanyEqMock: ReturnType<typeof vi.fn>
let updatePayload: Record<string, unknown> | null = null
let updateReturnsRows: Record<string, unknown>[] | null = [{ id: 'est_1' }]
let claims: { sub: string } | null = { sub: 'u_1' }

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn().mockResolvedValue({
    auth: { getClaims: vi.fn().mockImplementation(() => Promise.resolve({ data: { claims } })) },
    from: (t: string) => fromImpl(t),
  }),
}))

function configureSupabase() {
  updatePayload = null
  const selectMock = vi.fn().mockResolvedValue({ data: updateReturnsRows, error: null })
  // .update(...).eq('id', ...).eq('company_id', ...).select('id') — two
  // chained .eq() calls, the second of which exposes .select().
  updateCompanyEqMock = vi.fn().mockReturnValue({ select: selectMock })
  updateEqMock = vi.fn().mockReturnValue({ eq: updateCompanyEqMock })

  fromImpl.mockImplementation((table: string) => {
    if (table === 'companies') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { id: 'co_1', currency_code: 'usd', default_tax_rate: 0 },
              error: null,
            }),
          }),
        }),
      }
    }
    if (table === 'estimates') {
      return {
        update: vi.fn().mockImplementation((payload: Record<string, unknown>) => {
          updatePayload = payload
          return { eq: updateEqMock }
        }),
      }
    }
    throw new Error(`Unexpected table: ${table}`)
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.resetModules()
  getActiveCompanyId.mockResolvedValue('co_1')
  mockAssertCompanyWritable.mockResolvedValue(null)
  claims = { sub: 'u_1' }
  updateReturnsRows = [{ id: 'est_1' }]
  configureSupabase()
})

describe('setEstimateSharePassword', () => {
  it('rejects an invalid estimateId before touching auth', async () => {
    const { setEstimateSharePassword } = await import('@/lib/actions/estimate')
    const result = await setEstimateSharePassword('', 'validpass')
    expect(result).toEqual({ success: false, error: 'Invalid estimate id' })
    expect(fromImpl).not.toHaveBeenCalled()
  })

  it('returns the auth error when unauthenticated', async () => {
    claims = null
    const { setEstimateSharePassword } = await import('@/lib/actions/estimate')
    const result = await setEstimateSharePassword('est_1', 'validpass')
    expect(result.success).toBe(false)
    expect(result.error).toBe('Not authenticated')
  })

  it('demo tenant: assertCompanyWritable denies -> no update call', async () => {
    mockAssertCompanyWritable.mockResolvedValue({ error: 'This is a read-only demo. Create a free account to make changes.' })
    const { setEstimateSharePassword } = await import('@/lib/actions/estimate')

    const result = await setEstimateSharePassword('est_1', 'validpass')

    expect(result.success).toBe(false)
    expect(mockAssertCompanyWritable).toHaveBeenCalledWith('co_1')
    expect(fromImpl).not.toHaveBeenCalledWith('estimates')
  })

  it('rejects a password shorter than the minimum (4 chars, trimmed)', async () => {
    const { setEstimateSharePassword } = await import('@/lib/actions/estimate')
    const result = await setEstimateSharePassword('est_1', '  ab  ')
    expect(result.success).toBe(false)
    expect(result.error).toMatch(/between 4 and 72/)
    expect(updatePayload).toBeNull()
  })

  it('rejects a password longer than the maximum (72 chars)', async () => {
    const { setEstimateSharePassword } = await import('@/lib/actions/estimate')
    const result = await setEstimateSharePassword('est_1', 'x'.repeat(73))
    expect(result.success).toBe(false)
    expect(updatePayload).toBeNull()
  })

  it('sets a valid password: hashes it (salt$hash shape, never the plaintext) and stamps share_password_set_at', async () => {
    const { setEstimateSharePassword } = await import('@/lib/actions/estimate')
    const result = await setEstimateSharePassword('est_1', 'correct horse battery')

    expect(result).toEqual({ success: true })
    expect(updatePayload).not.toBeNull()
    const hash = updatePayload!.share_password_hash as string
    expect(hash).not.toContain('correct horse battery')
    expect(hash.split('$')).toHaveLength(2)
    expect(typeof updatePayload!.share_password_set_at).toBe('string')
    expect(updateEqMock).toHaveBeenCalledWith('id', 'est_1')
    expect(updateCompanyEqMock).toHaveBeenCalledWith('company_id', 'co_1')
  })

  it('removing a password (null) clears both columns', async () => {
    const { setEstimateSharePassword } = await import('@/lib/actions/estimate')
    const result = await setEstimateSharePassword('est_1', null)

    expect(result).toEqual({ success: true })
    expect(updatePayload).toEqual({ share_password_hash: null, share_password_set_at: null })
  })

  it('cross-company / not-found: the update matches zero rows -> generic failure', async () => {
    updateReturnsRows = []
    configureSupabase()
    const { setEstimateSharePassword } = await import('@/lib/actions/estimate')

    const result = await setEstimateSharePassword('est_1', 'validpass')

    expect(result.success).toBe(false)
    expect(result.error).toBe('Failed to update the estimate password.')
  })
})
