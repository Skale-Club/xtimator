// Phase 87: scope-check helper for MCP tool handlers.
//
// Phase 86 (`resolveAccessToken`) returns `scope` as a parsed array of valid Scope
// values. We also accept space-delimited strings here so callers can pass the raw
// scope claim from the token row if they need to — RFC 6749 §3.3 specifies scopes
// as space-separated strings.
//
// Phase 88+ tools call `requireScope(auth, 'mcp:read' | 'mcp:write')` inside their
// handlers before executing privileged actions. A `mcp:write` operation requires
// the `mcp:write` scope; a `mcp:read` operation requires `mcp:read`.

import type { Scope } from '@/lib/oauth/types'

export interface AuthContext {
  client_id: string
  user_id: string
  company_id: string
  scope: Scope[] | string
}

export type ScopeCheckResult =
  | { ok: true }
  | { ok: false; status: 403; error: 'insufficient_scope'; message: string }

/**
 * Parse a token's scope claim into a Set for O(1) membership tests.
 * Accepts both the already-parsed array form returned by resolveAccessToken()
 * and the raw space-delimited string from the DB row.
 */
function toScopeSet(raw: Scope[] | string): Set<string> {
  if (Array.isArray(raw)) return new Set(raw)
  return new Set(raw.split(/\s+/).filter(Boolean))
}

/**
 * Returns `{ ok: true }` when the auth token carries the required scope,
 * otherwise a 403 insufficient_scope error per RFC 6750 §3.1.
 */
export function requireScope(
  auth: AuthContext,
  requiredScope: Scope,
): ScopeCheckResult {
  const scopes = toScopeSet(auth.scope)
  if (scopes.has(requiredScope)) return { ok: true }
  return {
    ok: false,
    status: 403,
    error: 'insufficient_scope',
    message: `Required scope '${requiredScope}' not granted to this token`,
  }
}
