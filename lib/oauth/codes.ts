// Phase 86: authorization-code issuance + verification + single-use consumption.
//
// Codes live for 10 minutes, are stored as sha256(code), and are consumed (deleted)
// on first successful token exchange to prevent replay.

import 'server-only'
import { requireServiceClient } from '@/lib/supabase/service'
import { generateOpaqueToken, hashToken } from './tokens'
import { verifyPkceS256 } from './pkce'
import type { AuthorizationCodeRow } from './types'
import {
  assertCompanyWritable,
  assertWritable,
} from '@/lib/demo/guard'

export const AUTHORIZATION_CODE_TTL_SECONDS = 60 * 10 // 10 minutes

export interface IssueCodeInput {
  clientId: string
  userId: string
  userEmail?: string | null
  companyId: string
  codeChallenge: string
  codeChallengeMethod: 'S256'
  redirectUri: string
  scope: string
}

export interface IssuedCode {
  code: string
  expiresAt: Date
}

export async function issueAuthorizationCode(input: IssueCodeInput): Promise<IssuedCode> {
  const denied = await assertWritable({
    userId: input.userId,
    email: input.userEmail,
    companyId: input.companyId,
  })
  if (denied) throw new Error(denied.error)

  const supabase = requireServiceClient()
  const code = generateOpaqueToken()
  const expiresAt = new Date(Date.now() + AUTHORIZATION_CODE_TTL_SECONDS * 1000)

  const { error } = await supabase.from('oauth_authorization_codes').insert({
    code_hash: hashToken(code),
    client_id: input.clientId,
    user_id: input.userId,
    company_id: input.companyId,
    code_challenge: input.codeChallenge,
    code_challenge_method: input.codeChallengeMethod,
    redirect_uri: input.redirectUri,
    scope: input.scope,
    expires_at: expiresAt.toISOString(),
  })

  if (error) throw new Error(`[oauth] failed to persist authorization code: ${error.message}`)
  return { code, expiresAt }
}

export interface ConsumeCodeInput {
  code: string
  clientId: string
  redirectUri: string
  codeVerifier: string
}

export type ConsumeCodeResult =
  | { ok: true; row: AuthorizationCodeRow }
  | {
      ok: false
      reason:
        | 'not_found'
        | 'expired'
        | 'consumed'
        | 'client_mismatch'
        | 'redirect_mismatch'
        | 'pkce_mismatch'
        | 'demo_readonly'
    }

/**
 * Validate + atomically consume an authorization code.
 *
 * Returns the row on success. On any failure the code is NOT consumed (so legitimate
 * retries with corrected params still work within the 10-minute window).
 */
export async function consumeAuthorizationCode(input: ConsumeCodeInput): Promise<ConsumeCodeResult> {
  const supabase = requireServiceClient()
  const codeHash = hashToken(input.code)

  const { data, error } = await supabase
    .from('oauth_authorization_codes')
    .select('code_hash, client_id, user_id, company_id, code_challenge, code_challenge_method, redirect_uri, scope, expires_at, consumed_at')
    .eq('code_hash', codeHash)
    .maybeSingle()

  if (error || !data) return { ok: false, reason: 'not_found' }
  const row = data as AuthorizationCodeRow

  if (row.consumed_at) return { ok: false, reason: 'consumed' }
  if (new Date(row.expires_at).getTime() <= Date.now()) return { ok: false, reason: 'expired' }
  if (row.client_id !== input.clientId) return { ok: false, reason: 'client_mismatch' }
  if (row.redirect_uri !== input.redirectUri) return { ok: false, reason: 'redirect_mismatch' }

  if (row.code_challenge_method !== 'S256') return { ok: false, reason: 'pkce_mismatch' }
  if (!verifyPkceS256(input.codeVerifier, row.code_challenge)) {
    return { ok: false, reason: 'pkce_mismatch' }
  }

  if (await assertCompanyWritable(row.company_id)) {
    return { ok: false, reason: 'demo_readonly' }
  }

  // Mark as consumed (single-use). We update rather than delete so concurrent retries
  // can be distinguished from "never existed" in observability.
  const { error: updateErr } = await supabase
    .from('oauth_authorization_codes')
    .update({ consumed_at: new Date().toISOString() })
    .eq('code_hash', codeHash)
    .is('consumed_at', null) // optimistic: only consume if still unconsumed

  if (updateErr) return { ok: false, reason: 'not_found' }
  return { ok: true, row }
}
