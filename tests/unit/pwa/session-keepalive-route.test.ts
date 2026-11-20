// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({ claims: vi.fn(), proxyClaims: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ auth: { getClaims: mocks.claims } }) }))
vi.mock('@/lib/auth/owned-proxy', () => ({ ownedRequestClaims: mocks.proxyClaims }))
import { GET } from '@/app/api/auth/keepalive/route'
import { proxy } from '@/proxy'

beforeEach(() => {
  vi.resetAllMocks()
  vi.stubEnv('NEXT_PUBLIC_AUTH_MODE', 'owned')
  vi.stubEnv('APP_ORIGIN', 'https://xtimator.test')
  vi.stubEnv('DEMO_APP_ORIGIN', 'https://demo.xtimator.test')
  mocks.proxyClaims.mockResolvedValue(null)
})
afterEach(() => vi.unstubAllEnvs())

describe('PWA keepalive server authority', () => {
  it.each([null, { sub: 'user' }])('returns an uncached explicit session state', async claims => {
    mocks.claims.mockResolvedValue({ data: { claims }, error: null })
    const response = await GET()
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ ok: true, loggedIn: !!claims })
    expect(response.headers.get('cache-control')).toContain('no-store')
  })
  it.each(['throw', 'error'])('reports an unavailable session check as 503 for %s', async kind => {
    if (kind === 'throw') mocks.claims.mockRejectedValue(new Error('Database unavailable'))
    else mocks.claims.mockResolvedValue({ data: null, error: { message: 'Provider unavailable' } })
    const response = await GET()
    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({ ok: false, code: 'auth_unavailable' })
  })
  it('lets an expired session reach JSON while preserving the renewal path', async () => {
    const response = await proxy(new NextRequest('https://xtimator.test/api/auth/keepalive'))
    expect(response.status).toBe(200)
    expect(response.headers.get('location')).toBeNull()
    expect(mocks.proxyClaims).toHaveBeenCalledOnce()
  })
  it('retains renewed session cookies on a successful foreground check', async () => {
    mocks.proxyClaims.mockImplementation(async (_request, response) => {
      response.cookies.set('xtimator_session', 'renewed-session')
      return { sub: 'user' }
    })
    const response = await proxy(new NextRequest('https://xtimator.test/api/auth/keepalive'))
    expect(response.cookies.get('xtimator_session')?.value).toBe('renewed-session')
  })
})
