// Phase 86: canonical issuer URL resolver.
//
// Resolution order (per SEED-030 / spec):
//   1. NEXT_PUBLIC_APP_URL (if set)
//   2. VERCEL_URL (auto-set by Vercel — must be prefixed with https://)
//   3. fallback to the incoming request's origin

import { headers } from 'next/headers'

export async function resolveIssuer(): Promise<string> {
  const explicit = process.env.NEXT_PUBLIC_APP_URL
  if (explicit) return stripTrailingSlash(explicit)

  const vercel = process.env.VERCEL_URL
  if (vercel) return `https://${vercel}`

  // Fall back to the incoming request's origin (works on localhost too).
  const h = await headers()
  const proto = h.get('x-forwarded-proto') ?? 'http'
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost:9633'
  return `${proto}://${host}`
}

function stripTrailingSlash(s: string): string {
  return s.endsWith('/') ? s.slice(0, -1) : s
}
