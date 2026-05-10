import { createClient } from '@supabase/supabase-js'

/**
 * Creates a Supabase service-role client.
 * Returns null when the required env vars are absent (e.g. during static
 * pre-rendering at build time on Vercel), so callers can fall back gracefully
 * instead of crashing with "supabaseUrl is required".
 *
 * Use this only in code that may run during the Next.js static build phase
 * (e.g. manifest.ts, layout metadata). For runtime-only code (API routes,
 * Server Actions) prefer requireServiceClient() which is non-nullable.
 */
export function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key)
}

/**
 * Non-nullable variant for runtime-only callers (API routes, Server Actions,
 * cron jobs). Throws a clear error at runtime if the env vars are missing so
 * the root cause is immediately obvious instead of a cascade of null errors.
 */
export function requireServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error(
      '[requireServiceClient] NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY must be set.'
    )
  }
  return createClient(url, key)
}
