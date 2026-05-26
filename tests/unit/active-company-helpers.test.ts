// tests/unit/active-company-helpers.test.ts
// Phase 79 Plan 02: cookie fallback / validation / fallback selection / cache key
// Covers D-05, D-06, D-07, D-08, D-09, D-11

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------- mocks ----------
vi.mock('next/headers', () => ({
  cookies: vi.fn(),
}))
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))
vi.mock('@/lib/supabase/service', () => ({
  requireServiceClient: vi.fn(),
}))
vi.mock('@/lib/queries/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/queries/auth')>()
  return {
    ...actual,
    getAuthClaims: vi.fn(),
  }
})
vi.mock('next/cache', () => ({
  // We bypass unstable_cache to invoke the wrapped function directly in tests.
  unstable_cache: <T extends (...args: never[]) => unknown>(fn: T) => fn,
}))

import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { requireServiceClient } from '@/lib/supabase/service'
import { getAuthClaims } from '@/lib/queries/auth'

// ---------- helpers ----------
function makeCookieStore({ active }: { active: string | null }) {
  const cookieSpy = vi.fn()
  const get = vi.fn().mockReturnValue(active ? { value: active } : undefined)
  return {
    store: { get, set: cookieSpy },
    setSpy: cookieSpy,
  }
}

function makeAuthedSupabase({
  validateResult,
  fallbackResult,
}: {
  validateResult: { data: { company_id: string } | null }
  fallbackResult: { data: Array<{ company_id: string }> | null }
}) {
  const maybeSingle = vi.fn().mockResolvedValue(validateResult)
  const limit = vi.fn().mockResolvedValue(fallbackResult)
  const order = vi.fn().mockReturnValue({ limit })

  // Validation chain: select.eq.eq.maybeSingle
  const eq2Validate = vi.fn().mockReturnValue({ maybeSingle })
  const eq1Validate = vi.fn().mockReturnValue({ eq: eq2Validate })

  // Fallback chain: select.eq.order.limit
  const eq1Fallback = vi.fn().mockReturnValue({ order })

  let selectCallCount = 0
  const select = vi.fn().mockImplementation(() => {
    selectCallCount++
    return selectCallCount === 1
      ? { eq: eq1Validate }
      : { eq: eq1Fallback }
  })

  return {
    from: vi.fn().mockReturnValue({ select }),
    _spies: { maybeSingle, limit, order, eq1Validate, eq2Validate, eq1Fallback, select },
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.resetModules()
})

// ---------- tests ----------
describe('getActiveCompanyId — D-05/D-06/D-07/D-08 (cookie fallback + validation)', () => {
  it('T1: cookie present AND user owns it (validation passes) → returns cookie value; no cookie write', async () => {
    const { store, setSpy } = makeCookieStore({ active: 'company-abc' })
    vi.mocked(cookies).mockResolvedValue(store as never)
    vi.mocked(getAuthClaims).mockResolvedValue({ sub: 'user-1' } as never)
    const supa = makeAuthedSupabase({
      validateResult: { data: { company_id: 'company-abc' } },
      fallbackResult: { data: null },
    })
    vi.mocked(createClient).mockResolvedValue(supa as never)

    const { getActiveCompanyId } = await import('@/lib/queries/active-company')
    const result = await getActiveCompanyId()

    expect(result).toBe('company-abc')
    expect(setSpy).not.toHaveBeenCalled()
  })

  it('T2: cookie missing → fallback runs, cookie written with D-05 options (httpOnly/lax/path/maxAge)', async () => {
    const { store, setSpy } = makeCookieStore({ active: null })
    vi.mocked(cookies).mockResolvedValue(store as never)
    vi.mocked(getAuthClaims).mockResolvedValue({ sub: 'user-1' } as never)
    const supa = makeAuthedSupabase({
      validateResult: { data: null },
      fallbackResult: { data: [{ company_id: 'company-xyz' }] },
    })
    vi.mocked(createClient).mockResolvedValue(supa as never)

    const { getActiveCompanyId } = await import('@/lib/queries/active-company')
    const result = await getActiveCompanyId()

    expect(result).toBe('company-xyz')
    expect(setSpy).toHaveBeenCalledWith(
      'active_company_id',
      'company-xyz',
      expect.objectContaining({
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        maxAge: 60 * 60 * 24 * 30,
      })
    )
  })

  it('T3: cookie set but validation rejects foreign company_id → fallback overwrites cookie', async () => {
    const { store, setSpy } = makeCookieStore({ active: 'company-stale' })
    vi.mocked(cookies).mockResolvedValue(store as never)
    vi.mocked(getAuthClaims).mockResolvedValue({ sub: 'user-1' } as never)
    const supa = makeAuthedSupabase({
      validateResult: { data: null }, // stale / foreign cookie
      fallbackResult: { data: [{ company_id: 'company-real' }] },
    })
    vi.mocked(createClient).mockResolvedValue(supa as never)

    const { getActiveCompanyId } = await import('@/lib/queries/active-company')
    const result = await getActiveCompanyId()

    expect(result).toBe('company-real')
    expect(setSpy).toHaveBeenCalledWith('active_company_id', 'company-real', expect.any(Object))
  })

  it('T4: fallback uses ORDER BY companies.created_at DESC LIMIT 1', async () => {
    const { store } = makeCookieStore({ active: null })
    vi.mocked(cookies).mockResolvedValue(store as never)
    vi.mocked(getAuthClaims).mockResolvedValue({ sub: 'user-1' } as never)
    const supa = makeAuthedSupabase({
      validateResult: { data: null },
      fallbackResult: { data: [{ company_id: 'newest' }] },
    })
    vi.mocked(createClient).mockResolvedValue(supa as never)

    const { getActiveCompanyId } = await import('@/lib/queries/active-company')
    await getActiveCompanyId()

    expect(supa._spies.order).toHaveBeenCalledWith(
      'created_at',
      expect.objectContaining({ foreignTable: 'companies', ascending: false })
    )
    expect(supa._spies.limit).toHaveBeenCalledWith(1)
  })

  it('T5: zero memberships → returns null; no cookie set', async () => {
    const { store, setSpy } = makeCookieStore({ active: null })
    vi.mocked(cookies).mockResolvedValue(store as never)
    vi.mocked(getAuthClaims).mockResolvedValue({ sub: 'user-1' } as never)
    const supa = makeAuthedSupabase({
      validateResult: { data: null },
      fallbackResult: { data: [] },
    })
    vi.mocked(createClient).mockResolvedValue(supa as never)

    const { getActiveCompanyId } = await import('@/lib/queries/active-company')
    const result = await getActiveCompanyId()

    expect(result).toBeNull()
    expect(setSpy).not.toHaveBeenCalled()
  })

  it('T6: unauthenticated → returns null without DB call', async () => {
    const { store } = makeCookieStore({ active: 'company-abc' })
    vi.mocked(cookies).mockResolvedValue(store as never)
    vi.mocked(getAuthClaims).mockResolvedValue(null as never)

    const { getActiveCompanyId } = await import('@/lib/queries/active-company')
    const result = await getActiveCompanyId()

    expect(result).toBeNull()
    expect(createClient).not.toHaveBeenCalled()
  })
})

describe('getActiveCompany — D-09/D-11 (cache key = activeCompanyId, tag = company)', () => {
  it('T7: returns full AppCompany row keyed by activeCompanyId', async () => {
    const { store } = makeCookieStore({ active: 'company-abc' })
    vi.mocked(cookies).mockResolvedValue(store as never)
    vi.mocked(getAuthClaims).mockResolvedValue({ sub: 'user-1' } as never)

    // getActiveCompanyId path
    const authed = makeAuthedSupabase({
      validateResult: { data: { company_id: 'company-abc' } },
      fallbackResult: { data: null },
    })
    vi.mocked(createClient).mockResolvedValue(authed as never)

    // loadCompanyById path (service role inside unstable_cache, bypassed in mock)
    const single = vi.fn().mockResolvedValue({
      data: {
        id: 'company-abc',
        name: 'Acme',
        logo_url: null,
        owner_name: null,
        theme_preference: null,
        industry: null,
        currency_code: 'USD',
      },
    })
    const eqService = vi.fn().mockReturnValue({ single })
    const selectService = vi.fn().mockReturnValue({ eq: eqService })
    vi.mocked(requireServiceClient).mockReturnValue({
      from: vi.fn().mockReturnValue({ select: selectService }),
    } as never)

    const { getActiveCompany } = await import('@/lib/queries/active-company')
    const result = await getActiveCompany()

    expect(result).toEqual(expect.objectContaining({ id: 'company-abc', name: 'Acme' }))
    expect(eqService).toHaveBeenCalledWith('id', 'company-abc')
  })

  it('T8: getActiveCompany returns null when getActiveCompanyId returns null', async () => {
    vi.mocked(getAuthClaims).mockResolvedValue(null as never)
    const { store } = makeCookieStore({ active: null })
    vi.mocked(cookies).mockResolvedValue(store as never)

    const { getActiveCompany } = await import('@/lib/queries/active-company')
    const result = await getActiveCompany()

    expect(result).toBeNull()
    expect(requireServiceClient).not.toHaveBeenCalled()
  })
})
