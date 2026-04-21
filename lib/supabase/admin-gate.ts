import 'server-only'
import { createServerClient } from '@supabase/ssr'
import type { NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'

/**
 * Proxy-side admin membership check (ADMIN-01, D-07).
 *
 * Reads the SSR session from the incoming request cookies, then queries
 * `platform_admins` via the service-role client (RLS bypass). Returns false
 * for any negative outcome — no session, missing claims, or no row — so the
 * proxy can rewrite to /404 without revealing whether the route exists.
 *
 * Does NOT throw. Does NOT mutate cookies (proxy already rotates the session
 * via updateSession() — this helper only reads).
 */
export async function checkPlatformAdmin(request: NextRequest): Promise<boolean> {
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        // No-op: checkPlatformAdmin is read-only; updateSession() handles cookie rotation.
        setAll: () => {
          /* intentionally empty */
        },
      },
    }
  )

  const { data } = await supabase.auth.getClaims()
  const userId = data?.claims?.sub
  if (!userId) return false

  const svc = createServiceClient()
  const { data: row } = await svc
    .from('platform_admins')
    .select('user_id')
    .eq('user_id', userId)
    .maybeSingle()
  return !!row
}
