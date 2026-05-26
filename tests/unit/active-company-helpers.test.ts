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

  // The .eq() chain disambiguates validate (.eq.eq.maybeSingle) vs fallback (.eq.order.limit)
  // by returning an object that supports BOTH `.eq()` (validation continuation) AND
  // `.order()` (fallback continuation). The implementation drives which path runs.
  const eqLeaf = {
    eq: vi.fn().mockReturnValue({ maybeSingle }),
    order,
  }
  const select = vi.fn().mockReturnValue({
    eq: vi.fn().mockReturnValue(eqLeaf),
  })

  return {
    from: vi.fn().mockReturnValue({ select }),
    _spies: { maybeSingle, limit, order, select, eqLeaf },
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

// ---------- getMembershipCompanies — SWITCH-04 / SWITCH-16 ----------
//
// Helper that mocks the membership-listing supabase chain:
//   supabase.from('company_members').select(...).eq('user_id', ...).order('created_at', { foreignTable: 'companies', ascending: true })
// The .order() call is the terminal awaited node (resolves to { data, error }).
function makeMembershipSupabase({
  listResult,
}: {
  listResult: { data: Array<{ companies: { id: string; name: string; logo_url: string | null; created_at: string } }> | null; error: unknown }
}) {
  const order = vi.fn().mockResolvedValue(listResult)
  const eq = vi.fn().mockReturnValue({ order })
  const select = vi.fn().mockReturnValue({ eq })
  const from = vi.fn().mockReturnValue({ select })
  return {
    client: { from },
    _spies: { from, select, eq, order },
  }
}

describe('getMembershipCompanies — SWITCH-04 (live list of user companies, ASC by created_at)', () => {
  it('M1: multiple memberships → returns mapped { id, name, logo_url }[] in ASC created_at order; calls .order with foreignTable companies, ascending true', async () => {
    vi.mocked(getAuthClaims).mockResolvedValue({ sub: 'user-1' } as never)
    const supa = makeMembershipSupabase({
      listResult: {
        data: [
          { companies: { id: 'c-1', name: 'Alpha', logo_url: null, created_at: '2026-01-01' } },
          { companies: { id: 'c-2', name: 'Beta', logo_url: 'https://x/b.png', created_at: '2026-02-01' } },
        ],
        error: null,
      },
    })
    vi.mocked(createClient).mockResolvedValue(supa.client as never)

    const { getMembershipCompanies } = await import('@/lib/queries/active-company')
    const result = await getMembershipCompanies()

    expect(result).toEqual([
      { id: 'c-1', name: 'Alpha', logo_url: null },
      { id: 'c-2', name: 'Beta', logo_url: 'https://x/b.png' },
    ])
    expect(supa._spies.from).toHaveBeenCalledWith('company_members')
    expect(supa._spies.eq).toHaveBeenCalledWith('user_id', 'user-1')
    expect(supa._spies.order).toHaveBeenCalledWith(
      'created_at',
      expect.objectContaining({ foreignTable: 'companies', ascending: true })
    )
  })

  it('M2: single membership → returns array of length 1 with only { id, name, logo_url } (no created_at leaked)', async () => {
    vi.mocked(getAuthClaims).mockResolvedValue({ sub: 'user-1' } as never)
    const supa = makeMembershipSupabase({
      listResult: {
        data: [
          { companies: { id: 'c-only', name: 'Solo', logo_url: 'https://x/s.png', created_at: '2026-03-01' } },
        ],
        error: null,
      },
    })
    vi.mocked(createClient).mockResolvedValue(supa.client as never)

    const { getMembershipCompanies } = await import('@/lib/queries/active-company')
    const result = await getMembershipCompanies()

    expect(result).toHaveLength(1)
    expect(result[0]).toEqual({ id: 'c-only', name: 'Solo', logo_url: 'https://x/s.png' })
    // Public shape must not leak created_at.
    expect(Object.keys(result[0])).toEqual(expect.arrayContaining(['id', 'name', 'logo_url']))
    expect(Object.keys(result[0])).not.toContain('created_at')
  })

  it('M3a: unauthenticated → returns [] without touching supabase', async () => {
    vi.mocked(getAuthClaims).mockResolvedValue(null as never)

    const { getMembershipCompanies } = await import('@/lib/queries/active-company')
    const result = await getMembershipCompanies()

    expect(result).toEqual([])
    expect(createClient).not.toHaveBeenCalled()
  })

  it('M3b: authenticated but zero memberships (data null or empty) → returns []', async () => {
    vi.mocked(getAuthClaims).mockResolvedValue({ sub: 'user-1' } as never)
    const supa = makeMembershipSupabase({
      listResult: { data: null, error: null },
    })
    vi.mocked(createClient).mockResolvedValue(supa.client as never)

    const { getMembershipCompanies } = await import('@/lib/queries/active-company')
    const result = await getMembershipCompanies()

    expect(result).toEqual([])
  })
})
