/**
 * SEED-059 — same-origin Data API proxy.
 *
 * The browser calls `${NEXT_PUBLIC_SUPABASE_URL}/rest/v1/...` where that build
 * value is the app's own origin; `app/rest/v1/[...path]/route.ts` hands every
 * request to `forwardDataApi`, which forwards it to the configured upstream:
 *
 *   - DATA_API_MODE=supabase (default): `${DATA_API_UPSTREAM_URL}/rest/v1/<path>`.
 *     The browser's `apikey` is an app-signed anon JWT, which the Supabase gateway
 *     does not recognise as a project key, so it is REPLACED with the server-side
 *     gateway key (`DATA_API_UPSTREAM_KEY`). `Authorization` (the user's data JWT
 *     or the anon JWT, both signed with the project JWT secret) passes through.
 *   - DATA_API_MODE=postgrest: `${POSTGREST_INTERNAL_URL}/<path>`, `apikey` dropped.
 *
 * Authorization is NOT decided here: the end-user JWT reaches PostgREST and RLS
 * decides. Only allowlisted headers travel in either direction; cookies never do.
 */
import { dataApiMode, dataApiUpstreamUrl, postgrestInternalUrl } from '@/lib/supabase/data-api'

export const DATA_PROXY_PREFIX = '/rest/v1'
export const DATA_PROXY_TIMEOUT_MS = 30_000

const REQUEST_HEADERS = [
  'authorization',
  'accept',
  'accept-profile',
  'content-profile',
  'content-type',
  'prefer',
  'range',
  'range-unit',
  'x-client-info',
] as const

const RESPONSE_HEADERS = [
  'content-type',
  'content-range',
  'content-location',
  'location',
  'preference-applied',
  'x-total-count',
] as const

function json(status: number, error: string): Response {
  return new Response(JSON.stringify({ message: error }), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  })
}

/** Server-side gateway key for the Supabase upstream (never the app-signed anon JWT). */
function upstreamGatewayKey(): string | undefined {
  return (
    process.env.DATA_API_UPSTREAM_KEY?.trim() ||
    process.env.SUPABASE_PUBLISHABLE_KEY?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ||
    undefined
  )
}

/** Returns the encoded sub-path after /rest/v1/, or null when it is unsafe. */
function safeSubPath(pathname: string): string | null {
  if (pathname !== DATA_PROXY_PREFIX && !pathname.startsWith(`${DATA_PROXY_PREFIX}/`)) return null
  const rest = pathname.slice(DATA_PROXY_PREFIX.length).replace(/^\/+/, '')
  for (const segment of rest.split('/')) {
    let decoded: string
    try {
      decoded = decodeURIComponent(segment)
    } catch {
      return null
    }
    if (decoded === '..' || decoded === '.' || decoded.includes('/') || decoded.includes('\\') || decoded.includes('\0')) {
      return null
    }
  }
  return rest
}

export async function forwardDataApi(request: Request): Promise<Response> {
  const url = new URL(request.url)
  const subPath = safeSubPath(url.pathname)
  if (subPath === null) return json(400, 'Invalid path')

  const authorization = request.headers.get('authorization')
  if (!authorization) return json(401, 'Missing Authorization header')

  let mode: ReturnType<typeof dataApiMode>
  try {
    mode = dataApiMode()
  } catch {
    return json(500, 'Data API is misconfigured')
  }

  let target: string
  const headers = new Headers()
  if (mode === 'postgrest') {
    const internal = postgrestInternalUrl()
    if (!internal) return json(500, 'Data API is misconfigured')
    target = `${internal}/${subPath}${url.search}`
  } else {
    const upstream = dataApiUpstreamUrl()
    const key = upstreamGatewayKey()
    if (!upstream || !key) return json(500, 'Data API is misconfigured')
    // A loop (upstream pointing back at this origin) would recurse until timeout.
    if (new URL(upstream).origin === url.origin) return json(508, 'Data API upstream loops back to this origin')
    target = `${upstream}${DATA_PROXY_PREFIX}/${subPath}${url.search}`
    headers.set('apikey', key)
  }

  for (const name of REQUEST_HEADERS) {
    const value = request.headers.get(name)
    if (value !== null) headers.set(name, value)
  }

  const hasBody = request.method !== 'GET' && request.method !== 'HEAD'
  let upstreamResponse: Response
  try {
    upstreamResponse = await fetch(target, {
      method: request.method,
      headers,
      redirect: 'manual',
      signal: AbortSignal.timeout(DATA_PROXY_TIMEOUT_MS),
      ...(hasBody && request.body ? { body: request.body, duplex: 'half' } : {}),
    } as RequestInit)
  } catch (error) {
    const name = (error as { name?: string } | null)?.name
    if (name === 'TimeoutError' || name === 'AbortError') return json(504, 'Data API upstream timed out')
    return json(502, 'Data API upstream unavailable')
  }

  const out = new Headers({ 'cache-control': 'no-store' })
  for (const name of RESPONSE_HEADERS) {
    const value = upstreamResponse.headers.get(name)
    if (value !== null) out.set(name, value)
  }
  const nullBody = upstreamResponse.status === 204 || upstreamResponse.status === 205 || upstreamResponse.status === 304
  return new Response(nullBody || request.method === 'HEAD' ? null : upstreamResponse.body, {
    status: upstreamResponse.status,
    headers: out,
  })
}

/** Same-origin requests never preflight; answer OPTIONS locally instead of forwarding. */
export function dataApiOptions(): Response {
  return new Response(null, {
    status: 204,
    headers: { allow: 'GET, HEAD, POST, PATCH, PUT, DELETE, OPTIONS', 'cache-control': 'no-store' },
  })
}
