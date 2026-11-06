import 'server-only'
import { createClient } from '@supabase/supabase-js'
import { resolveServiceClientConfig } from '@/lib/supabase/data-api'

/** Data transport only. Never use this factory to authenticate an end user. */
export function createDataServiceClient() {
  const config = resolveServiceClientConfig()
  if (!config.ok) return null
  return createClient(config.url, config.key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    ...(config.fetch ? { global: { fetch: config.fetch } } : {}),
  })
}

export function requireDataServiceClient() {
  const client = createDataServiceClient()
  if (!client) throw new Error('Data service configuration is incomplete')
  return client
}
