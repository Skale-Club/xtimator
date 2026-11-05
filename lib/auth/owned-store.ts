import 'server-only'
import { requireDataServiceClient } from '@/lib/supabase/data-service'
import { hashToken, opaqueToken, type OwnedAccount } from './owned-session'
import type { VerifiedIdentity } from './google-identity'

export async function requireOwnedActivation() {
  const { data, error } = await requireDataServiceClient().from('xtimator_auth_control').select('active').eq('singleton', true).single()
  if (error || !data?.active) throw new Error('auth_not_activated')
}

export async function getOwnedAccount(id: string): Promise<OwnedAccount | null> {
  const { data, error } = await requireDataServiceClient().from('xtimator_accounts').select('*').eq('id', id).maybeSingle()
  if (error) throw new Error('Account store unavailable')
  return data as OwnedAccount | null
}

export async function rateLimitOwned(key: string, limit: number, seconds = 900) {
  const { data, error } = await requireDataServiceClient().rpc('xtimator_auth_rate_limit', { p_key: hashToken(key), p_limit: limit, p_seconds: seconds })
  if (error) throw new Error('Rate limiter unavailable')
  return data === true
}

export async function completeIdentity(identity: VerifiedIdentity, options: { pending?: string; recovery?: string; currentUser?: string } = {}) {
  const { data, error } = await requireDataServiceClient().rpc('xtimator_complete_identity', {
    p_issuer: `https://securetoken.google.com/${identity.project}`, p_subject: identity.subject,
    p_provider: identity.provider, p_phone: identity.phone ?? null, p_email: identity.email ?? null,
    p_google_subject: identity.googleSubject ?? null, p_name: identity.name ?? null,
    p_pending: options.pending ? hashToken(options.pending) : null,
    p_recovery: options.recovery ? hashToken(options.recovery) : null, p_current_user: options.currentUser ?? null,
  })
  if (error) {
    for (const code of ['identity_conflict', 'challenge_expired', 'account_recovery_required', 'account_disabled', 'auth_not_activated']) {
      if (error.message.includes(code)) throw new Error(code)
    }
    throw new Error('identity_unavailable')
  }
  return data as string | null
}

export async function rememberGoogle(identity: VerifiedIdentity, userId: string | null) {
  const token = opaqueToken()
  const { error } = await requireDataServiceClient().from('xtimator_auth_challenges').insert({
    token_hash: hashToken(token), kind: 'google', user_id: userId,
    payload: { issuer: `https://securetoken.google.com/${identity.project}`, subject: identity.subject, email: identity.email, name: identity.name },
    expires_at: new Date(Date.now() + 600_000).toISOString(),
  })
  if (error) throw new Error('Could not save identity challenge')
  return token
}
