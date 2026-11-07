import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { cache } from 'react'
import { ownedAuthEnabled } from '@/lib/auth/mode'

// React's cache is scoped to the server request. Layouts, pages and tenant
// queries share one client/session without retaining credentials across users.
export const createClient = cache(async () => {
  if (ownedAuthEnabled()) return (await import('@/lib/auth/owned-client')).createOwnedClient()
  const cookieStore = await cookies() // MUST await — Next.js 15+ requirement
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Server Components cannot set cookies; middleware handles session rotation
          }
        },
      },
    }
  )
})
