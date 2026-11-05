import { NextResponse } from 'next/server'
import { ownedAuthEnabled } from '@/lib/auth/mode'
import { publicIdentityConfig } from '@/lib/auth/google-identity'
import { noStore } from '@/lib/auth/http'

export const dynamic = 'force-dynamic'
export async function GET() {
  if (!ownedAuthEnabled()) return NextResponse.json({ mode: 'supabase' }, { headers: noStore })
  try { return NextResponse.json({ mode: 'owned', firebase: publicIdentityConfig() }, { headers: noStore }) }
  catch { return NextResponse.json({ code: 'auth_unavailable' }, { status: 503, headers: noStore }) }
}
