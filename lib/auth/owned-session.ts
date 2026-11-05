import 'server-only'
import { createHash, randomBytes } from 'node:crypto'
import { SignJWT } from 'jose'
import type { User } from '@supabase/supabase-js'
import { requireDataServiceClient } from '@/lib/supabase/data-service'

export const SESSION_COOKIE = 'xtimator_session'
export const PENDING_COOKIE = 'xtimator_pending_identity'
export const RECOVERY_COOKIE = 'xtimator_account_recovery'
export const EMAIL_COOKIE = 'xtimator_email_confirmation'
export const SESSION_SECONDS = 30 * 24 * 60 * 60
export const DATA_TOKEN_SECONDS = 300
export const sessionCookieOptions = {
  httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax' as const, path: '/',
}

export interface OwnedAccount {
  id: string
  email: string | null
  email_confirmed_at: string | null
  phone: string | null
  phone_confirmed_at: string | null
  raw_user_meta_data: Record<string, unknown>
  raw_app_meta_data: Record<string, unknown>
  created_at: string
  updated_at: string
  disabled_at: string | null
}
export interface OwnedSession {
  id: string
  user_id: string
  expires_at: string
  created_at: string
  auth_time: string
  account: OwnedAccount
}

export const hashToken = (value: string) => createHash('sha256').update(value).digest('hex')
export const opaqueToken = () => randomBytes(32).toString('base64url')

export function toUser(account: OwnedAccount): User {
  return {
    id: account.id, aud: 'authenticated', role: 'authenticated',
    email: account.email ?? undefined, phone: account.phone ?? undefined,
    email_confirmed_at: account.email_confirmed_at ?? undefined,
    phone_confirmed_at: account.phone_confirmed_at ?? undefined,
    app_metadata: {}, user_metadata: account.raw_user_meta_data,
    created_at: account.created_at, updated_at: account.updated_at,
    identities: [], is_anonymous: false,
  }
}

export function sessionClaims(session: OwnedSession) {
  return {
    sub: session.user_id, role: 'authenticated', aud: 'authenticated', iss: 'xtimator',
    session_id: session.id,
    // Invitation authorization must never treat an unverified contact as proof.
    email: session.account.email_confirmed_at ? session.account.email : undefined,
    phone: session.account.phone_confirmed_at ? session.account.phone : undefined,
    user_metadata: session.account.raw_user_meta_data,
    app_metadata: {}, auth_time: Math.floor(Date.parse(session.auth_time) / 1000),
  }
}

export async function readOwnedSession(token: string | undefined): Promise<OwnedSession | null> {
  if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null
  const { data, error } = await requireDataServiceClient().from('xtimator_sessions')
    .select('id,user_id,expires_at,created_at,auth_time,account:xtimator_accounts!inner(*)')
    .eq('token_hash', hashToken(token)).gt('expires_at', new Date().toISOString()).maybeSingle()
  if (error) throw new Error('Session store unavailable')
  if (!data) return null
  const session = data as unknown as OwnedSession
  return session.account.disabled_at ? null : session
}

export async function issueOwnedSession(userId: string, authTime = Date.now()) {
  const token = opaqueToken()
  const { error } = await requireDataServiceClient().from('xtimator_sessions').insert({
    token_hash: hashToken(token), user_id: userId,
    expires_at: new Date(Date.now() + SESSION_SECONDS * 1000).toISOString(),
    auth_time: new Date(authTime).toISOString(),
  })
  if (error) throw new Error('Could not create session')
  return token
}

export async function revokeOwnedSession(token: string | undefined, allOtherUserId?: string) {
  if (!token) return
  const service = requireDataServiceClient()
  const query = allOtherUserId
    ? service.from('xtimator_sessions').delete().eq('user_id', allOtherUserId).neq('token_hash', hashToken(token))
    : service.from('xtimator_sessions').delete().eq('token_hash', hashToken(token))
  const { error } = await query
  if (error) throw new Error('Could not revoke session')
}

export async function renewOwnedSession(session: OwnedSession) {
  // Enforce an absolute 90-day lifetime, even for an actively used cookie.
  const expires = Math.min(Date.now() + SESSION_SECONDS * 1000, Date.parse(session.created_at) + 90 * 86400_000)
  const { error } = await requireDataServiceClient().from('xtimator_sessions').update({ expires_at: new Date(expires).toISOString() }).eq('id', session.id)
  if (error) throw new Error('Could not renew session')
  return Math.max(0, Math.floor((expires - Date.now()) / 1000))
}

export async function issueDataToken(session: OwnedSession) {
  const secret = process.env.XTIMATOR_DATA_JWT_SECRET
  if (!secret || Buffer.byteLength(secret) < 32) throw new Error('Data JWT signing configuration is incomplete')
  // Must be the signing key explicitly accepted by this environment's PostgREST.
  // Never derive it from the service-role token, nor use the admin key as bearer.
  return new SignJWT(sessionClaims(session)).setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuedAt().setExpirationTime(Math.min(Math.floor(Date.now() / 1000) + DATA_TOKEN_SECONDS, Math.floor(Date.parse(session.expires_at) / 1000)))
    .sign(new TextEncoder().encode(secret))
}
