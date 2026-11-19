import { describe, it, expect, vi, beforeEach } from 'vitest'
import { isConnectOnboardingOpen } from '@/lib/billing/connect-availability'

/**
 * Launch decision 2026-11-19: Xtimator launches with Stripe Connect onboarding
 * closed. This pins the switch so it is flipped deliberately, and checks that
 * the initiate route refuses to start OAuth while it is closed.
 */
describe('Stripe Connect launch switch', () => {
  it('is closed at launch', () => {
    expect(isConnectOnboardingOpen()).toBe(false)
  })
})

const mintOAuthState = vi.fn()
const getIntegrationKey = vi.fn()
const rateLimit = vi.fn()

vi.mock('@/lib/queries/auth', () => ({ getAuthClaims: vi.fn(async () => ({ sub: 'user_1' })) }))
vi.mock('@/lib/queries/active-company', () => ({ getActiveCompanyId: vi.fn(async () => 'company_1') }))
vi.mock('@/lib/auth/require-company-role', () => ({ requireCompanyOwner: vi.fn(async () => undefined) }))
vi.mock('@/lib/demo/guard', () => ({ demoGuardResponse: vi.fn(async () => null) }))
vi.mock('@/lib/platform-config', () => ({ getIntegrationKey: (...a: unknown[]) => getIntegrationKey(...a) }))
vi.mock('@/lib/billing/connect-oauth', () => ({
  mintOAuthState: (...a: unknown[]) => mintOAuthState(...a),
  buildAuthorizeUrl: vi.fn(),
}))
vi.mock('@/lib/ratelimit', () => ({ rateLimit: (...a: unknown[]) => rateLimit(...a) }))
vi.mock('@/lib/supabase/service', () => ({ requireServiceClient: vi.fn() }))
vi.mock('next/headers', () => ({ cookies: vi.fn(async () => ({ set: vi.fn() })) }))

describe('GET /api/stripe/connect/initiate while onboarding is closed', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('redirects back to settings without starting OAuth', async () => {
    const { GET } = await import('@/app/api/stripe/connect/initiate/route')
    const res = await (GET as unknown as (r: Request) => Promise<Response>)(
      new Request('https://xtimator.com/api/stripe/connect/initiate'),
    )
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toContain('/settings/integrations/stripe?error=platform_not_configured')
    expect(mintOAuthState).not.toHaveBeenCalled()
    expect(getIntegrationKey).not.toHaveBeenCalled()
    expect(rateLimit).not.toHaveBeenCalled()
  })
})
