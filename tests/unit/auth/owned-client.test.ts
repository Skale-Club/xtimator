// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { jwtVerify } from 'jose'

const jar = vi.hoisted(() => ({ get: vi.fn(), set: vi.fn() }))
vi.mock('next/headers', () => ({ cookies: async () => jar }))
import { createClient } from '@/lib/supabase/server'
import { requireServiceClient } from '@/lib/supabase/service'
import { hashToken, readOwnedSession, SESSION_COOKIE, sessionCookieOptions } from '@/lib/auth/owned-session'

const account = {
  id: '11111111-1111-4111-8111-111111111111', email: 'owner@example.test', email_confirmed_at: '2026-01-01T00:00:00Z',
  phone: '+15085550100', phone_confirmed_at: '2026-01-01T00:00:00Z', raw_user_meta_data: { full_name: 'Owner' },
  raw_app_meta_data: { role: 'admin' }, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', disabled_at: null,
}
const session = {
  id: '22222222-2222-4222-8222-222222222222', user_id: account.id,
  created_at: new Date().toISOString(), expires_at: new Date(Date.now() + 86400_000).toISOString(), auth_time: new Date().toISOString(), account,
}
const secret = 'test-data-signing-key-with-at-least-32-bytes'
let requests: { url: string; method: string; auth: string | null; body?: string }[]

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_AUTH_MODE', 'owned')
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://data.example.test')
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'test-anon-key')
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-service-key')
  vi.stubEnv('SUPABASE_SECRET_KEY', 'test-service-key')
  vi.stubEnv('XTIMATOR_DATA_JWT_SECRET', secret)
  jar.get.mockReturnValue({ value: 'x'.repeat(43) }); jar.set.mockClear()
  requests = []
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = input instanceof Request ? input : new Request(input, init)
    requests.push({ url: request.url, method: request.method, auth: request.headers.get('authorization'), body: request.method !== 'GET' ? await request.text() : undefined })
    const path = new URL(request.url).pathname
    if (path.includes('/auth/v1')) throw new Error('GoTrue is forbidden in owned mode')
    const single = request.headers.get('accept')?.includes('vnd.pgrst.object')
    if (path.endsWith('/xtimator_sessions') && request.method === 'GET') return Response.json(session)
    if (path.endsWith('/xtimator_accounts') && request.method === 'GET') return Response.json(single ? account : [account], { headers: { 'content-range': '0-0/1' } })
    if (path.endsWith('/companies')) return Response.json([{ id: 'company-one' }])
    return new Response(null, { status: 204 })
  }))
})
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals() })

describe('owned server/client compatibility boundary', () => {
  it('resolves server identity and data with no Supabase Auth requests', async () => {
    const client = await createClient()
    const { data } = await client.auth.getClaims()
    expect(data?.claims).toMatchObject({ sub: account.id, iss: 'xtimator', email: account.email, app_metadata: {} })
    expect((await client.auth.getUser()).data.user?.id).toBe(account.id)
    await client.from('companies').select('id')
    const request = requests.find(value => value.url.includes('/companies'))!
    const { payload } = await jwtVerify(request.auth!.replace('Bearer ', ''), new TextEncoder().encode(secret), { algorithms: ['HS256'], issuer: 'xtimator', audience: 'authenticated' })
    expect(payload).toMatchObject({ sub: account.id, role: 'authenticated', session_id: session.id })
    expect(payload.exp! - payload.iat!).toBeLessThanOrEqual(300)
    expect(request.auth).not.toContain('test-service-key')
    expect(requests.filter(value => value.url.includes('/xtimator_sessions'))).toHaveLength(1)
    expect(requests.some(value => value.url.includes('/auth/v1'))).toBe(false)
  })
  it('reads and erases administrative users locally, not in shared Google/Supabase Auth', async () => {
    const service = requireServiceClient()
    expect((await service.auth.admin.getUserById(account.id)).data.user?.id).toBe(account.id)
    expect((await service.auth.admin.listUsers({ perPage: 1000 })).data.users).toHaveLength(1)
    await service.auth.admin.deleteUser(account.id)
    expect(requests.at(-1)?.url).toContain('/rest/v1/xtimator_accounts')
    expect(requests.at(-1)?.method).toBe('DELETE')
    expect(requests.some(value => value.url.includes('/auth/v1'))).toBe(false)
  })
  it('rejects password/email mutation instead of silently using the old provider', async () => {
    const client = await createClient()
    expect((await client.auth.signInWithPassword({ email: 'test@example.test', password: 'never-send' })).error).toMatchObject({ code: 'passwordless_login_required' })
    expect((await client.auth.updateUser({ email: 'unverified@example.test' })).error).toBeTruthy()
    expect(requests.some(value => value.url.includes('/auth/v1'))).toBe(false)
  })
  it('stores only the cookie hash and clears the server cookie on local logout', async () => {
    const client = await createClient()
    await client.auth.signOut({ scope: 'local' })
    const deletion = requests.find(value => value.method === 'DELETE')!
    expect(decodeURIComponent(deletion.url)).toContain(hashToken('x'.repeat(43)))
    expect(deletion.url).not.toContain('x'.repeat(43))
    expect(jar.set).toHaveBeenCalledWith(SESSION_COOKIE, '', expect.objectContaining({ httpOnly: true, maxAge: 0, sameSite: 'lax', path: '/' }))
    expect(sessionCookieOptions).not.toHaveProperty('domain')
  })
  it('does not query the store for missing/malformed opaque cookies', async () => {
    expect(await readOwnedSession(undefined)).toBeNull()
    expect(await readOwnedSession('forged-uid')).toBeNull()
    expect(requests).toHaveLength(0)
  })
})
