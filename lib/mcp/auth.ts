// Phase 87: MCP request authentication.
//
// Extracts and validates a Bearer access token from an incoming Request. The token
// is resolved via Phase 86's `resolveAccessToken` which returns the (client_id,
// user_id, company_id, scope) tuple persisted alongside the sha256-hashed token.
//
// On failure we emit RFC 9728-compliant 401s — the `WWW-Authenticate` header
// points the client at our protected-resource metadata document so Claude.ai can
// re-discover the authorization server and trigger a refresh flow when its token
// expires.

import 'server-only'
import { resolveAccessToken } from '@/lib/oauth/tokens'
import { resolveIssuer } from '@/lib/oauth/issuer'
import type { Scope } from '@/lib/oauth/types'

export interface McpAuthContext {
  client_id: string
  user_id: string
  company_id: string
  scope: Scope[]
}

export type VerifyMcpRequestResult =
  | { ok: true; auth: McpAuthContext }
  | {
      ok: false
      status: 401 | 403
      error: string
      headers?: Record<string, string>
    }

/**
 * Build the RFC 9728 `WWW-Authenticate` challenge header. Points the client at
 * `/.well-known/oauth-protected-resource` (shipped by Phase 86) so it can
 * rediscover the AS metadata and refresh.
 */
async function buildBearerChallenge(error: string): Promise<Record<string, string>> {
  const issuer = await resolveIssuer()
  const resourceMetadata = `${issuer}/.well-known/oauth-protected-resource`
  return {
    'WWW-Authenticate': `Bearer realm="xtimator", resource_metadata="${resourceMetadata}", error="${error}"`,
  }
}

/**
 * Extract a Bearer token from the Authorization header.
 * Returns null when the header is missing or uses a non-Bearer scheme.
 *
 * Accepts only exactly `Bearer <token>` (case-insensitive scheme per RFC 6750 §2.1).
 */
function extractBearerToken(req: Request): string | null {
  const header = req.headers.get('authorization')
  if (!header) return null
  const trimmed = header.trim()
  // Match "Bearer <token>" — token must be non-empty, no extra whitespace inside.
  const match = /^Bearer\s+([^\s]+)\s*$/i.exec(trimmed)
  if (!match) return null
  return match[1]
}

/**
 * Verify an MCP request is carrying a valid Bearer access token. The returned
 * `auth` object is what gets handed to `createMcpServer` and through to every
 * tool handler.
 *
 * 401 with `invalid_token` for: missing header, malformed scheme, unknown /
 * expired / revoked token.
 */
export async function verifyMcpRequest(req: Request): Promise<VerifyMcpRequestResult> {
  const token = extractBearerToken(req)
  if (!token) {
    return {
      ok: false,
      status: 401,
      error: 'invalid_token',
      headers: await buildBearerChallenge('invalid_token'),
    }
  }

  const resolved = await resolveAccessToken(token)
  if (!resolved) {
    return {
      ok: false,
      status: 401,
      error: 'invalid_token',
      headers: await buildBearerChallenge('invalid_token'),
    }
  }

  return {
    ok: true,
    auth: {
      client_id: resolved.client_id,
      user_id: resolved.user_id,
      company_id: resolved.company_id,
      scope: resolved.scope,
    },
  }
}
