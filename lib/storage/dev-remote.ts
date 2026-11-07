import 'server-only'

/**
 * Local development only: when an asset is in neither R2 nor Supabase, ask the
 * production app for it instead of returning a 404.
 *
 * Production objects live in R2, and a developer machine usually has no `S3_*`
 * credentials, so `/storage/...` falls through to Supabase, which no longer
 * holds them, and every landing image, brand logo and company logo is broken on
 * localhost. Fetching them from production's own public `/storage/...` route
 * needs no key on the developer's machine.
 *
 * Deliberately narrow:
 *  - only when NODE_ENV is exactly 'development' (never in production, never in
 *    vitest, whose NODE_ENV is 'test'), so it cannot change a deployed response;
 *  - only for publicly readable buckets, so no cookie or tenant check is ever
 *    forwarded and private job photos, audio and PDFs still 404 locally;
 *  - `STORAGE_DEV_REMOTE_ORIGIN` points it elsewhere (a staging host), and
 *    setting it to `off` turns it off.
 */
const DEFAULT_ORIGIN = 'https://xtimator.com'

export function devRemoteOrigin(): string | null {
  if (process.env.NODE_ENV !== 'development') return null
  const raw = process.env.STORAGE_DEV_REMOTE_ORIGIN?.trim()
  if (raw && ['off', 'false', '0'].includes(raw.toLowerCase())) return null
  return (raw || DEFAULT_ORIGIN).replace(/\/+$/, '')
}

/** Fetches `/storage/{bucket}/{key}` from the remote origin; null when off or missing. */
export async function fetchFromDevRemote(bucket: string, key: string): Promise<Response | null> {
  const origin = devRemoteOrigin()
  if (!origin) return null
  const path = key.split('/').map(encodeURIComponent).join('/')
  try {
    const res = await fetch(`${origin}/storage/${encodeURIComponent(bucket)}/${path}`, { cache: 'no-store' })
    if (!res.ok || !res.body) return null
    return new Response(res.body, {
      status: 200,
      headers: {
        'Content-Type': res.headers.get('content-type') ?? 'application/octet-stream',
        'Cache-Control': 'private, no-store',
        'Content-Disposition': 'inline',
        'X-Content-Type-Options': 'nosniff',
        'X-Asset-Source': `dev-remote:${origin}`,
      },
    })
  } catch {
    return null
  }
}
