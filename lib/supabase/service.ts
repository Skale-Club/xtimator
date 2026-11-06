import { createClient } from '@supabase/supabase-js'
import { resolveServiceClientConfig } from '@/lib/supabase/data-api'
import { ownedAuthEnabled } from '@/lib/auth/mode'
import { ownedAdminAuth, withOwnedAuth } from '@/lib/auth/owned-client'

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
  const config = resolveServiceClientConfig()
  if (!config.ok) return null
  const client = createClient(config.url, config.key, {
    auth: { persistSession: false, autoRefreshToken: false },
    ...(config.fetch ? { global: { fetch: config.fetch } } : {}),
  })
  return ownedAuthEnabled() ? withOwnedAuth(client, ownedAdminAuth(client)) : client
}

/**
 * Non-nullable variant for runtime-only callers (API routes, Server Actions,
 * cron jobs). Throws a clear error at runtime if the env vars are missing so
 * the root cause is immediately obvious instead of a cascade of null errors.
 */
export function requireServiceClient() {
  const config = resolveServiceClientConfig()
  if (!config.ok) throw new Error(`[requireServiceClient] ${config.reason}`)
  const client = createClient(config.url, config.key, {
    auth: { persistSession: false, autoRefreshToken: false },
    ...(config.fetch ? { global: { fetch: config.fetch } } : {}),
  })
  return ownedAuthEnabled() ? withOwnedAuth(client, ownedAdminAuth(client)) : client
}
