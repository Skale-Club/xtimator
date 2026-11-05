import 'server-only'
import type { NextRequest, NextResponse } from 'next/server'
import { readOwnedSession, renewOwnedSession, SESSION_COOKIE, sessionCookieOptions, sessionClaims } from './owned-session'

export async function ownedRequestClaims(request: NextRequest, response: NextResponse) {
  const token = request.cookies.get(SESSION_COOKIE)?.value
  const session = await readOwnedSession(token)
  if (!session) return null
  if (Date.parse(session.expires_at) - Date.now() < 7 * 86400_000) {
    const maxAge = await renewOwnedSession(session)
    response.cookies.set(SESSION_COOKIE, token!, { ...sessionCookieOptions, maxAge })
  }
  return sessionClaims(session)
}
