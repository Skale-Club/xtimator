import { createBrowserClient } from '@supabase/ssr'
import { ownedAuthEnabled } from '@/lib/auth/mode'
import { createOwnedBrowserClient } from '@/lib/auth/owned-browser'

export function createClient() {
  if (ownedAuthEnabled()) return createOwnedBrowserClient()
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)!
  )
}
