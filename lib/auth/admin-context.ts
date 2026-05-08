import 'server-only'
import { cache } from 'react'
import { unstable_cache } from 'next/cache'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { requireServiceClient } from '@/lib/supabase/service'

export type AdminContext = {
  userId: string
  email: string
}

// DB lookup cached for 60s per userId — avoids a round-trip on every admin page nav.
const cachedIsAdmin = unstable_cache(
  async (userId: string): Promise<boolean> => {
    const svc = requireServiceClient()
    const { data } = await svc
      .from('platform_admins')
      .select('user_id')
      .eq('user_id', userId)
      .maybeSingle()
    return !!data
  },
  ['admin-check'],
  { revalidate: 60, tags: ['platform_admins'] }
)

export const getAdminContext = cache(async (): Promise<AdminContext | null> => {
  const supabase = await createClient()
  const { data } = await supabase.auth.getClaims()
  const userId = data?.claims?.sub
  const email = (data?.claims?.email as string | undefined) ?? ''
  if (!userId) return null

  const isAdmin = await cachedIsAdmin(userId)
  return isAdmin ? { userId, email } : null
})

export async function requireAdmin(): Promise<AdminContext> {
  const ctx = await getAdminContext()
  if (!ctx) notFound()
  return ctx
}
