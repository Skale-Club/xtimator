import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// Clears the current session (handy for shaking off a leftover demo session)
// and sends you to the login dialog.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const supabase = await createClient()
  // Demo visitors share an account. Only remove this browser's session so one
  // visitor cannot revoke every other visitor's refresh token.
  await supabase.auth.signOut({ scope: 'local' })
  return NextResponse.redirect(new URL('/?auth=login', request.url))
}
