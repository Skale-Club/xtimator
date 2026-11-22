import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * GET /api/stripe/connect/initiate is gated by the company feature resolver:
 * platform switch (and global stop), tenant switch, and "already linked" are
 * all refused/short-circuited BEFORE the rate limit, the OAuth state and any
 * Stripe URL.
 */

const mintOAuthState = vi.fn()
const getIntegrationKey = vi.fn()
const rateLimit = vi.fn()
const single = vi.fn()
const getPlatformFeatureState = vi.fn()

vi.mock('@/lib/queries/auth', () => ({ getAuthClaims: vi.fn(async () => ({ sub: 'user_1' })) }))
vi.mock('@/lib/queries/active-company', () => ({ getActiveCompanyId: vi.fn(async () => 'company_1') }))
vi.mock('@/lib/auth/require-company-role', () => ({ requireCompanyOwner: vi.fn(async () => undefined) }))
vi.mock('@/lib/demo/guard', () => ({ demoGuardResponse: vi.fn(async () => null) }))
vi.mock('@/lib/platform-config', () => ({ getIntegrationKey: (...a: unknown[]) => getIntegrationKey(...a) }))
vi.mock('@/lib/billing/connect-oauth', () => ({
  mintOAuthState: (...a: unknown[]) => mintOAuthState(...a),
  buildAuthorizeUrl: vi.fn(() => 'https://connect.stripe.com/oauth/authorize?state=s'),
}))
vi.mock('@/lib/ratelimit', () => ({ rateLimit: (...a: unknown[]) => rateLimit(...a) }))
vi.mock('@/lib/features/platform-feature-state', () => ({
  getPlatformFeatureState: (...a: unknown[]) => getPlatformFeatureState(...a),
}))
vi.mock('@/lib/supabase/service', () => ({
  requireServiceClient: () => ({
    from: () => ({ select: () => ({ eq: () => ({ single }) }) }),
  }),
}))
vi.mock('next/headers', () => ({ cookies: vi.fn(async () => ({ set: vi.fn() })) }))

const ready = { id: 'company_1', email: 'o@example.com', online_payments_allowed: true, online_payments_enabled: true }

async function call(): Promise<Response> {
  const { GET } = await import('@/app/api/stripe/connect/initiate/route')
  return (GET as unknown as (r: Request) => Promise<Response>)(
    new Request('https://xtimator.com/api/stripe/connect/initiate'),
  )
}

function expectStopped() {
  expect(rateLimit).not.toHaveBeenCalled()
  expect(mintOAuthState).not.toHaveBeenCalled()
  expect(getIntegrationKey).not.toHaveBeenCalled()
}

beforeEach(() => {
  vi.clearAllMocks()
  getPlatformFeatureState.mockResolvedValue({ connectPaymentsOpen: true })
  rateLimit.mockResolvedValue({ allowed: true })
  getIntegrationKey.mockResolvedValue('ca_test')
  mintOAuthState.mockReturnValue('signed-state')
  single.mockResolvedValue({ data: { ...ready, stripe_account_id: null }, error: null })
})

describe('GET /api/stripe/connect/initiate feature gate', () => {
  it('redirects to payments_not_available when the platform switch is off', async () => {
    single.mockResolvedValue({ data: { ...ready, online_payments_allowed: false }, error: null })
    const res = await call()
    expect(res.headers.get('location')).toContain('/settings/client-actions?error=payments_not_available')
    expectStopped()
  })

  it('redirects to payments_not_available when the global stop is closed', async () => {
    getPlatformFeatureState.mockResolvedValue({ connectPaymentsOpen: false })
    const res = await call()
    expect(res.headers.get('location')).toContain('/settings/client-actions?error=payments_not_available')
    expectStopped()
  })

  it('redirects to payments_off when the tenant switch is off', async () => {
    single.mockResolvedValue({ data: { ...ready, online_payments_enabled: false }, error: null })
    const res = await call()
    expect(res.headers.get('location')).toContain('/settings/client-actions?error=payments_off')
    expectStopped()
  })

  it('redirects with connected=1 when an account is already linked', async () => {
    single.mockResolvedValue({ data: { ...ready, stripe_account_id: 'acct_test_123' }, error: null })
    const res = await call()
    expect(res.headers.get('location')).toContain('/settings/client-actions?connected=1')
    expectStopped()
  })

  it('starts OAuth when allowed, enabled and not linked', async () => {
    const res = await call()
    expect(res.headers.get('location')).toContain('connect.stripe.com/oauth/authorize')
    expect(rateLimit).toHaveBeenCalledOnce()
    expect(mintOAuthState).toHaveBeenCalledWith('company_1')
  })
})
