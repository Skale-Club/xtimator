import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

/**
 * Quick-260909-eul — coverage that the OAuth/recovery callback route emits a
 * RELATIVE Location header on every branch, never an absolute one built from
 * request.url or APP_ORIGIN. Requests are built against the INTERNAL bind
 * origin (`https://0.0.0.0:3000`) on purpose: if the route ever regresses to
 * deriving the redirect from the request/base URL again, these assertions
 * (`location` starts with '/' and never contains 'http') will catch it even
 * though the internal bind address would otherwise be an obviously-wrong but
 * still "passing" absolute redirect target.
 */

const exchangeMock = vi.fn()

// Chainable query builder mock: .select().eq().order().limit().maybeSingle()
// and .select().eq().limit().maybeSingle() both resolve a configurable value
// per table name.
const companiesResult = { data: null as unknown }
const membershipResult = { data: null as unknown }

function makeChain(result: { data: unknown }) {
  const chain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue(result),
  }
  return chain
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn().mockResolvedValue({
    auth: {
      exchangeCodeForSession: (...args: unknown[]) => exchangeMock(...args),
    },
    from: (table: string) => {
      if (table === 'companies') return makeChain(companiesResult)
      if (table === 'company_members') return makeChain(membershipResult)
      throw new Error(`unexpected table: ${table}`)
    },
  }),
}))

vi.mock('@/lib/auth-logger', () => ({
  logAuthEvent: vi.fn(),
}))

vi.mock('@/lib/theme/cookie', () => ({
  writeThemeCookie: vi.fn(),
  isValidTheme: () => false,
}))

function makeRequest(query: string) {
  return new NextRequest(`https://0.0.0.0:3000/callback${query}`)
}

beforeEach(() => {
  vi.clearAllMocks()
  companiesResult.data = null
  membershipResult.data = null
})

describe('GET /callback — relative-Location redirects (quick-260909-eul)', () => {
  it('exchange error → 307 to /?auth=login (relative)', async () => {
    exchangeMock.mockResolvedValue({ data: null, error: { message: 'bad code' } })
    const { GET } = await import('@/app/(auth)/callback/route')

    const res = await GET(makeRequest('?code=abc'))

    expect(res.status).toBe(307)
    const location = res.headers.get('location')
    expect(location).toBe('/?auth=login')
    expect(location).not.toContain('http')
  })

  it('?type=recovery with successful exchange → 307 to /update-password (relative)', async () => {
    exchangeMock.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null })
    const { GET } = await import('@/app/(auth)/callback/route')

    const res = await GET(makeRequest('?code=abc&type=recovery'))

    expect(res.status).toBe(307)
    const location = res.headers.get('location')
    expect(location).toBe('/update-password')
    expect(location).not.toContain('http')
  })

  it('successful exchange, user owns a company → 307 to /dashboard (relative)', async () => {
    exchangeMock.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null })
    companiesResult.data = { id: 'c1', theme_preference: null }
    const { GET } = await import('@/app/(auth)/callback/route')

    const res = await GET(makeRequest('?code=abc'))

    expect(res.status).toBe(307)
    const location = res.headers.get('location')
    expect(location).toBe('/dashboard')
    expect(location).not.toContain('http')
  })

  it('successful exchange, no company, no membership → 307 to /onboarding (relative)', async () => {
    exchangeMock.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null })
    const { GET } = await import('@/app/(auth)/callback/route')

    const res = await GET(makeRequest('?code=abc'))

    expect(res.status).toBe(307)
    const location = res.headers.get('location')
    expect(location).toBe('/onboarding')
    expect(location).not.toContain('http')
  })

  it('no code param → 307 to /?auth=login (relative)', async () => {
    const { GET } = await import('@/app/(auth)/callback/route')

    const res = await GET(makeRequest(''))

    expect(res.status).toBe(307)
    const location = res.headers.get('location')
    expect(location).toBe('/?auth=login')
    expect(location).not.toContain('http')
    expect(exchangeMock).not.toHaveBeenCalled()
  })
})
