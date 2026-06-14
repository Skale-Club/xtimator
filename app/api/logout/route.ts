import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// Clears the current session (handy for shaking off a leftover demo session)
// and sends you to the login dialog.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const supabase = await createClient()
  await supabase.auth.signOut()
  return NextResponse.redirect(new URL('/?auth=login', request.url))
}
