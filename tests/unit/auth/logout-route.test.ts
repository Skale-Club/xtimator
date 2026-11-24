import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GET } from '@/app/api/logout/route'
import { createClient } from '@/lib/supabase/server'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
const signOut = vi.fn(async () => ({ error: null }))

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_AUTH_MODE', 'owned')
  vi.mocked(createClient).mockResolvedValue({ auth: { signOut } } as never)
  signOut.mockClear()
})
afterEach(() => vi.unstubAllEnvs())

describe('logout redirects through the configured public origin', () => {
  it.each([
    ['http://localhost:9650/api/logout', 'https://127.0.0.1:9650'],
    ['http://0.0.0.0:3000/api/logout', 'https://xtimator.com'],
  ])('keeps an internal request URL %s out of the browser', async (requestUrl, origin) => {
    vi.stubEnv('APP_ORIGIN', origin)
    const response = await GET(new Request(requestUrl))
    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toBe(`${origin}/?auth=login`)
    expect(signOut).toHaveBeenCalledExactlyOnceWith({ scope: 'local' })
  })

  it('rejects a cross-site logout before touching the session', async () => {
    const response = await GET(new Request('https://xtimator.com/api/logout', {
      headers: { 'sec-fetch-site': 'cross-site' },
    }))
    expect(response.status).toBe(403)
    expect(signOut).not.toHaveBeenCalled()
  })
})
