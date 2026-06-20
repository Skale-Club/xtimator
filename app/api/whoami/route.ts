import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireServiceClient } from '@/lib/supabase/service'

// Temporary diagnostic: reports the CURRENT browser session's identity and
// whether it is a platform admin. Reveals only the caller's own session.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const supabase = await createClient()
  const { data } = await supabase.auth.getClaims()
  const userId = (data?.claims?.sub as string | undefined) ?? null
  const email = (data?.claims?.email as string | undefined) ?? null

  let isAdmin = false
  if (userId) {
    const svc = requireServiceClient()
    const { data: row } = await svc
      .from('platform_admins')
      .select('user_id')
      .eq('user_id', userId)
      .maybeSingle()
    isAdmin = !!row
  }

  return NextResponse.json({ loggedIn: !!userId, userId, email, isAdmin })
}
