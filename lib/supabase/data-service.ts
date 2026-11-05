import 'server-only'
import { createClient } from '@supabase/supabase-js'

/** Data transport only. Never use this factory to authenticate an end user. */
export function createDataServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } })
}

export function requireDataServiceClient() {
  const client = createDataServiceClient()
  if (!client) throw new Error('Data service configuration is incomplete')
  return client
}
