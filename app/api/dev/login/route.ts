import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { ownedAuthEnabled } from '@/lib/auth/mode'
import { issueOwnedSession, SESSION_COOKIE, SESSION_SECONDS, sessionCookieOptions } from '@/lib/auth/owned-session'
import { requireDataServiceClient } from '@/lib/supabase/data-service'

export const runtime = 'nodejs'

/**
 * Development-only sign-in, so people and agents can open any screen on localhost without Google:
 *   GET /api/dev/login               -> the first platform admin of the development database
 *   GET /api/dev/login?email=a@b.com -> that account
 *   &to=/academy                     -> where to land (same-site paths only)
 * Answers 404 outside NODE_ENV=development and for any request not addressed to this computer.
 */
export async function GET(request: Request) {
  if (process.env.NODE_ENV !== 'development' || !ownedAuthEnabled() || !isLocalRequest(request)) {
    return new NextResponse(null, { status: 404 })
  }
  const url = new URL(request.url)
  const email = url.searchParams.get('email')?.trim().toLowerCase() ?? ''
  const db = requireDataServiceClient()

  let userId: string | null = null
  if (email) {
    const { data } = await db.from('xtimator_accounts').select('id').ilike('email', email).limit(1).maybeSingle()
    userId = (data?.id as string | undefined) ?? null
  } else {
    const { data } = await db.from('platform_admins').select('user_id').limit(1).maybeSingle()
    userId = (data?.user_id as string | undefined) ?? null
  }
  if (!userId) {
    return NextResponse.json({ message: email ? `No account with ${email}` : 'No platform admin in this database' }, { status: 404 })
  }

  const token = await issueOwnedSession(userId)
  const jar = await cookies()
  jar.set(SESSION_COOKIE, token, { ...sessionCookieOptions, maxAge: SESSION_SECONDS })

  const to = url.searchParams.get('to') ?? '/dashboard'
  const destination = to.startsWith('/') && !to.startsWith('//') ? to : '/dashboard'
  return NextResponse.redirect(new URL(destination, url.origin))
}

// Next's dev server adds x-forwarded-* itself, so the Host header is the signal here.
function isLocalRequest(request: Request) {
  const host = (request.headers.get('host') ?? '').split(':')[0]
  return host === 'localhost' || host === '127.0.0.1' || host === '[::1]'
}
