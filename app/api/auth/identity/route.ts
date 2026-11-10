import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { ownedAuthEnabled } from '@/lib/auth/mode'
import { verifyIdentity } from '@/lib/auth/google-identity'
import { completeIdentity, getOwnedAccount, rateLimitOwned, rememberGoogle, requireOwnedActivation } from '@/lib/auth/owned-store'
import { issueOwnedSession, readOwnedSession, revokeOwnedSession, SESSION_COOKIE, PENDING_COOKIE, RECOVERY_COOKIE, SESSION_SECONDS, sessionCookieOptions } from '@/lib/auth/owned-session'
import { noStore, safeInviteDestination, sameAuthOrigin } from '@/lib/auth/http'
import { requireDataServiceClient } from '@/lib/supabase/data-service'
import { clientIpFromHeaders } from '@/lib/security/bot-defense'
import { isValidTheme, writeThemeCookie } from '@/lib/theme/cookie'
import { syncWhatsAppSenderAfterPhoneChange } from '@/lib/whatsapp/sender-link'

export const runtime = 'nodejs'
const bodySchema = z.object({ idToken: z.string().min(1).max(16384), next: z.string().max(2048).nullable().optional(), purpose: z.enum(['login', 'link']).default('login') }).strict()

export async function POST(request: Request) {
  if (!ownedAuthEnabled()) return NextResponse.json({ code: 'not_enabled' }, { status: 404 })
  if (!sameAuthOrigin(request)) return NextResponse.json({ code: 'origin_denied' }, { status: 403 })
  try {
    if (!await rateLimitOwned(`identity:${clientIpFromHeaders(request.headers)}`, 30)) return NextResponse.json({ code: 'rate_limited' }, { status: 429, headers: { ...noStore, 'Retry-After': '900' } })
    const body = bodySchema.safeParse(await request.json().catch(() => null))
    if (!body.success) return NextResponse.json({ code: 'invalid_request' }, { status: 400 })
    await requireOwnedActivation()
    let identity
    try { identity = await verifyIdentity(body.data.idToken) }
    catch { return NextResponse.json({ code: 'invalid_identity' }, { status: 401 }) }
    const jar = await cookies()
    const current = await readOwnedSession(jar.get(SESSION_COOKIE)?.value)
    if (body.data.purpose === 'link' && (!current || Date.now() - Date.parse(current.auth_time) > 300_000)) {
      return NextResponse.json({ code: 'reauthentication_required' }, { status: 401 })
    }
    if (body.data.purpose === 'link' && current) {
      const { data: demo, error } = await requireDataServiceClient().from('demo_config').select('user_id').eq('user_id', current.user_id).maybeSingle()
      if (error) throw new Error('identity_unavailable')
      if (demo) return NextResponse.json({ code: 'demo_readonly' }, { status: 403 })
    }
    const phone = identity.provider === 'phone'
    const id = await completeIdentity(identity, {
      pending: phone ? jar.get(PENDING_COOKIE)?.value : undefined,
      recovery: phone ? jar.get(RECOVERY_COOKIE)?.value : undefined,
      currentUser: body.data.purpose === 'link' ? current?.user_id : undefined,
    })
    const account = id ? await getOwnedAccount(id) : null
    if (id && !account) throw new Error('identity_unavailable')
    if (!id || (identity.provider === 'google.com' && !account?.phone_confirmed_at)) {
      const pending = await rememberGoogle(identity, id)
      jar.set(PENDING_COOKIE, pending, { ...sessionCookieOptions, maxAge: 600 })
      return NextResponse.json({ status: 'phone_required' }, { headers: noStore })
    }
    const service = requireDataServiceClient()
    const { data: demo, error: demoError } = await service.from('demo_config').select('user_id').eq('user_id', id).maybeSingle()
    if (demoError) throw new Error('identity_unavailable')
    if (demo) return NextResponse.json({ code: 'demo_login_required' }, { status: 403 })
    // A verified phone change (the 'link' flow) moves the WhatsApp owner sender with it:
    // old rows are suspended, the new phone is linked. Best-effort, never throws.
    if (phone && (body.data.purpose === 'link' || jar.get(RECOVERY_COOKIE)?.value)) await syncWhatsAppSenderAfterPhoneChange(id)
    const token = await issueOwnedSession(id, identity.authTime * 1000)
    if (body.data.purpose === 'link' || (phone && jar.get(RECOVERY_COOKIE)?.value)) await revokeOwnedSession(token, id)
    await revokeOwnedSession(jar.get(SESSION_COOKIE)?.value)
    jar.set(SESSION_COOKIE, token, { ...sessionCookieOptions, maxAge: SESSION_SECONDS })
    for (const name of [PENDING_COOKIE, RECOVERY_COOKIE]) jar.set(name, '', { ...sessionCookieOptions, maxAge: 0 })
    const [{ data: owned, error: ownedError }, { data: member, error: memberError }] = await Promise.all([
      service.from('companies').select('id,theme_preference').eq('user_id', id).order('created_at', { ascending: false }).limit(1).maybeSingle(),
      service.from('company_members').select('company_id').eq('user_id', id).limit(1).maybeSingle(),
    ])
    if (ownedError || memberError) throw new Error('identity_unavailable')
    if (owned && isValidTheme(owned.theme_preference)) await writeThemeCookie(owned.theme_preference)
    const inviteDestination = safeInviteDestination(body.data.next)
    if (body.data.purpose === 'login' && inviteDestination) {
      const inviteToken = new URL(inviteDestination, 'https://xtimator.invalid').searchParams.get('token')
      if (inviteToken) {
        const { data: invite, error } = await service.from('company_invites').select('email,status,expires_at').eq('token', inviteToken).maybeSingle()
        if (error) throw new Error('identity_unavailable')
        if (invite?.status === 'pending' && Date.parse(invite.expires_at) > Date.now() &&
            (!account?.email_confirmed_at || account.email?.toLowerCase() !== invite.email?.toLowerCase())) {
          return NextResponse.json({ status: 'email_required', redirectTo: inviteDestination }, { headers: noStore })
        }
      }
    }
    const redirectTo = body.data.purpose === 'link' ? '/settings/account'
      : inviteDestination ?? (owned || member ? '/dashboard' : '/onboarding')
    return NextResponse.json({ status: 'active', redirectTo }, { headers: noStore })
  } catch (error) {
    const code = error instanceof Error ? error.message : ''
    if (code === 'challenge_expired') {
      const jar = await cookies()
      for (const name of [PENDING_COOKIE, RECOVERY_COOKIE]) jar.set(name, '', { ...sessionCookieOptions, maxAge: 0 })
    }
    const expected = ['identity_conflict', 'challenge_expired', 'account_recovery_required', 'account_disabled']
    return NextResponse.json({ code: expected.includes(code) ? code : 'auth_unavailable' }, { status: expected.includes(code) ? 409 : 503, headers: noStore })
  }
}
