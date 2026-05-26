// Phase 86: canonical issuer URL resolver.
// Phase 86 hotfix 2026-05-26: production must resolve to https://xtimator.com,
// not the per-deployment Vercel preview URL (xtimator-XXXX-skaleclub.vercel.app).
//
// Resolution order:
//   1. NEXT_PUBLIC_APP_URL (explicit override — wins everywhere)
//   2. VERCEL_ENV === 'production' → CANONICAL_PRODUCTION_URL (https://xtimator.com)
//      This handles the case where NEXT_PUBLIC_APP_URL was forgotten in Vercel env vars;
//      production deployments always emit the canonical domain so OAuth issuer / .well-known
//      metadata is stable across deploys.
//   3. VERCEL_URL (preview deployments — each deploy gets its own URL, OAuth flow works
//      against that preview only, useful for testing)
//   4. fallback to the incoming request's origin (localhost dev)

import { headers } from 'next/headers'

/** Canonical production URL — matches the convention in lib/billing/connect-webhook.ts,
 *  lib/whatsapp/confirm.ts, and app/api/cron/trial-warning-emails/route.ts. */
const CANONICAL_PRODUCTION_URL = 'https://xtimator.com'

export async function resolveIssuer(): Promise<string> {
  const explicit = normalize(process.env.NEXT_PUBLIC_APP_URL)
  if (explicit) return explicit

  if (process.env.VERCEL_ENV === 'production') return CANONICAL_PRODUCTION_URL

  const vercel = normalize(process.env.VERCEL_URL)
  if (vercel) return `https://${vercel}`

  // Fall back to the incoming request's origin (works on localhost too).
  const h = await headers()
  const proto = h.get('x-forwarded-proto') ?? 'http'
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost:9633'
  return `${proto}://${host}`
}

/** Defensive normalization: trims whitespace (e.g. trailing newline from `echo ... | vercel env add`)
 *  and strips a trailing slash. Returns null for empty / whitespace-only values so callers
 *  fall through to the next resolution branch. */
function normalize(raw: string | undefined): string | null {
  if (!raw) return null
  const trimmed = raw.trim()
  if (!trimmed) return null
  return trimmed.endsWith('/') ? trimmed.slice(0, -1) : trimmed
}
