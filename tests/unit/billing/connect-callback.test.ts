import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest'
import { NextRequest } from 'next/server'

/**
 * Wave 0 tests for the OAuth callback route (`/api/stripe/connect/callback`)
 * shipped in Plan 70-02. Verifies:
 *   - Happy path: valid state + code → exchangeCode invoked → company row
 *     populated → 302 to /settings/client-actions?connected=1.
 *   - Idempotency: when `companies.stripe_account_id` is already set, the
 *     callback MUST NOT call exchangeCode (OAuth codes are single-use; a
 *     second exchange revokes the connection per OAuth 2 spec).
 *   - Invalid state: tampered state → no code exchange → redirect with
 *     error=invalid_state (302 with the error query param, not 400 — the
 *     handler always redirects so the user lands on a useful UI).
 */

beforeAll(() => {
  if (!process.env.APP_ENCRYPTION_KEY) {
    process.env.APP_ENCRYPTION_KEY =
      'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA='
  }
})

// Mock all dependencies BEFORE importing the route module.
vi.mock('@/lib/queries/auth', () => ({
  getAuthClaims: vi.fn(),
}))
// Route now resolves the caller's ACTIVE company (not "any company owned by
// user_id") — bypass the real cookie/RLS-bound resolver entirely.
vi.mock('@/lib/queries/active-company', () => ({
  getActiveCompanyId: vi.fn(),
}))
vi.mock('@/lib/auth/require-company-role', () => ({
  requireCompanyOwner: vi.fn(),
}))
vi.mock('@/lib/supabase/service', () => ({
  requireServiceClient: vi.fn(),
}))
vi.mock('@/lib/billing/connect-oauth', async () => {
  const actual = await vi.importActual<
    typeof import('@/lib/billing/connect-oauth')
  >('@/lib/billing/connect-oauth')
  return {
    ...actual,
    exchangeCode: vi.fn(),
  }
})
vi.mock('@/lib/billing/stripe-client', () => ({
  getStripeClient: vi.fn(),
}))
// Platform-wide global stop; defaults to open.
vi.mock('@/lib/features/platform-feature-state', () => ({
  getPlatformFeatureState: vi.fn(async () => ({ connectPaymentsOpen: true })),
}))

const cookieGetFn = vi.fn()
const cookieDeleteFn = vi.fn()
const cookieSetFn = vi.fn()

vi.mock('next/headers', () => ({
  cookies: vi.fn().mockResolvedValue({
    delete: (...args: unknown[]) => cookieDeleteFn(...args),
    set: (...args: unknown[]) => cookieSetFn(...args),
    get: (...args: unknown[]) => cookieGetFn(...args),
  }),
}))

const { getAuthClaims } = await import('@/lib/queries/auth')
const { getActiveCompanyId } = await import('@/lib/queries/active-company')
const { requireCompanyOwner } = await import(
  '@/lib/auth/require-company-role'
)
const { requireServiceClient } = await import('@/lib/supabase/service')
const { mintOAuthState, exchangeCode } = await import(
  '@/lib/billing/connect-oauth'
)
const { getStripeClient } = await import('@/lib/billing/stripe-client')
const { getPlatformFeatureState } = await import('@/lib/features/platform-feature-state')
const { GET } = await import('@/app/api/stripe/connect/callback/route')

/** Sets the `stripe_oauth_state` cookie the route reads/compares against `state`. */
function setOAuthStateCookie(value: string | undefined) {
  cookieGetFn.mockImplementation((name: string) =>
    name === 'stripe_oauth_state' && value !== undefined ? { value } : undefined
  )
}

function makeSupabaseMock(company: {
  id: string
  stripe_account_id: string | null
  online_payments_allowed?: boolean
  online_payments_enabled?: boolean
}) {
  // Feature switches default ON; individual cases override them.
  company = { online_payments_allowed: true, online_payments_enabled: true, ...company }
  const updateChain = {
    update: vi.fn().mockReturnThis(),
    eq: vi.fn().mockResolvedValue({ data: null, error: null }),
  }
  const selectChain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: company, error: null }),
  }
  return {
    from: vi.fn().mockImplementation(() => {
      // Each call returns a fresh chain whose terminal method picks the right
      // result. We hand both update and select branches via the same proxy.
      return {
        select: selectChain.select.mockReturnValue(selectChain),
        update: updateChain.update.mockReturnValue(updateChain),
      }
    }),
    _selectChain: selectChain,
    _updateChain: updateChain,
  } as never
}

function makeRequest(query: Record<string, string>) {
  const url = new URL('http://localhost/api/stripe/connect/callback')
  for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v)
  return new NextRequest(url)
}

beforeEach(() => {
  vi.clearAllMocks()
  cookieGetFn.mockReturnValue(undefined)
  vi.mocked(getActiveCompanyId).mockResolvedValue('company_abc')
  vi.mocked(requireCompanyOwner).mockResolvedValue({
    userId: 'user_1',
    companyId: 'company_abc',
    role: 'owner',
  } as never)
})

describe('GET /api/stripe/connect/callback', () => {
  it('persists stripe_account_id on happy-path code exchange', async () => {
    const companyId = 'company_abc'
    const state = mintOAuthState(companyId)
    setOAuthStateCookie(state)
    vi.mocked(getAuthClaims).mockResolvedValue({ sub: 'user_1' } as never)
    const supabase = makeSupabaseMock({
      id: companyId,
      stripe_account_id: null,
    })
    vi.mocked(requireServiceClient).mockReturnValue(supabase)
    vi.mocked(exchangeCode).mockResolvedValue({
      stripe_user_id: 'acct_test_123',
      livemode: false,
      scope: 'read_write',
    })
    vi.mocked(getStripeClient).mockResolvedValue({
      accounts: {
        retrieve: vi.fn().mockResolvedValue({
          email: 'biz@example.com',
          business_profile: { name: 'Demo Biz' },
          settings: { dashboard: { display_name: 'Demo Biz' } },
        }),
      },
    } as never)

    const res = await GET(makeRequest({ code: 'ac_test', state }))

    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toContain('connected=1')
    expect(exchangeCode).toHaveBeenCalledOnce()
    expect(exchangeCode).toHaveBeenCalledWith('ac_test')
    // Confirm the update path wrote stripe_account_id
    const { _updateChain } = supabase as unknown as {
      _updateChain: { update: ReturnType<typeof vi.fn> }
    }
    expect(_updateChain.update).toHaveBeenCalledWith(
      expect.objectContaining({
        stripe_account_id: 'acct_test_123',
        stripe_connect_status: 'active',
        stripe_account_email: 'biz@example.com',
        stripe_account_display_name: 'Demo Biz',
      })
    )
  })

  it('is idempotent when callback runs for an already-connected company', async () => {
    const companyId = 'company_abc'
    const state = mintOAuthState(companyId)
    setOAuthStateCookie(state)
    vi.mocked(getAuthClaims).mockResolvedValue({ sub: 'user_1' } as never)
    const supabase = makeSupabaseMock({
      id: companyId,
      stripe_account_id: 'acct_existing',
    })
    vi.mocked(requireServiceClient).mockReturnValue(supabase)

    const res = await GET(makeRequest({ code: 'ac_test', state }))

    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toContain('connected=1')
    // CRITICAL: exchangeCode must NOT be called for already-connected companies.
    expect(exchangeCode).not.toHaveBeenCalled()
  })

  it('redirects with error=invalid_state when state is tampered', async () => {
    const companyId = 'company_abc'
    vi.mocked(getAuthClaims).mockResolvedValue({ sub: 'user_1' } as never)
    const supabase = makeSupabaseMock({
      id: companyId,
      stripe_account_id: null,
    })
    vi.mocked(requireServiceClient).mockReturnValue(supabase)

    const res = await GET(makeRequest({ code: 'ac_test', state: 'tampered.state.string.bad' }))

    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toContain('error=invalid_state')
    expect(exchangeCode).not.toHaveBeenCalled()
  })

  it('redirects with error=invalid_state when the state cookie does not match the state query param', async () => {
    const companyId = 'company_abc'
    const state = mintOAuthState(companyId)
    // Cookie holds a DIFFERENT (but validly-signed) state than the one Stripe
    // echoed back — must be rejected even though verifyOAuthState would pass.
    setOAuthStateCookie(mintOAuthState(companyId))
    vi.mocked(getAuthClaims).mockResolvedValue({ sub: 'user_1' } as never)
    const supabase = makeSupabaseMock({
      id: companyId,
      stripe_account_id: null,
    })
    vi.mocked(requireServiceClient).mockReturnValue(supabase)

    const res = await GET(makeRequest({ code: 'ac_test', state }))

    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toContain('error=invalid_state')
    expect(exchangeCode).not.toHaveBeenCalled()
  })

  it('redirects with error=owner_required when the caller is not the company owner', async () => {
    const companyId = 'company_abc'
    const state = mintOAuthState(companyId)
    setOAuthStateCookie(state)
    vi.mocked(getAuthClaims).mockResolvedValue({ sub: 'user_1' } as never)
    const supabase = makeSupabaseMock({
      id: companyId,
      stripe_account_id: null,
    })
    vi.mocked(requireServiceClient).mockReturnValue(supabase)
    vi.mocked(requireCompanyOwner).mockRejectedValue(new Error('forbidden'))

    const res = await GET(makeRequest({ code: 'ac_test', state }))

    expect(res.headers.get('location')).toContain('error=owner_required')
    expect(exchangeCode).not.toHaveBeenCalled()
  })

  it('refuses with payments_not_available and never exchanges the code when the platform switch was turned off mid-flow', async () => {
    const companyId = 'company_abc'
    const state = mintOAuthState(companyId)
    setOAuthStateCookie(state)
    vi.mocked(getAuthClaims).mockResolvedValue({ sub: 'user_1' } as never)
    vi.mocked(requireServiceClient).mockReturnValue(
      makeSupabaseMock({ id: companyId, stripe_account_id: null, online_payments_allowed: false }),
    )

    const res = await GET(makeRequest({ code: 'ac_test', state }))

    expect(res.headers.get('location')).toContain('/settings/client-actions?error=payments_not_available')
    expect(exchangeCode).not.toHaveBeenCalled()
  })

  it('refuses with payments_not_available when the global stop is closed', async () => {
    const companyId = 'company_abc'
    const state = mintOAuthState(companyId)
    setOAuthStateCookie(state)
    vi.mocked(getAuthClaims).mockResolvedValue({ sub: 'user_1' } as never)
    vi.mocked(requireServiceClient).mockReturnValue(makeSupabaseMock({ id: companyId, stripe_account_id: null }))
    vi.mocked(getPlatformFeatureState).mockResolvedValueOnce({ connectPaymentsOpen: false })

    const res = await GET(makeRequest({ code: 'ac_test', state }))

    expect(res.headers.get('location')).toContain('error=payments_not_available')
    expect(exchangeCode).not.toHaveBeenCalled()
  })

  it('refuses with payments_off and never exchanges the code when the tenant switch was turned off', async () => {
    const companyId = 'company_abc'
    const state = mintOAuthState(companyId)
    setOAuthStateCookie(state)
    vi.mocked(getAuthClaims).mockResolvedValue({ sub: 'user_1' } as never)
    vi.mocked(requireServiceClient).mockReturnValue(
      makeSupabaseMock({ id: companyId, stripe_account_id: null, online_payments_enabled: false }),
    )

    const res = await GET(makeRequest({ code: 'ac_test', state }))

    expect(res.headers.get('location')).toContain('/settings/client-actions?error=payments_off')
    expect(exchangeCode).not.toHaveBeenCalled()
  })
})
