/**
 * SEED-059 step 1 — data-API mode switch for the SERVICE clients.
 *
 * `DATA_API_MODE`:
 *   - `supabase` (default): the service client authenticates with the
 *     Supabase gateway key (`SUPABASE_SECRET_KEY` / `SUPABASE_SERVICE_ROLE_KEY`).
 *     Behaviour is unchanged.
 *   - `postgrest`: the data host is a vanilla self-hosted PostgREST, which only
 *     accepts JWTs signed with its `PGRST_JWT_SECRET` (= `XTIMATOR_DATA_JWT_SECRET`).
 *     The service client then sends a short-lived HS256 JWT
 *     `{ role: 'service_role', iss: 'xtimator' }` as both `Authorization: Bearer`
 *     and `apikey`. The token is signed lazily per request and cached until it
 *     is close to expiry, so long-lived clients never carry a stale token.
 *
 * Same-origin proxy (app/rest/v1 -> lib/supabase/data-proxy.ts): the BROWSER calls
 * `${NEXT_PUBLIC_SUPABASE_URL}/rest/v1` with `NEXT_PUBLIC_SUPABASE_URL` set to the
 * app's own origin, and the app forwards to the upstream. SERVER clients never hop
 * through the proxy: they use `dataApiBaseUrl()` (the upstream) and, in postgrest
 * mode with `POSTGREST_INTERNAL_URL` set, `<base>/rest/v1/...` is rewritten to
 * `${POSTGREST_INTERNAL_URL}/...` (PostgREST has no `/rest/v1` prefix).
 *
 * Secrets and tokens are never logged or included in error messages.
 */
import { SignJWT } from 'jose'

export type DataApiMode = 'supabase' | 'postgrest'

export const SERVICE_JWT_TTL_SECONDS = 60 * 60
/** Re-sign when fewer than this many seconds of validity remain. */
export const SERVICE_JWT_REFRESH_MARGIN_SECONDS = 5 * 60
const MIN_SECRET_BYTES = 32

export function dataApiMode(): DataApiMode {
  const raw = process.env.DATA_API_MODE?.trim().toLowerCase()
  if (!raw || raw === 'supabase') return 'supabase'
  if (raw === 'postgrest') return 'postgrest'
  // A typo at cutover must not silently fall back to the Supabase key path.
  throw new Error('DATA_API_MODE must be "supabase" or "postgrest"')
}

function dataJwtSecret(): string | null {
  const secret = process.env.XTIMATOR_DATA_JWT_SECRET
  if (!secret || Buffer.byteLength(secret) < MIN_SECRET_BYTES) return null
  return secret
}

function cleanUrl(raw: string | undefined): string | undefined {
  const value = raw?.trim().replace(/\/+$/, '')
  return value ? value : undefined
}

/** Server-only runtime env: the real upstream (Supabase project URL) behind the same-origin proxy. */
export function dataApiUpstreamUrl(): string | undefined {
  return cleanUrl(process.env.DATA_API_UPSTREAM_URL)
}

/** Server-only runtime env: internal base of the PostgREST container, e.g. http://host:3000. */
export function postgrestInternalUrl(): string | undefined {
  return cleanUrl(process.env.POSTGREST_INTERNAL_URL)
}

/**
 * Base URL SERVER-side Data API clients use. `DATA_API_UPSTREAM_URL` wins so the
 * server never depends on whether `NEXT_PUBLIC_SUPABASE_URL` was inlined into the
 * server bundle at build time (the build value is the app's own origin).
 */
export function dataApiBaseUrl(): string | undefined {
  return dataApiUpstreamUrl() ?? cleanUrl(process.env.NEXT_PUBLIC_SUPABASE_URL)
}

/** Maps `<anything>/rest/v1/<rest>` to `<internal>/<rest>`; null when the URL is not a Data API URL. */
export function rewriteToPostgrest(raw: string, internal: string): string | null {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return null
  }
  if (url.pathname !== '/rest/v1' && !url.pathname.startsWith('/rest/v1/')) return null
  return `${internal}${url.pathname.slice('/rest/v1'.length)}${url.search}`
}

/** fetch override for server clients (user + service): postgrest mode only, else undefined. */
export function postgrestRewriteFetch(inner: typeof fetch = fetch): typeof fetch | undefined {
  if (dataApiMode() !== 'postgrest') return undefined
  const internal = postgrestInternalUrl()
  if (!internal) return undefined
  return (input, init) => {
    const raw = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const target = rewriteToPostgrest(raw, internal)
    if (!target) return inner(input, init)
    return inner(input instanceof Request ? new Request(target, input) : target, init)
  }
}

let cache: { secret: string; token: string; exp: number } | null = null

/** Test hook: drop the cached service token. */
export function resetServiceJwtCache() {
  cache = null
}

export async function signServiceJwt(now: number = Date.now()): Promise<string> {
  const secret = dataJwtSecret()
  if (!secret) throw new Error('Data JWT signing configuration is incomplete (XTIMATOR_DATA_JWT_SECRET)')
  const nowSec = Math.floor(now / 1000)
  if (cache && cache.secret === secret && cache.exp - nowSec > SERVICE_JWT_REFRESH_MARGIN_SECONDS) {
    return cache.token
  }
  const exp = nowSec + SERVICE_JWT_TTL_SECONDS
  const token = await new SignJWT({ role: 'service_role', iss: 'xtimator' })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuedAt(nowSec)
    .setExpirationTime(exp)
    .sign(new TextEncoder().encode(secret))
  cache = { secret, token, exp }
  return token
}

export type ServiceClientConfig =
  | { ok: true; url: string; key: string; fetch?: typeof fetch }
  | { ok: false; reason: string }

/** fetch wrapper that stamps the service JWT on every Data API request. */
function serviceJwtFetch(): typeof fetch {
  const send = postgrestRewriteFetch(((input, init) => fetch(input, init)) as typeof fetch) ?? ((input, init) => fetch(input, init))
  return async (input, init) => {
    const token = await signServiceJwt()
    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined))
    headers.set('Authorization', `Bearer ${token}`)
    headers.set('apikey', token)
    return send(input, { ...init, headers })
  }
}

/**
 * Resolves the URL, key and optional fetch override for a service client.
 * Pure over `process.env`; callers decide whether `ok: false` means `null`
 * (static-build-safe factories) or a thrown error (runtime factories).
 */
export function resolveServiceClientConfig(): ServiceClientConfig {
  const url = dataApiBaseUrl()
  if (dataApiMode() === 'postgrest') {
    if (!url) return { ok: false, reason: 'DATA_API_UPSTREAM_URL or NEXT_PUBLIC_SUPABASE_URL must be set.' }
    if (!dataJwtSecret()) {
      return {
        ok: false,
        reason: 'DATA_API_MODE=postgrest requires XTIMATOR_DATA_JWT_SECRET (at least 32 bytes).',
      }
    }
    // supabase-js needs a non-empty key to construct; the fetch wrapper overrides it.
    return { ok: true, url, key: 'postgrest-service-jwt', fetch: serviceJwtFetch() }
  }
  const key = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    return {
      ok: false,
      reason: 'NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY must be set.',
    }
  }
  return { ok: true, url, key }
}
