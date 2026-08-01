// Phase 86: canonical issuer URL resolver.
// Vercel->Coolify migration cleanup (2026-08-01): removed the VERCEL_ENV /
// VERCEL_URL branches (Coolify has no equivalent env vars) and replaced the
// production safety net with a NODE_ENV check, so production never trusts a
// request Host header for the OAuth issuer.
//
// Resolution order:
//   1. Explicit env tier — APP_ORIGIN (runtime, non-inlined) → NEXT_PUBLIC_APP_URL
//      (legacy alias) → NEXT_PUBLIC_SITE_URL. The first non-empty value wins everywhere.
//   2. NODE_ENV === 'production' → CANONICAL_PRODUCTION_URL (https://xtimator.com)
//      Safety net: if the explicit env was forgotten, production must still emit the
//      canonical domain rather than trusting the incoming request's Host header (which
//      could be spoofed via x-forwarded-host), so OAuth issuer / .well-known metadata
//      stays stable and unspoofable across deploys.
//   3. fallback to the incoming request's origin (dev/test only)
//
// NOTE: we deliberately read the explicit env vars directly (rather than calling
// getCanonicalBaseUrl(), which never returns null) so the NODE_ENV production
// branch and the next/headers fallback below stay reachable.

import { headers } from 'next/headers'

/** Canonical production URL — matches the convention in lib/billing/connect-webhook.ts
 *  and lib/whatsapp/confirm.ts. */
const CANONICAL_PRODUCTION_URL = 'https://xtimator.com'

export async function resolveIssuer(): Promise<string> {
  const explicitEnv =
    process.env.APP_ORIGIN ??
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.NEXT_PUBLIC_SITE_URL
  const explicit = normalize(explicitEnv)
  if (explicit) return explicit

  if (process.env.NODE_ENV === 'production') return CANONICAL_PRODUCTION_URL

  // Fall back to the incoming request's origin (dev/test only — never reached
  // in production, see NODE_ENV branch above).
  const h = await headers()
  const proto = h.get('x-forwarded-proto') ?? 'http'
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost:9633'
  return `${proto}://${host}`
}

/** Defensive normalization: trims whitespace (e.g. trailing newline from a shell-piped
 *  env var assignment) and strips a trailing slash. Returns null for empty / whitespace-only
 *  values so callers fall through to the next resolution branch. */
function normalize(raw: string | undefined): string | null {
  if (!raw) return null
  const trimmed = raw.trim()
  if (!trimmed) return null
  return trimmed.endsWith('/') ? trimmed.slice(0, -1) : trimmed
}
