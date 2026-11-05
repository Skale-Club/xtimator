import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { ownedAuthEnabled } from '@/lib/auth/mode'
import { issueDataToken, readOwnedSession, revokeOwnedSession, SESSION_COOKIE, PENDING_COOKIE, RECOVERY_COOKIE, EMAIL_COOKIE, DATA_TOKEN_SECONDS, sessionCookieOptions, toUser } from '@/lib/auth/owned-session'
import { noStore, sameAuthOrigin } from '@/lib/auth/http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  if (!ownedAuthEnabled()) return NextResponse.json({ code: 'not_enabled' }, { status: 404, headers: noStore })
  try {
    const session = await readOwnedSession((await cookies()).get(SESSION_COOKIE)?.value)
    if (!session) return NextResponse.json({ user: null, accessToken: null }, { headers: noStore })
    return NextResponse.json({ user: toUser(session.account), accessToken: await issueDataToken(session),
      expiresAt: Math.min(Date.now() + DATA_TOKEN_SECONDS * 1000, Date.parse(session.expires_at)) }, { headers: noStore })
  } catch { return NextResponse.json({ code: 'auth_unavailable' }, { status: 503, headers: noStore }) }
}

export async function DELETE(request: Request) {
  if (!ownedAuthEnabled()) return NextResponse.json({ code: 'not_enabled' }, { status: 404 })
  if (!sameAuthOrigin(request, true)) return NextResponse.json({ code: 'origin_denied' }, { status: 403 })
  try {
    const jar = await cookies()
    await revokeOwnedSession(jar.get(SESSION_COOKIE)?.value)
    for (const name of [SESSION_COOKIE, PENDING_COOKIE, RECOVERY_COOKIE, EMAIL_COOKIE]) jar.set(name, '', { ...sessionCookieOptions, maxAge: 0 })
    return NextResponse.json({ success: true }, { headers: noStore })
  } catch { return NextResponse.json({ code: 'auth_unavailable' }, { status: 503 }) }
}
