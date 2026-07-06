import 'server-only'
import { createHmac, timingSafeEqual } from 'node:crypto'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { requireAdmin } from '@/lib/auth/admin-context'
import { requireServiceClient } from '@/lib/supabase/service'
import { logAdminAction } from '@/lib/admin/audit-log'

export const SUPPORT_MODE_COOKIE = 'support_mode_session'

// 2 hours — CONTEXT.md's recommended middle-ground TTL within its stated 1-4h range.
const SESSION_TTL_MS = 2 * 60 * 60 * 1000

interface SupportModePayload {
  adminUserId: string
  companyId: string
  issuedAt: number
  expiresAt: number
}

export interface SupportModeSession {
  adminUserId: string
  companyId: string
}

function loadSigningKey(): Buffer {
  const raw = process.env.APP_ENCRYPTION_KEY
  if (!raw) throw new Error('APP_ENCRYPTION_KEY is not set')
  const key = Buffer.from(raw, 'base64')
  if (key.length !== 32) {
    throw new Error(
      `APP_ENCRYPTION_KEY must decode to 32 bytes (256 bits); got ${key.length}.`
    )
  }
  return key
}

function sign(payloadB64: string): string {
  return createHmac('sha256', loadSigningKey()).update(payloadB64).digest('hex')
}

function encodeCookie(payload: SupportModePayload): string {
  const payloadB64 = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url')
  const signature = sign(payloadB64)
  return `${payloadB64}.${signature}`
}

function decodeCookie(cookieValue: string): SupportModePayload | null {
  const parts = cookieValue.split('.')
  if (parts.length !== 2) return null
  const [payloadB64, receivedSig] = parts

  const expectedSig = sign(payloadB64)
  const expectedBuf = Buffer.from(expectedSig)
  const receivedBuf = Buffer.from(receivedSig)
  if (expectedBuf.length !== receivedBuf.length) return null

  let valid: boolean
  try {
    valid = timingSafeEqual(expectedBuf, receivedBuf)
  } catch {
    return null
  }
  if (!valid) return null

  try {
    const json = Buffer.from(payloadB64, 'base64url').toString('utf8')
    const parsed = JSON.parse(json) as SupportModePayload
    if (
      typeof parsed.adminUserId !== 'string' ||
      typeof parsed.companyId !== 'string' ||
      typeof parsed.issuedAt !== 'number' ||
      typeof parsed.expiresAt !== 'number'
    ) {
      return null
    }
    return parsed
  } catch {
    return null
  }
}

async function isStillPlatformAdmin(adminUserId: string): Promise<boolean> {
  const svc = requireServiceClient()
  const { data } = await svc
    .from('platform_admins')
    .select('user_id')
    .eq('user_id', adminUserId)
    .maybeSingle()
  return !!data
}

/**
 * Mints a signed, time-boxed Support Mode session for the given company.
 * requireAdmin()-gated — throws/notFound()'s if the caller is not a platform admin.
 * Logs 'company.support_mode_start'. Does NOT redirect — caller handles navigation.
 */
export async function startSupportSession(companyId: string): Promise<void> {
  const ctx = await requireAdmin()

  const issuedAt = Date.now()
  const expiresAt = issuedAt + SESSION_TTL_MS
  const payload: SupportModePayload = {
    adminUserId: ctx.userId,
    companyId,
    issuedAt,
    expiresAt,
  }
  const cookieValue = encodeCookie(payload)

  const cookieStore = await cookies()
  cookieStore.set(SUPPORT_MODE_COOKIE, cookieValue, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: Math.floor(SESSION_TTL_MS / 1000), // never exceeds signed expiresAt (decision #6c)
  })

  void logAdminAction({
    actorId: ctx.userId,
    actorEmail: ctx.email,
    action: 'company.support_mode_start',
    targetType: 'company',
    targetId: companyId,
    metadata: {},
  })
}

/**
 * Reads + verifies the Support Mode cookie: signature, expiry, and a live
 * re-check that adminUserId is STILL a platform_admins row (never trust the
 * cookie's claim of adminhood alone — mirrors getAdminContext()'s own
 * stale-cache warning). Returns null on ANY failure.
 */
export async function getSupportModeSession(): Promise<SupportModeSession | null> {
  const cookieStore = await cookies()
  const cookieValue = cookieStore.get(SUPPORT_MODE_COOKIE)?.value
  if (!cookieValue) return null

  const payload = decodeCookie(cookieValue)
  if (!payload) return null

  if (payload.expiresAt <= Date.now()) return null

  const stillAdmin = await isStillPlatformAdmin(payload.adminUserId)
  if (!stillAdmin) return null

  return { adminUserId: payload.adminUserId, companyId: payload.companyId }
}

/**
 * Ends the current Support Mode session (if any): reads issuedAt BEFORE
 * clearing the cookie, computes session duration, logs
 * 'company.support_mode_end', then clears the cookie, then redirects back
 * to /admin/companies — mirroring lib/demo/actions.ts's exitDemoToSignup,
 * which calls redirect() directly inside the server action itself (this is
 * the actual mechanism that makes a bare <form action={endSupportSession}>
 * binding navigate anywhere; see 151-CONTEXT.md locked decision #5). Safe
 * no-op if no session is active (no redirect in that case — nothing to exit).
 */
export async function endSupportSession(): Promise<void> {
  const cookieStore = await cookies()
  const cookieValue = cookieStore.get(SUPPORT_MODE_COOKIE)?.value
  if (!cookieValue) return

  const payload = decodeCookie(cookieValue)

  if (payload) {
    const durationSeconds = Math.round((Date.now() - payload.issuedAt) / 1000)
    // Re-resolve admin identity for the log's actor fields — the cookie
    // itself only carries adminUserId; look up email via requireAdmin()
    // if this runs in the admin's own request context, else fall back to
    // an empty email (best-effort logging, never blocks the exit flow).
    let actorEmail = ''
    try {
      const ctx = await requireAdmin()
      actorEmail = ctx.email
    } catch {
      // Not resolvable (e.g. admin session itself expired) — log with empty email.
    }
    await logAdminAction({
      actorId: payload.adminUserId,
      actorEmail,
      action: 'company.support_mode_end',
      targetType: 'company',
      targetId: payload.companyId,
      metadata: { durationSeconds },
    })
  }

  cookieStore.set(SUPPORT_MODE_COOKIE, '', {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  })

  redirect('/admin/companies')
}
