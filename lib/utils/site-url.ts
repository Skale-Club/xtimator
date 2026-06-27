// Canonical base-URL resolver for server-side redirect construction.
//
 // Background (Hetzner/Coolify migration 2026-05-31): behind the Coolify reverse
 // proxy the Next.js standalone server binds HOSTNAME=0.0.0.0 PORT=3000, so
 // `new URL(request.url).origin` resolves to the internal bind address
 // `https://0.0.0.0:3000` instead of the public domain. Any redirect built from
 // that origin (e.g. the OAuth callback) sends users to https://0.0.0.0:3000/dashboard.
 //
 // Resolution precedence:
 //   1. Sanitized APP_ORIGIN (RUNTIME, non-inlined — settable in Coolify without a
 //      rebuild + container restart; wins everywhere). This is the primary lever for
 //      fixing the public URL on the VPS since it does not require a new build.
 //   2. Sanitized NEXT_PUBLIC_SITE_URL (build-INLINED — baked in at `next build` time,
 //      so changing it requires a rebuild, which is what APP_ORIGIN avoids)
 //   3. Proxy headers: `${X-Forwarded-Proto}://${X-Forwarded-Host || Host}`
 //   4. Last resort: the canonical production domain (never the internal bind address)
 //
 // Synchronous (reads directly from the passed Request) — unlike resolveIssuer()
 // in lib/oauth/issuer.ts which is async via next/headers; here the caller already
 // holds the Request, so no async header() call is needed.

/** Internal hostnames that must never be used for external redirects. */
const INTERNAL_HOSTS = new Set([
  '0.0.0.0',
  '[::]',
  '::',
  'localhost',
  '127.0.0.1',
  '[::1]',
])

/** Check if a host is an internal/loopback address. */
function isInternalHost(host: string): boolean {
  // Normalize: strip port, strip IPv6 brackets
  const normalized = host.replace(/^\[(.+)\]$/, '$1').split(':')[0].toLowerCase()
  return INTERNAL_HOSTS.has(normalized)
}

/** Defensive normalization: trims whitespace (handles the literal trailing newline
 *  in the Coolify env value), strips surrounding single/double quotes, and removes a
 *  trailing slash. Returns null for empty / whitespace-only values so the caller falls
 *  through to the next resolution branch. */
function normalize(raw: string | undefined | null): string | null {
  if (!raw) return null
  let trimmed = raw.trim()
  if (!trimmed) return null
  // Strip surrounding single or double quotes (env value may be quoted).
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    trimmed = trimmed.slice(1, -1).trim()
  }
  if (!trimmed) return null
  if (trimmed.endsWith('/')) trimmed = trimmed.slice(0, -1)
  return trimmed || null
}

export function resolveBaseUrl(request: Request): string {
  // 1. Runtime, non-inlined APP_ORIGIN — wins everywhere.
  const runtime = normalize(process.env.APP_ORIGIN)
  if (runtime) return runtime

  // 2. Build-inlined explicit canonical domain.
  const explicit = normalize(process.env.NEXT_PUBLIC_SITE_URL)
  if (explicit) return explicit

  // 3. Proxy headers — only usable when a host is present.
  const proto = request.headers.get('x-forwarded-proto') ?? 'http'
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host')
  if (host && !isInternalHost(host)) return `${proto}://${host}`

  // 4. Last resort: the canonical production domain (NEVER the internal bind address).
  return 'https://xtimator.com'
}

/** Request-less canonical base-URL resolver for modules that have no Request in
 *  scope (OAuth issuer, WhatsApp senders, cron jobs, Connect webhook, server
 *  actions). Precedence mirrors resolveBaseUrl's env tiers, then adds the legacy
 *  NEXT_PUBLIC_APP_URL alias, and finally falls back to the canonical production
 *  domain (the literal final fallback below). */
export function getCanonicalBaseUrl(): string {
  return (
    normalize(process.env.APP_ORIGIN) ??
    normalize(process.env.NEXT_PUBLIC_SITE_URL) ??
    normalize(process.env.NEXT_PUBLIC_APP_URL) ??
    'https://xtimator.com'
  )
}
