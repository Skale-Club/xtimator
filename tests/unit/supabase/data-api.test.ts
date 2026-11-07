// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { decodeJwt, decodeProtectedHeader, jwtVerify } from 'jose'

vi.mock('@/lib/auth/mode', () => ({ ownedAuthEnabled: () => false }))

import { dataApiMode, resetServiceJwtCache, signServiceJwt } from '@/lib/supabase/data-api'
import { createDataServiceClient, requireDataServiceClient } from '@/lib/supabase/data-service'
import { createServiceClient, requireServiceClient } from '@/lib/supabase/service'

const SECRET = 'unit-test-data-jwt-secret-0123456789abcdef'
const URL_ = 'https://data.example.test'

function stubEnv(env: Record<string, string | undefined>) {
  for (const key of ['DATA_API_MODE', 'XTIMATOR_DATA_JWT_SECRET', 'SUPABASE_SECRET_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'NEXT_PUBLIC_SUPABASE_URL']) {
    vi.stubEnv(key, env[key])
  }
}

let fetchMock: ReturnType<typeof vi.fn>
beforeEach(() => {
  resetServiceJwtCache()
  fetchMock = vi.fn(async () => new Response('[]', { status: 200, headers: { 'content-type': 'application/json' } }))
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('dataApiMode', () => {
  it('defaults to supabase', () => {
    stubEnv({})
    expect(dataApiMode()).toBe('supabase')
  })
  it('accepts postgrest case-insensitively', () => {
    stubEnv({ DATA_API_MODE: ' PostgREST ' })
    expect(dataApiMode()).toBe('postgrest')
  })
  it('rejects an unknown value instead of silently falling back', () => {
    stubEnv({ DATA_API_MODE: 'postgrst' })
    expect(() => dataApiMode()).toThrow(/DATA_API_MODE/)
  })
})

describe('signServiceJwt', () => {
  it('signs HS256 with role=service_role, iss=xtimator and a 1h expiry', async () => {
    stubEnv({ XTIMATOR_DATA_JWT_SECRET: SECRET })
    const token = await signServiceJwt()
    expect(decodeProtectedHeader(token)).toMatchObject({ alg: 'HS256', typ: 'JWT' })
    const { payload } = await jwtVerify(token, new TextEncoder().encode(SECRET), { algorithms: ['HS256'] })
    expect(payload).toMatchObject({ role: 'service_role', iss: 'xtimator' })
    expect(payload.exp! - payload.iat!).toBe(3600)
  })
  it('caches until near expiry, then re-signs', async () => {
    stubEnv({ XTIMATOR_DATA_JWT_SECRET: SECRET })
    const t0 = Date.UTC(2026, 0, 1)
    const a = await signServiceJwt(t0)
    expect(await signServiceJwt(t0 + 30 * 60_000)).toBe(a)
    const b = await signServiceJwt(t0 + 56 * 60_000)
    expect(b).not.toBe(a)
    expect(decodeJwt(b).exp).toBe(Math.floor((t0 + 56 * 60_000) / 1000) + 3600)
  })
  it('fails with a clear error (no secret echoed) when the secret is missing or short', async () => {
    stubEnv({ XTIMATOR_DATA_JWT_SECRET: 'short-secret' })
    await expect(signServiceJwt()).rejects.toThrow(/XTIMATOR_DATA_JWT_SECRET/)
    await expect(signServiceJwt()).rejects.not.toThrow(/short-secret/)
  })
})

describe('supabase mode (default) is unchanged', () => {
  it('sends the gateway key as apikey/Authorization and never signs a JWT', async () => {
    stubEnv({ NEXT_PUBLIC_SUPABASE_URL: URL_, SUPABASE_SECRET_KEY: 'sb_secret_unit_placeholder', XTIMATOR_DATA_JWT_SECRET: SECRET })
    await requireServiceClient().from('companies').select('id')
    const [, init] = fetchMock.mock.calls[0]
    const headers = new Headers(init.headers)
    expect(headers.get('apikey')).toBe('sb_secret_unit_placeholder')
    expect(headers.get('authorization')).toBe('Bearer sb_secret_unit_placeholder')
  })
  it('falls back to SUPABASE_SERVICE_ROLE_KEY', async () => {
    stubEnv({ NEXT_PUBLIC_SUPABASE_URL: URL_, SUPABASE_SERVICE_ROLE_KEY: 'legacy-service-key' })
    await requireDataServiceClient().from('x').select('id')
    expect(new Headers(fetchMock.mock.calls[0][1].headers).get('apikey')).toBe('legacy-service-key')
  })
  it('does not require XTIMATOR_DATA_JWT_SECRET', () => {
    stubEnv({ NEXT_PUBLIC_SUPABASE_URL: URL_, SUPABASE_SECRET_KEY: 'k' })
    expect(() => requireServiceClient()).not.toThrow()
  })
  it('keeps the original missing-config contract', () => {
    stubEnv({ NEXT_PUBLIC_SUPABASE_URL: URL_ })
    expect(createServiceClient()).toBeNull()
    expect(createDataServiceClient()).toBeNull()
    expect(() => requireServiceClient()).toThrow(/SUPABASE_SECRET_KEY/)
    expect(() => requireDataServiceClient()).toThrow(/incomplete/)
  })
})

describe('postgrest mode', () => {
  it('stamps the service JWT on Authorization and apikey; ignores the Supabase key', async () => {
    stubEnv({ DATA_API_MODE: 'postgrest', NEXT_PUBLIC_SUPABASE_URL: URL_, XTIMATOR_DATA_JWT_SECRET: SECRET, SUPABASE_SECRET_KEY: 'sb_secret_must_not_be_sent' })
    await requireServiceClient().from('companies').select('id')
    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toContain(`${URL_}/rest/v1/companies`)
    const headers = new Headers(init.headers)
    const bearer = headers.get('authorization')!.replace(/^Bearer /, '')
    expect(headers.get('apikey')).toBe(bearer)
    expect(bearer).not.toContain('sb_secret')
    expect(decodeJwt(bearer)).toMatchObject({ role: 'service_role', iss: 'xtimator' })
  })
  it('works for the data-service factory too', async () => {
    stubEnv({ DATA_API_MODE: 'postgrest', NEXT_PUBLIC_SUPABASE_URL: URL_, XTIMATOR_DATA_JWT_SECRET: SECRET })
    await requireDataServiceClient().from('xtimator_sessions').select('id')
    expect(decodeJwt(new Headers(fetchMock.mock.calls[0][1].headers).get('apikey')!)).toMatchObject({ role: 'service_role' })
  })
  it('missing secret -> clear error from require*, null from create*', () => {
    stubEnv({ DATA_API_MODE: 'postgrest', NEXT_PUBLIC_SUPABASE_URL: URL_, SUPABASE_SECRET_KEY: 'sb_secret_ignored' })
    expect(() => requireServiceClient()).toThrow(/XTIMATOR_DATA_JWT_SECRET/)
    expect(createServiceClient()).toBeNull()
    expect(createDataServiceClient()).toBeNull()
    expect(() => requireDataServiceClient()).toThrow(/incomplete/)
  })
})

describe('server clients never hop through the same-origin proxy', () => {
  const INTERNAL = 'http://postgrest.internal:3000'
  const UPSTREAM = 'https://proj.example-upstream.test'
  function stub(values: Record<string, string | undefined>) {
    stubEnv(values)
    vi.stubEnv('DATA_API_UPSTREAM_URL', values.DATA_API_UPSTREAM_URL)
    vi.stubEnv('POSTGREST_INTERNAL_URL', values.POSTGREST_INTERNAL_URL)
  }

  it('DATA_API_UPSTREAM_URL wins over NEXT_PUBLIC_SUPABASE_URL (which is the app origin in the browser build)', async () => {
    stub({ NEXT_PUBLIC_SUPABASE_URL: 'https://app.example.test', DATA_API_UPSTREAM_URL: `${UPSTREAM}/`, SUPABASE_SECRET_KEY: 'k' })
    await requireServiceClient().from('companies').select('id')
    expect(String(fetchMock.mock.calls[0][0])).toBe(`${UPSTREAM}/rest/v1/companies?select=id`)
  })

  it('postgrest mode rewrites <base>/rest/v1/ to POSTGREST_INTERNAL_URL/ for the service client', async () => {
    stub({ DATA_API_MODE: 'postgrest', NEXT_PUBLIC_SUPABASE_URL: URL_, XTIMATOR_DATA_JWT_SECRET: SECRET, POSTGREST_INTERNAL_URL: `${INTERNAL}/` })
    await requireServiceClient().from('companies').select('id').eq('id', 1)
    expect(String(fetchMock.mock.calls[0][0])).toBe(`${INTERNAL}/companies?select=id&id=eq.1`)
    expect(decodeJwt(new Headers(fetchMock.mock.calls[0][1].headers).get('authorization')!.replace(/^Bearer /, ''))).toMatchObject({ role: 'service_role' })
  })

  it('postgrest mode leaves the URL alone when POSTGREST_INTERNAL_URL is unset', async () => {
    stub({ DATA_API_MODE: 'postgrest', NEXT_PUBLIC_SUPABASE_URL: URL_, XTIMATOR_DATA_JWT_SECRET: SECRET })
    await requireServiceClient().from('companies').select('id')
    expect(String(fetchMock.mock.calls[0][0])).toContain(`${URL_}/rest/v1/companies`)
  })

  it('rewriteToPostgrest / postgrestRewriteFetch only touch /rest/v1 URLs and only in postgrest mode', async () => {
    const { rewriteToPostgrest, postgrestRewriteFetch } = await import('@/lib/supabase/data-api')
    expect(rewriteToPostgrest('https://x.test/rest/v1/a/b?c=d', INTERNAL)).toBe(`${INTERNAL}/a/b?c=d`)
    expect(rewriteToPostgrest('https://x.test/auth/v1/user', INTERNAL)).toBeNull()
    stub({})
    expect(postgrestRewriteFetch()).toBeUndefined()
    stub({ DATA_API_MODE: 'postgrest', POSTGREST_INTERNAL_URL: INTERNAL })
    const rewrite = postgrestRewriteFetch()!
    await rewrite('https://x.test/rest/v1/t?select=*')
    await rewrite('https://x.test/other')
    expect(String(fetchMock.mock.calls[0][0])).toBe(`${INTERNAL}/t?select=*`)
    expect(String(fetchMock.mock.calls[1][0])).toBe('https://x.test/other')
  })
})
