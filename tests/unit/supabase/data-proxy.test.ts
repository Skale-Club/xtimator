// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { dataApiOptions, forwardDataApi } from '@/lib/supabase/data-proxy'
import { OPTIONS } from '@/app/rest/v1/[...path]/route'

const ORIGIN = 'https://app.example.test'
const UPSTREAM = 'https://proj.example-upstream.test'
const INTERNAL = 'http://postgrest.internal:3000'
const GATEWAY_KEY = 'gateway-key-placeholder'

function env(values: Record<string, string | undefined>) {
  for (const key of [
    'DATA_API_MODE',
    'DATA_API_UPSTREAM_URL',
    'DATA_API_UPSTREAM_KEY',
    'SUPABASE_PUBLISHABLE_KEY',
    'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
    'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    'POSTGREST_INTERNAL_URL',
  ]) {
    vi.stubEnv(key, values[key])
  }
}

function req(path: string, init: RequestInit & { headers?: Record<string, string> } = {}) {
  const headers = { authorization: 'Bearer user-jwt', apikey: 'anon-jwt-from-browser', ...(init.headers ?? {}) }
  return new Request(`${ORIGIN}${path}`, { ...init, headers })
}

let fetchMock: ReturnType<typeof vi.fn>
beforeEach(() => {
  fetchMock = vi.fn(async () => new Response('[{"id":1}]', {
    status: 206,
    headers: {
      'content-type': 'application/json',
      'content-range': '0-0/5',
      'x-total-count': '5',
      'set-cookie': 'leak=1',
      'x-powered-by': 'secret',
      connection: 'keep-alive',
    },
  }))
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('supabase mode', () => {
  beforeEach(() => env({ DATA_API_UPSTREAM_URL: `${UPSTREAM}/`, DATA_API_UPSTREAM_KEY: GATEWAY_KEY }))

  it('forwards to <upstream>/rest/v1/<path>?<query> and keeps the query string', async () => {
    await forwardDataApi(req('/rest/v1/estimates?select=id%2Cname&company_id=eq.7&order=created_at.desc'))
    const [target] = fetchMock.mock.calls[0]
    expect(target).toBe(`${UPSTREAM}/rest/v1/estimates?select=id%2Cname&company_id=eq.7&order=created_at.desc`)
  })

  it('replaces the browser apikey with the gateway key and keeps Authorization', async () => {
    await forwardDataApi(req('/rest/v1/estimates'))
    const headers = new Headers(fetchMock.mock.calls[0][1].headers)
    expect(headers.get('apikey')).toBe(GATEWAY_KEY)
    expect(headers.get('authorization')).toBe('Bearer user-jwt')
  })

  it('falls back to NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY when no dedicated key is set', async () => {
    env({ DATA_API_UPSTREAM_URL: UPSTREAM, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_placeholder' })
    await forwardDataApi(req('/rest/v1/estimates'))
    expect(new Headers(fetchMock.mock.calls[0][1].headers).get('apikey')).toBe('sb_publishable_placeholder')
  })

  it('500s without upstream config and refuses a loop back to its own origin', async () => {
    env({ DATA_API_UPSTREAM_KEY: GATEWAY_KEY })
    expect((await forwardDataApi(req('/rest/v1/x'))).status).toBe(500)
    env({ DATA_API_UPSTREAM_URL: ORIGIN, DATA_API_UPSTREAM_KEY: GATEWAY_KEY })
    expect((await forwardDataApi(req('/rest/v1/x'))).status).toBe(508)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('postgrest mode', () => {
  beforeEach(() => env({ DATA_API_MODE: 'postgrest', POSTGREST_INTERNAL_URL: `${INTERNAL}/`, DATA_API_UPSTREAM_KEY: GATEWAY_KEY }))

  it('forwards to <internal>/<path>?<query> without the /rest/v1 prefix', async () => {
    await forwardDataApi(req('/rest/v1/rpc/expire_credit_lots?foo=bar', { method: 'POST', body: '{}' }))
    expect(fetchMock.mock.calls[0][0]).toBe(`${INTERNAL}/rpc/expire_credit_lots?foo=bar`)
  })

  it('drops apikey and keeps Authorization', async () => {
    await forwardDataApi(req('/rest/v1/estimates'))
    const headers = new Headers(fetchMock.mock.calls[0][1].headers)
    expect(headers.has('apikey')).toBe(false)
    expect(headers.get('authorization')).toBe('Bearer user-jwt')
  })

  it('500s without POSTGREST_INTERNAL_URL', async () => {
    env({ DATA_API_MODE: 'postgrest' })
    expect((await forwardDataApi(req('/rest/v1/x'))).status).toBe(500)
  })

  it('500s on an invalid DATA_API_MODE instead of guessing', async () => {
    env({ DATA_API_MODE: 'postgrst', POSTGREST_INTERNAL_URL: INTERNAL })
    expect((await forwardDataApi(req('/rest/v1/x'))).status).toBe(500)
  })
})

describe('request hygiene', () => {
  beforeEach(() => env({ DATA_API_UPSTREAM_URL: UPSTREAM, DATA_API_UPSTREAM_KEY: GATEWAY_KEY }))

  it('forwards only allowlisted request headers and never cookies', async () => {
    await forwardDataApi(
      req('/rest/v1/estimates', {
        headers: {
          cookie: 'xtimator_session=secret',
          'x-forwarded-for': '1.2.3.4',
          'x-evil': '1',
          host: 'evil.test',
          accept: 'application/json',
          'accept-profile': 'public',
          'content-profile': 'public',
          prefer: 'return=representation',
          range: '0-9',
          'range-unit': 'items',
          'x-client-info': 'supabase-js/2',
        },
      }),
    )
    const sent = [...new Headers(fetchMock.mock.calls[0][1].headers).keys()].sort()
    expect(sent).toEqual(
      ['accept', 'accept-profile', 'apikey', 'authorization', 'content-profile', 'prefer', 'range', 'range-unit', 'x-client-info'],
    )
  })

  it('streams the request body and content-type on writes', async () => {
    await forwardDataApi(
      req('/rest/v1/estimates', { method: 'POST', body: '{"a":1}', headers: { 'content-type': 'application/json' } }),
    )
    const init = fetchMock.mock.calls[0][1]
    expect(init.method).toBe('POST')
    expect(init.duplex).toBe('half')
    expect(init.body).toBeInstanceOf(ReadableStream)
    expect(new Headers(init.headers).get('content-type')).toBe('application/json')
  })

  it('does not send a body on GET/HEAD', async () => {
    await forwardDataApi(req('/rest/v1/estimates'))
    expect(fetchMock.mock.calls[0][1].body).toBeUndefined()
  })

  it.each(['/rest/v1/../api/health', '/rest/v1/a%2Fb', '/rest/v1/%5C..', '/rest/v1/a%2F..%2Fb', '/rest/v1/%zz'])(
    'rejects traversal path %s',
    async (path) => {
      const response = await forwardDataApi(req(path))
      expect(response.status).toBe(400)
      expect(fetchMock).not.toHaveBeenCalled()
    },
  )

  it('401s without Authorization (supabase-js always sends one)', async () => {
    const request = new Request(`${ORIGIN}/rest/v1/estimates`, { headers: { apikey: 'x' } })
    const response = await forwardDataApi(request)
    expect(response.status).toBe(401)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('response passthrough', () => {
  beforeEach(() => env({ DATA_API_UPSTREAM_URL: UPSTREAM, DATA_API_UPSTREAM_KEY: GATEWAY_KEY }))

  it('passes status, body and only allowlisted headers (content-range included)', async () => {
    const response = await forwardDataApi(req('/rest/v1/estimates', { headers: { range: '0-0' } }))
    expect(response.status).toBe(206)
    expect(await response.text()).toBe('[{"id":1}]')
    expect(response.headers.get('content-range')).toBe('0-0/5')
    expect(response.headers.get('x-total-count')).toBe('5')
    expect(response.headers.get('content-type')).toBe('application/json')
    expect(response.headers.has('set-cookie')).toBe(false)
    expect(response.headers.has('x-powered-by')).toBe(false)
    expect(response.headers.has('connection')).toBe(false)
    expect(response.headers.get('cache-control')).toBe('no-store')
  })

  it('passes upstream errors through untouched (RLS 403 / PGRST codes)', async () => {
    fetchMock.mockResolvedValueOnce(new Response('{"code":"42501"}', { status: 403, headers: { 'content-type': 'application/json' } }))
    const response = await forwardDataApi(req('/rest/v1/estimates', { method: 'DELETE' }))
    expect(response.status).toBe(403)
    expect(await response.json()).toEqual({ code: '42501' })
  })

  it('returns a null body for 204', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204, headers: { location: '/x' } }))
    const response = await forwardDataApi(req('/rest/v1/estimates', { method: 'PATCH', body: '{}' }))
    expect(response.status).toBe(204)
    expect(response.headers.get('location')).toBe('/x')
  })

  it('504 on upstream timeout, 502 on any other failure', async () => {
    fetchMock.mockRejectedValueOnce(Object.assign(new Error('t'), { name: 'TimeoutError' }))
    expect((await forwardDataApi(req('/rest/v1/estimates'))).status).toBe(504)
    fetchMock.mockRejectedValueOnce(new TypeError('fetch failed'))
    expect((await forwardDataApi(req('/rest/v1/estimates'))).status).toBe(502)
  })

  it('arms a 30 s abort signal on the upstream call', async () => {
    await forwardDataApi(req('/rest/v1/estimates'))
    expect(fetchMock.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal)
  })
})

describe('OPTIONS', () => {
  it('is answered locally without touching the upstream', async () => {
    const response = OPTIONS()
    expect(response.status).toBe(204)
    expect(dataApiOptions().headers.get('allow')).toContain('PATCH')
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
