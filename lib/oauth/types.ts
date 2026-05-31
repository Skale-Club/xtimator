// Phase 86: shared OAuth 2.0 types.
//
// Per SEED-030, Xtimator is the authorization server + resource server.
// Public clients only (PKCE S256, no client_secret).

export const SUPPORTED_RESPONSE_TYPES = ['code'] as const
export const SUPPORTED_GRANT_TYPES = ['authorization_code', 'refresh_token'] as const
export const SUPPORTED_CODE_CHALLENGE_METHODS = ['S256'] as const
export const SUPPORTED_TOKEN_AUTH_METHODS = ['none'] as const
export const SUPPORTED_SCOPES = ['mcp:read', 'mcp:write'] as const

export type ResponseType = (typeof SUPPORTED_RESPONSE_TYPES)[number]
export type GrantType = (typeof SUPPORTED_GRANT_TYPES)[number]
export type CodeChallengeMethod = (typeof SUPPORTED_CODE_CHALLENGE_METHODS)[number]
export type TokenAuthMethod = (typeof SUPPORTED_TOKEN_AUTH_METHODS)[number]
export type Scope = (typeof SUPPORTED_SCOPES)[number]

export interface OAuthClient {
  id: string
  client_id: string
  client_name: string
  redirect_uris: string[]
  grant_types: GrantType[]
  response_types: ResponseType[]
  token_endpoint_auth_method: TokenAuthMethod
  created_at: string
}

export interface AuthorizationCodeRow {
  code_hash: string
  client_id: string
  user_id: string
  company_id: string
  code_challenge: string
  code_challenge_method: CodeChallengeMethod
  redirect_uri: string
  scope: string
  expires_at: string
  consumed_at: string | null
}

export interface AccessTokenRow {
  token_hash: string
  client_id: string
  user_id: string
  company_id: string
  scope: string
  expires_at: string
  revoked_at: string | null
}

export type RefreshTokenRow = AccessTokenRow

export interface TokenResponse {
  access_token: string
  token_type: 'Bearer'
  expires_in: number
  refresh_token: string
  scope: string
}

export type OAuthErrorCode =
  | 'invalid_request'
  | 'invalid_client'
  | 'invalid_grant'
  | 'unauthorized_client'
  | 'unsupported_grant_type'
  | 'invalid_scope'
  | 'access_denied'
  | 'server_error'

export interface OAuthErrorResponse {
  error: OAuthErrorCode
  error_description?: string
}

// Validation helpers ----------------------------------------------------------

export function isSupportedScope(value: string): value is Scope {
  return (SUPPORTED_SCOPES as readonly string[]).includes(value)
}

/**
 * Parse a space-delimited scope string from a client request.
 * Returns an array of recognized scopes (unknown values are dropped silently —
 * RFC 6749 §3.3 leaves unknown-scope handling to the AS).
 *
 * Empty / missing scope defaults to `mcp:read`.
 */
export function parseScope(raw: string | null | undefined): Scope[] {
  if (!raw) return ['mcp:read']
  const parts = raw.split(/\s+/).filter(Boolean)
  const valid = parts.filter(isSupportedScope) as Scope[]
  return valid.length > 0 ? valid : ['mcp:read']
}

export function serializeScope(scopes: Scope[]): string {
  return scopes.join(' ')
}
