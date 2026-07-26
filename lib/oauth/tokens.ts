// Phase 86: access + refresh token issuance, hashing, lookup, rotation.
//
// Storage invariant: tables hold sha256(token) — never plaintext. Lookup hashes the
// incoming bearer token and compares hashes.

import 'server-only'
import { createHash, randomBytes } from 'node:crypto'
import { requireServiceClient } from '@/lib/supabase/service'
import type { Scope } from './types'
import {
  assertCompanyWritable,
  assertWritable,
} from '@/lib/demo/guard'

export const ACCESS_TOKEN_TTL_SECONDS = 60 * 60 // 1 hour
export const REFRESH_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 30 // 30 days

/**
 * Generate a 32-byte cryptographic random token as a hex string (64 chars).
 */
export function generateOpaqueToken(): string {
  return randomBytes(32).toString('hex')
}

/**
 * sha256(token) → hex. Used as the primary key in oauth_access_tokens /
 * oauth_refresh_tokens / oauth_authorization_codes.
 */
export function hashToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex')
}

export interface IssueTokensInput {
  clientId: string
  userId: string
  userEmail?: string | null
  companyId: string
  scope: string // space-delimited scope string (already validated upstream)
}

export interface IssuedTokenPair {
  accessToken: string
  refreshToken: string
  accessTokenExpiresAt: Date
  refreshTokenExpiresAt: Date
  scope: string
}

/**
 * Issue a brand-new (access, refresh) token pair, hash both, persist via service-role client.
 */
export async function issueTokenPair(input: IssueTokensInput): Promise<IssuedTokenPair> {
  const denied = await assertWritable({
    userId: input.userId,
    email: input.userEmail,
    companyId: input.companyId,
  })
  if (denied) throw new Error(denied.error)

  const supabase = requireServiceClient()

  const accessToken = generateOpaqueToken()
  const refreshToken = generateOpaqueToken()
  const now = Date.now()
  const accessExp = new Date(now + ACCESS_TOKEN_TTL_SECONDS * 1000)
  const refreshExp = new Date(now + REFRESH_TOKEN_TTL_SECONDS * 1000)

  const accessRow = {
    token_hash: hashToken(accessToken),
    client_id: input.clientId,
    user_id: input.userId,
    company_id: input.companyId,
    scope: input.scope,
    expires_at: accessExp.toISOString(),
  }
  const refreshRow = {
    token_hash: hashToken(refreshToken),
    client_id: input.clientId,
    user_id: input.userId,
    company_id: input.companyId,
    scope: input.scope,
    expires_at: refreshExp.toISOString(),
  }

  const { error: accessErr } = await supabase.from('oauth_access_tokens').insert(accessRow)
  if (accessErr) throw new Error(`[oauth] failed to persist access token: ${accessErr.message}`)

  const { error: refreshErr } = await supabase.from('oauth_refresh_tokens').insert(refreshRow)
  if (refreshErr) throw new Error(`[oauth] failed to persist refresh token: ${refreshErr.message}`)

  return {
    accessToken,
    refreshToken,
    accessTokenExpiresAt: accessExp,
    refreshTokenExpiresAt: refreshExp,
    scope: input.scope,
  }
}

export interface ResolvedRefreshToken {
  client_id: string
  user_id: string
  company_id: string
  scope: string
}

/**
 * Look up a refresh token by its sha256 hash. Returns null when missing, expired, or revoked.
 */
export async function resolveRefreshToken(refreshToken: string): Promise<ResolvedRefreshToken | null> {
  const supabase = requireServiceClient()
  const tokenHash = hashToken(refreshToken)

  const { data, error } = await supabase
    .from('oauth_refresh_tokens')
    .select('client_id, user_id, company_id, scope, expires_at, revoked_at')
    .eq('token_hash', tokenHash)
    .maybeSingle()

  if (error || !data) return null
  if (data.revoked_at) return null
  if (new Date(data.expires_at).getTime() <= Date.now()) return null
  if (await assertCompanyWritable(data.company_id)) return null

  return {
    client_id: data.client_id,
    user_id: data.user_id,
    company_id: data.company_id,
    scope: data.scope,
  }
}

/**
 * Mark a refresh token as revoked (rotation).
 */
export async function revokeRefreshToken(refreshToken: string): Promise<void> {
  const supabase = requireServiceClient()
  const tokenHash = hashToken(refreshToken)
  const { data, error } = await supabase
    .from('oauth_refresh_tokens')
    .select('company_id')
    .eq('token_hash', tokenHash)
    .maybeSingle()

  if (error || !data) return
  if (await assertCompanyWritable(data.company_id)) return

  await supabase
    .from('oauth_refresh_tokens')
    .update({ revoked_at: new Date().toISOString() })
    .eq('token_hash', tokenHash)
}

/**
 * Rotate a refresh token: validate the incoming token, issue a NEW (access, refresh) pair,
 * revoke the old refresh token. Returns null if the incoming refresh token is invalid.
 *
 * `clientId` is verified against the stored row to prevent cross-client refresh attacks.
 */
export async function rotateRefreshToken(
  refreshToken: string,
  clientId: string,
): Promise<IssuedTokenPair | null> {
  const resolved = await resolveRefreshToken(refreshToken)
  if (!resolved) return null
  if (resolved.client_id !== clientId) return null

  // Issue NEW pair before revoking, so a transient failure doesn't lock the user out.
  const pair = await issueTokenPair({
    clientId: resolved.client_id,
    userId: resolved.user_id,
    companyId: resolved.company_id,
    scope: resolved.scope,
  })

  await revokeRefreshToken(refreshToken)
  return pair
}

export interface ResolvedAccessToken {
  client_id: string
  user_id: string
  company_id: string
  scope: Scope[]
}

/**
 * Resolve a bearer access token to its (user_id, company_id, scope). Returns null
 * when missing, expired, or revoked. The MCP route (Phase 87) will call this.
 */
export async function resolveAccessToken(accessToken: string): Promise<ResolvedAccessToken | null> {
  const supabase = requireServiceClient()
  const tokenHash = hashToken(accessToken)

  const { data, error } = await supabase
    .from('oauth_access_tokens')
    .select('client_id, user_id, company_id, scope, expires_at, revoked_at')
    .eq('token_hash', tokenHash)
    .maybeSingle()

  if (error || !data) return null
  if (data.revoked_at) return null
  if (new Date(data.expires_at).getTime() <= Date.now()) return null
  if (await assertCompanyWritable(data.company_id)) return null

  return {
    client_id: data.client_id,
    user_id: data.user_id,
    company_id: data.company_id,
    scope: (data.scope as string).split(/\s+/).filter(Boolean) as Scope[],
  }
}
