import 'server-only'
import { cache } from 'react'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { requireServiceClient } from '@/lib/supabase/service'

export type AdminContext = {
  userId: string
  email: string
}

/**
 * Resolves the current admin context, or null when the signed-in user is not a
 * platform admin (or nobody is signed in).
 *
 * The lookup is a direct, per-request query (memoized within the request by
 * React `cache`). It is intentionally NOT wrapped in `unstable_cache`: the prior
 * implementation used a constant cache key (`['admin-check']`) which could share
 * one cached result across different users, so a non-admin's cached `false`
 * could be served to a real admin and 404 them out of /admin. A single indexed
 * lookup on a low-traffic surface is not worth that risk.
 */
export const getAdminContext = cache(async (): Promise<AdminContext | null> => {
  const supabase = await createClient()
  const { data } = await supabase.auth.getClaims()
  const userId = data?.claims?.sub
  const email = (data?.claims?.email as string | undefined) ?? ''
  if (!userId) return null

  const svc = requireServiceClient()
  const { data: row } = await svc
    .from('platform_admins')
    .select('user_id')
    .eq('user_id', userId)
    .maybeSingle()

  return row ? { userId, email } : null
})

export async function requireAdmin(): Promise<AdminContext> {
  const ctx = await getAdminContext()
  if (!ctx) notFound()
  return ctx
}
