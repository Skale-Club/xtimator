import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/queries/auth', () => ({ getAuthClaims: vi.fn() }))
vi.mock('@/lib/queries/active-company', () => ({ getActiveCompanyId: vi.fn() }))
vi.mock('@/lib/auth/require-company-role', () => ({ requireCompanyOwner: vi.fn() }))
vi.mock('@/lib/supabase/service', () => ({ requireServiceClient: vi.fn() }))
vi.mock('@/lib/platform-config', () => ({ getIntegrationKey: vi.fn() }))
vi.mock('@/lib/billing/connect-oauth', () => ({ deauthorize: vi.fn() }))
vi.mock('@/lib/demo/guard', () => ({ demoGuardResponse: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

const { getAuthClaims } = await import('@/lib/queries/auth')
const { getActiveCompanyId } = await import('@/lib/queries/active-company')
const { requireCompanyOwner } = await import('@/lib/auth/require-company-role')
const { requireServiceClient } = await import('@/lib/supabase/service')
const { getIntegrationKey } = await import('@/lib/platform-config')
const { demoGuardResponse } = await import('@/lib/demo/guard')
const { POST } = await import('@/app/api/stripe/connect/disconnect/route')

function mockService(updateError: { message: string } | null) {
  const update = vi.fn()
  const from = vi.fn(() => {
    const q = {
      select: vi.fn(() => q),
      eq: vi.fn(() => q),
      single: vi.fn().mockResolvedValue({ data: { id: 'c1', stripe_account_id: 'acct_test_123' } }),
      update: (...a: unknown[]) => {
        update(...a)
        return { eq: vi.fn().mockResolvedValue({ error: updateError }) }
      },
    }
    return q
  })
  vi.mocked(requireServiceClient).mockReturnValue({ from } as never)
  return update
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getAuthClaims).mockResolvedValue({ sub: 'u1' } as never)
  vi.mocked(demoGuardResponse).mockResolvedValue(null)
  vi.mocked(getActiveCompanyId).mockResolvedValue('c1')
  vi.mocked(requireCompanyOwner).mockResolvedValue({} as never)
  vi.mocked(getIntegrationKey).mockResolvedValue(null)
})

const req = () => new NextRequest('http://localhost/api/stripe/connect/disconnect', { method: 'POST' })

describe('POST /api/stripe/connect/disconnect', () => {
  it('clears the account and both health columns', async () => {
    const update = mockService(null)
    const res = await POST(req())
    expect(res.status).toBe(200)
    expect(update).toHaveBeenCalledWith({
      stripe_account_id: null,
      stripe_connect_status: 'disconnected',
      stripe_charges_enabled: null,
      stripe_connect_disabled_reason: null,
    })
  })

  it('returns a non-ok response when the update fails', async () => {
    mockService({ message: 'boom' })
    const res = await POST(req())
    expect(res.status).toBe(500)
    expect((await res.json()).ok).toBe(false)
  })
})
