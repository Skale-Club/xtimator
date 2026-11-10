import { randomInt } from 'node:crypto'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { Resend } from 'resend'
import { z } from 'zod'
import { ownedAuthEnabled } from '@/lib/auth/mode'
import { noStore, sameAuthOrigin } from '@/lib/auth/http'
import { hashToken, opaqueToken, readOwnedSession, EMAIL_COOKIE, RECOVERY_COOKIE, SESSION_COOKIE, sessionCookieOptions } from '@/lib/auth/owned-session'
import { rateLimitOwned, requireOwnedActivation } from '@/lib/auth/owned-store'
import { requireDataServiceClient } from '@/lib/supabase/data-service'
import { getIntegrationKey } from '@/lib/platform-config'
import { emailFrom } from '@/lib/email/sender'
import { clientIpFromHeaders } from '@/lib/security/bot-defense'

export const runtime = 'nodejs'
const schema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('send'), email: z.email().max(254), purpose: z.enum(['recovery', 'email']).default('recovery') }).strict(),
  z.object({ action: z.literal('verify'), code: z.string().regex(/^\d{6}$/), purpose: z.enum(['recovery', 'email']).default('recovery') }).strict(),
])

export async function POST(request: Request) {
  if (!ownedAuthEnabled()) return NextResponse.json({ code: 'not_enabled' }, { status: 404 })
  if (!sameAuthOrigin(request)) return NextResponse.json({ code: 'origin_denied' }, { status: 403 })
  try {
    await requireOwnedActivation()
    const input = schema.safeParse(await request.json().catch(() => null))
    if (!input.success) return NextResponse.json({ code: 'invalid_request' }, { status: 400 })
    const body = input.data
    const ip = clientIpFromHeaders(request.headers)
    if (!await rateLimitOwned(`recovery:${body.action}:${ip}`, body.action === 'send' ? 5 : 20)) {
      return NextResponse.json({ code: 'rate_limited' }, { status: 429, headers: { ...noStore, 'Retry-After': '900' } })
    }
    const jar = await cookies()
    const session = body.purpose === 'email' ? await readOwnedSession(jar.get(SESSION_COOKIE)?.value) : null
    if (body.purpose === 'email' && !session) return NextResponse.json({ code: 'not_authenticated' }, { status: 401 })
    if (session && Date.now() - Date.parse(session.auth_time) > 300_000) return NextResponse.json({ code: 'reauthentication_required' }, { status: 401 })
    const service = requireDataServiceClient()
    if (session) {
      const { data: demo, error } = await service.from('demo_config').select('user_id').eq('user_id', session.user_id).maybeSingle()
      if (error) throw new Error('Account lookup failed')
      if (demo) return NextResponse.json({ code: 'demo_readonly' }, { status: 403 })
    }
    const cookieName = body.purpose === 'email' ? EMAIL_COOKIE : RECOVERY_COOKIE
    if (body.action === 'send') {
      const email = body.email.trim().toLowerCase()
      if (!await rateLimitOwned(`recovery:email:${email}`, 3, 3600)) return NextResponse.json({ code: 'rate_limited' }, { status: 429, headers: { ...noStore, 'Retry-After': '3600' } })
      const key = await getIntegrationKey('resend')
      if (!key) throw new Error('Email service is unavailable')
      let userId = session?.user_id ?? null
      if (!session) {
        const { data, error } = await service.from('xtimator_accounts').select('id').ilike('email', email.replace(/[\\%_]/g, value => `\\${value}`))
          .not('email_confirmed_at', 'is', null).is('disabled_at', null).limit(2)
        if (error) throw new Error('Account lookup failed')
        userId = data?.length === 1 ? data[0].id : null
      }
      if (userId) {
        const { data: demo, error } = await service.from('demo_config').select('user_id').eq('user_id', userId).maybeSingle()
        if (error) throw new Error('Account lookup failed')
        if (demo) userId = null
      }
      const token = opaqueToken()
      const code = String(randomInt(0, 1_000_000)).padStart(6, '0')
      const { error } = await service.from('xtimator_auth_challenges').insert({
        token_hash: hashToken(token), kind: body.purpose, user_id: userId,
        code_hash: hashToken(`${token}:${code}`), payload: { email }, expires_at: new Date(Date.now() + 600_000).toISOString(),
      })
      if (error) throw new Error('Challenge store failed')
      // Same response/cookie shape for unknown addresses. Never expose the code.
      if (userId) {
        const result = await new Resend(key).emails.send({ from: emailFrom('Xtimator'), to: email,
          subject: 'Your Xtimator verification code',
          text: `Your Xtimator verification code is ${code}. It expires in 10 minutes. If you did not request this, ignore this message.`,
        })
        if (!result.error) {
          // Phase 2b: login/verification codes are a platform cost - recorded, never billed.
          try {
            const { recordEmailSent } = await import('@/lib/billing/messaging-cost')
            await recordEmailSent({
              id: result.data?.id ?? null,
              meta: { companyId: null, purpose: 'otp', billable: false },
            })
          } catch {
            /* best-effort */
          }
        }
        if (result.error) {
          // Keep account existence private even when delivery fails.
          await service.from('xtimator_auth_challenges').delete().eq('token_hash', hashToken(token))
          console.error('[auth] Verification email delivery failed')
        }
      }
      jar.set(cookieName, token, { ...sessionCookieOptions, maxAge: 600 })
      return NextResponse.json({ status: 'code_sent' }, { headers: noStore })
    }
    const token = jar.get(cookieName)?.value
    if (!token || !/^[\w-]{43}$/.test(token)) return NextResponse.json({ code: 'challenge_expired' }, { status: 400 })
    const { data: verified, error } = await service.rpc('xtimator_verify_challenge', { p_token: hashToken(token), p_code: hashToken(`${token}:${body.code}`) })
    if (error) throw new Error('Challenge store failed')
    if (!verified) return NextResponse.json({ code: 'wrong_code' }, { status: 400, headers: noStore })
    if (session) {
      const { data, error: updateError } = await service.rpc('xtimator_apply_verified_email', { p_token: hashToken(token), p_user_id: session.user_id })
      if (updateError) throw new Error('Email update failed')
      if (!data) return NextResponse.json({ code: 'identity_conflict' }, { status: 409 })
      jar.set(cookieName, '', { ...sessionCookieOptions, maxAge: 0 })
      return NextResponse.json({ status: 'email_verified' }, { headers: noStore })
    }
    return NextResponse.json({ status: 'phone_required' }, { headers: noStore })
  } catch { return NextResponse.json({ code: 'auth_unavailable' }, { status: 503, headers: noStore }) }
}
