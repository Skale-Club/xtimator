import 'server-only'
import { cache } from 'react'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

export type AdminContext = {
  userId: string
  email: string
}

/**
 * Per-request admin context, memoised via React `cache()` so that the proxy +
 * admin layout + nested server components + server actions all share a single
 * DB lookup per render (P-02 in 08-RESEARCH.md).
 *
 * Returns null when:
 *   - the request has no SSR session, or
 *   - the user is not a member of `platform_admins`.
 *
 * Belt-and-braces with the proxy gate (P-01c): the proxy already 404s
 * non-admins, but the layout MUST re-verify (per Next.js 16 proxy docs:
 * "always verify authentication and authorization inside each Server
 * Function rather than relying on Proxy alone").
 */
export const getAdminContext = cache(async (): Promise<AdminContext | null> => {
  const supabase = await createClient()
  const { data } = await supabase.auth.getClaims()
  const userId = data?.claims?.sub
  const email = (data?.claims?.email as string | undefined) ?? ''
  if (!userId) return null

  const svc = createServiceClient()
  const { data: row } = await svc
    .from('platform_admins')
    .select('user_id')
    .eq('user_id', userId)
    .maybeSingle()

  return row ? { userId, email } : null
})

/**
 * Layout / server-action guard. Throws via `notFound()` when not an admin.
 *
 * Use in admin layout.tsx (after the proxy gate) and at the top of any admin
 * server action (R-05 mitigation: don't rely on proxy matcher coverage).
 */
export async function requireAdmin(): Promise<AdminContext> {
  const ctx = await getAdminContext()
  if (!ctx) notFound()
  return ctx
}
